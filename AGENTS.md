# CodeWhale VSCode 项目指南

## 项目概述

CodeWhale VSCode 是一个 VSCode 扩展，为 CodeWhale TUI 提供图形界面。该扩展通过 WebView 与用户交互，连接到 CodeWhale TUI 引擎进行 AI 对话。

## 开发环境设置

### 前置要求
- Node.js 18+
- npm 或 yarn
- VSCode 或兼容的 IDE（如 Trae CN）

### 安装依赖
```bash
npm install
```

## 编译与构建

### 开发模式编译
```bash
npm run compile
```
- 使用 webpack 编译开发版本
- 输出文件：`dist/extension.js`
- 包含 source map，便于调试

### 生产模式打包
```bash
npm run package
```
- 使用 webpack 编译生产版本
- 代码压缩优化
- 输出文件更小（约 168KB）

### 运行测试
```bash
npm test
```
- 使用 vitest 运行单元测试
- 测试文件位于 `src/*.test.ts`

## 插件打包与安装

### 打包为 VSIX 文件
```bash
npx @vscode/vsce package --no-dependencies
```
- 生成 `cblage-codewhale-vscode-0.1.0.vsix` 文件
- 包含所有必要的源文件和资源
- 文件大小约 180KB

### 安装 VSIX
```bash
code --install-extension ./cblage-codewhale-vscode-0.1.0.vsix --force
```

> 使用 Trae CN 时如果 `code` 不可用，先设置 alias：
> ```bash
> alias code="/Applications/Trae CN.app/Contents/Resources/app/bin/code"
> ```

### 一键编译打包安装
```bash
npm run compile && \
npx @vscode/vsce package --no-dependencies && \
code --install-extension ./cblage-codewhale-vscode-0.1.0.vsix --force
```

### 安装后激活
安装完成后，重新加载窗口：
- 按 `Cmd+Shift+P` 打开命令面板
- 输入 "Reload Window" 并执行

## 项目结构

```
DeepSeek-GUI/
├── src/
│   ├── extension.ts          # 扩展入口点
│   ├── chat-provider.ts      # 主聊天界面逻辑
│   ├── webview-html.ts       # WebView HTML 模板
│   ├── api-client.ts         # CodeWhale API 客户端
│   ├── engine.ts             # TUI 引擎管理
│   ├── i18n.ts               # 国际化支持
│   ├── slash-commands.ts     # 斜杠命令定义
│   └── *.test.ts             # 单元测试
├── dist/                     # 编译输出
├── media/                    # 图标等资源
├── package.json              # 扩展配置
└── webpack.config.js         # Webpack 配置
```

## 关键功能模块

### 1. WebView 通信
- `chat-provider.ts` 管理与 WebView 的双向通信
- 消息类型：`sendMessage`, `slashCommand`, `loadThread`, `interrupt` 等
- 使用 `postMessage` API 发送消息

### 2. 斜杠命令处理
- `slash-commands.ts` 定义可用命令及其可用性
- `handleSlashCommand()` 处理命令逻辑
- 命令格式：`command` + `args`（例如：`/task` + `show task_id`）

### 3. 任务管理
- 任务列表显示在侧边栏的 "Tasks" 标签页
- 支持创建、查看、取消任务
- 点击任务卡片触发 `/task show <id>` 命令

### 4. 侧边栏状态
- 侧边栏包含三个标签页：Threads、Work、Tasks
- 打开后保持打开状态，除非用户明确关闭
- 点击线程项不会自动关闭侧边栏

## 常见问题修复

### 问题：任务列表点击报错 "Unknown command"
**原因**：消息格式错误，将整个命令字符串作为 `command` 参数发送

**修复**：
```javascript
// 错误格式
vscode.postMessage({ type: 'slashCommand', command: '/task show ' + taskId });

// 正确格式
vscode.postMessage({ type: 'slashCommand', command: '/task', args: 'show ' + taskId });
```

### 问题：侧边栏自动关闭
**原因**：点击线程项时自动移除 `open` 类

**修复**：移除自动关闭代码
```javascript
// 移除这行
threadsPanel.classList.remove('open');
```

## 开发建议

### 代码风格
- 使用 TypeScript 严格模式
- 遵循 ESLint 规则
- 函数和变量使用 camelCase
- 类和接口使用 PascalCase

