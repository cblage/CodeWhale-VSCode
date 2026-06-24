/**
 * Webview CSS styles extracted from webview-html.ts for maintainability.
 * All styles are returned as a single string to be injected into the webview HTML.
 */
export function getWebviewCss(): string {
  return `
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
      overflow: hidden;
    }

    #layout { display: flex; flex: 1; overflow: hidden; }

    /* ── Sidebar / Threads Panel ── */

    #threads-panel {
      width: 220px;
      min-width: 160px;
      border-right: 1px solid var(--border);
      overflow: hidden;
      padding: 0;
      display: none;
      flex-direction: column;
    }
    #threads-panel.open { display: flex; }

    .sidebar-section {
      display: flex;
      flex-direction: column;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }
    #sidebar-threads {
      flex: 1;
      min-height: 0;
      overflow: hidden;
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
      max-height: none;
      flex: 1;
      min-height: 0;
    }
    #sidebar-threads[data-active-tab="sessions"] #tab-threads-list,
    #sidebar-threads[data-active-tab="threads"] #tab-sessions {
      display: none;
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
      position: relative;
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

    /* Session search bar */
    .session-search-bar {
      padding: 6px 8px;
      border-bottom: 1px solid var(--border);
    }
    .session-search-input {
      width: 100%;
      padding: 5px 8px;
      border: 1px solid var(--border);
      border-radius: 4px;
      background: var(--input-bg, var(--bg));
      color: var(--fg);
      font-size: 12px;
      outline: none;
      box-sizing: border-box;
    }
    .session-search-input:focus {
      border-color: var(--accent);
    }
    .session-search-input::placeholder {
      color: var(--muted);
    }

    /* Session delete button */
    .session-delete-btn {
      position: absolute;
      right: 6px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      color: var(--muted);
      cursor: pointer;
      font-size: 11px;
      padding: 2px 5px;
      border-radius: 3px;
      opacity: 0.3;
      transition: opacity 0.15s, color 0.15s;
      line-height: 1;
      z-index: 1;
    }
    .thread-item:hover .session-delete-btn {
      opacity: 0.7;
    }
    .session-delete-btn:hover {
      opacity: 1 !important;
      color: #e55;
      background: rgba(255,0,0,0.08);
    }
    .thread-item.active .session-delete-btn {
      color: rgba(255,255,255,0.6);
    }
    .thread-item.active .session-delete-btn:hover {
      color: #ff6b6b;
      background: rgba(255,255,255,0.15);
    }

    /* ── Chat Area ── */

    #chat-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

    #messages {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }

    /* ── Welcome Screen ── */

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

    /* ── Messages ── */

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

    /* ── Markdown rendered elements ── */

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
    .message.user .content a {
      color: var(--brand-primary-foreground);
      text-decoration: underline;
      text-decoration-color: rgba(255, 255, 255, 0.85);
      text-underline-offset: 2px;
      text-decoration-thickness: 1.5px;
    }

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
    .thinking-content.open { display: block; }
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
    .file-change-card .fc-actions button.is-unavailable,
    .file-change-card .fc-actions button[aria-disabled="true"] {
      background: linear-gradient(
        135deg,
        color-mix(in srgb, var(--input-bg) 88%, transparent) 0%,
        color-mix(in srgb, var(--border) 25%, var(--input-bg)) 100%
      );
      color: var(--muted);
      border-style: dashed;
      border-color: var(--muted);
      opacity: 0.82;
      cursor: not-allowed;
    }
    .file-change-card .fc-actions button.is-unavailable:hover,
    .file-change-card .fc-actions button[aria-disabled="true"]:hover {
      background: linear-gradient(
        135deg,
        color-mix(in srgb, var(--input-bg) 88%, transparent) 0%,
        color-mix(in srgb, var(--border) 25%, var(--input-bg)) 100%
      );
      color: var(--muted);
      border-color: var(--muted);
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
      content: '\u258A';
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
    #toolbar button.is-unavailable,
    #toolbar button[aria-disabled="true"] {
      background: linear-gradient(
        135deg,
        color-mix(in srgb, var(--card-bg) 92%, transparent) 0%,
        color-mix(in srgb, var(--border) 28%, var(--card-bg)) 100%
      );
      color: var(--muted);
      border-style: dashed;
      border-color: var(--muted);
      opacity: 0.82;
      cursor: not-allowed;
      position: relative;
    }
    #toolbar button.is-unavailable:hover,
    #toolbar button[aria-disabled="true"]:hover {
      color: var(--muted);
      border-color: var(--muted);
    }
    #toolbar button.is-unavailable::after,
    #toolbar button[aria-disabled="true"]::after {
      content: "";
      position: absolute;
      inset: 3px;
      border-radius: 2px;
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--border) 65%, transparent);
      pointer-events: none;
    }

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

    /* ── Slash Menu ── */

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

    /* ── System Messages / Errors ── */

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

    /* ── Status Bar ── */

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

    /* ── Tooltip ── */

    #ui-tooltip {
      position: fixed;
      left: 0;
      top: 0;
      max-width: min(320px, calc(100vw - 16px));
      padding: 6px 8px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: color-mix(in srgb, var(--vscode-editorHoverWidget-background, var(--card-bg)) 96%, black);
      color: var(--fg);
      font-size: 0.75em;
      line-height: 1.35;
      box-shadow: 0 8px 24px rgba(0,0,0,0.22);
      z-index: 100000;
      pointer-events: none;
      opacity: 0;
      transform: translateY(4px);
      transition: opacity 90ms ease, transform 90ms ease;
    }
    #ui-tooltip.visible {
      opacity: 1;
      transform: translateY(0);
    }

    /* ── Task Cards ── */

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

    /* ── Work Section ── */

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

    /* ── Changes Section ── */

    .change-summary-row {
      display: flex;
      gap: 8px;
      font-size: 0.8em;
      padding-bottom: 4px;
    }
    .change-summary-created { color: #4caf50; }
    .change-summary-modified { color: #2196f3; }
    .change-summary-deleted { color: #f44336; }
    .change-list { padding: 2px 10px; }
    .change-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 3px 0;
      border-bottom: 1px solid rgba(128,128,128,0.06);
    }
    .change-item:last-child { border-bottom: none; }
    .change-badge {
      flex-shrink: 0;
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 2px;
      font-size: 0.7em;
      font-weight: 700;
      font-family: var(--vscode-editor-font-family, monospace);
      letter-spacing: -0.5px;
    }
    .change-badge-created { background: rgba(76,175,80,0.18); color: #4caf50; }
    .change-badge-modified { background: rgba(33,150,243,0.18); color: #2196f3; }
    .change-badge-deleted { background: rgba(244,67,54,0.18); color: #f44336; }
    .change-path {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.85em;
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .change-stats {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.8em;
      flex-shrink: 0;
    }
    .change-added { color: #4caf50; }
    .change-removed { color: #f44336; }
    .change-actions {
      flex-shrink: 0;
      display: flex;
      gap: 3px;
    }
    .change-btn {
      padding: 1px 5px;
      border: 1px solid var(--border);
      border-radius: 2px;
      background: transparent;
      color: var(--muted);
      cursor: pointer;
      font-size: 0.7em;
      font-family: var(--vscode-editor-font-family, monospace);
      line-height: 1.4;
      transition: all 0.1s ease;
    }
    .change-btn:hover {
      color: var(--fg);
      border-color: var(--muted);
      background: rgba(128,128,128,0.06);
    }
    .change-btn:active {
      background: rgba(128,128,128,0.12);
    }

    /* ── Task Detail Overlay ── */

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
`;
}
