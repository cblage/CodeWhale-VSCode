import { describe, it, expect, vi } from "vitest";
import { getWebviewHtml, WebviewTranslations } from "./webview-html";

// Mock vscode since webview-html.ts imports it
vi.mock("vscode", () => ({
  Uri: {
    file: (p: string) => ({ fsPath: p }),
    joinPath: (...args: any[]) => ({
      fsPath: args.map((arg) => typeof arg === "string" ? arg : arg.fsPath).join("/"),
    }),
  },
}));

function makeTr(): WebviewTranslations {
  return {
    locale: "en",
    history: "History",
    threads: "Threads",
    sessions: "Sessions",
    tasks: "Tasks",
    work: "Work",
    newThread: "New Thread",
    compact: "Compact",
    contextUsage: "Context",
    contextUsageUnavailable: "Context usage unavailable",
    interrupt: "Interrupt",
    steer: "Steer",
    toggleHistory: "Toggle History",
    send: "Send",
    inputPlaceholder: "Type a message...",
    initializing: "Initializing...",
    ready: "Ready",
    thinking: "Thinking...",
    streaming: "Streaming...",
    processing: "Processing...",
    error: "Error",
    approvalAwaiting: "Approval Required",
    noConversations: "No conversations",
    noTasks: "No tasks",
    threadsCountPattern: "{n} threads",
    modelLabel: "Model",
    workspaceLabel: "Workspace",
    loadedThreadPattern: "Loaded: {0}",
    showAllWorkspaces: "All",
    filterCurrentWorkspace: "Project",
    showingWorkspaceSessions: "Show sessions from this project",
    showingAllSessions: "Show sessions from all workspaces",
    approvalRequired: "Approval required",
    allow: "Allow",
    deny: "Deny",
    thinkingToggle: "Thinking",
    thinkingOpen: "▶ Thinking",
    thinkingClose: "▼ Thinking",
    modeLabel: "Mode",
    reasoningEffortLabel: "Effort",
    welcomeTitle: "CodeWhale",
    welcomeSubtitle: "Your AI coding partner",
    welcomeQuote: "The best way to predict the future is to invent it.",
    welcomeQuoteAuthor: "Alan Kay",
    welcomeSuggestionTitle: "Try asking",
    welcomeSuggestion1: "Explain this code",
    welcomeSuggestion2: "Write a test",
    welcomeSuggestion3: "Find bugs",
    welcomeSuggestion4: "Refactor this",
    noActiveWork: "No active work",
    cancel: "Cancel",
    goal: "Goal",
    checklist: "To-do",
    strategy: "Strategy",
    cycles: "Cycles",
    coherenceHealthy: "Healthy",
    coherenceGettingCrowded: "Getting crowded",
    coherenceRefreshingContext: "Refreshing context",
    coherenceVerifyingRecentWork: "Verifying recent work",
    coherenceResettingPlan: "Resetting plan",
    completionPct: "0%",
    readyTimedOut: "Ready timed out",
    note: "Note",
    dismissNotification: "Dismiss notification",
    noPreviousMessage: "No previous message",
    justNow: "just now",
    minutesAgoPattern: "{n} min ago",
    hoursAgoPattern: "{n}h ago",
    daysAgoPattern: "{n}d ago",
    commandMode: "/mode",
    commandModel: "/model",
    commandModels: "/models",
    commandReasoning: "/reasoning",
    commandConfig: "/config",
    commandSettings: "/settings",
    commandClear: "/clear",
    commandInterrupt: "/interrupt",
    commandHelp: "/help",
    commandCompact: "/compact",
    commandExit: "/exit",
    commandRename: "/rename",
    commandSave: "/save",
    commandExport: "/export",
    commandContext: "/context",
    commandTokens: "/tokens",
    commandCost: "/cost",
    commandStatus: "/status",
    commandHome: "/home",
    commandWorkspace: "/workspace",
    commandTask: "/task",
    commandJobs: "/jobs",
    commandNote: "/note",
    commandMemory: "/memory",
    commandTrust: "/trust",
    commandVerbose: "/verbose",
    commandTheme: "/theme",
    commandUndo: "/undo",
    commandRetry: "/retry",
    commandShare: "/share",
    commandGoal: "/goal",
    commandSkills: "/skills",
    commandSkill: "/skill",
    commandMcp: "/mcp",
    commandNetwork: "/network",
    commandProvider: "/provider",
    commandQueue: "/queue",
    commandStash: "/stash",
    commandHooks: "/hooks",
    commandSubagents: "/subagents",
    commandAgent: "/agent",
    commandLinks: "/links",
    commandFeedback: "/feedback",
    commandAttach: "/attach",
    commandAnchor: "/anchor",
    commandSessions: "/sessions",
    commandLoad: "/load",
    commandCycles: "/cycles",
    commandCycle: "/cycle",
    commandRecall: "/recall",
    commandRelay: "/relay",
    commandInit: "/init",
    commandLsp: "/lsp",
    commandReview: "/review",
    commandRestore: "/restore",
    commandRlm: "/rlm",
    commandChange: "/change",
    commandCache: "/cache",
    commandProfile: "/profile",
    commandTranslate: "/translate",
    commandSystem: "/system",
    commandEdit: "/edit",
    commandDiff: "/diff",
    commandStatusline: "/statusline",
    commandLogout: "/logout",
    commandNotAvailableInGui: "Not available in GUI",
    attachFiles: "Attach files",
    removeAttachment: "Remove",
    attachedFileCount: "{n} files attached",
    fileNotSupported: "File type not supported",
    changes: "Changes",
    noFileChanges: "No file changes in this session",
    undoUnsupportedTooltip: "Undo not supported",
    retryUnsupportedTooltip: "Retry not supported",
    revertUnsupportedTooltip: "Revert not supported",
    fileCreated: "Created",
    fileDeleted: "Deleted",
    fileModified: "Modified",
    viewDiff: "View Diff",
    viewDiffTooltip: "View file diff",
    openFile: "Open File",
    openFileTooltip: "Open file in editor",
    revertFile: "Revert",
    revertFileTooltip: "Revert file changes",
    fileChanges: "File Changes",
    userInputAwaiting: "Input required",
    searchSessions: "Search",
    searchPlaceholder: "Search sessions...",
    deleteSession: "Delete",
    deleteSessionConfirmTitle: "Delete session?",
    deleteSessionConfirmMessage: 'This will permanently delete the session "{title}". This cannot be undone.',
    deleteSessionConfirmButton: "Delete",
    deleteSessionSuccess: "Session deleted",
    deleteSessionFailed: "Failed to delete session",
    noSearchResults: "No matching sessions",
    // Agent panel
    agents: "Agents",
    noAgentRuns: "No agent runs",
    agentStatusQueued: "Queued",
    agentStatusStarting: "Starting",
    agentStatusRunning: "Running",
    agentStatusWaitingForUser: "Waiting for input",
    agentStatusNeedsAction: "Needs parent action",
    agentStatusModelWait: "Waiting for model",
    agentStatusRunningTool: "Running tool",
    agentStatusCompleted: "Completed",
    agentStatusFailed: "Failed",
    agentStatusCancelled: "Cancelled",
    agentStatusInterrupted: "Interrupted",
    agentObjective: "Objective",
    agentModel: "Model",
    agentProfile: "Profile",
    agentSteps: "Steps",
    agentResult: "Result",
    agentError: "Error",
    agentRole: "Role",
    agentArtifacts: "Artifacts",
    agentUsage: "Token usage",
    agentSpawned: "Spawned",
    agentDelegating: "Delegating",
    agentFanout: "Fan-out",
    agentActive: "active",
    agentInactive: "inactive",
    agentType: "Type",
    agentLatestOutput: "Latest output",
    agentDetails: "Details",
    stopAgent: "Stop",
    stopAllAgents: "Stop all agents",
    stoppingAgent: "Stopping…",
    agentTranscript: "Transcript",
    agentEvents: "Events",
    agentAssignment: "Assignment",
    agentRunMetadata: "Run metadata",
    agentReferences: "References",
    agentNoTranscript: "No transcript content is available",
    agentNoEvents: "No lifecycle events are available",
    agentPartialTranscript: "Earlier transcript messages were omitted from this bounded checkpoint",
    subagent: "Subagent",
  };
}