### 调试技巧
1. 使用 `console.log` 输出到 VSCode 开发者工具（Help → Toggle Developer Tools）
2. WebView 中的 `console.log` 输出到浏览器控制台
3. 使用 `postMessage` 记录消息流

### 性能优化
- WebView HTML 模板使用模板字符串，避免频繁 DOM 操作
- 使用事件委托处理列表项点击
- 避免在渲染函数中创建重复的事件监听器

## 发布流程

1. 更新 `package.json` 中的版本号
2. 运行测试：`npm test`
3. 编译生产版本：`npm run package`
4. 打包 VSIX：`npx @vscode/vsce package --no-dependencies`
5. 测试安装：安装到本地 IDE 验证功能
6. 发布到 VSCode Marketplace（如果需要）

## 相关项目

- **CodeWhale TUI**: TUI 引擎，提供 API 服务
- **DeepSeek API**: DeepSeek AI API 接口

## 联系与支持

- 项目仓库：https://github.com/HengQuWorld/CodeWhale-VSCode
- 问题反馈：通过 GitHub Issues

---

## 编码注意的坑（WebView + 大型前端块修改经验总结）

### 根因案例（2026-06-04 撤销/重试功能卡 Initializing 事件）

> 现象：在 `webview-html.ts` 的 `<script>` 块中添加了新函数 `updateUndoRetryState()` 引用了 `messages` 变量，但原始代码中**只有** `messagesEl`（DOM 元素引用），**未声明过** `messages` 数组变量。新代码在 script 块靠前位置执行 → 抛出 `ReferenceError: messages is not defined` → 整个 script 块**停止执行** → 后续所有初始化（status 更新、消息订阅、按钮事件绑定）全部死锁 → UI 永远停在 "Initializing..."。

### 核心教训

1. **大型 inline `<script>` 块是一荣俱荣、一损俱损的整体**
   - VSCode WebView 的 `webview.html` 是单文件模板，里面常常塞一个 80~200 KB 的 `<script>` 块
   - 该块中**任何位置**的运行时错误（`ReferenceError` / `TypeError` / 语法错误）都会让**整个块停止执行**
   - 后果：用户看到的不是"某个按钮不工作"，而是**整个 webview 看起来死了**（Initializing 永远不消失、状态栏不更新、按钮全无响应）

2. **不要假设前端存在某个变量**
   - 大型 webview 脚本里**有大量闭包、模块模式、IIFE**，变量要么在 `window` 上、要么闭包私有
   - 修改前必须**先 grep** 确认变量是否被声明：`grep -n "let X\|var X\|const X" webview-html.ts`
   - 如果找不到 → **不要直接用**。要么走 postMessage 让后端判断，要么自己维护一个 IIFE 局部变量

3. **修改 webview 前端的最安全姿势**
   - **优先后端**：按钮 → `vscode.postMessage({ type: 'xxx' })` → 后端判断 + 状态机
   - **不依赖前端变量**：所有判断逻辑放在后端 `chat-provider.ts`，前端只负责"显示/发消息"
   - **新逻辑放 IIFE 隔离**：用 `(function(){ ... })()` 包起来，自己声明局部变量，**绝不**污染外层作用域
   - **绑定 handler 用 try/catch 包装**：单个按钮的 handler 出错不应该影响其他按钮
   - **事件委托复用现有模式**：新按钮的 click 处理**插到**原有 `addEventListener('click', ...)` 内部，跟着 `target.classList.contains('xxx')` 走

4. **debug 大型 webview 卡死的二分定位法**
   - 第一步：`git stash` 全部本地修改 → 打包测试
     - 正常 → 我的修改是问题源
     - 还是卡 → 是环境问题（不是代码）
   - 第二步：`git checkout` 逐个文件回退，找出**哪个文件**的修改导致问题
   - 第三步：定位具体行时，从**最简化的修改**开始（只加 1 行 HTML / 1 个 postMessage）→ 测试 → 逐步加代码 → 找到出错的那行
   - **不要**用 `console.log` 散弹枪调试大型 webview 块——错误抛出后**后续所有 `console.log` 也不会执行**，所以看到的"没日志"不代表"没出错"，而可能**脚本已经死了**

5. **绝对不要把 HTML 调试标记 + 状态文字改动直接 commit**
   - 调试时的 BOOT marker、CSP 临时移除、`_debugMode = true`、写日志到磁盘等**都是一次性探针**
   - 找到根因后**立即 revert** 这些探针代码
   - 探针代码混在生产代码里 → 下次再调试时浪费更多时间判断"这些是做什么的"

