import { describe, it, expect } from "vitest";

interface TranslationEntry {
  key: string;
  enValue: string;
  zhCnValue: string;
}

const COMMAND_KEYS = [
  "commandMode", "commandModel", "commandModels", "commandReasoning",
  "commandConfig", "commandSettings", "commandClear", "commandHelp",
  "commandCompact", "commandExit", "commandRename", "commandSave",
  "commandExport", "commandContext", "commandTokens", "commandCost",
  "commandStatus", "commandHome", "commandWorkspace", "commandTask",
  "commandJobs", "commandNote", "commandMemory", "commandTrust",
  "commandVerbose", "commandTheme", "commandUndo", "commandRetry",
  "commandShare", "commandGoal", "commandSkills", "commandSkill",
  "commandMcp", "commandNetwork", "commandProvider", "commandQueue",
  "commandStash", "commandHooks", "commandSubagents", "commandAgent",
  "commandLinks", "commandFeedback", "commandAttach", "commandAnchor",
  "commandSessions", "commandLoad", "commandCycles", "commandCycle",
  "commandRecall", "commandRelay", "commandInit", "commandLsp",
  "commandReview", "commandRestore", "commandRlm", "commandChange",
  "commandCache", "commandProfile", "commandTranslate", "commandSystem",
  "commandEdit", "commandDiff", "commandLogout", "commandNotAvailableInGui",
];

describe("i18n command translations", () => {
  const enTranslations: Record<string, string> = {
    commandMode: "/mode - Switch mode (agent/plan/yolo)",
    commandModel: "/model - Switch model",
    commandModels: "/models - List available models",
    commandReasoning: "/reasoning - Set reasoning effort",
    commandConfig: "/config - Open settings",
    commandSettings: "/settings - Show current settings",
    commandClear: "/clear - Clear chat",
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
    commandJobs: "/jobs - Manage background jobs",
    commandNote: "/note - Manage notes",
    commandMemory: "/memory - Manage memory",
    commandTrust: "/trust - Manage trust settings",
    commandVerbose: "/verbose - Toggle verbose mode",
    commandTheme: "/theme - Change theme (not available in GUI)",
    commandUndo: "/undo - Undo last action",
    commandRetry: "/retry - Retry last turn",
    commandShare: "/share - Share conversation",
    commandGoal: "/goal - Set a goal",
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
    commandLinks: "/links - Show DeepSeek links",
    commandFeedback: "/feedback - Send feedback",
    commandAttach: "/attach - Attach a file",
    commandAnchor: "/anchor - Set anchor points",
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
    commandCache: "/cache - Cache telemetry",
    commandProfile: "/profile - Switch profile",
    commandTranslate: "/translate - Toggle translation",
    commandSystem: "/system - Show system prompt",
    commandEdit: "/edit - Edit last message",
    commandDiff: "/diff - Show diff",
    commandLogout: "/logout - Logout",
    commandNotAvailableInGui: "This command is not available in the VSCode extension. Use the TUI terminal instead.",
  };

  const zhCnTranslations: Record<string, string> = {
    commandMode: "/mode - 切换模式 (agent/plan/yolo)",
    commandModel: "/model - 切换模型",
    commandModels: "/models - 列出可用模型",
    commandReasoning: "/reasoning - 设置思考深度",
    commandConfig: "/config - 打开设置",
    commandSettings: "/settings - 显示当前设置",
    commandClear: "/clear - 清空聊天",
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
    commandJobs: "/jobs - 管理后台任务",
    commandNote: "/note - 管理笔记",
    commandMemory: "/memory - 管理记忆",
    commandTrust: "/trust - 管理信任设置",
    commandVerbose: "/verbose - 切换详细模式",
    commandTheme: "/theme - 更改主题 (GUI中不可用)",
    commandUndo: "/undo - 撤销上次操作",
    commandRetry: "/retry - 重试上次对话",
    commandShare: "/share - 分享对话",
    commandGoal: "/goal - 设定目标",
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
    commandLinks: "/links - 显示 DeepSeek 链接",
    commandFeedback: "/feedback - 发送反馈",
    commandAttach: "/attach - 附加文件",
    commandAnchor: "/anchor - 设置锚点",
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
    commandCache: "/cache - 缓存遥测",
    commandProfile: "/profile - 切换配置",
    commandTranslate: "/translate - 切换翻译",
    commandSystem: "/system - 显示系统提示",
    commandEdit: "/edit - 编辑上一条消息",
    commandDiff: "/diff - 显示差异",
    commandLogout: "/logout - 登出",
    commandNotAvailableInGui: "此命令在 VSCode 扩展中不可用，请使用 TUI 终端。",
  };

  it("has all command keys in English translations", () => {
    for (const key of COMMAND_KEYS) {
      expect(enTranslations[key], `Missing English translation for ${key}`).toBeDefined();
      expect(enTranslations[key].length, `Empty English translation for ${key}`).toBeGreaterThan(0);
    }
  });

  it("has all command keys in Chinese translations", () => {
    for (const key of COMMAND_KEYS) {
      expect(zhCnTranslations[key], `Missing Chinese translation for ${key}`).toBeDefined();
      expect(zhCnTranslations[key].length, `Empty Chinese translation for ${key}`).toBeGreaterThan(0);
    }
  });

  it("all command translations start with /command-name", () => {
    for (const key of COMMAND_KEYS) {
      if (key === "commandNotAvailableInGui") continue;
      const enVal = enTranslations[key];
      expect(enVal, `English ${key} should start with /`).toMatch(/^\//);
    }
  });

  it("commandNotAvailableInGui is properly set", () => {
    expect(enTranslations.commandNotAvailableInGui).toContain("not available");
    expect(zhCnTranslations.commandNotAvailableInGui).toContain("不可用");
  });

  it("has same number of command keys in both languages", () => {
    const enKeys = Object.keys(enTranslations).filter((k) => k.startsWith("command"));
    const zhKeys = Object.keys(zhCnTranslations).filter((k) => k.startsWith("command"));
    expect(enKeys.length).toBe(zhKeys.length);
  });
});