function makeMockWebview() {
  return {
    asWebviewUri: (uri: any) => uri.fsPath,
    cspSource: "vscode-webview://test",
  } as any;
}

function makeMockExtensionUri() {
  return { fsPath: "/test/extension" } as any;
}

describe("webview-html.ts assembler", () => {
  it("returns a complete HTML document", () => {
    const html = getWebviewHtml(makeMockWebview(), makeMockExtensionUri(), makeTr());
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("<title>🦍 HarambeChat</title>");
    expect(html).toContain('<body class="hide-agent-tool-cards compact-tool-details">');
    expect(html).toContain("</html>");
  });

  it("contains CSP header with nonce", () => {
    const html = getWebviewHtml(makeMockWebview(), makeMockExtensionUri(), makeTr());
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("style-src 'nonce-");
    expect(html).toContain("script-src 'nonce-");
  });

  it("contains CSS from webview-css module", () => {
    const html = getWebviewHtml(makeMockWebview(), makeMockExtensionUri(), makeTr());
    expect(html).toContain("--bg:");
    expect(html).toContain("--fg:");
    expect(html).toContain("#layout");
    expect(html).toContain("#messages");
  });

  it("contains HTML structure with all key elements", () => {
    const html = getWebviewHtml(makeMockWebview(), makeMockExtensionUri(), makeTr());
    expect(html).toContain('id="layout"');
    expect(html).not.toContain('id="threads-panel"');
    expect(html).not.toContain('id="sidebar-resize-handle"');
    expect(html).toContain('id="history-popover"');
    expect(html).toContain('id="input-resize-handle"');
    expect(html).toContain('id="chat-area"');
    expect(html).toContain('id="messages"');
    expect(html).toContain('id="input-area"');
    expect(html).not.toContain("cblage.codewhale:sidebarWidth");
    expect(html).toContain('id="toolbar"');
    expect(html).toContain('id="settings-bar"');
    expect(html).toContain('id="status"');
    expect(html).toContain('id="ui-tooltip"');
    expect(html).toContain('id="debug-panel"');
  });

  it("moves Sessions/Threads into a full-chat History popover and keeps Tasks separate", () => {
    const html = getWebviewHtml(makeMockWebview(), makeMockExtensionUri(), makeTr());
    expect(html).toContain('id="sidebar-threads"');
    expect(html).toContain('id="tab-sessions"');
    expect(html).toContain('id="tab-threads-list"');
    expect(html).toContain('class="history-popover-content"');
    expect(html).toContain('class="history-popover-list" id="tab-sessions"');
    expect(html).not.toContain('id="sidebar-tasks"');
    expect(html).not.toContain('id="tab-tasks"');
    expect(html).toContain('id="btn-tasks-popover" title="Tasks"');
    expect(html).toContain('aria-controls="tasks-popover"');
    expect(html).toContain('codicon codicon-server-process');
    expect(html).toContain('id="tasks-popover"');
    expect(html).toContain('id="tasks-popover-list"');
    expect(html).not.toContain('id="sidebar-changes"');
    expect(html).not.toContain('id="tab-changes"');
    expect(html).not.toContain('id="sidebar-work"');
    expect(html).not.toContain('id="tab-work"');
    expect(html).not.toContain('id="sidebar-agents"');
    expect(html).not.toContain('id="tab-agents"');
  });

  it("moves Changes out of the history sidebar into a top popover", () => {
    const html = getWebviewHtml(makeMockWebview(), makeMockExtensionUri(), makeTr());
    expect(html).not.toContain('<span class="sidebar-section-title">⛁ Changes</span>');
    expect(html).toContain('id="btn-changes" title="Changes"');
    expect(html).toContain('codicon codicon-diff-multiple');
    expect(html).toContain('id="changes-count-badge"');
    expect(html).toContain('id="changes-popover"');
    expect(html).toContain('id="changes-popover-list"');
    expect(html).not.toContain('<span class="sidebar-section-title">♙ Agents</span>');
    expect(html).not.toContain('<span class="sidebar-section-title">🤖 Agents</span>');
    expect(html).not.toContain('<span class="sidebar-section-title">📝 Changes</span>');
  });

  it("contains input area with all controls", () => {
    const html = getWebviewHtml(makeMockWebview(), makeMockExtensionUri(), makeTr());
    expect(html).toContain('id="input"');
    expect(html).toContain('id="btn-send-stop"');
    expect(html).toContain('id="btn-attach" title="Attach files" aria-label="Attach files"><span class="codicon codicon-attach"');
    expect(html).not.toContain("📎");
    expect(html).toContain('id="slash-menu"');
    expect(html).toContain('id="attachments-area"');
  });

  it("contains toolbar buttons", () => {
    const html = getWebviewHtml(makeMockWebview(), makeMockExtensionUri(), makeTr());
    expect(html).toContain('id="context-usage-gauge" class="context-usage-gauge unavailable" role="img" tabindex="0"');
    expect(html).toContain('data-tooltip="Context usage unavailable"');
    expect(html).toContain('<circle class="context-usage-track"');
    expect(html).toContain('<circle class="context-usage-value"');
    expect(html).toContain('stroke-dasharray="56.549" stroke-dashoffset="56.549"');
    expect(html).not.toContain('pathLength="100"');
    const newSessionButtonIndex = html.indexOf('id="btn-new-thread"');
    const historyButtonIndex = html.indexOf('id="btn-history"');
    const firstTopActionIndex = html.indexOf('id="btn-tasks-popover"');
    const agentButtonIndex = html.indexOf('id="btn-agents"');
    const configButtonIndex = html.indexOf('id="btn-config"');
    expect(newSessionButtonIndex).toBeLessThan(historyButtonIndex);
    expect(historyButtonIndex).toBeLessThan(firstTopActionIndex);
    expect(agentButtonIndex).toBeLessThan(configButtonIndex);
    expect(html.match(/id="btn-new-thread"/g)).toHaveLength(1);
    expect(html).toContain('id="btn-new-thread" title="New session" aria-label="New session"><span class="codicon codicon-new-session" aria-hidden="true"></span></button>');
    const toolbarHtml = html.slice(html.indexOf('<div id="toolbar">'), html.indexOf('<div id="session-controls-popover"'));
    expect(toolbarHtml).not.toContain('id="btn-new-thread"');
    expect(toolbarHtml).not.toContain('id="btn-compact"');
    expect(toolbarHtml).toContain('id="btn-session-controls" title="Session controls" aria-label="Session controls"');
    expect(toolbarHtml).toContain('codicon codicon-dashboard');
    const contextGaugeIndex = toolbarHtml.indexOf('id="context-usage-gauge"');
    const sessionControlsIndex = toolbarHtml.indexOf('id="btn-session-controls"');
    const undoIndex = toolbarHtml.indexOf('id="btn-undo"');
    const retryIndex = toolbarHtml.indexOf('id="btn-retry"');
    const stopAgentsIndex = toolbarHtml.indexOf('id="btn-stop-agents"');
    expect(contextGaugeIndex).toBeLessThan(sessionControlsIndex);
    expect(sessionControlsIndex).toBeLessThan(undoIndex);
    expect(undoIndex).toBeLessThan(retryIndex);
    expect(retryIndex).toBeLessThan(stopAgentsIndex);
    expect(toolbarHtml).not.toContain('id="thread-count"');
    expect(html).not.toContain('id="btn-threads"');
    expect(html).toContain('id="btn-history" title="History" aria-label="History" aria-expanded="false" aria-controls="history-popover"><span class="codicon codicon-history"');
    expect(html).not.toContain(">📋</button>");
    expect(html).toContain('id="btn-compact"><span class="codicon codicon-fold" aria-hidden="true"></span>Compact</button>');
    expect(html).toContain('id="btn-undo" title="Undo last turn" aria-label="Undo last turn"><span class="codicon codicon-discard" aria-hidden="true"></span></button>');
    expect(html).toContain('id="btn-retry" title="Retry last turn" aria-label="Retry last turn"><span class="codicon codicon-debug-restart" aria-hidden="true"></span></button>');
    expect(html).not.toContain("🔁 Retry");
    expect(html).toContain('id="btn-stop-agents" title="Stop all agents" aria-label="Stop all agents" disabled><span class="codicon codicon-debug-stop" aria-hidden="true"></span></button>');
    expect(html.indexOf('id="btn-stop-agents"')).toBeGreaterThan(html.indexOf('id="btn-retry"'));
    expect(html).toContain('id="btn-config" title="Open Config Panel"><span class="codicon codicon-settings-gear"');
  });

  it("places mutually exclusive Tasks, Work, Changes, and Agent popovers before Config", () => {
    const html = getWebviewHtml(makeMockWebview(), makeMockExtensionUri(), makeTr());
    expect(html).toContain('id="btn-tasks-popover"');
    expect(html).toContain('id="btn-tasks-popover" title="Tasks" aria-label="Tasks" aria-expanded="false" aria-controls="tasks-popover" disabled><span class="codicon codicon-server-process"');
    expect(html).toMatch(/id="btn-tasks-popover"[^>]*\sdisabled(?:\s|>)/);
    expect(html).toContain('id="tasks-popover"');
    expect(html).toContain('id="tasks-popover-list"');
    expect(html).toContain('id="btn-work-popover"');
    expect(html).toContain('disabled><span class="codicon codicon-checklist"');
    expect(html).toContain('<span id="work-pending-badge"');
    expect(html).toContain('aria-controls="work-popover"');
    expect(html).toMatch(/id="btn-work-popover"[^>]*\sdisabled(?:\s|>)/);
    expect(html).toContain('id="work-pending-badge"');
    expect(html).toContain('id="work-popover"');
    expect(html).toContain('id="work-popover-list"');
    expect(html).toContain('id="btn-changes"');
    expect(html).toContain('aria-controls="changes-popover"');
    expect(html).toMatch(/id="btn-changes"[^>]*\sdisabled(?:\s|>)/);
    expect(html).toContain('id="changes-count-badge"');
    expect(html).toContain('id="changes-popover"');
    expect(html).toContain('id="changes-popover-list"');
    expect(html).toContain('id="btn-agents"');
    expect(html).toContain('id="btn-agents" title="Agents" aria-label="Agents" aria-expanded="false" aria-controls="agent-popover" disabled><span class="codicon codicon-robot"');
    expect(html).toContain('aria-controls="agent-popover"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toMatch(/id="btn-agents"[^>]*\sdisabled(?:\s|>)/);
    expect(html).toContain('id="agent-count-badge"');
    expect(html).toContain('id="agent-popover"');
    expect(html).toContain('id="agent-popover-list"');
    expect(html.indexOf('id="btn-tasks-popover"')).toBeLessThan(html.indexOf('id="btn-work-popover"'));
    expect(html.indexOf('id="btn-work-popover"')).toBeLessThan(html.indexOf('id="btn-agents"'));
    expect(html.indexOf('id="btn-agents"')).toBeLessThan(html.indexOf('id="btn-config"'));
  });

  it("loads the bundled Codicon font under the webview CSP", () => {
    const html = getWebviewHtml(makeMockWebview(), makeMockExtensionUri(), makeTr());
    expect(html).toContain('/test/extension/media/codicons/codicon.css');
    expect(html).toContain("vscode-webview://test; font-src vscode-webview://test;");
    expect(html).toContain('<span class="codicon codicon-robot" aria-hidden="true"></span> Agents');
  });

  it("injects translation strings into HTML", () => {
    const tr = makeTr();
    const html = getWebviewHtml(makeMockWebview(), makeMockExtensionUri(), tr);
    expect(html).toContain(tr.sessions);
    expect(html).toContain(tr.threads);
    expect(html).toContain(tr.send);
    expect(html).toContain(tr.inputPlaceholder);
    expect(html).toContain(tr.initializing);
    expect(html).toContain('title="New session"');
    expect(html).toContain(tr.compact);
    expect(html).toContain(tr.interrupt);
    expect(html).toContain(tr.steer);
  });

  it("contains shared state initialization script", () => {
    const html = getWebviewHtml(makeMockWebview(), makeMockExtensionUri(), makeTr());
    expect(html).toContain("acquireVsCodeApi");
    expect(html).toContain("window.__wvVscode");
    expect(html).toContain("window.__wvDiffStore");
    expect(html).toContain("window.__wvDiffIdCounter");
    expect(html).toContain("window.__wvApiCapabilities");
    expect(html).toContain("window.__wvSidebar");
  });

  it("includes all module scripts after removing the sidebar-resize script", () => {
    const html = getWebviewHtml(makeMockWebview(), makeMockExtensionUri(), makeTr());
    const scriptCount = (html.match(/<script nonce=/g) || []).length;
    expect(scriptCount).toBe(9);
  });

  it("contains utilities module output", () => {
    const html = getWebviewHtml(makeMockWebview(), makeMockExtensionUri(), makeTr());
    expect(html).toContain("window.__wvEscapeHtml");
    expect(html).toContain("window.__wvFormatRelativeTime");
    expect(html).toContain("window.__wvI18n");
  });

  it("contains debug module output", () => {
    const html = getWebviewHtml(makeMockWebview(), makeMockExtensionUri(), makeTr());
    expect(html).toContain("window.__wvDbg");
    expect(html).toContain("window.__wvPostUiProbe");
  });

  it("contains tooltip module output", () => {
    const html = getWebviewHtml(makeMockWebview(), makeMockExtensionUri(), makeTr());
    expect(html).toContain("function showTooltipForTarget");
    expect(html).toContain("function hideTooltip");
  });

  it("contains sidebar module output", () => {
    const html = getWebviewHtml(makeMockWebview(), makeMockExtensionUri(), makeTr());
    expect(html).toContain("function renderSessions");
    expect(html).toContain("function renderThreads");
    expect(html).toContain("function renderTasks");
    expect(html).toContain("function renderWork");
    expect(html).toContain("window.__wvSidebar = {");
  });

  it("contains messages module output", () => {
    const html = getWebviewHtml(makeMockWebview(), makeMockExtensionUri(), makeTr());
    expect(html).toContain("function addMessage");
    expect(html).toContain("function renderToolCall");
    expect(html).toContain("window.__wvMessages = {");
  });

  it("contains input module output", () => {
    const html = getWebviewHtml(makeMockWebview(), makeMockExtensionUri(), makeTr());
    expect(html).toContain("function sendMessage");
    expect(html).toContain("slashMenuOpen");
  });

  it("contains event handler module output", () => {
    const html = getWebviewHtml(makeMockWebview(), makeMockExtensionUri(), makeTr());
    expect(html).toContain("window.addEventListener('message'");
    expect(html).toContain("case 'ready'");
    expect(html).toContain("case 'addMessage'");
  });

  it("generates unique nonces for each call", () => {
    const html1 = getWebviewHtml(makeMockWebview(), makeMockExtensionUri(), makeTr());
    const html2 = getWebviewHtml(makeMockWebview(), makeMockExtensionUri(), makeTr());
    const nonce1 = html1.match(/nonce-([a-zA-Z0-9]{32})/)?.[1];
    const nonce2 = html2.match(/nonce-([a-zA-Z0-9]{32})/)?.[1];
    expect(nonce1).toBeTruthy();
    expect(nonce2).toBeTruthy();
    expect(nonce1).not.toBe(nonce2);
  });

  it("handles zh-cn locale", () => {
    const tr = makeTr();
    tr.locale = "zh-cn";
    tr.filterCurrentWorkspace = "工作区会话";
    tr.threads = "线程";
    tr.send = "发送";
    const html = getWebviewHtml(makeMockWebview(), makeMockExtensionUri(), tr);
    expect(html).toContain("工作区会话");
    expect(html).toContain("线程");
    expect(html).toContain("发送");
    expect(html).toContain("var __locale = 'zh-cn'");
  });

  it("sidebar state has all required fields", () => {
    const html = getWebviewHtml(makeMockWebview(), makeMockExtensionUri(), makeTr());
    expect(html).toContain("sessions: []");
    expect(html).toContain("activeSessionId: null");
    expect(html).toContain("threads: []");
    expect(html).toContain("activeThreadId: null");
    expect(html).toContain("showAllWorkspaces: false");
    expect(html).toContain("sidebarTab: 'sessions'");
    expect(html).toContain("workState:");
    expect(html).toContain("renderSessions:");
    expect(html).toContain("renderThreads:");
    expect(html).toContain("renderTasks:");
    expect(html).toContain("renderWork:");
    expect(html).toContain("switchSidebarTab:");
  });

  it("API capabilities default to all false", () => {
    const html = getWebviewHtml(makeMockWebview(), makeMockExtensionUri(), makeTr());
    expect(html).toContain("saveSession: false");
    expect(html).toContain("undoLastTurn: false");
    expect(html).toContain("retryLastTurn: false");
    expect(html).toContain("revertFileChange: false");
  });

  it("contains task detail overlay element", () => {
    const html = getWebviewHtml(makeMockWebview(), makeMockExtensionUri(), makeTr());
    expect(html).toContain('id="task-detail-overlay"');
  });

  it("moves mode, model, effort, and Compact into the session controls popover", () => {
    const html = getWebviewHtml(makeMockWebview(), makeMockExtensionUri(), makeTr());
    const topBarHtml = html.slice(html.indexOf('<div id="settings-bar">'), html.indexOf('<div id="work-popover"'));
    const sessionControlsHtml = html.slice(html.indexOf('<div id="session-controls-popover"'), html.indexOf('<div id="input-resize-handle"'));
    expect(topBarHtml).not.toContain('class="setting-item"');
    expect(topBarHtml).not.toContain('id="current-mode"');
    expect(sessionControlsHtml).toContain('role="dialog" aria-label="Session controls" aria-hidden="true"');
    expect(sessionControlsHtml).toContain('<span>Session controls</span>');
    expect(sessionControlsHtml).not.toContain('codicon codicon-dashboard');
    expect(sessionControlsHtml).toContain('id="current-mode"');
    expect(sessionControlsHtml).toContain('id="current-mode" data-value="act">Agent</span>');
    expect(sessionControlsHtml).toContain('data-value="plan">Planner</div>');
    expect(sessionControlsHtml).toContain('data-value="operate">Orchestrator</div>');
    expect(sessionControlsHtml).toContain('id="current-model"');
    expect(sessionControlsHtml).toContain('id="current-reasoning"');
    expect(sessionControlsHtml).toContain('<span class="setting-label">Effort:</span>');
    expect(sessionControlsHtml).toContain('id="btn-compact"');
    expect(html.match(/id="btn-compact"/g)).toHaveLength(1);
  });

  it("contains status bar with status text and stats", () => {
    const html = getWebviewHtml(makeMockWebview(), makeMockExtensionUri(), makeTr());
    expect(html).toContain('id="status-text"');
    expect(html).toContain('id="status-stats"');
  });

  it("replaces the thread count with a dashboard session-controls trigger", () => {
    const html = getWebviewHtml(makeMockWebview(), makeMockExtensionUri(), makeTr());
    expect(html).not.toContain('id="thread-count"');
    expect(html).toContain('id="btn-session-controls"');
    expect(html).toContain('aria-controls="session-controls-popover"');
  });

  it("uses equal Project and All session-scope tabs without a diskette action", () => {
    const html = getWebviewHtml(makeMockWebview(), makeMockExtensionUri(), makeTr());
    expect(html).toContain('id="session-scope-workspace" data-tab="sessions" title="Show sessions from this project"');
    expect(html).toContain('aria-pressed="true"><span class="codicon codicon-folder"');
    expect(html).toContain('<span>Project</span></button>');
    expect(html).toContain('id="session-scope-all" data-tab="sessions" title="Show sessions from all workspaces"');
    expect(html).toContain('aria-pressed="false"><span class="codicon codicon-globe"');
    expect(html).toContain('<span>All</span></button>');
    expect(html).not.toContain('id="workspace-filter-toggle"');
    expect(html).not.toContain('codicon codicon-save');
  });

  it("contains sidebar tab buttons", () => {
    const html = getWebviewHtml(makeMockWebview(), makeMockExtensionUri(), makeTr());
    expect(html).toContain('id="session-scope-workspace"');
    expect(html).toContain('id="session-scope-all"');
    expect(html).toContain('id="tab-threads-btn"');
  });
});
