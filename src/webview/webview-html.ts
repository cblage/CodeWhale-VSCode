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
  contextUsage: string;
  contextUsageUnavailable: string;
  interrupt: string;
  steer: string;
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
  showingWorkspaceSessions: string;
  showingAllSessions: string;
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
  dismissNotification: string;
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
  // Session search & delete
  searchSessions: string;
  searchPlaceholder: string;
  deleteSession: string;
  deleteSessionConfirmTitle: string;
  deleteSessionConfirmMessage: string;
  deleteSessionConfirmButton: string;
  deleteSessionSuccess: string;
  deleteSessionFailed: string;
  noSearchResults: string;
  // Agent panel
  agents: string;
  noAgentRuns: string;
  agentStatusQueued: string;
  agentStatusStarting: string;
  agentStatusRunning: string;
  agentStatusWaitingForUser: string;
  agentStatusNeedsAction: string;
  agentStatusModelWait: string;
  agentStatusRunningTool: string;
  agentStatusCompleted: string;
  agentStatusFailed: string;
  agentStatusCancelled: string;
  agentStatusInterrupted: string;
  agentObjective: string;
  agentModel: string;
  agentProfile: string;
  agentSteps: string;
  agentResult: string;
  agentError: string;
  agentRole: string;
  agentArtifacts: string;
  agentUsage: string;
  agentSpawned: string;
  agentDelegating: string;
  agentFanout: string;
  agentActive: string;
  agentInactive: string;
  agentType: string;
  agentLatestOutput: string;
  agentDetails: string;
  stopAgent: string;
  stopAllAgents: string;
  stoppingAgent: string;
  agentTranscript: string;
  agentEvents: string;
  agentAssignment: string;
  agentRunMetadata: string;
  agentReferences: string;
  agentNoTranscript: string;
  agentNoEvents: string;
  agentPartialTranscript: string;
  subagent: string;
}

export function getWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  tr: WebviewTranslations
): string {
  const nonce = getNonce();
  const css = getWebviewCss();
  const codiconsCssUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "media", "codicons", "codicon.css")
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'nonce-${nonce}' ${webview.cspSource}; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🦍 HarambeChat</title>
  <link href="${codiconsCssUri}" rel="stylesheet">
  <style nonce="${nonce}">
${css}
  </style>
