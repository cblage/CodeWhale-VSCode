import * as vscode from "vscode";

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
  <title>CodeWhale Chat</title>
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
      --brand-primary: #2c4f54;
      --brand-primary-light: #6d9ea6;
      --brand-primary-foreground: #ffffff;
      --brand-warm-bg: #fdfbf7;
      --brand-deep-bg: #0c1416;
      --brand-ink: #1c1917;
      --brand-soft-gray: #e7e5e4;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --brand-primary: #6d9ea6;
        --brand-primary-light: #8fbfc7;
        --brand-warm-bg: #0c1416;
        --brand-ink: #e7e5e4;
      }
    }

    body[data-vscode-theme-kind="vscode-dark"] {
      --brand-primary: #6d9ea6;
      --brand-primary-light: #8fbfc7;
      --brand-warm-bg: #0c1416;
      --brand-ink: #e7e5e4;
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
      width: 220px;
      min-width: 160px;
      border-right: 1px solid var(--border);
      overflow-y: auto;
      padding: 0;
      display: none;
      flex-direction: column;
    }
    #threads-panel.open { display: flex; }

    .sidebar-section {
      display: flex;
      flex-direction: column;
      border-bottom: 1px solid var(--border);
    }
    .sidebar-section-header {
      display: flex;
      align-items: center;
      padding: 5px 10px;
      cursor: pointer;
      user-select: none;
      transition: background 0.15s;
    }
    .sidebar-section-header:hover {
      background: var(--card-bg);
    }
    .sidebar-section-title {
      font-size: 0.78em;
      font-weight: 600;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      flex: 1;
    }
    .sidebar-section-action {
      font-size: 0.85em;
      cursor: pointer;
      padding: 0 4px;
      transition: opacity 0.2s;
    }
    .sidebar-section-action:hover {
      opacity: 1 !important;
    }
    .sidebar-section-arrow {
      font-size: 0.7em;
      color: var(--muted);
      transition: transform 0.2s;
    }
    .sidebar-section.collapsed .sidebar-section-arrow {
      transform: rotate(-90deg);
    }
    .sidebar-section-body {
      overflow-y: auto;
      max-height: 200px;
      transition: max-height 0.25s ease;
    }
    .sidebar-section.collapsed .sidebar-section-body {
      max-height: 0 !important;
      overflow: hidden;
    }
    #sidebar-threads .sidebar-section-body {
      max-height: 600px;
      flex: 1;
    }

    .sidebar-tabs {
      display: flex;
      align-items: center;
      padding: 5px 10px;
      border-bottom: 1px solid var(--border);
      gap: 4px;
    }
    .sidebar-tab {
      padding: 4px 12px;
      font-size: 0.78em;
      font-weight: 600;
      color: var(--muted);
      background: transparent;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .sidebar-tab:hover {
      background: var(--card-bg);
      color: var(--fg);
    }
    .sidebar-tab.active {
      background: var(--brand-primary);
      color: white;
    }

    .thread-item {
      padding: 6px 10px;
      cursor: pointer;
      font-size: 0.85em;
      color: var(--muted);
    }
    .thread-item + .thread-item { border-top: 1px solid rgba(128,128,128,0.1); }
    .thread-item:hover { background: var(--card-bg); color: var(--fg); }
    .thread-item.active { background: var(--brand-primary); color: white; }
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
    .session-workspace {
      color: var(--accent);
      font-size: 0.9em;
      opacity: 0.7;
    }

    #chat-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

    #messages {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }

    .welcome-screen {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex: 1;
      padding: 40px 24px;
      text-align: center;
      animation: welcomeFadeIn 600ms ease-out;
    }
    @keyframes welcomeFadeIn {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .welcome-brand {
      font-size: 1.6em;
      font-weight: 700;
      color: var(--brand-primary);
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }
    .welcome-subtitle {
      font-size: 0.85em;
      color: var(--muted);
      margin-bottom: 28px;
      max-width: 360px;
      line-height: 1.5;
    }
    .welcome-quote-block {
      position: relative;
      padding: 16px 24px;
      margin-bottom: 32px;
      max-width: 400px;
      border-left: 3px solid var(--brand-primary);
      background: rgba(44, 79, 84, 0.06);
      border-radius: 0 8px 8px 0;
    }
    body[data-vscode-theme-kind="vscode-dark"] .welcome-quote-block {
      background: rgba(109, 158, 166, 0.08);
    }
    .welcome-quote-text {
      font-size: 0.88em;
      line-height: 1.7;
      color: var(--fg);
      font-style: italic;
    }
    .welcome-quote-author {
      font-size: 0.78em;
      color: var(--muted);
      margin-top: 8px;
      text-align: right;
    }
    .welcome-suggestions-title {
      font-size: 0.9em;
      font-weight: 600;
      color: var(--fg);
      margin-bottom: 12px;
    }
    .welcome-suggestions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      max-width: 420px;
      width: 100%;
    }
    .welcome-suggestion {
      padding: 10px 14px;
      border: 1px solid var(--border);
      border-radius: 8px;
      font-size: 0.82em;
      color: var(--muted);
      cursor: pointer;
      text-align: left;
      background: transparent;
      transition: border-color 0.2s, color 0.2s, background 0.2s;
      line-height: 1.4;
    }
    .welcome-suggestion:hover {
      border-color: var(--brand-primary);
      color: var(--brand-primary);
      background: rgba(44, 79, 84, 0.05);
    }
    body[data-vscode-theme-kind="vscode-dark"] .welcome-suggestion:hover {
      background: rgba(109, 158, 166, 0.08);
    }

    .message {
      margin-bottom: 12px;
      padding: 8px 12px;
      border-radius: 6px;
      max-width: 100%;
      word-wrap: break-word;
    }

    .message.user {
      background: var(--brand-primary);
      color: var(--brand-primary-foreground);
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
      border-left: 3px solid var(--brand-primary);
      margin: 6px 0;
      padding: 4px 10px;
      color: var(--muted);
      background: rgba(44, 79, 84, 0.05);
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
      color: var(--brand-primary);
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
      line-height: 1.6;
    }
    .thinking-content.open { 
      display: block; 
    }
    .thinking-stream {
      white-space: pre-wrap;
      word-break: break-word;
      font-family: inherit;
    }
    .thinking-content p { margin: 4px 0; }
    .thinking-content ul, .thinking-content ol {
      margin: 4px 0; padding-left: 20px;
    }
    .thinking-content li { margin: 2px 0; }
    .thinking-content code {
      background: rgba(128,128,128,0.15);
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 0.9em;
      font-family: var(--vscode-editor-font-family, monospace);
    }
    .thinking-content pre {
      background: var(--input-bg);
      padding: 8px;
      border-radius: 4px;
      overflow-x: auto;
      margin: 6px 0;
    }
    .thinking-content pre code {
      background: none; padding: 0;
    }
    .thinking-content blockquote {
      border-left: 2px solid var(--muted);
      margin: 6px 0; padding-left: 10px;
      color: var(--muted);
    }
    .thinking-content strong { color: var(--fg); }
    .thinking-content h1, .thinking-content h2, .thinking-content h3,
    .thinking-content h4, .thinking-content h5, .thinking-content h6 {
      margin: 8px 0 4px; color: var(--fg); font-weight: 600;
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
      color: var(--brand-primary);
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

    .file-change-card {
      margin-top: 6px;
      padding: 6px 10px;
      border: 1px solid var(--brand-primary);
      border-radius: 4px;
      background: rgba(0, 122, 204, 0.06);
      font-size: 0.85em;
    }
    .file-change-card .fc-header {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .file-change-card .fc-path {
      font-family: var(--vscode-editor-font-family, monospace);
      font-weight: 600;
      color: var(--fg);
      word-break: break-all;
    }
    .file-change-card .fc-badge {
      font-size: 0.8em;
      padding: 1px 6px;
      border-radius: 3px;
      font-weight: 500;
    }
    .file-change-card .fc-badge.created {
      background: rgba(76, 175, 80, 0.15);
      color: #4caf50;
    }
    .file-change-card .fc-badge.modified {
      background: rgba(33, 150, 243, 0.15);
      color: #2196f3;
    }
    .file-change-card .fc-badge.deleted {
      background: rgba(244, 67, 54, 0.15);
      color: #f44336;
    }
    .file-change-card .fc-stats {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.85em;
    }
    .file-change-card .fc-stats .added { color: #4caf50; }
    .file-change-card .fc-stats .removed { color: #f44336; }
    .file-change-card .fc-actions {
      margin-top: 4px;
      display: flex;
      gap: 6px;
    }
    .file-change-card .fc-actions button {
      padding: 2px 10px;
      border: 1px solid var(--border);
      border-radius: 3px;
      background: var(--input-bg);
      color: var(--fg);
      cursor: pointer;
      font-size: 0.85em;
    }
    .file-change-card .fc-actions button:hover {
      background: var(--brand-primary);
      color: white;
      border-color: var(--brand-primary);
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
    .approval-bar .approval-remember { font-size: 0.8em; display: flex; align-items: center; gap: 4px; margin-bottom: 6px; color: var(--muted); cursor: pointer; }
    .approval-bar .approval-remember input { cursor: pointer; }
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

    .user-input-bar {
      margin-top: 8px;
      padding: 10px;
      border-radius: 6px;
      background: rgba(255, 193, 7, 0.1);
      border-left: 3px solid #ffc107;
      display: flex;
      gap: 10px;
      align-items: flex-start;
    }
    .user-input-icon { font-size: 1.2em; }
    .user-input-content { flex: 1; }
    .user-input-question { margin-bottom: 8px; }
    .user-input-header { font-weight: bold; font-size: 0.9em; color: var(--text); margin-bottom: 3px; }
    .user-input-text { font-size: 0.85em; color: var(--muted); margin-bottom: 4px; }
    .user-input-options { display: flex; gap: 8px; flex-wrap: wrap; }
    .btn-user-input-option {
      padding: 6px 12px;
      background: rgba(92, 184, 92, 0.15);
      border: 1px solid #5cb85c;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.8em;
      color: #5cb85c;
      transition: all 0.2s;
    }
    .btn-user-input-option:hover { background: rgba(92, 184, 92, 0.3); }
    .user-input-buttons { display: flex; gap: 6px; justify-content: flex-end; margin-top: 8px; }
    .btn-user-input-cancel {
      padding: 4px 10px;
      border: none;
      border-radius: 3px;
      cursor: pointer;
      font-size: 0.8em;
      background: #d9534f;
      color: white;
    }

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
      flex-direction: column;
      gap: 6px;
      position: relative;
      overflow: visible;
    }
    #attachments-area {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .attachment-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: var(--code-bg);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 2px 6px;
      font-size: 0.85em;
      color: var(--fg);
      max-width: 200px;
      overflow: hidden;
    }
    .attachment-chip .attachment-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .attachment-chip .attachment-remove {
      cursor: pointer;
      opacity: 0.6;
      font-size: 0.9em;
      flex-shrink: 0;
    }
    .attachment-chip .attachment-remove:hover { opacity: 1; }
    #input-row {
      display: flex;
      gap: 6px;
      align-items: flex-end;
    }
    #btn-attach {
      background: transparent !important;
      color: var(--fg) !important;
      border: none;
      border-radius: 4px;
      padding: 6px 8px;
      cursor: pointer;
      font-size: 1.1em;
      flex-shrink: 0;
      line-height: 1;
    }
    #btn-attach:hover { opacity: 0.8; }
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
    #input-area textarea:focus { border-color: var(--brand-primary); }
    #input-area button {
      background: var(--brand-primary);
      color: var(--brand-primary-foreground);
      border: none;
      border-radius: 4px;
      padding: 6px 14px;
      cursor: pointer;
      font-size: 0.9em;
      white-space: nowrap;
    }
    #input-area button:hover { background: var(--brand-primary-light); }
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
      background: var(--brand-primary);
      color: var(--brand-primary-foreground);
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
    .slash-menu-item:hover { background: var(--brand-primary); color: white; }
    .slash-menu-item.selected { background: var(--brand-primary); color: white; }
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
      display: flex;
      align-items: center;
      gap: 8px;
      border-top: 1px solid var(--border);
      background: var(--card-bg);
      min-height: 20px;
    }
    .status-bar .status-left {
      flex-shrink: 0;
    }
    .status-bar .status-right {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .status-bar .stat-chip {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 0 4px;
      border-radius: 2px;
      font-size: 0.95em;
    }
    .status-bar .stat-chip.cost {
      color: var(--fg);
      font-weight: 600;
    }
    .status-bar .stat-chip.cache-good {
      color: #4caf50;
    }
    .status-bar .stat-chip.cache-warn {
      color: #f0ad4e;
    }
    .status-bar .stat-chip.cache-bad {
      color: #d9534f;
    }
    .status-bar .stat-chip.cache-neutral {
      color: var(--muted);
    }
    .status-bar .stat-chip.tokens {
      color: var(--muted);
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
      <div class="sidebar-section" id="sidebar-threads">
        <div class="sidebar-tabs">
          <button class="sidebar-tab active" id="tab-sessions-btn" data-tab="sessions">${tr.sessions}</button>
          <button class="sidebar-tab" id="tab-threads-btn" data-tab="threads">${tr.threads}</button>
          <span class="sidebar-section-action" id="workspace-filter-toggle" title="${tr.showAllWorkspaces}">🌐</span>
        </div>
        <div class="sidebar-section-body" id="tab-sessions"></div>
        <div class="sidebar-section-body" id="tab-threads-list" style="display:none;"></div>
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
    const _diffStore = new Map();
    let _diffIdCounter = 0;
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
      approvalRequired: '${tr.approvalRequired}',
      allow: '${tr.allow}',
      deny: '${tr.deny}',
      thinkingOpen: '${tr.thinkingOpen}',
      thinkingClose: '${tr.thinkingClose}',
      thinkingToggle: '${tr.thinkingToggle}',
      welcomeTitle: '${tr.welcomeTitle}',
      welcomeSubtitle: '${tr.welcomeSubtitle}',
      welcomeQuote: '${tr.welcomeQuote}',
      welcomeQuoteAuthor: '${tr.welcomeQuoteAuthor}',
      welcomeSuggestionTitle: '${tr.welcomeSuggestionTitle}',
      welcomeSuggestion1: '${tr.welcomeSuggestion1}',
      welcomeSuggestion2: '${tr.welcomeSuggestion2}',
      welcomeSuggestion3: '${tr.welcomeSuggestion3}',
      welcomeSuggestion4: '${tr.welcomeSuggestion4}',
      noActiveWork: '${tr.noActiveWork}',
      cancel: '${tr.cancel}',
      goal: '${tr.goal}',
      checklist: '${tr.checklist}',
      strategy: '${tr.strategy}',
      cycles: '${tr.cycles}',
      readyTimedOut: '${tr.readyTimedOut}',
      note: '${tr.note}',
      noPreviousMessage: '${tr.noPreviousMessage}',
      justNow: '${tr.justNow}',
      minutesAgoPattern: '${tr.minutesAgoPattern}',
      hoursAgoPattern: '${tr.hoursAgoPattern}',
      daysAgoPattern: '${tr.daysAgoPattern}',
    };

    function formatThreadsCount(n, type = 'sessions') {
      if (type === 'threads') {
        return __locale === 'zh-cn' ? n + ' 个线程' : n + ' thread' + (n !== 1 ? 's' : '');
      }
      return __locale === 'zh-cn' ? n + ' 个会话' : n + ' session' + (n !== 1 ? 's' : '');
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
    const attachBtn = document.getElementById('btn-attach');
    const attachmentsArea = document.getElementById('attachments-area');
    let currentAttachments = [];
    const newThreadBtn = document.getElementById('btn-new-thread');
    const threadsBtn = document.getElementById('btn-threads');
    const threadCountEl = document.getElementById('thread-count');
    const compactBtn = document.getElementById('btn-compact');
    const interruptBtn = document.getElementById('btn-interrupt');
    const statusEl = document.getElementById('status');
    const statusTextEl = document.getElementById('status-text');
    const statusStatsEl = document.getElementById('status-stats');
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
    let userScrolledUp = false;
    const SCROLL_BOTTOM_THRESHOLD = 80;

    function smartScrollToBottom() {
      if (userScrolledUp) return;
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function isNearBottom() {
      return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < SCROLL_BOTTOM_THRESHOLD;
    }

    messagesEl.addEventListener('scroll', function() {
      if (isNearBottom()) {
        userScrolledUp = false;
      } else {
        userScrolledUp = true;
      }
    });
    let sessions = [];
    let activeSessionId = null;
    let threads = [];
    let activeThreadId = null;
    let showAllWorkspaces = false;
    let sidebarTab = 'sessions'; // 'sessions' or 'threads'
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
      { name: '/interrupt', desc: '${tr.commandInterrupt}', category: 'core' },
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
    attachBtn.addEventListener('click', () => { vscode.postMessage({ type: 'attachFile' }); });
    let isComposing = false;
    inputEl.addEventListener('compositionstart', () => { isComposing = true; });
    inputEl.addEventListener('compositionend', () => { isComposing = false; });
    let messageHistory = [];
    let historyIndex = -1;
    let draftBeforeHistory = '';
    inputEl.addEventListener('keydown', (e) => {
      _dbg('keydown: key=' + e.key + ' isComposing=' + isComposing);
      if (isComposing) return;
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
      
      if (e.key === 'ArrowUp' && messageHistory.length > 0) {
        const pos = inputEl.selectionStart;
        if (pos === 0) {
          e.preventDefault();
          if (historyIndex === -1) {
            draftBeforeHistory = inputEl.value;
          }
          historyIndex = Math.min(historyIndex + 1, messageHistory.length - 1);
          inputEl.value = messageHistory[historyIndex];
          inputEl.selectionStart = inputEl.selectionEnd = inputEl.value.length;
          inputEl.style.height = 'auto';
          inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
          return;
        }
      } else if (e.key === 'ArrowDown' && historyIndex !== -1) {
        const len = inputEl.value.length;
        const pos = inputEl.selectionStart;
        if (pos === len) {
          e.preventDefault();
          historyIndex--;
          if (historyIndex === -1) {
            inputEl.value = draftBeforeHistory;
          } else {
            inputEl.value = messageHistory[historyIndex];
          }
          inputEl.selectionStart = inputEl.selectionEnd = 0;
          inputEl.style.height = 'auto';
          inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
          return;
        }
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

    // Workspace filter toggle
    document.getElementById('workspace-filter-toggle')?.addEventListener('click', function(e) {
      e.stopPropagation();
      vscode.postMessage({ type: 'toggleAllWorkspaces' });
    });

    document.getElementById('tab-sessions-btn')?.addEventListener('click', function() {
      switchSidebarTab('sessions');
    });

    document.getElementById('tab-threads-btn')?.addEventListener('click', function() {
      switchSidebarTab('threads');
    });

    renderWelcome();

    function renderAttachments() {
      attachmentsArea.innerHTML = '';
      currentAttachments.forEach(function(att, idx) {
        const chip = document.createElement('span');
        chip.className = 'attachment-chip';
        const icon = att.kind === 'video' ? '🎬' : att.kind === 'file' ? '📄' : '🖼';
        chip.innerHTML = '<span>' + icon + '</span><span class="attachment-name" title="' + escapeHtml(att.path) + '">' + escapeHtml(att.name) + '</span><span class="attachment-remove" data-idx="' + idx + '">✕</span>';
        attachmentsArea.appendChild(chip);
      });
      attachmentsArea.querySelectorAll('.attachment-remove').forEach(function(btn) {
        btn.addEventListener('click', function() {
          const idx = parseInt(btn.getAttribute('data-idx'), 10);
          vscode.postMessage({ type: 'removeAttachment', index: idx });
        });
      });
    }

    function sendMessage() {
      const text = inputEl.value.trim();
      if (!text && currentAttachments.length === 0) return;
      if (isStreaming && !text.startsWith('/interrupt') && !text.startsWith('/clear')) return;
      inputEl.value = '';
      inputEl.style.height = 'auto';
      userScrolledUp = false;
      messageHistory.unshift(text);
      if (messageHistory.length > 200) messageHistory.length = 200;
      historyIndex = -1;
      draftBeforeHistory = '';
      
      if (text.startsWith('/')) {
        const parts = text.split(' ');
        const command = parts[0].toLowerCase();
        const args = parts.slice(1).join(' ');
        
        vscode.postMessage({ type: 'slashCommand', command, args });
      } else {
        vscode.postMessage({ type: 'sendMessage', text });
      }
    }

    function renderWelcome() {
      const existing = messagesEl.querySelector('.welcome-screen');
      if (existing) return;
      const welcome = document.createElement('div');
      welcome.className = 'welcome-screen';
      const suggestions = [
        { text: __i18n.welcomeSuggestion1, prompt: __i18n.welcomeSuggestion1 },
        { text: __i18n.welcomeSuggestion2, prompt: __i18n.welcomeSuggestion2 },
        { text: __i18n.welcomeSuggestion3, prompt: __i18n.welcomeSuggestion3 },
        { text: __i18n.welcomeSuggestion4, prompt: __i18n.welcomeSuggestion4 },
      ];
      welcome.innerHTML =
        '<div class="welcome-brand">' + escapeHtml(__i18n.welcomeTitle) + '</div>' +
        '<div class="welcome-subtitle">' + escapeHtml(__i18n.welcomeSubtitle) + '</div>' +
        '<div class="welcome-quote-block">' +
          '<div class="welcome-quote-text">' + escapeHtml(__i18n.welcomeQuote) + '</div>' +
          '<div class="welcome-quote-author">' + escapeHtml(__i18n.welcomeQuoteAuthor) + '</div>' +
        '</div>' +
        '<div class="welcome-suggestions-title">' + escapeHtml(__i18n.welcomeSuggestionTitle) + '</div>' +
        '<div class="welcome-suggestions">' +
          suggestions.map(s =>
            '<button class="welcome-suggestion" data-prompt="' + escapeHtml(s.prompt) + '">' + escapeHtml(s.text) + '</button>'
          ).join('') +
        '</div>';
      messagesEl.appendChild(welcome);
      welcome.addEventListener('click', function(e) {
        const btn = e.target.closest('.welcome-suggestion');
        if (btn && btn.dataset.prompt) {
          inputEl.value = btn.dataset.prompt;
          inputEl.focus();
        }
      });
    }

    function addMessage(msg, showRole) {
      const welcomeEl = messagesEl.querySelector('.welcome-screen');
      if (welcomeEl) welcomeEl.remove();

      const el = document.createElement('div');
      el.className = 'message ' + msg.role;
      el.id = 'msg-' + msg.id;

      let html = '';
      if (showRole !== false) {
        html += '<div class="role">' + escapeHtml(msg.role) + '</div>';
      }
      html += '<div class="message-body" id="body-' + msg.id + '"></div>';
      
      el.innerHTML = html;
      messagesEl.appendChild(el);
      smartScrollToBottom();
      
      const bodyEl = el.querySelector('.message-body');
      
      if (msg.blocks && msg.blocks.length > 0) {
        for (let bi = 0; bi < msg.blocks.length; bi++) {
          const b = msg.blocks[bi];
          if (b.type === 'thinking') {
            const th = b.contentHtml !== undefined ? b.contentHtml : escapeHtml(b.content || '');
            const block = document.createElement('div');
            block.className = 'thinking-block';
            block.setAttribute('data-block-idx', String(bi));
            const isOpen = 'open';
            const toggleLabel = __i18n.thinkingOpen;
            block.innerHTML = '<div class="thinking-toggle">' + escapeHtml(toggleLabel) + '</div><div class="thinking-content ' + isOpen + '" id="thinking-' + msg.id + '-' + bi + '">' + th + '</div>';
            bodyEl.appendChild(block);
          } else if (b.type === 'tool_call') {
            const tcIdx = b.toolCallIdx;
            const tc = msg.toolCalls && msg.toolCalls[tcIdx];
            if (tc) {
              const tcEl = document.createElement('div');
              tcEl.innerHTML = renderToolCall(msg.id, tc, tcIdx);
              const child = tcEl.firstElementChild;
              child.setAttribute('data-block-idx', String(bi));
              bodyEl.appendChild(child);
            }
          } else if (b.type === 'text') {
            const content = b.contentHtml !== undefined ? b.contentHtml : escapeHtml(b.content || '');
            const contentEl = document.createElement('div');
            contentEl.className = 'content' + (msg.status === 'streaming' ? ' streaming-indicator' : '');
            contentEl.id = 'content-' + msg.id + '-' + bi;
            contentEl.setAttribute('data-block-idx', String(bi));
            contentEl.innerHTML = content;
            bodyEl.appendChild(contentEl);
          }
        }
      } else {
        if (msg.thinkingHtml !== undefined || msg.thinking !== undefined) {
          const th = msg.thinkingHtml !== undefined ? msg.thinkingHtml : escapeHtml(msg.thinking || '');
          const block = document.createElement('div');
          block.className = 'thinking-block';
          const isOpen = 'open';
          const toggleLabel = __i18n.thinkingOpen;
          block.innerHTML = '<div class="thinking-toggle">' + escapeHtml(toggleLabel) + '</div><div class="thinking-content ' + isOpen + '" id="thinking-' + msg.id + '-0">' + th + '</div>';
          bodyEl.appendChild(block);
        }
        
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          for (let i = 0; i < msg.toolCalls.length; i++) {
            const tc = msg.toolCalls[i];
            const tcEl = document.createElement('div');
            tcEl.innerHTML = renderToolCall(msg.id, tc, i);
            bodyEl.appendChild(tcEl.firstElementChild);
          }
        }
        
        const content = msg.contentHtml !== undefined ? msg.contentHtml : (msg.content || '');
        if (content) {
          const contentEl = document.createElement('div');
          contentEl.className = 'content' + (msg.status === 'streaming' ? ' streaming-indicator' : '');
          contentEl.id = 'content-' + msg.id + '-0';
          contentEl.innerHTML = content;
          bodyEl.appendChild(contentEl);
        } else if (msg.status === 'streaming') {
          const contentEl = document.createElement('div');
          contentEl.className = 'content streaming-indicator';
          contentEl.id = 'content-' + msg.id + '-0';
          bodyEl.appendChild(contentEl);
        }
      }
      
      smartScrollToBottom();
    }

    function renderToolCall(msgId, tc, tcIdx) {
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
        statusText = __i18n.approvalAwaiting;
      } else if (tc.status === 'pending') {
        statusIcon = '◯';
        statusText = 'pending';
      }
      
      let html = '<div class="tool-call" id="tc-' + msgId + '-' + tcIdx + '">';
      html += '<span class="tool-name">🔧 ' + escapeHtml(tc.displayName || tc.name) + '</span>';
      html += ' <span class="tool-status" style="color:var(--muted)">' + statusIcon + ' ' + statusText + '</span>';
      if (tc.fileChange) {
        html += renderFileChangeCard(tc.fileChange);
      } else if (tc.output) {
        html += '<div class="tool-output">' + escapeHtml(tc.output) + '</div>';
      }
      if (tc.status === 'awaiting_approval' && tc.approvalId) {
        html += '<div class="approval-bar">';
        html += '<div class="approval-text">⚠ ' + escapeHtml(tc.approvalSummary || __i18n.approvalRequired) + '</div>';
        html += '<label class="approval-remember"><input type="checkbox" data-approval-id="' + tc.approvalId + '" class="remember-check" /> Remember for this tool</label>';
        html += '<div class="approval-buttons">';
        html += '<button class="btn-allow" data-approval-id="' + tc.approvalId + '" data-decision="allow">' + __i18n.allow + '</button>';
        html += '<button class="btn-deny" data-approval-id="' + tc.approvalId + '" data-decision="deny">' + __i18n.deny + '</button>';
        html += '</div></div>';
      }
      html += '</div>';
      return html;
    }

    function renderFileChangeCard(fc) {
      const changeTypeLabel = fc.changeType === 'created' ? __i18n.fileCreated : fc.changeType === 'deleted' ? __i18n.fileDeleted : __i18n.fileModified;
      const shortP = fc.filePath.replace(/\\\\/g, '/').split('/').slice(-3).join('/');
      const displayPath = fc.filePath.replace(/\\\\/g, '/').split('/').length > 3 ? '…/' + shortP : fc.filePath;
      const diffKey = fc.filePath + '@' + (++_diffIdCounter);
      if (fc.diff) _diffStore.set(diffKey, fc.diff);
      let html = '<div class="file-change-card">';
      html += '<div class="fc-header">';
      html += '<span class="fc-path" title="' + escapeHtml(fc.filePath) + '">📝 ' + escapeHtml(displayPath) + '</span>';
      html += '<span class="fc-badge ' + fc.changeType + '">' + escapeHtml(changeTypeLabel) + '</span>';
      if (fc.addedLines > 0 || fc.removedLines > 0) {
        html += '<span class="fc-stats">';
        if (fc.addedLines > 0) html += '<span class="added">+' + fc.addedLines + '</span> ';
        if (fc.removedLines > 0) html += '<span class="removed">-' + fc.removedLines + '</span>';
        html += '</span>';
      }
      html += '</div>';
      if (fc.toolName) {
        const friendlyName = fc.toolName.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
        html += '<div class="fc-tool-info" style="font-size:0.8em;color:var(--muted);padding:2px 8px">🔧 ' + escapeHtml(friendlyName) + '</div>';
      }
      html += '<div class="fc-actions">';
      if (fc.diff) {
        html += '<button class="fc-view-diff" data-file-path="' + escapeHtml(fc.filePath) + '" data-diff-key="' + diffKey + '" title="' + escapeHtml(__i18n.viewDiffTooltip) + '">🔍 ' + escapeHtml(__i18n.viewDiff) + '</button>';
      }
      if (fc.changeType !== 'deleted') {
        html += '<button class="fc-open-file" data-file-path="' + escapeHtml(fc.filePath) + '" title="' + escapeHtml(__i18n.openFileTooltip) + '">📄 ' + escapeHtml(__i18n.openFile) + '</button>';
      }
      html += '</div>';
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
        el.textContent = __i18n.thinkingClose;
      } else {
        content.classList.add('open');
        el.textContent = __i18n.thinkingOpen;
      }
    }

    function decideApproval(approvalId, decision) {
      const checkbox = document.querySelector('.remember-check[data-approval-id="' + approvalId + '"]');
      const remember = checkbox ? checkbox.checked : false;
      vscode.postMessage({ type: 'approvalDecision', approvalId, decision, remember });
    }

    // Event delegation for thinking toggle and approval buttons
    messagesEl.addEventListener('click', (e) => {
      const target = e.target;
      
      if (target.classList.contains('fc-view-diff')) {
        const filePath = target.getAttribute('data-file-path');
        const diffKey = target.getAttribute('data-diff-key');
        if (filePath) {
          vscode.postMessage({ type: 'openDiff', filePath, diff: (diffKey ? _diffStore.get(diffKey) : undefined) || undefined });
        }
        return;
      }

      if (target.classList.contains('fc-open-file')) {
        const filePath = target.getAttribute('data-file-path');
        if (filePath) {
          vscode.postMessage({ type: 'openFile', filePath });
        }
        return;
      }

      if (target.classList.contains('work-fc-view-diff')) {
        const filePath = target.getAttribute('data-file-path');
        const diffKey = target.getAttribute('data-diff-key');
        if (filePath) {
          vscode.postMessage({ type: 'openDiff', filePath, diff: (diffKey ? _diffStore.get(diffKey) : undefined) || undefined });
        }
        return;
      }
      
      if (target.classList.contains('work-fc-open-file')) {
        const filePath = target.getAttribute('data-file-path');
        if (filePath) {
          vscode.postMessage({ type: 'openFile', filePath });
        }
        return;
      }
      
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

      // Handle user input option buttons
      if (target.classList.contains('btn-user-input-option')) {
        const inputId = target.getAttribute('data-input-id');
        const questionId = target.getAttribute('data-question-id');
        const optionIdx = target.getAttribute('data-option-idx');
        const optionLabel = target.getAttribute('data-option-label');
        if (inputId && questionId && optionIdx !== null && optionLabel) {
          vscode.postMessage({
            type: 'userInputSelect',
            inputId,
            questionId,
            optionIdx: parseInt(optionIdx),
            optionLabel,
          });
        }
      }

      // Handle user input cancel button
      if (target.classList.contains('btn-user-input-cancel')) {
        const inputId = target.getAttribute('data-input-id');
        if (inputId) {
          vscode.postMessage({ type: 'userInputCancel', inputId });
        }
      }
    });

    document.querySelectorAll('.sidebar-section-header').forEach(header => {
      header.addEventListener('click', () => {
        const section = header.parentElement;
        section.classList.toggle('collapsed');
      });
    });

    function formatRelativeTime(dateStr) {
      try {
        const d = new Date(dateStr);
        const now = new Date();
        const diffMs = now - d;
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return __i18n.justNow;
        if (diffMin < 60) return __i18n.minutesAgoPattern.replace('{n}', String(diffMin));
        const diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return __i18n.hoursAgoPattern.replace('{n}', String(diffHr));
        const diffDay = Math.floor(diffHr / 24);
        if (diffDay < 30) return __i18n.daysAgoPattern.replace('{n}', String(diffDay));
        return d.toLocaleDateString();
      } catch { return ''; }
    }

    function renderSessions() {
      const container = document.getElementById('tab-sessions');
      if (!container) return;
      const count = sessions.length;
      threadCountEl.textContent = formatThreadsCount(count, 'sessions');

      // Update workspace filter toggle indicator
      const filterToggle = document.getElementById('workspace-filter-toggle');
      if (filterToggle) {
        filterToggle.textContent = showAllWorkspaces ? '🌍' : '🌐';
        filterToggle.title = showAllWorkspaces ? __i18n.filterCurrentWorkspace : __i18n.showAllWorkspaces;
        filterToggle.style.opacity = showAllWorkspaces ? '1' : '0.5';
      }

      container.innerHTML = '';

      if (count === 0) {
        const el = document.createElement('div');
        el.className = 'thread-item';
        el.textContent = __i18n.noConversations;
        el.style.color = 'var(--muted)';
        el.style.fontStyle = 'italic';
        el.style.textAlign = 'center';
        el.style.padding = '20px 10px';
        container.appendChild(el);
        return;
      }

      for (const s of sessions) {
        const el = document.createElement('div');
        el.className = 'thread-item' + (s.id === activeSessionId ? ' active' : '');

        const titleEl = document.createElement('div');
        titleEl.className = 'thread-title';
        titleEl.textContent = s.title || s.id.slice(0, 8);
        el.appendChild(titleEl);

        const metaEl = document.createElement('div');
        metaEl.className = 'thread-meta';

        const modeEl = document.createElement('span');
        modeEl.textContent = s.mode || '';
        metaEl.appendChild(modeEl);

        if (showAllWorkspaces && s.workspace) {
          const wsEl = document.createElement('span');
          wsEl.className = 'session-workspace';
          const wsName = s.workspace.split('/').pop() || s.workspace;
          wsEl.textContent = wsName;
          wsEl.title = s.workspace;
          metaEl.appendChild(wsEl);
        }

        if (s.message_count) {
          const msgEl = document.createElement('span');
          msgEl.textContent = s.message_count + ' msgs';
          metaEl.appendChild(msgEl);
        }

        if (s.updated_at) {
          const timeEl = document.createElement('span');
          timeEl.textContent = formatRelativeTime(s.updated_at);
          metaEl.appendChild(timeEl);
        }

        el.appendChild(metaEl);

        el.addEventListener('click', () => {
          vscode.postMessage({ type: 'loadSession', sessionId: s.id });
        });
        container.appendChild(el);
      }
    }

    function renderThreads() {
      const container = document.getElementById('tab-threads-list');
      if (!container) return;
      const count = threads.length;
      if (sidebarTab === 'threads') {
        threadCountEl.textContent = formatThreadsCount(count, 'threads');
      }

      container.innerHTML = '';

      if (count === 0) {
        const el = document.createElement('div');
        el.className = 'thread-item';
        el.textContent = __i18n.noConversations;
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
        });
        container.appendChild(el);
      }
    }

    function switchSidebarTab(tab) {
      sidebarTab = tab;
      const sessionsBtn = document.getElementById('tab-sessions-btn');
      const threadsBtn = document.getElementById('tab-threads-btn');
      const sessionsContainer = document.getElementById('tab-sessions');
      const threadsContainer = document.getElementById('tab-threads-list');

      if (tab === 'sessions') {
        sessionsBtn.classList.add('active');
        threadsBtn.classList.remove('active');
        sessionsContainer.style.display = '';
        threadsContainer.style.display = 'none';
        threadCountEl.textContent = formatThreadsCount(sessions.length, 'sessions');
      } else {
        sessionsBtn.classList.remove('active');
        threadsBtn.classList.add('active');
        sessionsContainer.style.display = 'none';
        threadsContainer.style.display = '';
        threadCountEl.textContent = formatThreadsCount(threads.length, 'threads');
      }
    }

    function renderTasks(tasks) {
      const container = document.getElementById('tab-tasks');
      if (!container) return;
      container.innerHTML = '';
      if (!tasks || tasks.length === 0) {
        const el = document.createElement('div');
        el.className = 'work-empty';
        el.textContent = __i18n.noTasks;
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
          vscode.postMessage({ type: 'slashCommand', command: '/task', args: 'show ' + t.id });
        });
        if (t.status === 'running' || t.status === 'queued') {
          const actions = document.createElement('div');
          actions.className = 'task-actions';
          const cancelBtn = document.createElement('button');
          cancelBtn.textContent = __i18n.cancel;
          cancelBtn.onclick = () => {
            vscode.postMessage({ type: 'slashCommand', command: '/task', args: 'cancel ' + t.id });
          };
          actions.appendChild(cancelBtn);
          card.appendChild(actions);
        }
        container.appendChild(card);
      }
    }

    let workState = { goal: null, checklist: [], checklistCompletionPct: 0, strategy: [], cycleCount: 0, coherenceState: 'healthy', coherenceLabel: '', fileChanges: [] };

    function renderWork() {
      const container = document.getElementById('tab-work');
      if (!container) return;
      container.innerHTML = '';
      const hasContent = workState.goal || workState.checklist.length > 0 || workState.strategy.length > 0 || workState.cycleCount > 0 || (workState.coherenceState && workState.coherenceState !== 'healthy');
      if (!hasContent) {
        const el = document.createElement('div');
        el.className = 'work-empty';
        el.textContent = __i18n.noActiveWork;
        container.appendChild(el);
        return;
      }
      if (workState.coherenceState && workState.coherenceState !== 'healthy') {
        const section = document.createElement('div');
        section.className = 'work-section';
        const stateKey = 'coherence' + workState.coherenceState.charAt(0).toUpperCase() + workState.coherenceState.slice(1).replace(/_([a-z])/g, function(_, c) { return c.toUpperCase(); });
        const stateLabel = __i18n[stateKey] || workState.coherenceLabel || workState.coherenceState;
        const isWarning = workState.coherenceState === 'refreshing_context' || workState.coherenceState === 'getting_crowded';
        const barColor = isWarning ? '#ff9800' : '#2196f3';
        section.innerHTML = '<div class="work-coherence" style="padding:4px 8px;border-radius:4px;background:' + barColor + '22;border-left:3px solid ' + barColor + ';font-size:0.82em;color:' + barColor + '">' + escapeHtml(stateLabel) + '</div>';
        container.appendChild(section);
      }
      if (workState.goal) {
        const section = document.createElement('div');
        section.className = 'work-section';
        section.innerHTML = '<div class="work-section-title">' + escapeHtml(__i18n.goal) + '</div><div class="work-goal">' + escapeHtml(workState.goal) + '</div>';
        container.appendChild(section);
      }
      if (workState.checklist.length > 0) {
        const section = document.createElement('div');
        section.className = 'work-section';
        let html = '<div class="work-section-title">' + escapeHtml(__i18n.checklist);
        if (workState.checklistCompletionPct > 0) {
          const pctStr = __i18n.completionPct.replace('{n}', String(workState.checklistCompletionPct));
          html += ' <span style="font-weight:400;color:var(--muted);font-size:0.9em">' + escapeHtml(pctStr) + '</span>';
        }
        html += '</div>';
        if (workState.checklistCompletionPct > 0) {
          html += '<div class="work-progress-bar" style="height:4px;background:var(--border);border-radius:2px;margin:4px 0 8px;overflow:hidden"><div style="height:100%;width:' + workState.checklistCompletionPct + '%;background:var(--brand-primary);border-radius:2px;transition:width 0.3s ease"></div></div>';
        }
        for (const item of workState.checklist) {
          const check = item.status === 'completed' ? '✓' : item.status === 'in_progress' ? '⟳' : '○';
          const color = item.status === 'completed' ? '#4caf50' : item.status === 'in_progress' ? '#ff9800' : '#888';
          html += '<div class="work-checklist-item" style="color:' + color + ';display:flex;align-items:baseline;gap:6px;padding:2px 0"><span style="flex-shrink:0;width:16px;text-align:center">' + check + '</span><span>' + escapeHtml(item.content) + '</span></div>';
        }
        section.innerHTML = html;
        container.appendChild(section);
      }
      if (workState.strategy.length > 0) {
        const section = document.createElement('div');
        section.className = 'work-section';
        let html = '<div class="work-section-title">' + escapeHtml(__i18n.strategy) + '</div>';
        for (const step of workState.strategy) {
          const icon = step.status === 'completed' ? '✓' : step.status === 'in_progress' ? '⟳' : '○';
          const color = step.status === 'completed' ? '#4caf50' : step.status === 'in_progress' ? '#ff9800' : '#888';
          html += '<div class="work-strategy-step" style="color:' + color + ';display:flex;align-items:baseline;gap:6px;padding:2px 0"><span style="flex-shrink:0;width:16px;text-align:center">' + icon + '</span><span>' + escapeHtml(step.text) + '</span></div>';
        }
        section.innerHTML = html;
        container.appendChild(section);
      }
      if (workState.cycleCount > 0) {
        const section = document.createElement('div');
        section.className = 'work-section';
        section.innerHTML = '<div style="font-size:0.8em;color:var(--muted)">' + escapeHtml(__i18n.cycles) + ': ' + workState.cycleCount + '</div>';
        container.appendChild(section);
      }
      if (workState.fileChanges && workState.fileChanges.length > 0) {
        const section = document.createElement('div');
        section.className = 'work-section';
        let html = '<div class="work-section-title">' + escapeHtml(__i18n.fileChanges) + ' <span style="font-weight:400;color:var(--muted);font-size:0.9em">(' + workState.fileChanges.length + ')</span></div>';
        for (const fc of workState.fileChanges) {
          const changeTypeLabel = fc.changeType === 'created' ? __i18n.fileCreated : fc.changeType === 'deleted' ? __i18n.fileDeleted : __i18n.fileModified;
          const shortP = fc.filePath.replace(/\\\\/g, '/').split('/').slice(-3).join('/');
          const displayPath = fc.filePath.replace(/\\\\/g, '/').split('/').length > 3 ? '…/' + shortP : fc.filePath;
          const badgeColor = fc.changeType === 'created' ? '#4caf50' : fc.changeType === 'deleted' ? '#f44336' : '#2196f3';
          html += '<div class="work-checklist-item" style="display:flex;align-items:center;gap:6px;padding:3px 0;flex-wrap:wrap">';
          html += '<span style="flex-shrink:0;font-size:0.8em;padding:1px 5px;border-radius:3px;background:' + badgeColor + '22;color:' + badgeColor + '">' + escapeHtml(changeTypeLabel) + '</span>';
          html += '<span style="font-family:var(--vscode-editor-font-family,monospace);font-size:0.85em;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escapeHtml(fc.filePath) + '">' + escapeHtml(displayPath) + '</span>';
          if (fc.toolName) {
            const fn = fc.toolName.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
            html += '<span style="font-size:0.75em;color:var(--muted);flex-shrink:0">🔧' + escapeHtml(fn) + '</span>';
          }
          if (fc.addedLines > 0 || fc.removedLines > 0) {
            html += '<span style="font-family:var(--vscode-editor-font-family,monospace);font-size:0.8em;flex-shrink:0">';
            if (fc.addedLines > 0) html += '<span style="color:#4caf50">+' + fc.addedLines + '</span>';
            if (fc.removedLines > 0) html += '<span style="color:#f44336">-' + fc.removedLines + '</span>';
            html += '</span>';
          }
          const workDiffKey = fc.filePath + '@' + (++_diffIdCounter);
          html += '<span style="flex-shrink:0;display:flex;gap:3px">';
          if (fc.diff) {
            _diffStore.set(workDiffKey, fc.diff);
            html += '<button class="work-fc-view-diff" data-file-path="' + escapeHtml(fc.filePath) + '" data-diff-key="' + workDiffKey + '" title="' + escapeHtml(__i18n.viewDiffTooltip) + '" style="padding:0 5px;border:1px solid var(--border);border-radius:2px;background:transparent;color:var(--muted);cursor:pointer;font-size:0.75em">🔍</button>';
          }
          if (fc.changeType !== 'deleted') {
            html += '<button class="work-fc-open-file" data-file-path="' + escapeHtml(fc.filePath) + '" title="' + escapeHtml(__i18n.openFileTooltip) + '" style="padding:0 5px;border:1px solid var(--border);border-radius:2px;background:transparent;color:var(--muted);cursor:pointer;font-size:0.75em">📄</button>';
          }
          html += '</span>';
          html += '</div>';
        }
        section.innerHTML = html;
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
          statusTextEl.textContent = '${tr.ready} (' + (msg.model || 'deepseek-v4-pro') + ')';
          if (msg.mode) currentModeEl.textContent = msg.mode;
          if (msg.model) currentModelEl.textContent = msg.model;
          if (msg.reasoningEffort) currentReasoningEl.textContent = msg.reasoningEffort;
          break;
          
        case 'settingsUpdated':
          if (msg.mode) currentModeEl.textContent = msg.mode;
          if (msg.model) currentModelEl.textContent = msg.model;
          if (msg.reasoningEffort) currentReasoningEl.textContent = msg.reasoningEffort;
          break;

        case 'sessionList':
          sessions = msg.sessions || [];
          showAllWorkspaces = !!msg.showAllWorkspaces;
          renderSessions();
          break;

        case 'threadList':
          threads = msg.threads || [];
          showAllWorkspaces = !!msg.showAllWorkspaces;
          renderThreads();
          break;

        case 'sessionLoaded':
          activeSessionId = msg.sessionId || null;
          renderSessions();
          break;

        case 'threadLoaded':
          activeThreadId = msg.threadId || msg.thread?.id || null;
          renderThreads();
          break;

        case 'taskList':
          renderTasks(msg.tasks || []);
          break;

        case 'workState':
          workState = {
            goal: msg.goal || null,
            checklist: msg.checklist || [],
            checklistCompletionPct: msg.checklistCompletionPct || 0,
            strategy: msg.strategy || [],
            cycleCount: msg.cycleCount || 0,
            coherenceState: msg.coherenceState || 'healthy',
            coherenceLabel: msg.coherenceLabel || '',
            fileChanges: msg.fileChanges || [],
          };
          renderWork();
          break;

        case 'taskDetail':
          showTaskDetail(msg.task);
          break;

        case 'loadHistory':
          closeTaskDetail();
          messagesEl.innerHTML = '';
          for (const m of msg.messages) {
            const showRole = !msg.compactMode || !!m._realContent;
            addMessage(m, showRole);
          }
          break;

        case 'threadLoaded':
          closeTaskDetail();
          activeThreadId = msg.thread?.id || null;
          activeSessionId = null;
          messagesEl.innerHTML = '';
          for (const m of msg.messages) addMessage(m);
          statusTextEl.textContent = formatLoadedThread(msg.thread?.title || msg.thread?.id?.slice(0, 12) || '');
          renderThreads();
          renderSessions();
          break;

        case 'addMessage':
          addMessage(msg.message);
          if (msg.message.status === 'streaming') {
            isStreaming = true;
            if (streamingTimeout) clearTimeout(streamingTimeout);
            streamingTimeout = setTimeout(() => {
              if (isStreaming) {
                isStreaming = false;
                statusTextEl.textContent = __i18n.readyTimedOut;
              }
            }, 300000);
            statusTextEl.textContent = __i18n.thinking;
          }
          break;

        case 'updateMessage': {
          const blockIdx = msg.blockIdx !== undefined ? msg.blockIdx : 0;
          let contentEl = document.getElementById('content-' + msg.messageId + '-' + blockIdx);
          if (!contentEl) {
            const bodyEl = document.getElementById('body-' + msg.messageId);
            if (bodyEl) {
              contentEl = document.createElement('div');
              contentEl.className = 'content streaming-indicator';
              contentEl.id = 'content-' + msg.messageId + '-' + blockIdx;
              contentEl.setAttribute('data-block-idx', String(blockIdx));
              const insertBefore = bodyEl.querySelector('[data-block-idx="' + (blockIdx + 1) + '"]');
              if (insertBefore) {
                bodyEl.insertBefore(contentEl, insertBefore);
              } else {
                bodyEl.appendChild(contentEl);
              }
            }
          }
          if (contentEl) {
            contentEl.textContent = msg.content || '';
            smartScrollToBottom();
          }
          statusTextEl.textContent = __i18n.streaming;
          break;
        }

        case 'updateThinking': {
          const blockIdx = msg.blockIdx !== undefined ? msg.blockIdx : 0;
          let thinkingEl = document.getElementById('thinking-' + msg.messageId + '-' + blockIdx);
          if (!thinkingEl) {
            const bodyEl = document.getElementById('body-' + msg.messageId);
            if (bodyEl) {
              const block = document.createElement('div');
              block.className = 'thinking-block';
              block.setAttribute('data-block-idx', String(blockIdx));
              block.innerHTML = '<div class="thinking-toggle">' + escapeHtml(__i18n.thinkingOpen) + '</div><div class="thinking-content open" id="thinking-' + msg.messageId + '-' + blockIdx + '"></div>';
              const insertBefore = bodyEl.querySelector('[data-block-idx="' + (blockIdx + 1) + '"]');
              if (insertBefore) {
                bodyEl.insertBefore(block, insertBefore);
              } else {
                bodyEl.appendChild(block);
              }
              thinkingEl = block.querySelector('.thinking-content');
            }
          }
          if (thinkingEl) {
            if (!thinkingEl.querySelector('.thinking-stream')) {
              thinkingEl.innerHTML = '<div class="thinking-stream"></div>';
            }
            const streamEl = thinkingEl.querySelector('.thinking-stream');
            if (streamEl) streamEl.textContent = msg.thinking || '';
            thinkingEl.classList.add('open');
            smartScrollToBottom();
          }
          statusTextEl.textContent = __i18n.thinking;
          break;
        }

        case 'addTextBlock': {
          const bodyEl = document.getElementById('body-' + msg.messageId);
          if (bodyEl) {
            const blockIdx = msg.blockIdx;
            const contentEl = document.createElement('div');
            contentEl.className = 'content streaming-indicator';
            contentEl.id = 'content-' + msg.messageId + '-' + blockIdx;
            contentEl.setAttribute('data-block-idx', String(blockIdx));
            const insertBefore = bodyEl.querySelector('[data-block-idx="' + (blockIdx + 1) + '"]');
            if (insertBefore) {
              bodyEl.insertBefore(contentEl, insertBefore);
            } else {
              bodyEl.appendChild(contentEl);
            }
            smartScrollToBottom();
          }
          break;
        }

        case 'addThinkingBlock': {
          const bodyEl = document.getElementById('body-' + msg.messageId);
          if (bodyEl) {
            const blockIdx = msg.blockIdx;
            const block = document.createElement('div');
            block.className = 'thinking-block';
            block.setAttribute('data-block-idx', String(blockIdx));
            block.innerHTML = '<div class="thinking-toggle">' + escapeHtml(__i18n.thinkingOpen) + '</div><div class="thinking-content open" id="thinking-' + msg.messageId + '-' + blockIdx + '"></div>';
            const insertBefore = bodyEl.querySelector('[data-block-idx="' + (blockIdx + 1) + '"]');
            if (insertBefore) {
              bodyEl.insertBefore(block, insertBefore);
            } else {
              bodyEl.appendChild(block);
            }
            smartScrollToBottom();
          }
          break;
        }

        case 'addToolCall': {
          const bodyEl = document.getElementById('body-' + msg.messageId);
          if (bodyEl) {
            const tcEl = document.createElement('div');
            tcEl.innerHTML = renderToolCall(msg.messageId, msg.toolCall, msg.toolCallIdx);
            const child = tcEl.firstElementChild;
            if (msg.blockIdx !== undefined) {
              child.setAttribute('data-block-idx', String(msg.blockIdx));
            }
            if (msg.blockIdx !== undefined) {
              const insertBefore = bodyEl.querySelector('[data-block-idx="' + (msg.blockIdx + 1) + '"]');
              if (insertBefore) {
                bodyEl.insertBefore(child, insertBefore);
              } else {
                bodyEl.appendChild(child);
              }
            } else {
              const contentEl = bodyEl.querySelector('.content');
              if (contentEl) {
                bodyEl.insertBefore(child, contentEl);
              } else {
                bodyEl.appendChild(child);
              }
            }
            smartScrollToBottom();
          }
          break;
        }

        case 'updateToolCall': {
          const tcEl = document.getElementById('tc-' + msg.messageId + '-' + msg.toolCallIdx);
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
                statusText = __i18n.approvalAwaiting;
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
            smartScrollToBottom();
          }
          break;
        }

        case 'fileChangeDetected': {
          const tcEl = document.getElementById('tc-' + msg.messageId + '-' + msg.toolCallIdx);
          if (tcEl && msg.fileChange) {
            const existingOutput = tcEl.querySelector('.tool-output');
            if (existingOutput) existingOutput.remove();
            const existingCard = tcEl.querySelector('.file-change-card');
            if (!existingCard) {
              const card = document.createElement('div');
              card.innerHTML = renderFileChangeCard(msg.fileChange);
              const cardEl = card.firstElementChild;
              const approvalBar = tcEl.querySelector('.approval-bar');
              if (approvalBar) {
                tcEl.insertBefore(cardEl, approvalBar);
              } else {
                tcEl.appendChild(cardEl);
              }
            }
            smartScrollToBottom();
          }
          break;
        }

        case 'approvalRequired': {
          const summaryText = escapeHtml(msg.summary || __i18n.approvalRequired);
          const rememberLabel = '<label class="approval-remember"><input type="checkbox" data-approval-id="' + msg.approvalId + '" class="remember-check" /> Remember for this tool</label>';
          if (msg.toolCallIdx !== undefined) {
            const tcEl = document.getElementById('tc-' + msg.messageId + '-' + msg.toolCallIdx);
            if (tcEl) {
              const nameSpan = tcEl.querySelector('.tool-name');
              if (nameSpan && msg.toolName) nameSpan.textContent = '🔧 ' + msg.toolName;
              const statusSpan = tcEl.querySelector('.tool-status');
              if (statusSpan) statusSpan.textContent = '⚠ ' + __i18n.approvalAwaiting;
              const existing = tcEl.querySelector('.approval-bar');
              if (!existing) {
                const bar = document.createElement('div');
                bar.className = 'approval-bar';
                bar.innerHTML = '<div class="approval-text">⚠ ' + summaryText + '</div>'
                  + rememberLabel
                  + '<div class="approval-buttons">'
                  + '<button class="btn-allow" data-approval-id="' + msg.approvalId + '" data-decision="allow">' + __i18n.allow + '</button>'
                  + '<button class="btn-deny" data-approval-id="' + msg.approvalId + '" data-decision="deny">' + __i18n.deny + '</button>'
                  + '</div>';
                tcEl.appendChild(bar);
                smartScrollToBottom();
              }
            }
          } else {
            const bodyEl = document.getElementById('body-' + msg.messageId);
            if (bodyEl) {
              const existing = bodyEl.querySelector('.approval-bar');
              if (!existing) {
                const bar = document.createElement('div');
                bar.className = 'approval-bar';
                bar.innerHTML = '<div class="approval-text">⚠ ' + summaryText + '</div>'
                  + rememberLabel
                  + '<div class="approval-buttons">'
                  + '<button class="btn-allow" data-approval-id="' + msg.approvalId + '" data-decision="allow">' + __i18n.allow + '</button>'
                  + '<button class="btn-deny" data-approval-id="' + msg.approvalId + '" data-decision="deny">' + __i18n.deny + '</button>'
                  + '</div>';
                bodyEl.appendChild(bar);
                smartScrollToBottom();
              }
            }
          }
          statusTextEl.textContent = __i18n.approvalAwaiting;
          break;
        }

        case 'approvalResolved':
          document.querySelectorAll('.approval-bar').forEach(bar => bar.remove());
          if (msg.decision === 'allow') {
            document.querySelectorAll('.tool-status').forEach(span => {
              if (span.textContent && span.textContent.includes(__i18n.approvalAwaiting)) {
                span.textContent = '⟳ running...';
              }
            });
          } else if (msg.decision === 'deny') {
            document.querySelectorAll('.tool-status').forEach(span => {
              if (span.textContent && span.textContent.includes(__i18n.approvalAwaiting)) {
                span.textContent = '✗ denied';
              }
            });
          }
          statusTextEl.textContent = __i18n.streaming;
          break;

        case 'userInputRequired': {
          const inputId = msg.inputId;
          const questions = msg.questions || [];
          let questionsHtml = '';
          for (const q of questions) {
            questionsHtml += '<div class="user-input-question">';
            questionsHtml += '<div class="user-input-header">' + escapeHtml(q.header) + '</div>';
            questionsHtml += '<div class="user-input-text">' + escapeHtml(q.question) + '</div>';
            questionsHtml += '<div class="user-input-options">';
            for (let optIdx = 0; optIdx < (q.options || []).length; optIdx++) {
              const opt = q.options[optIdx];
              questionsHtml += '<button class="btn-user-input-option" data-input-id="' + inputId + '" data-question-id="' + q.id + '" data-option-idx="' + optIdx + '" data-option-label="' + escapeHtml(opt.label) + '">' + escapeHtml(opt.label) + ': ' + escapeHtml(opt.description || '') + '</button>';
            }
            questionsHtml += '</div></div>';
          }

          if (statusTextEl) {
            statusTextEl.textContent = __i18n.userInputAwaiting;
          }
          const bodyEl = document.getElementById('body-' + msg.messageId);
          if (bodyEl) {
            const bar = document.createElement('div');
            bar.className = 'user-input-bar';
            bar.id = 'user-input-' + inputId;
            bar.innerHTML = '<div class="user-input-icon">❓</div>'
              + '<div class="user-input-content">' + questionsHtml + '</div>'
              + '<div class="user-input-buttons">'
              + '<button class="btn-user-input-cancel" data-input-id="' + inputId + '">' + __i18n.cancel + '</button>'
              + '</div>';
            bodyEl.appendChild(bar);
            smartScrollToBottom();
          }
          break;
        }

        case 'userInputResolved':
          document.querySelectorAll('.user-input-bar').forEach(bar => bar.remove());
          if (!msg.cancelled) {
            document.querySelectorAll('.tool-status').forEach(span => {
              if (span.textContent && span.textContent.includes(__i18n.userInputAwaiting)) {
                span.textContent = '✓ submitted';
              }
            });
          } else {
            document.querySelectorAll('.tool-status').forEach(span => {
              if (span.textContent && span.textContent.includes(__i18n.userInputAwaiting)) {
                span.textContent = '✗ cancelled';
              }
            });
          }
          statusTextEl.textContent = __i18n.streaming;
          break;

        case 'messageComplete': {
          const msgBodyEl = document.getElementById('body-' + msg.messageId);
          if (msgBodyEl) {
            msgBodyEl.querySelectorAll('.content.streaming-indicator').forEach(el => el.classList.remove('streaming-indicator'));
          }
          if (msg.usage) {
            const msgEl = document.getElementById('msg-' + msg.messageId);
            if (msgEl) {
              const usageEl = document.createElement('div');
              usageEl.className = 'usage-info';
              usageEl.textContent = '↥' + (msg.usage.input_tokens || 0) + ' ↧' + (msg.usage.output_tokens || 0);
              msgEl.appendChild(usageEl);
            }
          }
          if (msg.blockHtmls && msgBodyEl) {
            for (const bh of msg.blockHtmls) {
              const blockEl = msgBodyEl.querySelector('[data-block-idx="' + bh.blockIdx + '"]');
              if (blockEl) {
                const contentEl = blockEl.classList.contains('content') ? blockEl : blockEl.querySelector('.content');
                const thinkingEl = blockEl.classList.contains('thinking-block') ? blockEl.querySelector('.thinking-content') : null;
                if (contentEl) contentEl.innerHTML = bh.contentHtml;
                if (thinkingEl) thinkingEl.innerHTML = bh.contentHtml;
              }
            }
          } else {
            if (msg.contentHtml) {
              if (msgBodyEl) {
                const contentEls = msgBodyEl.querySelectorAll('.content');
                contentEls.forEach(el => { el.innerHTML = msg.contentHtml; });
              }
            }
            if (msg.thinkingHtml) {
              if (msgBodyEl) {
                const thinkingEls = msgBodyEl.querySelectorAll('.thinking-content');
                thinkingEls.forEach(el => { el.innerHTML = msg.thinkingHtml; });
              }
            }
          }
          isStreaming = false;
          if (streamingTimeout) { clearTimeout(streamingTimeout); streamingTimeout = null; }
          statusTextEl.textContent = msg.error ? __i18n.error : __i18n.ready;
          break;
        }

        case 'turnStarted':
          statusTextEl.textContent = __i18n.processing;
          break;

        case 'turnInterrupted':
          isStreaming = false;
          if (streamingTimeout) { clearTimeout(streamingTimeout); streamingTimeout = null; }
          statusTextEl.textContent = __i18n.ready;
          document.querySelectorAll('.approval-bar').forEach(bar => bar.remove());
          document.querySelectorAll('.user-input-bar').forEach(bar => bar.remove());
          break;

        case 'sessionStats': {
          if (!statusStatsEl) break;
          let statsHtml = '';
          if (msg.cost) {
            statsHtml += '<span class="stat-chip cost">' + escapeHtml(msg.cost) + '</span>';
          }
          if (msg.cacheHitRate !== undefined) {
            const rate = parseFloat(msg.cacheHitRate);
            let cacheClass = 'cache-neutral';
            if (rate > 80) cacheClass = 'cache-good';
            else if (rate >= 40) cacheClass = 'cache-warn';
            else if (rate > 0) cacheClass = 'cache-bad';
            statsHtml += '<span class="stat-chip ' + cacheClass + '">Cache: ' + msg.cacheHitRate + '%</span>';
          }
          if (msg.totalInputTokens || msg.totalOutputTokens) {
            statsHtml += '<span class="stat-chip tokens">↥' + Number(msg.totalInputTokens || 0).toLocaleString() + ' ↧' + Number(msg.totalOutputTokens || 0).toLocaleString() + '</span>';
          }
          statusStatsEl.innerHTML = statsHtml;
          break;
        }

        case 'status':
          statusTextEl.textContent = msg.text;
          break;

        case 'attachmentsChanged':
          currentAttachments = msg.attachments || [];
          renderAttachments();
          break;

        case 'clearChat':
          closeTaskDetail();
          messagesEl.innerHTML = '';
          isStreaming = false;
          if (streamingTimeout) { clearTimeout(streamingTimeout); streamingTimeout = null; }
          statusTextEl.textContent = __i18n.ready;
          if (statusStatsEl) statusStatsEl.innerHTML = '';
          renderWelcome();
          break;

        case 'error':
          statusTextEl.textContent = __i18n.error;
          const errEl = document.createElement('div');
          errEl.className = 'error-banner';
          errEl.innerHTML = '<span class="msg-label error">' + escapeHtml(__i18n.error) + '</span><span>' + escapeHtml(msg.message) + '</span>';
          messagesEl.appendChild(errEl);
          userScrolledUp = false;
          messagesEl.scrollTop = messagesEl.scrollHeight;
          isStreaming = false;
          if (streamingTimeout) { clearTimeout(streamingTimeout); streamingTimeout = null; }
          break;

        case 'info': {
          const infoEl = document.createElement('div');
          infoEl.className = 'system-message';
          infoEl.innerHTML = '<span class="msg-label note">' + escapeHtml(__i18n.note) + '</span><span class="msg-body">' + escapeHtml(msg.message) + '</span>';
          messagesEl.appendChild(infoEl);
          smartScrollToBottom();
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
            infoEl.innerHTML = '<span class="msg-label note">' + escapeHtml(__i18n.note) + '</span><span class="msg-body">' + escapeHtml(__i18n.noPreviousMessage) + '</span>';
            messagesEl.appendChild(infoEl);
            smartScrollToBottom();
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
