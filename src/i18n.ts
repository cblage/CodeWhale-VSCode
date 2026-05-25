import * as vscode from "vscode";

// ── Translation data ──

interface Translations {
  locale: string; // "en" or "zh-cn"
  history: string;
  threads: string;
  tasks: string;
  work: string;
  newThread: string;
  compact: string;
  interrupt: string;
  toggleHistory: string;
  send: string;
  inputPlaceholder: string;
  initializing: string;
  ready: string;
  thinking: string;
  streaming: string;
  processing: string;
  error: string;
  approvalAwaiting: string;
  userInputRequired: string;
  userInputAwaiting: string;
  noConversations: string;
  noTasks: string;
  threadsCount: (n: number) => string;
  modelLabel: string;
  workspaceLabel: string;
  modeLabel: string;
  reasoningEffortLabel: string;
  welcomeTitle: string;
  welcomeSubtitle: string;
  welcomeQuote: string;
  welcomeQuoteAuthor: string;
  welcomeSuggestionTitle: string;
  welcomeSuggestion1: string;
  welcomeSuggestion2: string;
  welcomeSuggestion3: string;
  welcomeSuggestion4: string;
  noActiveWork: string;
  cancel: string;
  goal: string;
  checklist: string;
  strategy: string;
  cycles: string;
  coherenceHealthy: string;
  coherenceGettingCrowded: string;
  coherenceRefreshingContext: string;
  coherenceVerifyingRecentWork: string;
  coherenceResettingPlan: string;
  completionPct: string;
  readyTimedOut: string;
  note: string;
  noPreviousMessage: string;
  justNow: string;
  minutesAgoPattern: string;
  hoursAgoPattern: string;
  daysAgoPattern: string;
  loadedThread: (title: string) => string;
  contextCompacted: string;
  compactFailed: string;
  sendFailed: string;
  initFailed: string;
  eventStreamError: string;
  engineRestarted: string;
  engineRestartFailed: string;
  engineNotRunning: string;
  approvalRequired: string;
  allow: string;
  deny: string;
  thinkingToggle: string;
  thinkingOpen: string;
  thinkingClose: string;
  /** "{n} threads" / "{n} 个会话" — webview JS replaces {n} */
  threadsCountPattern: string;
  /** "Loaded: {0}" / "已加载: {0}" */
  loadedThreadPattern: string;
  // Slash commands
  commandMode: string;
  commandModel: string;
  commandModels: string;
  commandReasoning: string;
  commandConfig: string;
  commandSettings: string;
  commandClear: string;
  commandInterrupt: string;
  commandHelp: string;
  commandCompact: string;
  commandExit: string;
  commandRename: string;
  commandSave: string;
  commandExport: string;
  commandContext: string;
  commandTokens: string;
  commandCost: string;
  commandStatus: string;
  commandHome: string;
  commandWorkspace: string;
  commandTask: string;
  commandJobs: string;
  commandNote: string;
  commandMemory: string;
  commandTrust: string;
  commandVerbose: string;
  commandTheme: string;
  commandUndo: string;
  commandRetry: string;
  commandShare: string;
  commandGoal: string;
  commandSkills: string;
  commandSkill: string;
  commandMcp: string;
  commandNetwork: string;
  commandProvider: string;
  commandQueue: string;
  commandStash: string;
  commandHooks: string;
  commandSubagents: string;
  commandAgent: string;
  commandLinks: string;
  commandFeedback: string;
  commandAttach: string;
  commandAnchor: string;
  commandSessions: string;
  commandLoad: string;
  commandCycles: string;
  commandCycle: string;
  commandRecall: string;
  commandRelay: string;
  commandInit: string;
  commandLsp: string;
  commandReview: string;
  commandRestore: string;
  commandRlm: string;
  commandChange: string;
  commandCache: string;
  commandProfile: string;
  commandTranslate: string;
  commandSystem: string;
  commandEdit: string;
  commandDiff: string;
  commandStatusline: string;
  commandLogout: string;
  commandNotAvailableInGui: string;
  fileChanges: string;
  viewDiff: string;
  openFile: string;
  noChanges: string;
  changesThisTurn: string;
  fileCreated: string;
  fileModified: string;
  fileDeleted: string;
  addedLines: string;
  removedLines: string;
}