</head>
<body class="hide-agent-tool-cards compact-tool-details">
  <div id="task-detail-overlay" class="task-detail-overlay" style="display:none"></div>
  <div id="agent-detail-overlay" class="task-detail-overlay" style="display:none"></div>
  <div id="layout">
    <div id="chat-area">
      <div id="settings-bar">
        <button id="btn-new-thread" title="New session" aria-label="New session"><span class="codicon codicon-new-session" aria-hidden="true"></span></button>
        <button id="btn-history" title="${tr.history}" aria-label="${tr.history}" aria-expanded="false" aria-controls="history-popover"><span class="codicon codicon-history" aria-hidden="true"></span></button>
        <button id="btn-tasks-popover" title="${tr.tasks}" aria-label="${tr.tasks}" aria-expanded="false" aria-controls="tasks-popover" disabled><span class="codicon codicon-server-process" aria-hidden="true"></span></button>
        <button id="btn-work-popover" title="${tr.checklist}" aria-label="${tr.checklist}" aria-expanded="false" aria-controls="work-popover" disabled><span class="codicon codicon-checklist" aria-hidden="true"></span><span id="work-pending-badge" aria-hidden="true"></span></button>
        <button id="btn-changes" title="${tr.changes}" aria-label="${tr.changes}" aria-expanded="false" aria-controls="changes-popover" disabled><span class="codicon codicon-diff-multiple" aria-hidden="true"></span><span id="changes-count-badge" aria-hidden="true"></span></button>
        <button id="btn-agents" title="${tr.agents}" aria-label="${tr.agents}" aria-expanded="false" aria-controls="agent-popover" disabled><span class="codicon codicon-robot" aria-hidden="true"></span><span id="agent-count-badge" aria-hidden="true"></span></button>
        <button id="btn-config" title="Open Config Panel"><span class="codicon codicon-settings-gear" aria-hidden="true"></span></button>
      </div>
      <div id="history-popover" role="dialog" aria-label="${tr.history}" aria-hidden="true">
        <div class="history-popover-content" id="sidebar-threads" data-active-tab="sessions">
          <div class="sidebar-tabs">
            <button class="sidebar-tab session-scope-tab active" id="session-scope-workspace" data-tab="sessions" title="${tr.showingWorkspaceSessions}" aria-label="${tr.showingWorkspaceSessions}" aria-pressed="true"><span class="codicon codicon-folder" aria-hidden="true"></span><span>${tr.filterCurrentWorkspace}</span></button>
            <button class="sidebar-tab session-scope-tab" id="session-scope-all" data-tab="sessions" title="${tr.showingAllSessions}" aria-label="${tr.showingAllSessions}" aria-pressed="false"><span class="codicon codicon-globe" aria-hidden="true"></span><span>${tr.showAllWorkspaces}</span></button>
            <button class="sidebar-tab" id="tab-threads-btn" data-tab="threads">${tr.threads}</button>
          </div>
          <div class="history-popover-list" id="tab-sessions"></div>
          <div class="history-popover-list" id="tab-threads-list"></div>
        </div>
      </div>
      <div id="tasks-popover" role="dialog" aria-label="${tr.tasks}" aria-hidden="true">
        <div class="tasks-popover-header">
          <span><span class="codicon codicon-server-process" aria-hidden="true"></span> ${tr.tasks}</span>
        </div>
        <div id="tasks-popover-list"></div>
      </div>
      <div id="work-popover" role="dialog" aria-label="${tr.checklist}" aria-hidden="true">
        <div class="work-popover-header">
          <span>✔ ${tr.checklist}</span>
        </div>
        <div id="work-popover-list"></div>
      </div>
      <div id="changes-popover" role="dialog" aria-label="${tr.changes}" aria-hidden="true">
        <div class="changes-popover-header">
          <span><span class="codicon codicon-diff-multiple" aria-hidden="true"></span> ${tr.changes}</span>
          <span id="changes-popover-count">0</span>
        </div>
        <div id="changes-popover-list"></div>
      </div>
      <div id="agent-popover" role="dialog" aria-label="${tr.agents}" aria-hidden="true">
        <div class="agent-popover-header">
          <span><span class="codicon codicon-robot" aria-hidden="true"></span> ${tr.agents}</span>
          <span id="agent-popover-count">0</span>
        </div>
        <div id="agent-popover-list"></div>
      </div>
      <div id="messages"></div>
      <div id="toolbar">
        <div id="context-usage-gauge" class="context-usage-gauge unavailable" role="img" tabindex="0" aria-label="${tr.contextUsageUnavailable}" data-tooltip="${tr.contextUsageUnavailable}">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle class="context-usage-track" cx="12" cy="12" r="9"></circle>
            <circle class="context-usage-value" cx="12" cy="12" r="9" stroke-dasharray="56.549" stroke-dashoffset="56.549"></circle>
          </svg>
        </div>
        <button id="btn-session-controls" title="Session controls" aria-label="Session controls" aria-expanded="false" aria-controls="session-controls-popover"><span class="codicon codicon-dashboard" aria-hidden="true"></span></button>
        <button id="btn-undo" title="Undo last turn" aria-label="Undo last turn"><span class="codicon codicon-discard" aria-hidden="true"></span></button>
        <button id="btn-retry" title="Retry last turn" aria-label="Retry last turn"><span class="codicon codicon-debug-restart" aria-hidden="true"></span></button>
        <button id="btn-stop-agents" title="${tr.stopAllAgents}" aria-label="${tr.stopAllAgents}" disabled><span class="codicon codicon-debug-stop" aria-hidden="true"></span></button>
      </div>
      <div id="session-controls-popover" role="dialog" aria-label="Session controls" aria-hidden="true">
        <div class="session-controls-header">
          <span>Session controls</span>
        </div>
        <div class="session-controls-body">
          <div class="setting-item">
            <span class="setting-label">${tr.modeLabel}:</span>
            <div class="setting-dropdown" data-setting="mode">
              <span class="setting-value" id="current-mode" data-value="act">Agent</span>
              <div class="dropdown-menu" id="dropdown-mode">
                <div class="dropdown-item" data-value="act">Agent</div>
                <div class="dropdown-item" data-value="plan">Planner</div>
                <div class="dropdown-item" data-value="yolo">Yolo</div>
                <div class="dropdown-item" data-value="operate">Orchestrator</div>
              </div>
            </div>
          </div>
          <div class="setting-item">
            <span class="setting-label">${tr.modelLabel}:</span>
            <div class="setting-dropdown" data-setting="model">
              <span class="setting-value" id="current-model">deepseek-v4-pro</span>
              <div class="dropdown-menu" id="dropdown-model">
                <div class="dropdown-item" data-value="deepseek-v4-pro">deepseek-v4-pro</div>
              </div>
            </div>
          </div>
          <div class="setting-item">
            <span class="setting-label">${tr.reasoningEffortLabel}:</span>
            <div class="setting-dropdown" data-setting="reasoning">
              <span class="setting-value" id="current-reasoning">auto</span>
              <div class="dropdown-menu" id="dropdown-reasoning">
                <div class="dropdown-item" data-value="auto">auto</div>
                <div class="dropdown-item" data-value="off">off</div>
                <div class="dropdown-item" data-value="low">low</div>
                <div class="dropdown-item" data-value="medium">medium</div>
                <div class="dropdown-item" data-value="high">high</div>
                <div class="dropdown-item" data-value="max">max</div>
              </div>
            </div>
          </div>
          <button id="btn-compact"><span class="codicon codicon-fold" aria-hidden="true"></span>${tr.compact}</button>
        </div>
      </div>
      <div id="input-resize-handle" title="Drag to resize input area"></div>
      <div id="input-area">
        <div id="slash-menu"></div>
        <div id="attachments-area"></div>
        <div id="input-row">
          <button id="btn-attach" title="${tr.attachFiles}" aria-label="${tr.attachFiles}"><span class="codicon codicon-attach" aria-hidden="true"></span></button>
          <textarea id="input" placeholder="${tr.inputPlaceholder}" rows="1"></textarea>
          <button id="btn-send-stop" class="btn-send-stop">
            <span class="btn-text-send">${tr.send}</span>
            <span class="btn-text-stop">${tr.interrupt}</span>
            <span class="btn-text-steer"><span class="codicon codicon-forward" aria-hidden="true"></span>${tr.steer}</span>
          </button>
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
      window.__wvApiCapabilities = { saveSession: false, undoLastTurn: false, retryLastTurn: false, revertFileChange: false, stopAgents: false };

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
        closeAgentDetail: function() {},
        showAgentDetail: function() {},
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
    (function() {
      'use strict';
      var handle = document.getElementById('input-resize-handle');
      var inputArea = document.getElementById('input-area');
      if (!handle || !inputArea) return;

      // Restore saved height from previous session
      try {
        var savedHeight = localStorage.getItem('cblage.codewhale:inputAreaHeight');
        if (savedHeight) {
          var h = parseInt(savedHeight, 10);
          if (h >= 56 && h <= 400) {
            inputArea.style.height = h + 'px';
            // Reset textarea height so it fills the restored container
            var input = document.getElementById('input');
            if (input) input.style.height = 'auto';
          }
        }
      } catch(e) { /* localStorage may not be available */ }

      var startY, startHeight;

      function onMouseDown(e) {
        startY = e.clientY;
        startHeight = inputArea.getBoundingClientRect().height;
        handle.classList.add('active');
        inputArea.classList.add('resizing');
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        e.preventDefault();
      }

      function onMouseMove(e) {
        if (startY === undefined) return;
        var newHeight = startHeight - (e.clientY - startY);
        if (newHeight < 56) newHeight = 56;
        if (newHeight > 400) newHeight = 400;
        inputArea.style.height = newHeight + 'px';
        // Keep textarea filling the container during resize
        var input = document.getElementById('input');
        if (input) input.style.height = 'auto';
      }

      function onMouseUp() {
        handle.classList.remove('active');
        inputArea.classList.remove('resizing');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        // Save height for next session
        try {
          var finalHeight = inputArea.getBoundingClientRect().height;
          localStorage.setItem('cblage.codewhale:inputAreaHeight', String(Math.round(finalHeight)));
        } catch(e) { /* ignore localStorage errors */ }
        // Reset textarea height so it fills the resized container
        var input = document.getElementById('input');
        if (input) input.style.height = 'auto';
        startY = undefined;
        startHeight = undefined;
      }

      handle.addEventListener('mousedown', onMouseDown);
    })();
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
