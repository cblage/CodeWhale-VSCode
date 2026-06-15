import * as vscode from "vscode";
import { getWebviewCss } from "./webview-css";
import { getUtilitiesScript } from "./webview-js-utilities";
import { getDebugScript } from "./webview-js-debug";
import { getTooltipScript } from "./webview-js-tooltip";
import { getSidebarScript } from "./webview-js-sidebar";
import { getMessagesScript } from "./webview-js-messages";
import { getInputScript } from "./webview-js-input";
import { getEventHandlerScript } from "./webview-js-event-handler";

export interface WebviewTranslations {
  locale: string; // "en" or "zh-cn"
  history: string;
  threads: string;
  sessions: string;
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
  noConversations: string;
  noTasks: string;
  threadsCountPattern: string; // "{n} threads" / "{n} 个会话"
  modelLabel: string;
  workspaceLabel: string;
  loadedThreadPattern: string; // "Loaded: {0}" / "已加载: {0}"
  showAllWorkspaces: string;
  filterCurrentWorkspace: string;
  approvalRequired: string;
  allow: string;
  deny: string;
  thinkingToggle: string;
  thinkingOpen: string;
  thinkingClose: string;
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
  attachFiles: string;
  removeAttachment: string;
  attachedFileCount: string;
  fileNotSupported: string;
  changes: string;
  noFileChanges: string;
  undoUnsupportedTooltip: string;
  retryUnsupportedTooltip: string;
  revertUnsupportedTooltip: string;
  fileCreated: string;
  fileDeleted: string;
  fileModified: string;
  viewDiff: string;
  viewDiffTooltip: string;
  openFile: string;
  openFileTooltip: string;
  revertFile: string;
  revertFileTooltip: string;
  fileChanges: string;
  userInputAwaiting: string;
}