const en: Translations = {
  locale: "en",
  history: "History", threads: "Threads", tasks: "Tasks", work: "Work",
  newThread: "+ New", compact: "⬒ Compact", interrupt: "■ Stop",
  toggleHistory: "Click to toggle history", send: "Send",
  inputPlaceholder: "Ask CodeWhale...",
  initializing: "Initializing...", ready: "Ready",
  thinking: "Thinking...", streaming: "Streaming...", processing: "Processing...",
  error: "Error", approvalAwaiting: "⏳ Awaiting approval...",
  userInputRequired: "Input required",
  userInputAwaiting: "⏳ Awaiting your input...",
  noConversations: "No conversations yet", noTasks: "No tasks",
  threadsCount: (n) => `${n} thread${n !== 1 ? "s" : ""}`,
  modelLabel: "Model", workspaceLabel: "Workspace",
  modeLabel: "Mode", reasoningEffortLabel: "Reasoning Effort",
  welcomeTitle: "CodeWhale",
  welcomeSubtitle: "Technology serves the enduring mission of civilization",
  welcomeQuote: "To establish the heart for heaven and earth, to secure life for the people, to continue the lost learning of past sages, and to establish peace for all generations.",
  welcomeQuoteAuthor: "— Zhang Zai",
  welcomeSuggestionTitle: "How can I help you today?",
  welcomeSuggestion1: "Explain a concept or idea",
  welcomeSuggestion2: "Write or refactor code",
  welcomeSuggestion3: "Analyze a problem step by step",
  welcomeSuggestion4: "Explore a topic in depth",
  noActiveWork: "No active work",
  cancel: "Cancel",
  goal: "Goal",
  checklist: "Checklist",
  strategy: "Strategy",
  cycles: "cycles",
  coherenceHealthy: "Healthy",
  coherenceGettingCrowded: "Getting crowded",
  coherenceRefreshingContext: "Refreshing context…",
  coherenceVerifyingRecentWork: "Verifying recent work…",
  coherenceResettingPlan: "Resetting plan…",
  completionPct: "{n}% complete",
  readyTimedOut: "Ready (stream timed out)",
  note: "Note",
  noPreviousMessage: "No previous message to edit",
  justNow: "just now",
  minutesAgoPattern: "{n}m ago",
  hoursAgoPattern: "{n}h ago",
  daysAgoPattern: "{n}d ago",
  loadedThread: (title) => `Loaded: ${title}`,
  contextCompacted: "Context compacted", compactFailed: "Compact failed",
  sendFailed: "Failed to send message", initFailed: "Failed to initialize",
  eventStreamError: "Event stream error",
  engineRestarted: "CodeWhale engine restarted",
  engineRestartFailed: "Failed to restart engine",
  engineNotRunning: "CodeWhale engine is not running",
  approvalRequired: "Approval required", allow: "Allow", deny: "Deny",
  thinkingToggle: "▶ Thinking", thinkingOpen: "▼ Thinking", thinkingClose: "▶ Thinking",
  threadsCountPattern: "{n} threads",
  loadedThreadPattern: "Loaded: {0}",
  commandMode: "/mode - Switch mode (agent/plan/yolo)",
  commandModel: "/model - Switch model",
  commandModels: "/models - List available models",
  commandReasoning: "/reasoning - Set reasoning effort",
  commandConfig: "/config - Open settings",
  commandSettings: "/settings - Show current settings",
  commandClear: "/clear - Clear chat",
  commandInterrupt: "/interrupt - Interrupt current turn",
  commandHelp: "/help - Show help",
  commandCompact: "/compact - Compact context",
  commandExit: "/exit - Close sidebar",
  commandRename: "/rename - Rename current thread",
  commandSave: "/save - Save conversation",
  commandExport: "/export - Export conversation",
  commandContext: "/context - Show context info",
  commandTokens: "/tokens - Show token usage",
  commandCost: "/cost - Show cost info",
  commandStatus: "/status - Show engine status",
  commandHome: "/home - Show dashboard",
  commandWorkspace: "/workspace - Set workspace",
  commandTask: "/task - Manage tasks",
  commandJobs: "/jobs - Manage background jobs (partial: TUI runtime only)",
  commandNote: "/note <text> | add | list | remove <n> | clear | path - Manage workspace notes",
  commandMemory: "/memory [show|path|clear|edit] - Manage persistent user-memory file",
  commandTrust: "/trust - Manage trust settings",
  commandVerbose: "/verbose - Toggle verbose mode",
  commandTheme: "/theme - Change theme (not available in GUI)",
  commandUndo: "/undo - Shows last turn info (full undo not supported via API)",
  commandRetry: "/retry - Retry last turn",
  commandShare: "/share - Share conversation (not available: requires TUI HTTP server)",
  commandGoal: "/goal <objective> [| budget: <tokens>] | /goal clear - Set or clear session goal",
  commandSkills: "/skills - List skills",
  commandSkill: "/skill - Run a skill",
  commandMcp: "/mcp - Manage MCP servers",
  commandNetwork: "/network - Manage network rules",
  commandProvider: "/provider - Switch API provider",
  commandQueue: "/queue - Manage message queue",
  commandStash: "/stash - Stash/restore messages",
  commandHooks: "/hooks - Manage hooks",
  commandSubagents: "/subagents - List sub-agents",
  commandAgent: "/agent - Spawn a sub-agent",
  commandLinks: "/links - Show CodeWhale links",
  commandFeedback: "/feedback - Send feedback",
  commandAttach: "/attach - Attach a file",
  commandAnchor: "/anchor <text> | list | remove <n> - Manage compaction anchors",
  commandSessions: "/sessions - Manage sessions",
  commandLoad: "/load - Load a session",
  commandCycles: "/cycles - List cycles",
  commandCycle: "/cycle - Show cycle details",
  commandRecall: "/recall - Recall from archive",
  commandRelay: "/relay - Relay to next agent",
  commandInit: "/init - Initialize project config",
  commandLsp: "/lsp - LSP settings",
  commandReview: "/review - Review code",
  commandRestore: "/restore - Restore from snapshot",
  commandRlm: "/rlm - Recursive language model",
  commandChange: "/change - View changelog",
  commandCache: "/cache - Show per-turn prefix-cache telemetry for last 10 turns",
  commandProfile: "/profile <name> - Switch to a named config profile",
  commandTranslate: "/translate - Toggle translation mode on/off",
  commandSystem: "/system - Show the current system prompt",
  commandEdit: "/edit - Load the last user message into the input for editing",
  commandDiff: "/diff - Show git diff output for the workspace",
  commandStatusline: "/statusline - Status line info",
  commandLogout: "/logout - Logout",
  commandNotAvailableInGui: "This command is not available in the VSCode extension. Use the TUI terminal instead.",
  fileChanges: "Changes",
  viewDiff: "View Diff",
  openFile: "Open File",
  noChanges: "No file changes this turn",
  changesThisTurn: "Changes This Turn",
  fileCreated: "created",
  fileModified: "modified",
  fileDeleted: "deleted",
  addedLines: "+{n}",
  removedLines: "-{n}",
};

