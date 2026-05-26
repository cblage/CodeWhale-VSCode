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
- 生成 `brotherwhale-vscode-0.1.0.vsix` 文件
- 包含所有必要的源文件和资源
- 文件大小约 180KB

### 安装 VSIX
```bash
code --install-extension ./brotherwhale-vscode-0.1.0.vsix --force
```

> 使用 Trae CN 时如果 `code` 不可用，先设置 alias：
> ```bash
> alias code="/Applications/Trae CN.app/Contents/Resources/app/bin/code"
> ```

### 一键编译打包安装
```bash
npm run compile && \
npx @vscode/vsce package --no-dependencies && \
code --install-extension ./brotherwhale-vscode-0.1.0.vsix --force
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
