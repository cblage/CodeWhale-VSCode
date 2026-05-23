# DeepSeek-GUI IDE 插件“无响应/一直初始化中”排查报告

本文记录一次真实故障的定位过程与修复点，供后续出现类似现象时快速复用。

## 现象与影响

### 表现 1：界面可见但完全不响应交互
- DeepSeek 面板能显示（threads/tasks/messages 等区域可见）
- 输入框无法获得焦点或无法输入
- 点击“发送/历史/新建”等按钮无任何反应
- 宿主侧看不到 `sendMessage/newThread/...` 等入站消息（仅能看到页面的 `webviewReady`）

### 表现 2：切换侧栏后一直“初始化中…”
- 切到其他插件再切回 DeepSeek 面板
- 面板停留在“初始化中…”或状态不更新

## 根因结论（基于证据）

### 根因 A：全屏遮罩层常驻，吞掉所有点击
- Webview 内存在一个用于“任务详情”的全屏遮罩层 `#task-detail-overlay`，其 CSS 为 fixed 全屏 + `z-index: 1000`。
- 故障时该遮罩层处于可见（`display: flex`）状态，导致所有点击都命中遮罩层而非输入框/按钮，从而表现为“完全无响应”。
- 同时该遮罩的关闭按钮曾依赖内联 `onclick`，在严格 CSP 的 webview 环境中不可用/不可靠，造成“打开后关不掉”，从而常驻。

### 根因 B：webview 可能重载，状态未回灌导致卡“初始化中…”
- VS Code WebviewView 在切换/重载时可能重新触发页面加载，页面会再次发送 `webviewReady`。
- 如果扩展端只刷新部分侧栏数据，而不重发 `ready` 或不恢复当前线程/历史，则页面会停留在初始“初始化中…”状态。

### 安全性隐患（非本次直接根因，但会导致相似“假死”）
- Markdown 渲染使用 `marked.parse(...)` 后直接赋值 `innerHTML`，未做 HTML/CSS 清洗。
- 若消息内容包含原始 HTML/CSS（例如注入 `position: fixed` 覆盖层），同样可导致“整页被覆盖不可交互”。

## 快速定位路径（推荐 Checklist）

### 1) 先判断：交互事件到底有没有到宿主
观察宿主日志（扩展自写日志）：
- 路径：`~/.deepseek-gui-logs/debug.log`
- 关键判断：
  - 若仅有 `onDidReceiveMessage: webviewReady`，没有 `sendMessage/newThread/...`，说明“页面能连宿主，但用户交互没变成消息回宿主”，优先查命中层/遮罩层。
  - 若有 `sendMessage` 入站，但 UI 不变，则查扩展端处理逻辑或引擎状态。

### 2) 立即排查：是否存在覆盖层吃掉点击（最高收益）
在 VS Code 执行：
- `Developer: Open Webview Developer Tools`

在 Console 执行以下检查：

```js
// 选一个屏幕中心点或输入框附近点位
document.elementFromPoint(window.innerWidth - 20, window.innerHeight - 20);
document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
```

若返回的是类似 `task-detail-overlay`/某个 fixed div，而不是你点击的按钮/输入框，则基本确认是“覆盖层吞点击”。

进一步定位：

```js
const el = document.getElementById('task-detail-overlay');
el && getComputedStyle(el).display;
el && getComputedStyle(el).zIndex;
```

### 3) 若是“切回来卡初始化”
检查宿主日志是否存在：
- 多次 `onDidReceiveMessage: webviewReady`
- 但没有对应的 `postMessage: ready`/`loadHistory` 等状态回灌（或回灌顺序异常）

应对策略：
- 将 `webviewReady` 视为“页面实例已重建”，扩展端必须执行一次“状态全量同步”。

## 这次修复点（可复用的工程改法）

### 修复 1：遮罩层默认强制关闭，且只在显式 taskDetail 时打开
要点：
- 页面初始化/常规状态同步（ready、loadHistory、threadLoaded、clearChat 等）时应强制 `closeTaskDetail()`，避免历史残留遮罩层。
- 只在接收到明确的 `taskDetail` 消息时显示 overlay。

### 修复 2：移除内联 onclick，改用 addEventListener
要点：
- Webview 的 CSP 通常禁止内联事件属性（`onclick="..."`），导致“看起来有按钮但永远点不动/不触发”。
- 用 `addEventListener` 绑定关闭按钮，确保可靠。

### 修复 3：webviewReady 触发全量状态回灌
要点：
- 在扩展端对 `webviewReady` 调用 `syncWebviewState()`：
  - threadList/taskList/workState
  - 若存在 currentThread：恢复历史 + 重订阅事件流
  - 发送 `ready`（包含 model/mode/reasoning）

### 修复 4：Markdown 渲染前转义原始 HTML（硬化）
要点：
- 在调用 `marked.parse()` 前先 escape `<>&`，阻断原始 HTML 注入路径。
- 即便本次不是由消息注入触发，这条硬化也能显著降低未来“整页被覆盖”的概率。

## “斜杠命令支持后才坏”的解释（为何看起来相关）
本次最终根因是 overlay 常驻，但它常见的被“改出来”的方式包括：
- 新增大量前端逻辑后更容易触发 overlay 的展示路径（例如 task 详情、slash command 触发的 task show）。
- CSP 下的内联 `onclick` 原本就不可靠，在 UI 重构/重渲染后更容易暴露为“遮罩打开后关不掉”。
- 页面重载（再次 webviewReady）频率上升，而扩展端未做状态回灌，导致“初始化中”表象更明显。

因此表面上“加了斜杠命令后坏了”，实际上是新增功能触发/放大了隐藏的 UI 状态一致性问题。

## 建议的长期预防
- 禁止 webview HTML 使用任何内联事件（onclick/onchange/…），统一事件绑定。
- 建立 “overlay 管理约束”：
  - 任何 overlay 必须有显式的 open/close 状态机
  - 页面初始化/ready 时应保证所有 overlay 处于关闭状态
- 在渲染链路中做 HTML 清洗（至少 escape HTML），并避免从模型输出直接进入 `innerHTML`。
- 在 `webviewReady` 上做全量同步，避免 view 重载后 UI 状态丢失。

## 相关实现文件（便于快速跳转）
- Webview UI 与 overlay：[/Users/gaord/magic/DeepSeek-GUI/src/webview-html.ts](file:///Users/gaord/magic/DeepSeek-GUI/src/webview-html.ts)
- 扩展端 webviewReady 处理：[/Users/gaord/magic/DeepSeek-GUI/src/chat-provider.ts](file:///Users/gaord/magic/DeepSeek-GUI/src/chat-provider.ts)
- Markdown 渲染：[/Users/gaord/magic/DeepSeek-GUI/src/markdown.ts](file:///Users/gaord/magic/DeepSeek-GUI/src/markdown.ts)
- 宿主调试日志：`~/.deepseek-gui-logs/debug.log`