const zhCn: Translations = {
  locale: "zh-cn",
  history: "历史", threads: "会话", tasks: "任务", work: "工作",
  newThread: "+ 新建", compact: "⬒ 压缩", interrupt: "■ 停止",
  toggleHistory: "点击切换历史", send: "发送",
  inputPlaceholder: "向 CodeWhale 提问...",
  initializing: "初始化中...", ready: "就绪",
  thinking: "思考中...", streaming: "输出中...", processing: "处理中...",
  error: "错误", approvalAwaiting: "⏳ 等待审批...",
  userInputRequired: "需要输入",
  userInputAwaiting: "⏳ 等待您的输入...",
  noConversations: "暂无会话", noTasks: "暂无任务",
  threadsCount: (n) => `${n} 个会话`,
  modelLabel: "模型", workspaceLabel: "工作区",
  modeLabel: "模式", reasoningEffortLabel: "思考深度",
  welcomeTitle: "CodeWhale",
  welcomeSubtitle: "科技服务文明传承的长线使命",
  welcomeQuote: "为天地立心，为生民立命，为往圣继绝学，为万世开太平。",
  welcomeQuoteAuthor: "—— 张载",
  welcomeSuggestionTitle: "今天想探索什么？",
  welcomeSuggestion1: "解释一个概念或想法",
  welcomeSuggestion2: "编写或重构代码",
  welcomeSuggestion3: "逐步分析一个问题",
  welcomeSuggestion4: "深入探索某个话题",
  noActiveWork: "暂无进行中的工作",
  cancel: "取消",
  goal: "目标",
  checklist: "检查清单",
  strategy: "策略",
  cycles: "轮次",
  coherenceHealthy: "健康",
  coherenceGettingCrowded: "上下文趋满",
  coherenceRefreshingContext: "正在刷新上下文…",
  coherenceVerifyingRecentWork: "正在验证近期工作…",
  coherenceResettingPlan: "正在重置计划…",
  completionPct: "已完成 {n}%",
  readyTimedOut: "就绪（流超时）",
  note: "提示",
  noPreviousMessage: "没有可编辑的上一条消息",
  justNow: "刚刚",
  minutesAgoPattern: "{n}分钟前",
  hoursAgoPattern: "{n}小时前",
  daysAgoPattern: "{n}天前",
  loadedThread: (title) => `已加载: ${title}`,
  contextCompacted: "上下文已压缩", compactFailed: "压缩失败",
  sendFailed: "发送消息失败", initFailed: "初始化失败",
  eventStreamError: "事件流错误",
  engineRestarted: "CodeWhale 引擎已重启",
  engineRestartFailed: "重启引擎失败",
  engineNotRunning: "CodeWhale 引擎未运行",
  approvalRequired: "需要审批", allow: "允许", deny: "拒绝",
  thinkingToggle: "▶ 思考过程", thinkingOpen: "▼ 思考过程", thinkingClose: "▶ 思考过程",
  threadsCountPattern: "{n} 个会话",
  loadedThreadPattern: "已加载: {0}",
  commandMode: "/mode - 切换模式 (agent/plan/yolo)",
  commandModel: "/model - 切换模型",
  commandModels: "/models - 列出可用模型",
  commandReasoning: "/reasoning - 设置思考深度",
  commandConfig: "/config - 打开设置",
  commandSettings: "/settings - 显示当前设置",
  commandClear: "/clear - 清空聊天",
  commandInterrupt: "/interrupt - 中断当前对话",
  commandHelp: "/help - 显示帮助",
  commandCompact: "/compact - 压缩上下文",
  commandExit: "/exit - 关闭侧边栏",
  commandRename: "/rename - 重命名当前会话",
  commandSave: "/save - 保存对话",
  commandExport: "/export - 导出对话",
  commandContext: "/context - 显示上下文信息",
  commandTokens: "/tokens - 显示 Token 用量",
  commandCost: "/cost - 显示费用信息",
  commandStatus: "/status - 显示引擎状态",
  commandHome: "/home - 显示仪表盘",
  commandWorkspace: "/workspace - 设置工作区",
  commandTask: "/task - 管理任务",
  commandJobs: "/jobs - 管理后台任务（部分支持：需TUI运行时）",
  commandNote: "/note <文本> | add | list | remove <n> | clear | path - 管理工作区笔记",
  commandMemory: "/memory [show|path|clear|edit] - 管理持久化用户记忆文件",
  commandTrust: "/trust - 管理信任设置",
  commandVerbose: "/verbose - 切换详细模式",
  commandTheme: "/theme - 更改主题 (GUI中不可用)",
  commandUndo: "/undo - 显示上一轮信息（完整撤销不受API支持）",
  commandRetry: "/retry - 重试上次对话",
  commandShare: "/share - 分享对话（不可用：需TUI HTTP服务器）",
  commandGoal: "/goal <目标> [| budget: <tokens>] | /goal clear - 设定或清除会话目标",
  commandSkills: "/skills - 列出技能",
  commandSkill: "/skill - 运行技能",
  commandMcp: "/mcp - 管理 MCP 服务器",
  commandNetwork: "/network - 管理网络规则",
  commandProvider: "/provider - 切换 API 提供商",
  commandQueue: "/queue - 管理消息队列",
  commandStash: "/stash - 暂存/恢复消息",
  commandHooks: "/hooks - 管理钩子",
  commandSubagents: "/subagents - 列出子代理",
  commandAgent: "/agent - 启动子代理",
  commandLinks: "/links - 显示 CodeWhale 链接",
  commandFeedback: "/feedback - 发送反馈",
  commandAttach: "/attach - 附加文件",
  commandAnchor: "/anchor <文本> | list | remove <n> - 管理压缩锚点",
  commandSessions: "/sessions - 管理会话",
  commandLoad: "/load - 加载会话",
  commandCycles: "/cycles - 列出周期",
  commandCycle: "/cycle - 显示周期详情",
  commandRecall: "/recall - 从归档中恢复",
  commandRelay: "/relay - 传递给下一个代理",
  commandInit: "/init - 初始化项目配置",
  commandLsp: "/lsp - LSP 设置",
  commandReview: "/review - 审查代码",
  commandRestore: "/restore - 从快照恢复",
  commandRlm: "/rlm - 递归语言模型",
  commandChange: "/change - 查看更新日志",
  commandCache: "/cache - 显示最近10轮的前缀缓存遥测数据",
  commandProfile: "/profile <名称> - 切换到指定配置档案",
  commandTranslate: "/translate - 开关翻译模式",
  commandSystem: "/system - 显示当前系统提示词",
  commandEdit: "/edit - 将上一条用户消息加载到输入框进行编辑",
  commandDiff: "/diff - 显示工作区的 git diff 输出",
  commandStatusline: "/statusline - 状态栏信息",
  commandLogout: "/logout - 登出",
  commandNotAvailableInGui: "此命令在 VSCode 扩展中不可用，请使用 TUI 终端。",
  fileChanges: "文件变更",
  viewDiff: "查看差异",
  openFile: "打开文件",
  noChanges: "本轮无文件变更",
  changesThisTurn: "本轮文件变更",
  fileCreated: "新建",
  fileModified: "修改",
  fileDeleted: "删除",
  addedLines: "+{n}",
  removedLines: "-{n}",
};