export function getWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  tr: WebviewTranslations
): string {
  const nonce = getNonce();
  const css = getWebviewCss();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CodeWhale Chat</title>
  <style nonce="${nonce}">
${css}
  </style>
</head>
<body>
  <div id="task-detail-overlay" class="task-detail-overlay" style="display:none"></div>
  <div id="layout">
    <div id="threads-panel">
      <div class="sidebar-section" id="sidebar-threads" data-active-tab="sessions">
        <div class="sidebar-tabs">
          <button class="sidebar-tab active" id="tab-sessions-btn" data-tab="sessions">${tr.sessions}</button>
          <button class="sidebar-tab" id="tab-threads-btn" data-tab="threads">${tr.threads}</button>
          <span class="sidebar-section-action" id="workspace-filter-toggle" title="${tr.showAllWorkspaces}">🌐</span>
        </div>
        <div class="sidebar-section-body" id="tab-sessions"></div>
        <div class="sidebar-section-body" id="tab-threads-list"></div>
      </div>
      <div class="sidebar-section" id="sidebar-work">
        <div class="sidebar-section-header" id="work-section-toggle">
          <span class="sidebar-section-title">◆ ${tr.work}</span>
          <span class="sidebar-section-arrow">▼</span>
        </div>
        <div class="sidebar-section-body" id="tab-work"></div>
      </div>
      <div class="sidebar-section" id="sidebar-tasks">
        <div class="sidebar-section-header" id="tasks-section-toggle">
          <span class="sidebar-section-title">⚙ ${tr.tasks}</span>
          <span class="sidebar-section-arrow">▼</span>
        </div>
        <div class="sidebar-section-body" id="tab-tasks"></div>
      </div>
      <div class="sidebar-section" id="sidebar-changes">
        <div class="sidebar-section-header" id="changes-section-toggle">
          <span class="sidebar-section-title">📝 ${tr.changes}</span>
          <span class="sidebar-section-arrow">▼</span>
        </div>
        <div class="sidebar-section-body" id="tab-changes"></div>
      </div>
    </div>
    <div id="chat-area">
      <div id="settings-bar">
        <div class="setting-item">
          <span class="setting-label">${tr.modeLabel}:</span>
          <span class="setting-value" id="current-mode">agent</span>
        </div>
        <div class="setting-item">
          <span class="setting-label">${tr.modelLabel}:</span>
          <span class="setting-value" id="current-model">deepseek-v4-pro</span>
        </div>
        <div class="setting-item">
          <span class="setting-label">${tr.reasoningEffortLabel}:</span>
          <span class="setting-value" id="current-reasoning">auto</span>
        </div>
      </div>
      <div id="messages"></div>
      <div id="toolbar">
        <button id="btn-new-thread">${tr.newThread}</button>
        <button id="btn-threads" title="${tr.toggleHistory}">📋</button>
        <button id="btn-compact">${tr.compact}</button>
        <button id="btn-undo" title="Undo last turn">↩ Undo</button>
        <button id="btn-retry" title="Retry last turn">🔁 Retry</button>
        <button id="btn-interrupt">${tr.interrupt}</button>
        <span class="thread-count" id="thread-count" title="${tr.toggleHistory}">0 sessions</span>
      </div>
      <div id="input-area">
        <div id="slash-menu"></div>
        <div id="attachments-area"></div>
        <div id="input-row">
          <button id="btn-attach" title="${tr.attachFiles}">📎</button>
          <textarea id="input" placeholder="${tr.inputPlaceholder}" rows="1"></textarea>
          <button id="btn-send">${tr.send}</button>
        </div>
      </div>
      <div class="status-bar" id="status">
        <span class="status-left" id="status-text">${tr.initializing}</span>
        <span class="status-right" id="status-stats"></span>
      </div>
      <div id="ui-tooltip" role="tooltip" aria-hidden="true"></div>
      <div id="debug-panel" style="display:none;position:fixed;bottom:0;left:0;right:0;background:#1a1a2e;color:#0f0;font-size:11px;padding:4px 8px;z-index:99999;max-height:80px;overflow-y:auto;font-family:monospace;pointer-events:none;"></div>
    </div>
  </div>

  <script nonce="${nonce}">
    // ── Shared state initialization (must run before IIFE modules) ──
    (function() {
      'use strict';
      // Acquire vscode API and store on window for all modules
      var vscode;
      try {
        vscode = acquireVsCodeApi();
      } catch(e) {
        document.title = 'FATAL: acquireVsCodeApi failed: ' + e.message;
      }
      if (!vscode) {
        document.body.innerHTML = '<div style="color:red;padding:20px;">FATAL: acquireVsCodeApi() returned null. Webview cannot communicate with extension.</div>';
      }
      window.__wvVscode = vscode;

      // Shared diff store for file changes
      window.__wvDiffStore = new Map();
      window.__wvDiffIdCounter = { value: 0 };

      // Shared API capabilities
      window.__wvApiCapabilities = { saveSession: false, undoLastTurn: false, retryLastTurn: false, revertFileChange: false };

      // Sidebar state exposed for event handler
      window.__wvSidebar = {
        sessions: [],
        activeSessionId: null,
        threads: [],
        activeThreadId: null,
        showAllWorkspaces: false,
        sidebarTab: 'sessions',
        workState: { goal: null, checklist: [], checklistCompletionPct: 0, strategy: [], cycleCount: 0, coherenceState: 'healthy', coherenceLabel: '' },
        renderSessions: function() {},
        renderThreads: function() {},
        renderTasks: function() {},
        renderWork: function() {},
        renderChanges: function() {},
        switchSidebarTab: function() {},
        closeTaskDetail: function() {},
        showTaskDetail: function() {},
        setSessions: function(s) { this.sessions = s; },
        setActiveSessionId: function(id) { this.activeSessionId = id; },
        setThreads: function(t) { this.threads = t; },
        setActiveThreadId: function(id) { this.activeThreadId = id; },
        setShowAllWorkspaces: function(v) { this.showAllWorkspaces = v; },
        setWorkState: function(ws) { this.workState = ws; },
        setChangesState: function(cs) { this.changesState = cs; },
      };
    })();
  </script>
  <script nonce="${nonce}">
    ${getUtilitiesScript(tr)}
  </script>
  <script nonce="${nonce}">
    ${getDebugScript(tr)}
  </script>
  <script nonce="${nonce}">
    ${getTooltipScript()}
  </script>
  <script nonce="${nonce}">
    ${getSidebarScript(tr)}
  </script>
  <script nonce="${nonce}">
    ${getMessagesScript(tr)}
  </script>
  <script nonce="${nonce}">
    ${getInputScript(tr)}
  </script>
  <script nonce="${nonce}">
    ${getEventHandlerScript(tr)}
  </script>
</body>
</html>`;
}

function getNonce(): string {
  let result = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