6. **CSP / nonce / script 块语法问题的早期信号**
   - JS 完全不执行 + Console 完全没日志 → **整段 script 被浏览器拒绝**（CSP 阻止、语法错误导致整个块拒绝解析、nonce 不匹配）
   - JS 执行了一段然后挂 → `ReferenceError` / `TypeError` / 无限循环
   - UI 部分渲染（HTML）但交互失效 → 事件 handler 报错或没绑上

### 检查清单（每次修改 webview-html.ts 前对照）

- [ ] 已用 `grep` 确认所有引用的变量在 script 块中存在
- [ ] 所有新 UI 逻辑尽量放后端
- [ ] 新代码用 IIFE 隔离，不污染外层
- [ ] 调试探针代码标记为 `// DEBUG:`，调试完**立即删除**
- [ ] 至少在 IDE 重新加载一次 webview 验证状态从 "Initializing" 变 "Ready"
- [ ] 修改量 > 50 行时，分批 commit，便于 `git bisect` 定位问题

---

## TUI / GUI 功能一致性原则

### 核心规则：GUI 实现**必须参考 TUI 的设计**，保持行为一致

GUI 是 TUI 的图形前端，用户在两种界面下的操作应该产生相同的效果。实现新功能前，**先读 TUI 源码**理解其设计意图，再决定 GUI 的实现方式。

### 实现优先级

1. **优先使用 TUI 已有的 Runtime API** — GUI 通过 HTTP 调用 TUI 的 `/v1/*` 端点
2. **如果 TUI 有功能但缺少 API 端点** — 先在 TUI 的 `runtime_api.rs` 中添加端点，再在 GUI 实现
3. **如果 TUI 也没有该功能** — 先在 TUI 设计并实现，暴露 API，再在 GUI 对接

**绝不**在 GUI 中用 hack/变通方式模拟一个 TUI 已有但 GUI 没有对接的功能。

### 当前已知差异（undo / retry / revert）

| 功能 | TUI 实现 | GUI 当前实现 | 差距 |
|------|----------|-------------|------|
| `/undo` | 从 `app.history` + `app.api_messages` 双向删除，清空 tool_cells | 从 `this.messages` 删除并 `loadHistory` 重渲染 | GUI 只删显示层，不删 API 侧消息；undo 后再发消息会带上旧上下文 |
| `/retry` | `undo_conversation()` + `SendMessage(input)` | `handleUndoLastTurn()` + `handleSendMessage()` | 同上，undo 不彻底 |
| `/patch_undo` | 通过 `SnapshotRepo` 恢复 `pre-turn:*` 快照，支持多次回退 | 用 `parseDiffToSides` 的 `oldContent` + `WorkspaceEdit` 回滚 | GUI 方式不可靠：diff 可能不完整、不支持多次回退 |
| `revert_turn` 工具 | AI 主动调用的 `revert_turn` 工具，基于快照回滚 | GUI 的 revert 按钮用 diff 回滚 | 应该对接 TUI 的快照机制 |

### 需要的 TUI API 端点（待添加）

以下端点目前在 TUI Runtime API 中**不存在**，需要添加后 GUI 才能正确实现：

1. **`POST /v1/threads/{id}/undo`** — 服务端删除最后一轮的 API 消息 + 历史，返回被删除的内容摘要
2. **`POST /v1/threads/{id}/retry`** — 服务端执行 undo + 重发最后一条用户消息
3. **`GET /v1/snapshots`** — 列出当前 workspace 的快照（对应 TUI 的 `SnapshotRepo.list()`）
4. **`POST /v1/snapshots/{id}/restore`** — 恢复指定快照（对应 TUI 的 `patch_undo` / `restore` 命令）

### TUI 关键源码位置

| 功能 | 文件 | 函数/结构 |
|------|------|-----------|
| undo 对话 | `crates/tui/src/commands/debug.rs` | `undo_conversation()` |
| retry 重试 | `crates/tui/src/commands/debug.rs` | `retry()` |
| patch_undo 文件回滚 | `crates/tui/src/commands/debug.rs` | `patch_undo()` |
| 快照仓库 | `crates/tui/src/snapshot/repo.rs` | `SnapshotRepo` |
| pre-turn 快照 | `crates/tui/src/core/turn.rs` | `pre_turn_snapshot()` |
| revert_turn 工具 | `crates/tui/src/tools/revert_turn.rs` | `RevertTurnTool` |
| Runtime API 路由 | `crates/tui/src/runtime_api.rs` | `build_router()` |
| /restore 命令 | `crates/tui/src/commands/restore.rs` | `restore()` |