const translations: Record<string, Translations> = {
  en, "en-us": en, "en-gb": en,
  "zh-cn": zhCn, "zh-CN": zhCn, "zh-tw": zhCn, zh: zhCn,
};

// ── Public API ──

/** Full translation table for extension-side messages */
export function t(): Translations {
  const lang = vscode.env.language.toLowerCase();
  return translations[lang] || en;
}

/** Returns "zh-cn" or "en" */
export function currentLocale(): string {
  const lang = vscode.env.language.toLowerCase();
  if (lang.startsWith("zh")) return "zh-cn";
  return "en";
}

/**
 * JSON-serialisable subset for embedding in webview HTML.
 * Functions (threadsCount, loadedThread) are serialised as replaceable strings.
 */
export function webviewTranslations(tr: Translations) {
  return {
    locale: tr.locale || "en",
    history: tr.history,
    threads: tr.threads,
    tasks: tr.tasks,
    work: tr.work,
    newThread: tr.newThread,
    compact: tr.compact,
    interrupt: tr.interrupt,
    toggleHistory: tr.toggleHistory,
    send: tr.send,
    inputPlaceholder: tr.inputPlaceholder,
    initializing: tr.initializing,
    ready: tr.ready,
    thinking: tr.thinking,
    streaming: tr.streaming,
    processing: tr.processing,
    error: tr.error,
    approvalAwaiting: tr.approvalAwaiting,
    userInputRequired: tr.userInputRequired,
    userInputAwaiting: tr.userInputAwaiting,
    noConversations: tr.noConversations,
    noTasks: tr.noTasks,
    threadsCountPattern: tr.threadsCountPattern,
    modelLabel: tr.modelLabel,
    workspaceLabel: tr.workspaceLabel,
    loadedThreadPattern: tr.loadedThreadPattern,
    approvalRequired: tr.approvalRequired,
    allow: tr.allow,
    deny: tr.deny,
    thinkingToggle: tr.thinkingToggle,
    thinkingOpen: tr.thinkingOpen,
    thinkingClose: tr.thinkingClose,
    contextCompacted: tr.contextCompacted,
    compactFailed: tr.compactFailed,
    sendFailed: tr.sendFailed,
    initFailed: tr.initFailed,
    eventStreamError: tr.eventStreamError,
    engineRestarted: tr.engineRestarted,
    engineRestartFailed: tr.engineRestartFailed,
    engineNotRunning: tr.engineNotRunning,
    modeLabel: tr.modeLabel,
    reasoningEffortLabel: tr.reasoningEffortLabel,
    welcomeTitle: tr.welcomeTitle,
    welcomeSubtitle: tr.welcomeSubtitle,
    welcomeQuote: tr.welcomeQuote,
    welcomeQuoteAuthor: tr.welcomeQuoteAuthor,
    welcomeSuggestionTitle: tr.welcomeSuggestionTitle,
    welcomeSuggestion1: tr.welcomeSuggestion1,
    welcomeSuggestion2: tr.welcomeSuggestion2,
    welcomeSuggestion3: tr.welcomeSuggestion3,
    welcomeSuggestion4: tr.welcomeSuggestion4,
    noActiveWork: tr.noActiveWork,
    cancel: tr.cancel,
    goal: tr.goal,
    checklist: tr.checklist,
    strategy: tr.strategy,
    cycles: tr.cycles,
    coherenceHealthy: tr.coherenceHealthy,
    coherenceGettingCrowded: tr.coherenceGettingCrowded,
    coherenceRefreshingContext: tr.coherenceRefreshingContext,
    coherenceVerifyingRecentWork: tr.coherenceVerifyingRecentWork,
    coherenceResettingPlan: tr.coherenceResettingPlan,
    completionPct: tr.completionPct,
    readyTimedOut: tr.readyTimedOut,
    note: tr.note,
    noPreviousMessage: tr.noPreviousMessage,
    justNow: tr.justNow,
    minutesAgoPattern: tr.minutesAgoPattern,
    hoursAgoPattern: tr.hoursAgoPattern,
    daysAgoPattern: tr.daysAgoPattern,
    commandMode: tr.commandMode,
    commandModel: tr.commandModel,
    commandModels: tr.commandModels,
    commandReasoning: tr.commandReasoning,
    commandConfig: tr.commandConfig,
    commandSettings: tr.commandSettings,
    commandClear: tr.commandClear,
    commandInterrupt: tr.commandInterrupt,
    commandHelp: tr.commandHelp,
    commandCompact: tr.commandCompact,
    commandExit: tr.commandExit,
    commandRename: tr.commandRename,
    commandSave: tr.commandSave,
    commandExport: tr.commandExport,
    commandContext: tr.commandContext,
    commandTokens: tr.commandTokens,
    commandCost: tr.commandCost,
    commandStatus: tr.commandStatus,
    commandHome: tr.commandHome,
    commandWorkspace: tr.commandWorkspace,
    commandTask: tr.commandTask,
    commandJobs: tr.commandJobs,
    commandNote: tr.commandNote,
    commandMemory: tr.commandMemory,
    commandTrust: tr.commandTrust,
    commandVerbose: tr.commandVerbose,
    commandTheme: tr.commandTheme,
    commandUndo: tr.commandUndo,
    commandRetry: tr.commandRetry,
    commandShare: tr.commandShare,
    commandGoal: tr.commandGoal,
    commandSkills: tr.commandSkills,
    commandSkill: tr.commandSkill,
    commandMcp: tr.commandMcp,
    commandNetwork: tr.commandNetwork,
    commandProvider: tr.commandProvider,
    commandQueue: tr.commandQueue,
    commandStash: tr.commandStash,
    commandHooks: tr.commandHooks,
    commandSubagents: tr.commandSubagents,
    commandAgent: tr.commandAgent,
    commandLinks: tr.commandLinks,
    commandFeedback: tr.commandFeedback,
    commandAttach: tr.commandAttach,
    commandAnchor: tr.commandAnchor,
    commandSessions: tr.commandSessions,
    commandLoad: tr.commandLoad,
    commandCycles: tr.commandCycles,
    commandCycle: tr.commandCycle,
    commandRecall: tr.commandRecall,
    commandRelay: tr.commandRelay,
    commandInit: tr.commandInit,
    commandLsp: tr.commandLsp,
    commandReview: tr.commandReview,
    commandRestore: tr.commandRestore,
    commandRlm: tr.commandRlm,
    commandChange: tr.commandChange,
    commandCache: tr.commandCache,
    commandProfile: tr.commandProfile,
    commandTranslate: tr.commandTranslate,
    commandSystem: tr.commandSystem,
    commandEdit: tr.commandEdit,
    commandDiff: tr.commandDiff,
    commandStatusline: tr.commandStatusline,
    commandLogout: tr.commandLogout,
    commandNotAvailableInGui: tr.commandNotAvailableInGui,
    fileChanges: tr.fileChanges,
    viewDiff: tr.viewDiff,
    openFile: tr.openFile,
    noChanges: tr.noChanges,
    changesThisTurn: tr.changesThisTurn,
    fileCreated: tr.fileCreated,
    fileModified: tr.fileModified,
    fileDeleted: tr.fileDeleted,
    addedLines: tr.addedLines,
    removedLines: tr.removedLines,
  };
}
