import * as vscode from "vscode";

export interface WebviewTranslations {
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
  noConversations: string;
  noTasks: string;
  threadsCountPattern: string; // "{n} threads" / "{n} 个会话"
  modelLabel: string;
  workspaceLabel: string;
  loadedThreadPattern: string; // "Loaded: {0}" / "已加载: {0}"
  approvalRequired: string;
  allow: string;
  deny: string;
  thinkingToggle: string;
  thinkingOpen: string;
  thinkingClose: string;
  modeLabel: string;
  reasoningEffortLabel: string;
  commandMode: string;
  commandModel: string;
  commandModels: string;
  commandReasoning: string;
  commandConfig: string;
  commandSettings: string;
  commandClear: string;
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
}

export function getWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  tr: WebviewTranslations
): string {
    const nonce = getNonce();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DeepSeek Chat</title>
  <style nonce="${nonce}">
    * { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --muted: var(--vscode-descriptionForeground);
      --accent: var(--vscode-button-background);
      --accent-hover: var(--vscode-button-hoverBackground);
      --border: var(--vscode-panel-border);
      --input-bg: var(--vscode-input-background);
      --input-border: var(--vscode-input-border);
      --input-fg: var(--vscode-input-foreground);
      --card-bg: var(--vscode-sideBar-background);
      --code-bg: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.12));
    }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--fg);
      background: var(--bg);
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    #layout { display: flex; flex: 1; overflow: hidden; }

    #threads-panel {
      width: 200px;
      min-width: 140px;
      border-right: 1px solid var(--border);
      overflow-y: auto;
      padding: 4px 0;
      display: none;
    }
    #threads-panel.open { display: block; }

    #threads-panel .panel-header {
      padding: 6px 10px;
      font-size: 0.8em;
      font-weight: 600;
      color: var(--muted);
      border-bottom: 1px solid var(--border);
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .panel-tabs {
      display: flex;
      border-bottom: 1px solid var(--border);
    }
    .panel-tab {
      flex: 1;
      background: none;
      border: none;
      color: var(--muted);
      padding: 4px 2px;
      font-size: 0.75em;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: color 0.15s, border-color 0.15s;
    }
    .panel-tab:hover { color: var(--fg); }
    .panel-tab.active { color: var(--fg); border-bottom-color: var(--accent); }

    .tab-content { overflow-y: auto; }
    .tab-content.active { display: block; }

    .thread-item {
      padding: 6px 10px;
      cursor: pointer;
      font-size: 0.85em;
      color: var(--muted);
    }
    .thread-item + .thread-item { border-top: 1px solid rgba(128,128,128,0.1); }
    .thread-item:hover { background: var(--card-bg); color: var(--fg); }
    .thread-item.active { background: var(--accent); color: white; }
    .thread-item .thread-title {
      font-weight: 600;
      color: var(--fg);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .thread-item.active .thread-title { color: white; }
    .thread-item.active .thread-preview { color: rgba(255,255,255,0.7); }
    .thread-item.active .thread-meta { color: rgba(255,255,255,0.6); }
    .thread-item.active .turn-status { color: rgba(255,255,255,0.8) !important; }
    .thread-item .thread-preview {
      font-size: 0.92em;
      color: var(--muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 1px;
    }
    .thread-item .thread-meta {
      display: flex;
      gap: 6px;
      font-size: 0.8em;
      color: var(--muted);
      margin-top: 2px;
    }
    .thread-item .thread-meta .turn-status {
      padding: 0 3px;
      border-radius: 2px;
      font-size: 0.9em;
    }
    .thread-item .turn-status.completed { color: #4caf50; }
    .thread-item .turn-status.failed { color: #f44336; }
    .thread-item .turn-status.in_progress { color: #ff9800; }

    #chat-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

    #messages {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }

    .message {
      margin-bottom: 12px;
      padding: 8px 12px;
      border-radius: 6px;
      max-width: 100%;
      word-wrap: break-word;
    }

    .message.user {
      background: var(--accent);
      color: white;
      margin-left: 20%;
    }

    .message.assistant {
      background: var(--card-bg);
      border: 1px solid var(--border);
    }

    .message .role {
      font-size: 0.8em;
      font-weight: 600;
      margin-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .message.user .role { color: rgba(255,255,255,0.8); }
    .message.assistant .role { color: var(--muted); }

    .message .content {
      line-height: 1.6;
      word-wrap: break-word;
    }

    /* ── Markdown rendered elements (by marked) ── */

    .message .content h1,
    .message .content h2,
    .message .content h3,
    .message .content h4,
    .message .content h5,
    .message .content h6 {
      margin: 8px 0 4px;
      font-weight: 600;
      line-height: 1.3;
    }
    .message .content h1 { font-size: 1.3em; border-bottom: 1px solid var(--border); padding-bottom: 4px; }
    .message .content h2 { font-size: 1.15em; }
    .message .content h3 { font-size: 1.05em; }

    .message .content p { margin: 4px 0; }
    .message .content p:first-child { margin-top: 0; }
    .message .content p:last-child { margin-bottom: 0; }

    .message .content code {
      background: var(--code-bg);
      padding: 1px 5px;
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.88em;
    }

    .message .content pre {
      background: var(--code-bg);
      padding: 10px 12px;
      border-radius: 4px;
      overflow-x: auto;
      margin: 6px 0;
    }
    .message .content pre code {
      background: none;
      padding: 0;
      font-size: 0.85em;
    }

    .message .content blockquote {
      border-left: 3px solid var(--accent);
      margin: 6px 0;
      padding: 4px 10px;
      color: var(--muted);
      background: rgba(128,128,128,0.05);
      border-radius: 0 4px 4px 0;
    }
    .message .content blockquote p { margin: 2px 0; }

    .message .content ul,
    .message .content ol {
      padding-left: 22px;
      margin: 4px 0;
    }
    .message .content li { margin: 1px 0; line-height: 1.5; }

    .message .content hr {
      border: none;
      border-top: 1px solid var(--border);
      margin: 10px 0;
    }

    .message .content a {
      color: var(--accent);
      text-decoration: underline;
    }
    .message .content a:hover { opacity: 0.8; }

    .message .content table {
      border-collapse: collapse;
      margin: 6px 0;
      font-size: 0.9em;
      width: 100%;
    }
    .message .content th,
    .message .content td {
      border: 1px solid var(--border);
      padding: 4px 8px;
      text-align: left;
    }
    .message .content th { background: var(--code-bg); font-weight: 600; }

    .message .content strong { font-weight: 700; }
    .message .content em { font-style: italic; }
    .message .content del { text-decoration: line-through; opacity: 0.7; }

    /* ── Thinking / Tool / Approval ── */

    .thinking-block {
      margin-top: 8px;
      padding: 6px 10px;
      border-left: 3px solid var(--muted);
      background: rgba(128,128,128,0.06);
      font-size: 0.88em;
      color: var(--muted);
      border-radius: 0 4px 4px 0;
    }

    .thinking-toggle {
      cursor: pointer;
      font-size: 0.85em;
      color: var(--muted);
      user-select: none;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .thinking-toggle:hover { color: var(--fg); }

    .thinking-content {
      display: none;
      margin-top: 6px;
      white-space: pre-wrap;
      line-height: 1.5;
    }
    .thinking-content.open { 
      display: block; 
    }

    .tool-call {
      margin-top: 8px;
      padding: 6px 10px;
      border: 1px solid var(--border);
      border-radius: 4px;
      font-size: 0.85em;
      background: rgba(128,128,128,0.04);
    }
    .tool-call .tool-name {
      font-weight: 600;
      color: var(--accent);
    }
    .tool-call .tool-status {
      margin-left: 4px;
    }
    .tool-call .tool-output {
      margin-top: 4px;
      padding: 4px 8px;
      background: var(--input-bg);
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.9em;
      white-space: pre-wrap;
      max-height: 200px;
      overflow-y: auto;
    }
    
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    
    .tool-call:has(.tool-status) .tool-status::before {
      display: inline-block;
    }

    .approval-bar {
      margin-top: 8px;
      padding: 6px 10px;
      border: 1px solid #f0ad4e;
      border-radius: 4px;
      background: rgba(240,173,78,0.1);
    }
    .approval-bar .approval-text { font-size: 0.85em; margin-bottom: 6px; }
    .approval-bar .approval-buttons { display: flex; gap: 6px; }
    .approval-bar button {
      padding: 3px 12px;
      border: none;
      border-radius: 3px;
      cursor: pointer;
      font-size: 0.85em;
    }
    .approval-bar .btn-allow { background: #5cb85c; color: white; }
    .approval-bar .btn-deny { background: #d9534f; color: white; }

    .usage-info {
      font-size: 0.75em;
      color: var(--muted);
      margin-top: 6px;
      text-align: right;
    }

    .streaming-indicator::after {
      content: '▊';
      animation: blink 1s step-end infinite;
    }
    @keyframes blink { 50% { opacity: 0; } }

    /* ── Input / Toolbar ── */

    #input-area {
      padding: 8px;
      border-top: 1px solid var(--border);
      display: flex;
      gap: 6px;
      position: relative;
      overflow: visible;
    }
    #input-area textarea {
      flex: 1;
      background: var(--input-bg);
      color: var(--input-fg);
      border: 1px solid var(--input-border);
      border-radius: 4px;
      padding: 6px 10px;
      font-family: inherit;
      font-size: inherit;
      resize: none;
      min-height: 36px;
      max-height: 120px;
      outline: none;
    }
    #input-area textarea:focus { border-color: var(--accent); }
    #input-area button {
      background: var(--accent);
      color: white;
      border: none;
      border-radius: 4px;
      padding: 6px 14px;
      cursor: pointer;
      font-size: 0.9em;
      white-space: nowrap;
    }
    #input-area button:hover { background: var(--accent-hover); }
    #input-area button:disabled { opacity: 0.5; cursor: not-allowed; }

    #toolbar {
      padding: 4px 8px;
      border-top: 1px solid var(--border);
      display: flex;
      gap: 4px;
      align-items: center;
    }
    #toolbar button {
      background: transparent;
      color: var(--muted);
      border: 1px solid var(--border);
      border-radius: 3px;
      padding: 2px 10px;
      cursor: pointer;
      font-size: 0.8em;
    }
    #toolbar button:hover { color: var(--fg); border-color: var(--fg); }

    #toolbar .thread-count {
      margin-left: auto;
      font-size: 0.75em;
      color: var(--muted);
      cursor: pointer;
      padding: 2px 8px;
      border-radius: 3px;
    }
    #toolbar .thread-count:hover { color: var(--fg); background: var(--card-bg); }
    
    #settings-bar {
      padding: 4px 8px;
      border-bottom: 1px solid var(--border);
      display: flex;
      gap: 12px;
      align-items: center;
      font-size: 0.75em;
      color: var(--muted);
      background: var(--card-bg);
    }
    #settings-bar .setting-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    #settings-bar .setting-label {
      font-weight: 600;
    }
    #settings-bar .setting-value {
      color: var(--fg);
      cursor: pointer;
      padding: 1px 4px;
      border-radius: 2px;
    }
    #settings-bar .setting-value:hover {
      background: var(--accent);
      color: white;
    }
    
    #slash-menu {
      position: fixed;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 4px;
      max-height: 200px;
      overflow-y: auto;
      display: none;
      z-index: 10000;
      box-shadow: 0 -2px 8px rgba(0,0,0,0.15);
    }
    #slash-menu.open { display: block; }
    .slash-menu-item {
      padding: 6px 10px;
      cursor: pointer;
      border-bottom: 1px solid var(--border);
    }
    .slash-menu-item:last-child { border-bottom: none; }
    .slash-menu-item:hover { background: var(--accent); color: white; }
    .slash-menu-item.selected { background: var(--accent); color: white; }
    .slash-menu-item .command-name {
      font-weight: 600;
      margin-right: 8px;
    }
    .slash-menu-item .command-desc {
      color: var(--muted);
      font-size: 0.9em;
    }
    .slash-menu-item:hover .command-desc,
    .slash-menu-item.selected .command-desc {
      color: rgba(255,255,255,0.8);
    }

    .system-message {
      padding: 8px 12px;
      background: var(--card-bg);
      border-left: 3px solid var(--border);
      border-radius: 4px;
      color: var(--text-muted);
      margin: 4px 8px;
      font-size: 0.85em;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .system-message .msg-label {
      font-weight: 600;
      font-style: normal;
      margin-right: 6px;
    }
    .system-message .msg-label.note {
      color: var(--text-muted);
    }
    .system-message .msg-label.error {
      color: #d9534f;
    }
    .system-message .msg-label.warning {
      color: #f0ad4e;
    }
    .system-message .msg-body {
      font-style: italic;
    }
    .error-banner {
      padding: 8px 12px;
      background: rgba(217,83,79,0.15);
      border-left: 3px solid #d9534f;
      border-radius: 4px;
      color: #d9534f;
      margin: 4px 8px;
      font-size: 0.85em;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .error-banner .msg-label {
      font-weight: 600;
      margin-right: 6px;
    }
    .status-bar {
      padding: 2px 8px;
      font-size: 0.75em;
      color: var(--muted);
      text-align: center;
    }
    .task-card {
      padding: 6px 10px;
      border-bottom: 1px solid rgba(128,128,128,0.1);
      cursor: pointer;
    }
    .task-card:hover { background: var(--card-bg); }
    .task-card .task-header {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 0.85em;
    }
    .task-card .task-status-icon {
      font-size: 0.9em;
      flex-shrink: 0;
    }
    .task-card .task-title {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .task-card .task-meta {
      font-size: 0.75em;
      color: var(--muted);
      margin-top: 2px;
    }
    .task-card .task-actions {
      display: flex;
      gap: 4px;
      margin-top: 4px;
    }
    .task-card .task-actions button {
      background: none;
      border: 1px solid var(--border);
      color: var(--muted);
      padding: 1px 6px;
      font-size: 0.7em;
      cursor: pointer;
      border-radius: 3px;
    }
    .task-card .task-actions button:hover {
      color: var(--fg);
      border-color: var(--fg);
    }
    .work-section {
      padding: 6px 10px;
      border-bottom: 1px solid rgba(128,128,128,0.1);
    }
    .work-section-title {
      font-size: 0.75em;
      font-weight: 600;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    .work-goal {
      font-size: 0.85em;
      color: #f0a030;
      font-weight: 600;
    }
    .work-checklist-item {
      font-size: 0.8em;
      padding: 1px 0;
    }
    .work-checklist-item .check { margin-right: 4px; }
    .work-strategy-step {
      font-size: 0.8em;
      padding: 1px 0;
    }
    .work-strategy-step .step-icon { margin-right: 4px; }
    .work-empty {
      color: var(--muted);
      font-style: italic;
      text-align: center;
      padding: 20px 10px;
      font-size: 0.85em;
    }
    .task-detail-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.5);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .task-detail-panel {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      width: 90%;
      max-width: 600px;
      max-height: 80vh;
      overflow-y: auto;
      padding: 16px;
      font-size: 0.85em;
      position: relative;
    }
    .task-detail-panel h3 {
      margin: 0 0 8px 0;
      font-size: 1em;
      color: var(--fg);
    }
    .task-detail-panel .detail-section {
      margin-bottom: 12px;
      border-bottom: 1px solid rgba(128,128,128,0.15);
      padding-bottom: 8px;
    }
    .task-detail-panel .detail-section:last-child {
      border-bottom: none;
    }
    .task-detail-panel .detail-label {
      font-size: 0.75em;
      font-weight: 600;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
    }
    .task-detail-panel .detail-value {
      color: var(--fg);
      white-space: pre-wrap;
      word-break: break-word;
    }
    .task-detail-panel .detail-value.result {
      color: #4caf50;
    }
    .task-detail-panel .detail-value.error {
      color: #f44336;
    }
    .task-detail-panel .tool-call-item,
    .task-detail-panel .timeline-item {
      padding: 2px 0;
      font-size: 0.85em;
    }
    .task-detail-panel .close-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      background: none;
      border: none;
      color: var(--muted);
      cursor: pointer;
      font-size: 1.2em;
      padding: 0 4px;
    }
    .task-detail-panel .close-btn:hover {
      color: var(--fg);
    }
  </style>
</head>
<body>
  <div id="task-detail-overlay" class="task-detail-overlay" style="display:none"></div>
  <div id="layout">
    <div id="threads-panel">
      <div class="panel-header">${tr.history}</div>
      <div class="panel-tabs" id="panel-tabs">
        <button class="panel-tab active" data-tab="threads">🕮 ${tr.threads}</button>
        <button class="panel-tab" data-tab="work">◆ ${tr.work}</button>
        <button class="panel-tab" data-tab="tasks">⚙ ${tr.tasks}</button>
      </div>
      <div id="tab-threads" class="tab-content active"></div>
      <div id="tab-work" class="tab-content" style="display:none"></div>
      <div id="tab-tasks" class="tab-content" style="display:none"></div>
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
        <button id="btn-interrupt">${tr.interrupt}</button>
        <span class="thread-count" id="thread-count" title="${tr.toggleHistory}">0 threads</span>
      </div>
      <div id="input-area">
        <div id="slash-menu"></div>
        <textarea id="input" placeholder="${tr.inputPlaceholder}" rows="1"></textarea>
        <button id="btn-send">${tr.send}</button>
      </div>
      <div class="status-bar" id="status">${tr.initializing}</div>
      <div id="debug-panel" style="display:none;position:fixed;bottom:0;left:0;right:0;background:#1a1a2e;color:#0f0;font-size:11px;padding:4px 8px;z-index:99999;max-height:80px;overflow-y:auto;font-family:monospace;pointer-events:none;"></div>
    </div>
  </div>

  <script nonce="${nonce}">
    window.onerror = function(msg, url, line, col, err) {
      document.title = 'JS_ERROR:' + msg;
      _dbg('JS ERROR: ' + msg + ' at line ' + line);
      return false;
    };
    window.addEventListener('unhandledrejection', function(e) {
      document.title = 'PROMISE_ERROR:' + (e.reason && e.reason.message ? e.reason.message : e.reason);
      _dbg('PROMISE ERROR: ' + (e.reason && e.reason.message ? e.reason.message : e.reason));
    });

    const _debugMode = false;
    function _dbg(msg) {
      if (!_debugMode) return;
      const panel = document.getElementById('debug-panel');
      if (panel) {
        panel.style.display = 'block';
        const line = document.createElement('div');
        line.textContent = new Date().toLocaleTimeString() + ' ' + msg;
        panel.appendChild(line);
        if (panel.children.length > 50) panel.removeChild(panel.firstChild);
        panel.scrollTop = panel.scrollHeight;
      }
    }
    // Translations injected by extension host
    const __locale = '${tr.locale || "en"}';
    const __i18n = {
      thinking: '${tr.thinking}',
      streaming: '${tr.streaming}',
      processing: '${tr.processing}',
      error: '${tr.error}',
      ready: '${tr.ready}',
      approvalAwaiting: '${tr.approvalAwaiting}',
      noConversations: '${tr.noConversations}',
      noTasks: '${tr.noTasks}',
      // Formatting uses __locale + inline logic — no .replace() dependency
      approvalRequired: '${tr.approvalRequired}',
      allow: '${tr.allow}',
      deny: '${tr.deny}',
      thinkingOpen: '${tr.thinkingOpen}',
      thinkingClose: '${tr.thinkingClose}',
    };

    function formatThreadsCount(n) {
      return __locale === 'zh-cn' ? n + ' 个会话' : n + ' thread' + (n !== 1 ? 's' : '');
    }
    function formatLoadedThread(title) {
      return __locale === 'zh-cn' ? '已加载: ' + title : 'Loaded: ' + title;
    }

    function escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    let vscode;
    try {
      vscode = acquireVsCodeApi();
      _dbg('acquireVsCodeApi OK');
    } catch(e) {
      _dbg('FATAL: acquireVsCodeApi failed: ' + e.message);
      document.title = 'FATAL: acquireVsCodeApi failed: ' + e.message;
    }
    if (!vscode) {
      document.body.innerHTML = '<div style="color:red;padding:20px;">FATAL: acquireVsCodeApi() returned null. Webview cannot communicate with extension.</div>';
    }
    const messagesEl = document.getElementById('messages');
    const threadsPanel = document.getElementById('threads-panel');
    const inputEl = document.getElementById('input');
    const sendBtn = document.getElementById('btn-send');
    const newThreadBtn = document.getElementById('btn-new-thread');
    const threadsBtn = document.getElementById('btn-threads');
    const threadCountEl = document.getElementById('thread-count');
    const compactBtn = document.getElementById('btn-compact');
    const interruptBtn = document.getElementById('btn-interrupt');
    const statusEl = document.getElementById('status');
    const slashMenuEl = document.getElementById('slash-menu');
    const currentModeEl = document.getElementById('current-mode');
    const currentModelEl = document.getElementById('current-model');
    const currentReasoningEl = document.getElementById('current-reasoning');

    _dbg('DOM elements: input=' + !!inputEl + ' sendBtn=' + !!sendBtn + ' messages=' + !!messagesEl + ' status=' + !!statusEl);

    function diagElement(name, el) {
      if (!el) { _dbg('DIAG ' + name + ': NULL'); return; }
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      _dbg('DIAG ' + name + ': pos=(' + Math.round(r.x) + ',' + Math.round(r.y) + ') size=' + Math.round(r.width) + 'x' + Math.round(r.height)
        + ' visible=' + (r.width > 0 && r.height > 0)
        + ' pointerEv=' + cs.pointerEvents
        + ' display=' + cs.display
        + ' visibility=' + cs.visibility
        + ' zindex=' + cs.zIndex);
    }

    function describeElement(el) {
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        tag: el.tagName,
        id: el.id || '',
        className: typeof el.className === 'string' ? el.className : String(el.className || ''),
        pointerEvents: cs.pointerEvents,
        position: cs.position,
        display: cs.display,
        visibility: cs.visibility,
        zIndex: cs.zIndex,
      };
    }

    function probeHitTarget(name, el) {
      if (!el) {
        return { name: name, missing: true };
      }
      const rect = el.getBoundingClientRect();
      const x = Math.round(rect.left + rect.width / 2);
      const y = Math.round(rect.top + rect.height / 2);
      const topEl = document.elementFromPoint(x, y);
      return {
        name: name,
        target: describeElement(el),
        center: { x: x, y: y },
        topElement: describeElement(topEl),
        containsTopElement: !!(topEl && el.contains(topEl)),
      };
    }

    function postUiProbe(reason) {
      try {
        vscode.postMessage({
          type: 'debugUiProbe',
          payload: {
            reason: reason,
            activeElement: describeElement(document.activeElement),
            visibilityState: document.visibilityState,
            probes: [
              probeHitTarget('messages', messagesEl),
              probeHitTarget('toolbar', document.getElementById('toolbar')),
              probeHitTarget('inputArea', document.getElementById('input-area')),
              probeHitTarget('input', inputEl),
              probeHitTarget('sendBtn', sendBtn),
              probeHitTarget('threadsBtn', threadsBtn),
              probeHitTarget('threadCount', threadCountEl),
              probeHitTarget('status', statusEl),
              probeHitTarget('taskDetailOverlay', document.getElementById('task-detail-overlay')),
              probeHitTarget('debugPanel', document.getElementById('debug-panel')),
              probeHitTarget('slashMenu', slashMenuEl),
            ],
          }
        });
      } catch (e) {
        _dbg('postUiProbe failed: ' + (e && e.message ? e.message : e));
      }
    }

    let _debugMessageBudget = 40;
    let _debugEventBudget = 12;

    function postUiDebug(reason, payload) {
      try {
        vscode.postMessage({
          type: 'debugUiProbe',
          payload: Object.assign({ reason: reason }, payload || {})
        });
      } catch (e) {
        _dbg('postUiDebug failed: ' + (e && e.message ? e.message : e));
      }
    }

    if (_debugMode) {
      setTimeout(function() {
        _dbg('=== DOM DIAGNOSTIC ===');
        diagElement('body', document.body);
        diagElement('#layout', document.getElementById('layout'));
        diagElement('#chat-area', document.getElementById('chat-area'));
        diagElement('#messages', messagesEl);
        diagElement('#toolbar', document.getElementById('toolbar'));
        diagElement('#input-area', document.getElementById('input-area'));
        diagElement('#input', inputEl);
        diagElement('#sendBtn', sendBtn);
        diagElement('#debug-panel', document.getElementById('debug-panel'));

        var allFixed = document.querySelectorAll('*');
        var fixedCount = 0;
        for (var i = 0; i < allFixed.length; i++) {
          if (getComputedStyle(allFixed[i]).position === 'fixed') fixedCount++;
        }
        _dbg('Total fixed-position elements: ' + fixedCount);

        _dbg('body scrollHeight=' + document.body.scrollHeight + ' clientHeight=' + document.body.clientHeight);
        _dbg('document height=' + document.documentElement.clientHeight);

        document.addEventListener('click', function(e) {
          _dbg('GLOBAL CLICK: target=' + e.target.tagName + '#' + e.target.id + ' class=' + e.target.className
            + ' at (' + Math.round(e.clientX) + ',' + Math.round(e.clientY) + ')'
            + ' pathLen=' + e.composedPath().length);
          var path = e.composedPath();
          for (var j = 0; j < Math.min(path.length, 10); j++) {
            var p = path[j];
            _dbg('  [' + j + '] ' + p.tagName + (p.id ? '#' + p.id : '') + (p.className ? '.' + String(p.className).split(' ')[0] : ''));
          }
        }, true);

        document.addEventListener('mousedown', function(e) {
          _dbg('GLOBAL MOUSEDOWN: (' + Math.round(e.clientX) + ',' + Math.round(e.clientY) + ') button=' + e.button);
        }, true);

        document.addEventListener('keydown', function(e) {
          _dbg('GLOBAL KEYDOWN: key=' + e.key + ' target=' + e.target.tagName + '#' + e.target.id);
        }, true);

        _dbg('Global event listeners attached. Try clicking anywhere...');
        postUiProbe('initial-timeout');
      }, 500);
    }

    document.addEventListener('click', function(e) {
      if (_debugEventBudget <= 0) return;
      _debugEventBudget--;
      postUiDebug('user-click', {
        target: describeElement(e.target),
        activeElement: describeElement(document.activeElement),
      });
    }, true);

    document.addEventListener('keydown', function(e) {
      if (_debugEventBudget <= 0) return;
      _debugEventBudget--;
      postUiDebug('user-keydown', {
        key: e.key,
        target: describeElement(e.target),
        activeElement: describeElement(document.activeElement),
      });
    }, true);

    document.addEventListener('visibilitychange', function() {
      postUiDebug('visibilitychange', {
        visibilityState: document.visibilityState,
        activeElement: describeElement(document.activeElement),
      });
    });

    console.log('DOM elements initialized:');
    console.log('- inputEl:', inputEl);
    console.log('- slashMenuEl:', slashMenuEl);
    console.log('- input-area:', document.getElementById('input-area'));

    let isStreaming = false;
    let streamingTimeout = null;
    let threads = [];
    let activeThreadId = null;
    let slashMenuOpen = false;
    let slashMenuSelected = 0;
    let slashMenuCommands = [];
    
    const slashCommands = [
      { name: '/mode', desc: '${tr.commandMode}', category: 'config' },
      { name: '/model', desc: '${tr.commandModel}', category: 'config' },
      { name: '/models', desc: '${tr.commandModels}', category: 'config' },
      { name: '/reasoning', desc: '${tr.commandReasoning}', category: 'config' },
      { name: '/config', desc: '${tr.commandConfig}', category: 'config' },
      { name: '/settings', desc: '${tr.commandSettings}', category: 'config' },
      { name: '/clear', desc: '${tr.commandClear}', category: 'core' },
      { name: '/help', desc: '${tr.commandHelp}', category: 'core' },
      { name: '/compact', desc: '${tr.commandCompact}', category: 'session' },
      { name: '/exit', desc: '${tr.commandExit}', category: 'core' },
      { name: '/rename', desc: '${tr.commandRename}', category: 'session' },
      { name: '/save', desc: '${tr.commandSave}', category: 'session' },
      { name: '/export', desc: '${tr.commandExport}', category: 'session' },
      { name: '/context', desc: '${tr.commandContext}', category: 'debug' },
      { name: '/tokens', desc: '${tr.commandTokens}', category: 'debug' },
      { name: '/cost', desc: '${tr.commandCost}', category: 'debug' },
      { name: '/status', desc: '${tr.commandStatus}', category: 'debug' },
      { name: '/home', desc: '${tr.commandHome}', category: 'core' },
      { name: '/workspace', desc: '${tr.commandWorkspace}', category: 'config' },
      { name: '/task', desc: '${tr.commandTask}', category: 'core' },
      { name: '/jobs', desc: '${tr.commandJobs}', category: 'core' },
      { name: '/note', desc: '${tr.commandNote}', category: 'core' },
      { name: '/memory', desc: '${tr.commandMemory}', category: 'core' },
      { name: '/trust', desc: '${tr.commandTrust}', category: 'config' },
      { name: '/verbose', desc: '${tr.commandVerbose}', category: 'config' },
      { name: '/theme', desc: '${tr.commandTheme}', category: 'unavailable' },
      { name: '/undo', desc: '${tr.commandUndo}', category: 'session' },
      { name: '/retry', desc: '${tr.commandRetry}', category: 'session' },
      { name: '/share', desc: '${tr.commandShare}', category: 'session' },
      { name: '/goal', desc: '${tr.commandGoal}', category: 'core' },
      { name: '/skills', desc: '${tr.commandSkills}', category: 'skills' },
      { name: '/skill', desc: '${tr.commandSkill}', category: 'skills' },
      { name: '/mcp', desc: '${tr.commandMcp}', category: 'config' },
      { name: '/network', desc: '${tr.commandNetwork}', category: 'config' },
      { name: '/provider', desc: '${tr.commandProvider}', category: 'config' },
      { name: '/queue', desc: '${tr.commandQueue}', category: 'core' },
      { name: '/stash', desc: '${tr.commandStash}', category: 'core' },
      { name: '/hooks', desc: '${tr.commandHooks}', category: 'core' },
      { name: '/subagents', desc: '${tr.commandSubagents}', category: 'core' },
      { name: '/agent', desc: '${tr.commandAgent}', category: 'core' },
      { name: '/links', desc: '${tr.commandLinks}', category: 'core' },
      { name: '/feedback', desc: '${tr.commandFeedback}', category: 'core' },
      { name: '/attach', desc: '${tr.commandAttach}', category: 'core' },
      { name: '/anchor', desc: '${tr.commandAnchor}', category: 'core' },
      { name: '/sessions', desc: '${tr.commandSessions}', category: 'session' },
      { name: '/load', desc: '${tr.commandLoad}', category: 'session' },
      { name: '/cycles', desc: '${tr.commandCycles}', category: 'session' },
      { name: '/cycle', desc: '${tr.commandCycle}', category: 'session' },
      { name: '/recall', desc: '${tr.commandRecall}', category: 'session' },
      { name: '/relay', desc: '${tr.commandRelay}', category: 'core' },
      { name: '/init', desc: '${tr.commandInit}', category: 'config' },
      { name: '/lsp', desc: '${tr.commandLsp}', category: 'config' },
      { name: '/review', desc: '${tr.commandReview}', category: 'skills' },
      { name: '/restore', desc: '${tr.commandRestore}', category: 'session' },
      { name: '/rlm', desc: '${tr.commandRlm}', category: 'core' },
      { name: '/change', desc: '${tr.commandChange}', category: 'core' },
      { name: '/cache', desc: '${tr.commandCache}', category: 'debug' },
      { name: '/profile', desc: '${tr.commandProfile}', category: 'config' },
      { name: '/translate', desc: '${tr.commandTranslate}', category: 'debug' },
      { name: '/system', desc: '${tr.commandSystem}', category: 'debug' },
      { name: '/edit', desc: '${tr.commandEdit}', category: 'session' },
      { name: '/diff', desc: '${tr.commandDiff}', category: 'debug' },
      { name: '/statusline', desc: '${tr.commandStatusline}', category: 'debug' },
      { name: '/logout', desc: '${tr.commandLogout}', category: 'config' },
    ];
    
    function updateSlashMenu(input) {
      console.log('updateSlashMenu called with:', input);
      
      if (!input.startsWith('/')) {
        slashMenuEl.classList.remove('open');
        slashMenuOpen = false;
        return;
      }
      
      const query = input.toLowerCase();
      slashMenuCommands = slashCommands.filter(cmd => 
        cmd.name.toLowerCase().startsWith(query) ||
        cmd.desc.toLowerCase().includes(query.slice(1))
      );
      
      console.log('Found commands:', slashMenuCommands.length);
      
      if (slashMenuCommands.length === 0) {
        slashMenuEl.classList.remove('open');
        slashMenuOpen = false;
        return;
      }
      
      const menuHtml = slashMenuCommands.map((cmd, i) => 
        '<div class="slash-menu-item' + (i === slashMenuSelected ? ' selected' : '') + '" data-index="' + i + '">' +
        '<span class="command-name">' + escapeHtml(cmd.name) + '</span>' +
        '<span class="command-desc">' + escapeHtml(cmd.desc) + '</span>' +
        '</div>'
      ).join('');
      
      console.log('Setting menu HTML, slashMenuEl:', slashMenuEl);
      slashMenuEl.innerHTML = menuHtml;
      
      const rect = inputEl.getBoundingClientRect();
      slashMenuEl.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
      slashMenuEl.style.left = rect.left + 'px';
      slashMenuEl.style.width = rect.width + 'px';
      
      slashMenuEl.classList.add('open');
      slashMenuOpen = true;
      console.log('Menu should be visible now');
    }
    
    function applySlashCommand(index) {
      if (index >= 0 && index < slashMenuCommands.length) {
        const cmd = slashMenuCommands[index];
        inputEl.value = cmd.name + ' ';
        inputEl.focus();
        slashMenuEl.classList.remove('open');
        slashMenuOpen = false;
      }
    }
    
    slashMenuEl.addEventListener('click', (e) => {
      const item = e.target.closest('.slash-menu-item');
      if (item) {
        const index = parseInt(item.getAttribute('data-index'));
        applySlashCommand(index);
      }
    });

    sendBtn.addEventListener('click', () => { _dbg('sendBtn clicked'); sendMessage(); });
    inputEl.addEventListener('keydown', (e) => {
      _dbg('keydown: key=' + e.key);
      if (slashMenuOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          slashMenuSelected = Math.min(slashMenuSelected + 1, slashMenuCommands.length - 1);
          updateSlashMenu(inputEl.value);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          slashMenuSelected = Math.max(slashMenuSelected - 1, 0);
          updateSlashMenu(inputEl.value);
        } else if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          applySlashCommand(slashMenuSelected);
        } else if (e.key === 'Escape') {
          slashMenuEl.classList.remove('open');
          slashMenuOpen = false;
        }
        return;
      }
      
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    inputEl.addEventListener('input', () => {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
      slashMenuSelected = 0;
      updateSlashMenu(inputEl.value);
    });

    newThreadBtn.addEventListener('click', () => vscode.postMessage({ type: 'newThread' }));
    compactBtn.addEventListener('click', () => vscode.postMessage({ type: 'compact' }));
    interruptBtn.addEventListener('click', () => vscode.postMessage({ type: 'interrupt' }));
    function toggleThreadsPanel() {
      const opening = !threadsPanel.classList.contains('open');
      threadsPanel.classList.toggle('open');
      if (opening) {
        // Request fresh data from extension when opening sidebar
        vscode.postMessage({ type: 'refreshSidebar' });
      }
    }
    threadsBtn.addEventListener('click', toggleThreadsPanel);
    threadCountEl.addEventListener('click', toggleThreadsPanel);

    function sendMessage() {
      const text = inputEl.value.trim();
      if (!text || isStreaming) return;
      inputEl.value = '';
      inputEl.style.height = 'auto';
      
      if (text.startsWith('/')) {
        const parts = text.split(' ');
        const command = parts[0].toLowerCase();
        const args = parts.slice(1).join(' ');
        
        vscode.postMessage({ type: 'slashCommand', command, args });
      } else {
        vscode.postMessage({ type: 'sendMessage', text });
      }
    }

    function addMessage(msg) {
      const el = document.createElement('div');
      el.className = 'message ' + msg.role;
      el.id = 'msg-' + msg.id;

      let html = '<div class="role">' + escapeHtml(msg.role) + '</div>';
      html += '<div class="message-body" id="body-' + msg.id + '"></div>';
      
      el.innerHTML = html;
      messagesEl.appendChild(el);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      
      const bodyEl = el.querySelector('.message-body');
      
      if (msg.thinkingHtml !== undefined || msg.thinking !== undefined) {
        const th = msg.thinkingHtml !== undefined ? msg.thinkingHtml : escapeHtml(msg.thinking || '');
        const block = document.createElement('div');
        block.className = 'thinking-block';
        const isOpen = msg.status === 'streaming' ? 'open' : '';
        const arrow = msg.status === 'streaming' ? '▼' : '▶';
        block.innerHTML = '<div class="thinking-toggle">' + arrow + ' Thinking</div><div class="thinking-content ' + isOpen + '" id="thinking-' + msg.id + '">' + th + '</div>';
        bodyEl.appendChild(block);
      }
      
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        for (const tc of msg.toolCalls) {
          const tcEl = document.createElement('div');
          tcEl.innerHTML = renderToolCall(msg.id, tc);
          bodyEl.appendChild(tcEl.firstElementChild);
        }
      }
      
      const content = msg.contentHtml !== undefined ? msg.contentHtml : (msg.content || '');
      if (content) {
        const contentEl = document.createElement('div');
        contentEl.className = 'content' + (msg.status === 'streaming' ? ' streaming-indicator' : '');
        contentEl.id = 'content-' + msg.id;
        contentEl.innerHTML = content;
        bodyEl.appendChild(contentEl);
      } else if (msg.status === 'streaming') {
        const contentEl = document.createElement('div');
        contentEl.className = 'content streaming-indicator';
        contentEl.id = 'content-' + msg.id;
        bodyEl.appendChild(contentEl);
      }
      
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function renderToolCall(msgId, tc) {
      let statusIcon = '';
      let statusText = tc.status;
      
      if (tc.status === 'running') {
        statusIcon = '⟳';
        statusText = 'running...';
      } else if (tc.status === 'complete') {
        statusIcon = '✓';
        statusText = 'completed';
      } else if (tc.status === 'error') {
        statusIcon = '✗';
        statusText = 'error';
      } else if (tc.status === 'awaiting_approval') {
        statusIcon = '⚠';
        statusText = 'awaiting approval';
      } else if (tc.status === 'pending') {
        statusIcon = '◯';
        statusText = 'pending';
      }
      
      let html = '<div class="tool-call" id="tc-' + msgId + '-' + escapeHtml(tc.name) + '">';
      html += '<span class="tool-name">🔧 ' + escapeHtml(tc.name) + '</span>';
      html += ' <span class="tool-status" style="color:var(--muted)">' + statusIcon + ' ' + statusText + '</span>';
      if (tc.output) {
        html += '<div class="tool-output">' + escapeHtml(tc.output) + '</div>';
      }
      if (tc.status === 'awaiting_approval' && tc.approvalId) {
        html += '<div class="approval-bar">';
        html += '<div class="approval-text">⚠ Approval required</div>';
        html += '<div class="approval-buttons">';
        html += '<button class="btn-allow" data-approval-id="' + tc.approvalId + '" data-decision="allow">Allow</button>';
        html += '<button class="btn-deny" data-approval-id="' + tc.approvalId + '" data-decision="deny">Deny</button>';
        html += '</div></div>';
      }
      html += '</div>';
      return html;
    }

    function toggleThinking(el) {
      const content = el.nextElementSibling;
      if (!content) {
        console.error('Thinking content not found');
        return;
      }
      const isOpen = content.classList.contains('open');
      if (isOpen) {
        content.classList.remove('open');
        el.textContent = '▶ Thinking';
      } else {
        content.classList.add('open');
        el.textContent = '▼ Thinking';
      }
    }

    function decideApproval(approvalId, decision) {
      vscode.postMessage({ type: 'approvalDecision', approvalId, decision });
    }

    // Event delegation for thinking toggle and approval buttons
    messagesEl.addEventListener('click', (e) => {
      const target = e.target;
      
      // Handle thinking toggle
      if (target.classList.contains('thinking-toggle')) {
        toggleThinking(target);
      }
      
      // Handle approval buttons
      if (target.classList.contains('btn-allow') || target.classList.contains('btn-deny')) {
        const approvalId = target.getAttribute('data-approval-id');
        const decision = target.getAttribute('data-decision');
        if (approvalId && decision) {
          decideApproval(approvalId, decision);
        }
      }
    });

    // Tab switching
    document.getElementById('panel-tabs').addEventListener('click', (e) => {
      const btn = e.target.closest('.panel-tab');
      if (!btn) return;
      const tab = btn.dataset.tab;
      document.querySelectorAll('.panel-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(c => {
        c.style.display = c.id === 'tab-' + tab ? 'block' : 'none';
      });
    });

    function formatRelativeTime(dateStr) {
      try {
        const d = new Date(dateStr);
        const now = new Date();
        const diffMs = now - d;
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return 'just now';
        if (diffMin < 60) return diffMin + 'm ago';
        const diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return diffHr + 'h ago';
        const diffDay = Math.floor(diffHr / 24);
        if (diffDay < 30) return diffDay + 'd ago';
        return d.toLocaleDateString();
      } catch { return ''; }
    }

    function renderThreads() {
      const container = document.getElementById('tab-threads');
      if (!container) return;
      const count = threads.length;
      threadCountEl.textContent = formatThreadsCount(count);

      container.innerHTML = '';

      if (count === 0) {
        const el = document.createElement('div');
        el.className = 'thread-item';
        el.textContent = 'No conversations yet';
        el.style.color = 'var(--muted)';
        el.style.fontStyle = 'italic';
        el.style.textAlign = 'center';
        el.style.padding = '20px 10px';
        container.appendChild(el);
        return;
      }

      for (const t of threads) {
        const el = document.createElement('div');
        el.className = 'thread-item' + (t.id === activeThreadId ? ' active' : '');

        const titleEl = document.createElement('div');
        titleEl.className = 'thread-title';
        titleEl.textContent = t.title || t.id.slice(0, 8);
        el.appendChild(titleEl);

        if (t.preview) {
          const previewEl = document.createElement('div');
          previewEl.className = 'thread-preview';
          previewEl.textContent = t.preview;
          el.appendChild(previewEl);
        }

        const metaEl = document.createElement('div');
        metaEl.className = 'thread-meta';

        if (t.latest_turn_status) {
          const statusEl = document.createElement('span');
          statusEl.className = 'turn-status ' + t.latest_turn_status;
          statusEl.textContent = t.latest_turn_status;
          metaEl.appendChild(statusEl);
        }

        const modeEl = document.createElement('span');
        modeEl.textContent = t.mode || '';
        metaEl.appendChild(modeEl);

        if (t.updated_at) {
          const timeEl = document.createElement('span');
          timeEl.textContent = formatRelativeTime(t.updated_at);
          metaEl.appendChild(timeEl);
        }

        el.appendChild(metaEl);

        el.addEventListener('click', () => {
          vscode.postMessage({ type: 'loadThread', threadId: t.id });
          threadsPanel.classList.remove('open');
        });
        container.appendChild(el);
      }
    }

    function renderTasks(tasks) {
      const container = document.getElementById('tab-tasks');
      if (!container) return;
      container.innerHTML = '';
      if (!tasks || tasks.length === 0) {
        const el = document.createElement('div');
        el.className = 'work-empty';
        el.textContent = 'No tasks';
        container.appendChild(el);
        return;
      }
      for (const t of tasks) {
        const card = document.createElement('div');
        card.className = 'task-card';
        const statusIcon = t.status === 'completed' ? '✓' : t.status === 'running' ? '⟳' : t.status === 'failed' ? '✗' : t.status === 'queued' ? '⏳' : '·';
        const statusColor = t.status === 'completed' ? '#4caf50' : t.status === 'running' ? '#ff9800' : t.status === 'failed' ? '#f44336' : t.status === 'queued' ? '#888' : '#888';
        const title = (t.prompt_summary || t.id).slice(0, 30);
        card.innerHTML =
          '<div class="task-header">' +
            '<span class="task-status-icon" style="color:' + statusColor + '">' + statusIcon + '</span>' +
            '<span class="task-title">' + escapeHtml(title) + '</span>' +
          '</div>' +
          '<div class="task-meta">' + escapeHtml(t.status) + ' · ' + escapeHtml(t.model || '') + '</div>';
        card.addEventListener('click', (e) => {
          if (e.target.tagName === 'BUTTON') return;
          vscode.postMessage({ type: 'slashCommand', command: '/task show ' + t.id });
        });
        if (t.status === 'running' || t.status === 'queued') {
          const actions = document.createElement('div');
          actions.className = 'task-actions';
          const cancelBtn = document.createElement('button');
          cancelBtn.textContent = 'Cancel';
          cancelBtn.onclick = () => {
            vscode.postMessage({ type: 'slashCommand', command: '/task cancel ' + t.id });
          };
          actions.appendChild(cancelBtn);
          card.appendChild(actions);
        }
        container.appendChild(card);
      }
    }

    let workState = { goal: null, checklist: [], strategy: [], cycleCount: 0 };

    function renderWork() {
      const container = document.getElementById('tab-work');
      if (!container) return;
      container.innerHTML = '';
      const hasContent = workState.goal || workState.checklist.length > 0 || workState.strategy.length > 0 || workState.cycleCount > 0;
      if (!hasContent) {
        const el = document.createElement('div');
        el.className = 'work-empty';
        el.textContent = 'No active work';
        container.appendChild(el);
        return;
      }
      if (workState.goal) {
        const section = document.createElement('div');
        section.className = 'work-section';
        section.innerHTML = '<div class="work-section-title">Goal</div><div class="work-goal">' + escapeHtml(workState.goal) + '</div>';
        container.appendChild(section);
      }
      if (workState.checklist.length > 0) {
        const section = document.createElement('div');
        section.className = 'work-section';
        let html = '<div class="work-section-title">Checklist</div>';
        for (const item of workState.checklist) {
          const check = item.status === 'completed' ? '[x]' : item.status === 'in_progress' ? '[~]' : '[ ]';
          const color = item.status === 'completed' ? '#4caf50' : item.status === 'in_progress' ? '#ff9800' : '#888';
          html += '<div class="work-checklist-item" style="color:' + color + '"><span class="check">' + check + '</span>' + escapeHtml(item.content) + '</div>';
        }
        section.innerHTML = html;
        container.appendChild(section);
      }
      if (workState.strategy.length > 0) {
        const section = document.createElement('div');
        section.className = 'work-section';
        let html = '<div class="work-section-title">Strategy</div>';
        for (const step of workState.strategy) {
          const icon = step.status === 'completed' ? '[x]' : step.status === 'in_progress' ? '[~]' : '[ ]';
          const color = step.status === 'completed' ? '#4caf50' : step.status === 'in_progress' ? '#ff9800' : '#888';
          html += '<div class="work-strategy-step" style="color:' + color + '"><span class="step-icon">' + icon + '</span>' + escapeHtml(step.text) + '</div>';
        }
        section.innerHTML = html;
        container.appendChild(section);
      }
      if (workState.cycleCount > 0) {
        const section = document.createElement('div');
        section.className = 'work-section';
        section.innerHTML = '<div style="font-size:0.8em;color:var(--muted)">cycles: ' + workState.cycleCount + '</div>';
        container.appendChild(section);
      }
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function closeTaskDetail() {
      const overlay = document.getElementById('task-detail-overlay');
      if (overlay) {
        overlay.style.display = 'none';
        overlay.innerHTML = '';
        overlay.onclick = null;
      }
    }

    function showTaskDetail(task) {
      const overlay = document.getElementById('task-detail-overlay');
      if (!overlay) return;
      const statusIcon = task.status === 'completed' ? '✓' : task.status === 'running' ? '⟳' : task.status === 'failed' ? '✗' : task.status === 'queued' ? '⏳' : '·';
      const statusColor = task.status === 'completed' ? '#4caf50' : task.status === 'running' ? '#ff9800' : task.status === 'failed' ? '#f44336' : '#888';
      const duration = task.duration_ms ? (task.duration_ms / 1000).toFixed(1) + 's' : '-';
      let html = '<div class="task-detail-panel">';
      html += '<button class="close-btn" type="button">✕</button>';
      html += '<h3>' + statusIcon + ' Task ' + escapeHtml(task.id.slice(0, 8)) + '</h3>';

      html += '<div class="detail-section">';
      html += '<div class="detail-label">Status</div>';
      html += '<div class="detail-value" style="color:' + statusColor + '">' + escapeHtml(task.status) + '</div>';
      html += '</div>';

      html += '<div class="detail-section">';
      html += '<div class="detail-label">Model / Mode</div>';
      html += '<div class="detail-value">' + escapeHtml(task.model) + ' · ' + escapeHtml(task.mode) + '</div>';
      html += '</div>';

      html += '<div class="detail-section">';
      html += '<div class="detail-label">Duration</div>';
      html += '<div class="detail-value">' + duration + '</div>';
      html += '</div>';

      html += '<div class="detail-section">';
      html += '<div class="detail-label">Prompt</div>';
      html += '<div class="detail-value">' + escapeHtml(task.prompt) + '</div>';
      html += '</div>';

      if (task.result_summary) {
        html += '<div class="detail-section">';
        html += '<div class="detail-label">Result</div>';
        html += '<div class="detail-value result">' + escapeHtml(task.result_summary) + '</div>';
        html += '</div>';
      }

      if (task.result_detail_path) {
        html += '<div class="detail-section">';
        html += '<div class="detail-label">Result Artifact</div>';
        html += '<div class="detail-value">' + escapeHtml(task.result_detail_path) + '</div>';
        html += '</div>';
      }

      if (task.error) {
        html += '<div class="detail-section">';
        html += '<div class="detail-label">Error</div>';
        html += '<div class="detail-value error">' + escapeHtml(task.error) + '</div>';
        html += '</div>';
      }

      if (task.tool_calls && task.tool_calls.length > 0) {
        html += '<div class="detail-section">';
        html += '<div class="detail-label">Tool Calls (' + task.tool_calls.length + ')</div>';
        for (const tc of task.tool_calls) {
          const tcStatus = tc.status === 'success' ? '✓' : tc.status === 'running' ? '⟳' : tc.status === 'failed' ? '✗' : '·';
          const tcDur = tc.duration_ms ? ' (' + (tc.duration_ms / 1000).toFixed(1) + 's)' : '';
          html += '<div class="tool-call-item">' + tcStatus + ' ' + escapeHtml(tc.name) + tcDur;
          if (tc.output_summary) html += ' — ' + escapeHtml(tc.output_summary);
          html += '</div>';
        }
        html += '</div>';
      }

      if (task.timeline && task.timeline.length > 0) {
        html += '<div class="detail-section">';
        html += '<div class="detail-label">Timeline</div>';
        for (const entry of task.timeline) {
          const time = entry.timestamp ? entry.timestamp.slice(11, 19) : '';
          html += '<div class="timeline-item">[' + time + '] ' + escapeHtml(entry.kind) + ': ' + escapeHtml(entry.summary) + '</div>';
        }
        html += '</div>';
      }

      html += '</div>';
      overlay.innerHTML = html;
      overlay.style.display = 'flex';
      const closeBtn = overlay.querySelector('.close-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          closeTaskDetail();
        });
      }
      overlay.onclick = (e) => { if (e.target === overlay) closeTaskDetail(); };
    }

    closeTaskDetail();

    // Tell extension we're ready to receive messages (side-effect of loading)
    _dbg('Sending webviewReady...');
    vscode.postMessage({ type: 'webviewReady' });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      _dbg('recv msg: ' + msg.type);
      if (_debugMessageBudget > 0) {
        _debugMessageBudget--;
        postUiDebug('recv-message', {
          messageType: msg.type,
          statusText: statusEl ? statusEl.textContent : '',
        });
      }
      switch (msg.type) {
        case 'ready':
          closeTaskDetail();
          statusEl.textContent = '${tr.ready} (' + (msg.model || 'deepseek-v4-pro') + ')';
          if (msg.mode) currentModeEl.textContent = msg.mode;
          if (msg.model) currentModelEl.textContent = msg.model;
          if (msg.reasoningEffort) currentReasoningEl.textContent = msg.reasoningEffort;
          break;
          
        case 'settingsUpdated':
          if (msg.mode) currentModeEl.textContent = msg.mode;
          if (msg.model) currentModelEl.textContent = msg.model;
          if (msg.reasoningEffort) currentReasoningEl.textContent = msg.reasoningEffort;
          break;

        case 'threadList':
          threads = msg.threads || [];
          renderThreads();
          break;

        case 'taskList':
          renderTasks(msg.tasks || []);
          break;

        case 'workState':
          workState = {
            goal: msg.goal || null,
            checklist: msg.checklist || [],
            strategy: msg.strategy || [],
            cycleCount: msg.cycleCount || 0,
          };
          renderWork();
          break;

        case 'taskDetail':
          showTaskDetail(msg.task);
          break;

        case 'loadHistory':
          closeTaskDetail();
          messagesEl.innerHTML = '';
          for (const m of msg.messages) addMessage(m);
          break;

        case 'threadLoaded':
          closeTaskDetail();
          activeThreadId = msg.thread?.id || null;
          messagesEl.innerHTML = '';
          for (const m of msg.messages) addMessage(m);
          statusEl.textContent = formatLoadedThread(msg.thread?.title || msg.thread?.id?.slice(0, 12) || '');
          renderThreads();
          break;

        case 'addMessage':
          addMessage(msg.message);
          if (msg.message.status === 'streaming') {
            isStreaming = true;
            if (streamingTimeout) clearTimeout(streamingTimeout);
            streamingTimeout = setTimeout(() => {
              if (isStreaming) {
                isStreaming = false;
                statusEl.textContent = 'Ready (stream timed out)';
              }
            }, 300000);
            statusEl.textContent = 'Thinking...';
          }
          break;

        case 'updateMessage': {
          let contentEl = document.getElementById('content-' + msg.messageId);
          if (!contentEl) {
            const bodyEl = document.getElementById('body-' + msg.messageId);
            if (bodyEl) {
              contentEl = document.createElement('div');
              contentEl.className = 'content streaming-indicator';
              contentEl.id = 'content-' + msg.messageId;
              bodyEl.appendChild(contentEl);
            }
          }
          if (contentEl) {
            contentEl.textContent = msg.content || '';
            messagesEl.scrollTop = messagesEl.scrollHeight;
          }
          statusEl.textContent = 'Streaming...';
          break;
        }

        case 'updateThinking': {
          let thinkingEl = document.getElementById('thinking-' + msg.messageId);
          if (!thinkingEl) {
            const bodyEl = document.getElementById('body-' + msg.messageId);
            if (bodyEl) {
              const block = document.createElement('div');
              block.className = 'thinking-block';
              block.innerHTML = '<div class="thinking-toggle">▼ Thinking</div><div class="thinking-content open" id="thinking-' + msg.messageId + '"></div>';
              bodyEl.insertBefore(block, bodyEl.firstChild);
              thinkingEl = block.querySelector('.thinking-content');
            }
          }
          if (thinkingEl) {
            thinkingEl.textContent = msg.thinking || '';
            messagesEl.scrollTop = messagesEl.scrollHeight;
          }
          statusEl.textContent = 'Thinking...';
          break;
        }

        case 'addToolCall': {
          const bodyEl = document.getElementById('body-' + msg.messageId);
          if (bodyEl) {
            const tcEl = document.createElement('div');
            tcEl.innerHTML = renderToolCall(msg.messageId, msg.toolCall);
            const contentEl = document.getElementById('content-' + msg.messageId);
            if (contentEl) {
              bodyEl.insertBefore(tcEl.firstElementChild, contentEl);
            } else {
              bodyEl.appendChild(tcEl.firstElementChild);
            }
            messagesEl.scrollTop = messagesEl.scrollHeight;
          }
          break;
        }

        case 'updateToolCall': {
          const tcEl = document.getElementById('tc-' + msg.messageId + '-' + msg.toolName);
          if (tcEl) {
            const statusSpan = tcEl.querySelector('.tool-status');
            if (statusSpan) {
              let statusIcon = '';
              let statusText = msg.status;
              
              if (msg.status === 'running') {
                statusIcon = '⟳';
                statusText = 'running...';
              } else if (msg.status === 'complete') {
                statusIcon = '✓';
                statusText = 'completed';
              } else if (msg.status === 'error') {
                statusIcon = '✗';
                statusText = 'error';
              } else if (msg.status === 'awaiting_approval') {
                statusIcon = '⚠';
                statusText = 'awaiting approval';
              }
              
              statusSpan.textContent = statusIcon + ' ' + statusText;
            }
            if (msg.output) {
              let outputEl = tcEl.querySelector('.tool-output');
              if (!outputEl) {
                outputEl = document.createElement('div');
                outputEl.className = 'tool-output';
                tcEl.appendChild(outputEl);
              }
              outputEl.textContent = msg.output;
            }
            messagesEl.scrollTop = messagesEl.scrollHeight;
          }
          break;
        }

        case 'approvalRequired': {
          const bodyEl = document.getElementById('body-' + msg.messageId);
          if (bodyEl) {
            const existing = bodyEl.querySelector('.approval-bar');
            if (!existing) {
              const bar = document.createElement('div');
              bar.className = 'approval-bar';
              bar.innerHTML = '<div class="approval-text">⚠ ' + escapeHtml(msg.reason) + '</div>'
                + '<div class="approval-buttons">'
                + '<button class="btn-allow" data-approval-id="' + msg.approvalId + '" data-decision="allow">Allow</button>'
                + '<button class="btn-deny" data-approval-id="' + msg.approvalId + '" data-decision="deny">Deny</button>'
                + '</div>';
              bodyEl.appendChild(bar);
              messagesEl.scrollTop = messagesEl.scrollHeight;
            }
          }
          statusEl.textContent = '⏳ Awaiting approval...';
          break;
        }

        case 'approvalResolved':
          document.querySelectorAll('.approval-bar').forEach(bar => bar.remove());
          statusEl.textContent = 'Streaming...';
          break;

        case 'messageComplete': {
          const el = document.getElementById('content-' + msg.messageId);
          if (el) el.classList.remove('streaming-indicator');
          if (msg.usage) {
            const msgEl = document.getElementById('msg-' + msg.messageId);
            if (msgEl) {
              const usageEl = document.createElement('div');
              usageEl.className = 'usage-info';
              usageEl.textContent = '↥' + (msg.usage.input_tokens || 0) + ' ↧' + (msg.usage.output_tokens || 0);
              msgEl.appendChild(usageEl);
            }
          }
          if (msg.contentHtml) {
            const contentEl = document.getElementById('content-' + msg.messageId);
            if (contentEl) contentEl.innerHTML = msg.contentHtml;
          }
          if (msg.thinkingHtml) {
            const thinkingEl = document.getElementById('thinking-' + msg.messageId);
            if (thinkingEl) thinkingEl.innerHTML = msg.thinkingHtml;
          }
          isStreaming = false;
          if (streamingTimeout) { clearTimeout(streamingTimeout); streamingTimeout = null; }
          statusEl.textContent = msg.error ? 'Error' : 'Ready';
          break;
        }

        case 'turnStarted':
          statusEl.textContent = 'Processing...';
          break;

        case 'status':
          statusEl.textContent = msg.text;
          break;

        case 'clearChat':
          closeTaskDetail();
          messagesEl.innerHTML = '';
          isStreaming = false;
          if (streamingTimeout) { clearTimeout(streamingTimeout); streamingTimeout = null; }
          statusEl.textContent = 'Ready';
          break;

        case 'error':
          statusEl.textContent = 'Error';
          const errEl = document.createElement('div');
          errEl.className = 'error-banner';
          errEl.innerHTML = '<span class="msg-label error">Error</span><span>' + escapeHtml(msg.message) + '</span>';
          messagesEl.appendChild(errEl);
          messagesEl.scrollTop = messagesEl.scrollHeight;
          isStreaming = false;
          if (streamingTimeout) { clearTimeout(streamingTimeout); streamingTimeout = null; }
          break;

        case 'info': {
          const infoEl = document.createElement('div');
          infoEl.className = 'system-message';
          infoEl.innerHTML = '<span class="msg-label note">Note</span><span class="msg-body">' + escapeHtml(msg.message) + '</span>';
          messagesEl.appendChild(infoEl);
          messagesEl.scrollTop = messagesEl.scrollHeight;
          break;
        }

        case 'loadLastUserMessage': {
          const userMsgs = messagesEl.querySelectorAll('.message.user .message-content');
          if (userMsgs.length > 0) {
            const lastMsg = userMsgs[userMsgs.length - 1];
            inputEl.value = lastMsg.textContent || '';
            inputEl.focus();
            inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
          } else {
            const infoEl = document.createElement('div');
            infoEl.className = 'system-message';
            infoEl.innerHTML = '<span class="msg-label note">Note</span><span class="msg-body">No previous message to edit</span>';
            messagesEl.appendChild(infoEl);
            messagesEl.scrollTop = messagesEl.scrollHeight;
          }
          break;
        }
      }
    });
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