### 实现新功能的检查流程

1. 在 TUI 源码中找到对应功能的实现
2. 确认 TUI Runtime API 是否已暴露该功能
3. 如果没有 API → 先在 `runtime_api.rs` 添加端点
4. 在 GUI 的 `api-client.ts` 中添加调用方法
5. 在 `chat-provider.ts` 中实现业务逻辑
6. 在 `webview-html.ts` 中添加 UI（遵循 WebView 编码原则）
7. 对比 TUI 和 GUI 的行为是否一致

---

## GUI 后端开发原则：复用 TUI 能力，不重复造轮子

### 核心原则

GUI 的 runtime API 端点（`runtime_api.rs`）**必须复用 TUI 已有的核心能力**，而不是自己重新实现一遍。TUI 已经有了完整的业务逻辑，API 端点只是把这些能力暴露给 GUI 调用。

### 正确做法 vs 错误做法

**错误**：在 API 端点中自己重建数据
```rust
// ❌ 自己从 turns 重建消息、估算 token
let turns = runtime_threads.list_turns_for_thread_pub(&thread_id)?;
let messages = runtime_threads.reconstruct_messages_from_turns(&turns)?;
let total_tokens = messages.iter().map(|m| text.len() as u64 / 4).sum();
```

**正确**：通过 Engine 获取 TUI 已有的真实数据
```rust
// ✅ 复用 Engine 的 get_session_snapshot()，和 TUI 的 build_session_snapshot 走同一路径
let engine = runtime_threads.get_engine(&thread_id).await?;
let snapshot = engine.get_session_snapshot().await?;
// snapshot.messages / snapshot.total_tokens / snapshot.model 都是 Engine 的真实状态
```

### 判断标准

写 API 端点时问自己：
1. **TUI 内部做这件事用的是什么？** → API 端点应该调用同一个东西
2. **我是在"暴露 TUI 的能力"还是"重新实现 TUI 的逻辑"？** → 应该是前者
3. **如果 TUI 的逻辑改了，我的 API 端点会不会不同步？** → 如果会，说明没有复用

### 具体规则

1. **数据来源：用 Engine 的真实状态，不要自己重建**
   - Engine 的 `session.messages` 是权威消息列表，不要从 turns/items 重建
   - Engine 的 `session.total_usage` 是权威 token 统计，不要从文本长度估算
   - 通过 `get_session_snapshot()` 获取完整快照

2. **业务逻辑：用 TUI 已有的函数，不要重写**
   - 保存 session：用 `create_saved_session_with_id_and_mode()` / `update_session()`，和 TUI 的 `build_session_snapshot` 一致
   - 文件操作：用 Engine 的 Op 通道，不要绕过 Engine 直接操作文件
   - 对话操作（undo/retry）：用 Engine 的 Op 通道，确保状态一致

3. **API 端点的角色是"薄适配层"**
   - 接收 HTTP 请求 → 转换参数 → 调用 TUI 已有能力 → 返回结果
   - 不应该在 API 层做数据转换、计算、重建等重逻辑
   - 如果发现 API 端点里有超过 20 行的业务逻辑，大概率是在重复造轮子

4. **Engine 是唯一的状态权威**
   - Engine 持有当前 session 的完整状态（messages、tokens、model 等）
   - Thread store 只持久化 turn items，不是消息的权威来源
   - 从 turns 重建消息是 `ensure_engine_loaded` 的内部实现细节，API 不应该依赖它

### 典型案例：session 保存

| 方面 | 错误方式 | 正确方式 |
|------|---------|---------|
| 消息来源 | 从 turns 重建 | Engine `get_session_snapshot()` |
| token 计算 | `text.len() / 4` 估算 | Engine 的 `total_usage` |
| model/workspace | 从 thread 记录读取 | Engine 快照自带 |
| session 构建 | 自己拼 `SavedSession` | 用 `create_saved_session_with_id_and_mode()` |
| 保存方式 | 自己写文件 | 用 `SessionManager::save_session()` |
