# [OPEN] ide-plugin-freeze

## Symptom
- CodeWhale VSCode 插件界面已加载，状态栏显示 `Ready`
- 日志中可见 `input=true sendBtn=true messages=true status=true`
- 用户操作无响应，表现为输入/发送/历史相关交互失效

## Hypotheses
- H1: Webview 前端被透明遮罩层或错误的 `pointer-events` 样式拦截，导致 DOM 存在但无法接收事件。
- H2: VS Code 宿主消息桥工作不完整，初始化完成后没有把可交互状态同步到前端状态机。
- H3: 前端进入了“只读/计划模式”或错误的 busy/disabled 状态，控件被逻辑禁用但状态文案仍显示 `Ready`。
- H4: 事件监听器未绑定或绑定后被重新渲染移除，导致点击和键盘事件没有真正触发 handler。
- H5: Webview 收到了线程/历史/状态消息，但某个未捕获异常打断了后续交互更新流程。

## Plan
- 只读检查 IDE 插件前端入口、webview 初始化、消息桥和交互控件状态逻辑。
- 找到最可能的证据点后，再补最小化埋点验证。

## Evidence
- E1: `~/.codewhale-vscode-logs/debug.log` 中宿主侧持续收到 `onDidReceiveMessage: webviewReady`，但没有任何 `sendMessage/newThread/compact/loadThread/...` 入站记录，说明扩展与 webview 的初始化桥接是通的，但用户交互没有转化成发回宿主的消息。
- E2: `src/webview-html.ts` 已经绑定了 `sendBtn/input/newThread/compact/interrupt/threads` 等事件监听，且这些绑定位于 `window.addEventListener('message', ...)` 之前；截图已证明后者生效，因此“脚本早期崩溃导致根本没绑监听”概率很低。
- E3: 当前页面存在一个默认启用的高 z-index 固定调试层：`#debug-panel`，样式为 `position:fixed; bottom:0; left:0; right:0; z-index:99999; max-height:80px;`。它正好覆盖输入区附近，是最可能影响点击命中的 DOM 层。
- E4: Markdown 渲染链路 `marked.parse(text) -> innerHTML` 完全未做 HTML/CSS 清洗，历史消息理论上可以注入覆盖层或全局样式，属于另一条可导致“页面完全不响应”的高风险路径。
- E5: 用本地 engine API 检查当前 3 个线程内容时，暂未发现明显原始 `<style>/<script>/position:fixed` 标记，因此当前这次故障更像是前端自身覆盖层/命中层问题，而不是现有历史消息注入。
- E6: 修复后第一次验证出现“切到其他插件再切回来，一直显示初始化中”；宿主日志新增 `08:15:03 onDidReceiveMessage: webviewReady`，但此前没有新的 `resolveWebviewView`，说明同一个 view 上 webview 内容会重载并重新发 `webviewReady`。
- E7: 原实现收到 `webviewReady` 时只刷新 `threadList/taskList/workState`，不会重发 `ready` 状态，也不会把 `currentThread` 的历史重新同步给新页面实例；这与“重新进入侧栏后卡在初始化中”完全吻合。

## Fix Applied
- F1: 默认关闭 webview 内部调试面板与全局高频交互监听，避免调试残留继续影响命中层和交互表现。
- F2: Markdown 渲染前先转义原始 HTML，阻断消息内容通过 `innerHTML` 注入样式/覆盖层的路径。
- F3: 新增 `syncWebviewState()`；每次收到 `webviewReady` 时都会重发 `ready`、刷新侧栏数据、恢复当前线程历史并重新订阅事件流，修复页面重载后一直停留在“初始化中”的状态丢失问题。

## Next
- Primary suspect: remove/disable fixed debug overlay and re-check hit testing near toolbar/input.
- Secondary hardening: sanitize rendered markdown/thinking HTML before assigning to `innerHTML`.
- Verify after redeploy: reload Trae window, reopen CodeWhale VSCode, confirm input/send/sidebar interactions recover and status no longer sticks on initializing after tab switches.
