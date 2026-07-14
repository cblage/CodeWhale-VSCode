/**
 * Config Panel - A standalone WebView panel for editing CodeWhale configuration.
 * Similar to TUI's ConfigUI, provides a form-based interface for viewing and
 * modifying runtime config keys.
 */

import * as vscode from "vscode";
import type { CodeWhaleApiClient, GuiConfigResponse } from "./types";
import { getErrorMessage } from "./utils/error-handler";
import { t } from "./i18n";

export class ConfigPanel {
  public static currentPanel: ConfigPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly api: CodeWhaleApiClient;
  private readonly extensionUri: vscode.Uri;
  private onRuntimeDisplaySettingsChanged?: () => void | Promise<void>;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    api: CodeWhaleApiClient,
    onRuntimeDisplaySettingsChanged?: () => void | Promise<void>,
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.api = api;
    this.onRuntimeDisplaySettingsChanged = onRuntimeDisplaySettingsChanged;

    this.panel.webview.html = this.getHtml();

    this.panel.webview.onDidReceiveMessage(
      async (msg) => {
        await this.handleMessage(msg);
      },
      null,
      this.disposables
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (
          event.affectsConfiguration("cblage.codewhale.showAgentToolCards")
          || event.affectsConfiguration("cblage.codewhale.autoWakeMasterForAgents")
          || event.affectsConfiguration("cblage.codewhale.agentWakeIntervalSeconds")
        ) {
          this.postExtensionSettings();
        }
      })
    );

    // Load initial config
    this.loadConfig();
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    api: CodeWhaleApiClient,
    onRuntimeDisplaySettingsChanged?: () => void | Promise<void>,
  ): ConfigPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (ConfigPanel.currentPanel) {
      ConfigPanel.currentPanel.onRuntimeDisplaySettingsChanged = onRuntimeDisplaySettingsChanged;
      ConfigPanel.currentPanel.panel.reveal(column);
      ConfigPanel.currentPanel.loadConfig();
      return ConfigPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      "cblage.codewhale.config",
      "CodeWhale Config",
      column || vscode.ViewColumn.One,
      { enableScripts: true, localResourceRoots: [extensionUri] }
    );

    ConfigPanel.currentPanel = new ConfigPanel(
      panel,
      extensionUri,
      api,
      onRuntimeDisplaySettingsChanged,
    );
    return ConfigPanel.currentPanel;
  }

  private postExtensionSettings(): void {
    const config = vscode.workspace.getConfiguration("cblage.codewhale");
    this.panel.webview.postMessage({
      type: "extensionSettings",
      showAgentToolCards: config.get<boolean>("showAgentToolCards", false),
      autoWakeMasterForAgents: config.get<boolean>("autoWakeMasterForAgents", true),
      agentWakeIntervalSeconds: config.get<number>("agentWakeIntervalSeconds", 30),
    });
  }

  private async loadConfig(): Promise<void> {
    this.postExtensionSettings();
    try {
      const config = await this.api.getConfig();
      this.panel.webview.postMessage({ type: "configData", config });
    } catch (err) {
      this.panel.webview.postMessage({
        type: "error",
        message: `Failed to load config: ${getErrorMessage(err)}`,
      });
    }
  }

  private async notifyRuntimeDisplaySettingsChanged(): Promise<void> {
    try {
      await this.onRuntimeDisplaySettingsChanged?.();
    } catch {
      // The config operation itself succeeded. A transient chat-webview sync
      // failure must not turn that successful save into a reported failure.
    }
  }

  private async handleMessage(msg: Record<string, unknown>): Promise<void> {
    switch (msg.type as string) {
      case "refresh":
        await this.loadConfig();
        break;
      case "setExtensionSetting": {
        const key = String(msg.key || "");
        const booleanKeys = new Set(["showAgentToolCards", "autoWakeMasterForAgents"]);
        const isInterval = key === "agentWakeIntervalSeconds";
        if (!booleanKeys.has(key) && !isInterval) break;
        const rawInterval = Number(msg.value);
        const value = isInterval
          ? Math.min(3600, Math.max(10, Number.isFinite(rawInterval) ? Math.round(rawInterval) : 30))
          : msg.value === true;
        try {
          await vscode.workspace
            .getConfiguration("cblage.codewhale")
            .update(
              key,
              value,
              vscode.ConfigurationTarget.Global
            );
          this.panel.webview.postMessage({
            type: "extensionSettingResult",
            success: true,
          });
          this.postExtensionSettings();
        } catch (err) {
          this.panel.webview.postMessage({
            type: "extensionSettingResult",
            success: false,
            error: getErrorMessage(err),
          });
          this.postExtensionSettings();
        }
        break;
      }
      case "setConfig": {
        const key = msg.key as string;
        const value = msg.value as string;
        try {
          const result = await this.api.setConfig({ key, value, persist: true });
          // Always reload after persisting — the reload endpoint now syncs
          // the new config to RuntimeThreadManager AND all active engines.
          await this.api.reloadConfig();
          this.panel.webview.postMessage({
            type: "setConfigResult",
            key: result.key,
            value: result.value,
            success: true,
          });
          // Refresh to show updated values
          await this.loadConfig();
          if (key === "show_tool_details" || key === "calm_mode") {
            await this.notifyRuntimeDisplaySettingsChanged();
          }
        } catch (err) {
          this.panel.webview.postMessage({
            type: "setConfigResult",
            key,
            value,
            success: false,
            error: getErrorMessage(err),
          });
        }
        break;
      }
      case "setConfigBatch": {
        const changes = msg.changes as Record<string, string>;
        const keys = Object.keys(changes);
        let savedCount = 0;
        let lastError = "";
        for (const key of keys) {
          try {
            await this.api.setConfig({ key, value: changes[key], persist: true });
            savedCount++;
          } catch (err) {
            lastError = getErrorMessage(err);
          }
        }
        // Single reload after all keys are persisted
        try {
          await this.api.reloadConfig();
        } catch (err) {
          lastError = getErrorMessage(err);
        }
        this.panel.webview.postMessage({
          type: "setConfigBatchResult",
          saved: savedCount,
          total: keys.length,
          success: lastError === "",
          error: lastError,
        });
        // Refresh to show updated values
        await this.loadConfig();
        if (keys.includes("show_tool_details") || keys.includes("calm_mode")) {
          await this.notifyRuntimeDisplaySettingsChanged();
        }
        break;
      }
      case "reloadConfig":
        try {
          await this.api.reloadConfig();
          await this.loadConfig();
          await this.notifyRuntimeDisplaySettingsChanged();
          this.panel.webview.postMessage({
            type: "reloadResult",
            success: true,
          });
        } catch (err) {
          this.panel.webview.postMessage({
            type: "reloadResult",
            success: false,
            error: getErrorMessage(err),
          });
        }
        break;
    }
  }

  private getHtml(): string {
    const tr = t();
    return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CodeWhale Config</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --input-bg: var(--vscode-input-background);
      --input-fg: var(--vscode-input-foreground);
      --input-border: var(--vscode-input-border);
      --btn-bg: var(--vscode-button-background);
      --btn-fg: var(--vscode-button-foreground);
      --btn-hover: var(--vscode-button-hoverBackground);
      --border: var(--vscode-panel-border);
      --section-bg: var(--vscode-sideBar-background);
      --muted: var(--vscode-descriptionForeground);
      --focus: var(--vscode-focusBorder);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      font-size: 13px;
      color: var(--fg);
      background: var(--bg);
      padding: 16px 24px;
      max-width: 800px;
      margin: 0 auto;
    }
    h1 {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 4px;
    }
    .subtitle {
      color: var(--muted);
      margin-bottom: 20px;
    }
    .toolbar {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }
    button {
      background: var(--btn-bg);
      color: var(--btn-fg);
      border: none;
      padding: 6px 14px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 13px;
    }
    button:hover { background: var(--btn-hover); }
    button.secondary {
      background: transparent;
      color: var(--fg);
      border: 1px solid var(--input-border);
    }
    button.secondary:hover { background: var(--input-bg); }
    .section {
      background: var(--section-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 14px 18px;
      margin-bottom: 14px;
    }
    .section-title {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 12px;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--border);
    }
    .field {
      display: flex;
      align-items: center;
      margin-bottom: 8px;
      gap: 12px;
    }
    .field:last-child { margin-bottom: 0; }
    .field-label {
      min-width: 160px;
      font-weight: 500;
      color: var(--muted);
    }
    .field-value {
      flex: 1;
    }
    .field-copy {
      min-width: 0;
      flex: 1;
    }
    .field-copy .field-label {
      display: block;
      min-width: 0;
      color: var(--fg);
    }
    .field-description {
      display: block;
      margin-top: 3px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.4;
    }
    .checkbox-field {
      cursor: pointer;
    }
    .checkbox-field input[type="checkbox"] {
      width: 16px;
      height: 16px;
      flex: 0 0 auto;
      accent-color: var(--vscode-checkbox-selectBackground, var(--btn-bg));
      cursor: pointer;
    }
    select, input[type="text"], input[type="number"] {
      width: 100%;
      padding: 4px 8px;
      background: var(--input-bg);
      color: var(--input-fg);
      border: 1px solid var(--input-border);
      border-radius: 3px;
      font-size: 13px;
      font-family: inherit;
    }
    select:focus, input[type="text"]:focus, input[type="number"]:focus {
      outline: 1px solid var(--focus);
    }
    .status {
      margin-top: 8px;
      padding: 6px 10px;
      border-radius: 3px;
      font-size: 12px;
    }
    .status.success { background: #2ea04325; color: #2ea043; }
    .status.error { background: #f8514925; color: #f85149; }
    .status.info { background: #388bfd25; color: #388bfd; }
    .hidden { display: none; }
  </style>
</head>
<body>
  <h1>CodeWhale Configuration</h1>
  <p class="subtitle">Edit runtime configuration. Changes are persisted to config.toml and settings.json.</p>

  <div class="toolbar">
    <button id="btn-reload">Fetch from Backend</button>
    <button id="btn-save" class="secondary">Apply to Backend</button>
  </div>

  <div id="status" class="status info hidden"></div>

  <div id="config-form">
    <!-- Extension UI Section -->
    <div class="section">
      <div class="section-title">${tr.extensionUi}</div>
      <label class="field checkbox-field" for="ext-show-agent-tool-cards">
        <span class="field-copy">
          <span class="field-label">${tr.showAgentToolCards}</span>
          <span class="field-description">${tr.showAgentToolCardsDescription}</span>
        </span>
        <input type="checkbox" id="ext-show-agent-tool-cards">
      </label>
      <label class="field checkbox-field" for="ext-auto-wake-master-agents">
        <span class="field-copy">
          <span class="field-label">${tr.autoWakeMasterForAgents}</span>
          <span class="field-description">${tr.autoWakeMasterForAgentsDescription}</span>
        </span>
        <input type="checkbox" id="ext-auto-wake-master-agents">
      </label>
      <label class="field" for="ext-agent-wake-interval">
        <span class="field-copy">
          <span class="field-label">${tr.agentWakeIntervalSeconds}</span>
          <span class="field-description">${tr.agentWakeIntervalSecondsDescription}</span>
        </span>
        <span class="field-value">
          <input type="number" id="ext-agent-wake-interval" min="10" max="3600" step="1" value="30">
        </span>
      </label>
    </div>

    <!-- Runtime Section -->
    <div class="section">
      <div class="section-title">Runtime</div>
      <div class="field">
        <span class="field-label">Model</span>
        <div class="field-value">
          <input type="text" id="cfg-model" autocomplete="off" spellcheck="false">
        </div>
      </div>
      <div class="field">
        <span class="field-label">Default Mode</span>
        <div class="field-value">
          <select id="cfg-default_mode">
            <option value="act">Agent</option>
            <option value="plan">Planner</option>
            <option value="operate">Orchestrator</option>
          </select>
        </div>
      </div>
      <div class="field">
        <span class="field-label">Effort</span>
        <div class="field-value">
          <select id="cfg-reasoning_effort">
            <option value="auto">auto</option>
            <option value="off">off</option>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
            <option value="max">max</option>
          </select>
        </div>
      </div>
      <div class="field">
        <span class="field-label">Approval Mode</span>
        <div class="field-value">
          <select id="cfg-approval_mode">
            <option value="suggest">suggest</option>
            <option value="auto">auto</option>
            <option value="on-request">on-request</option>
            <option value="untrusted">untrusted</option>
            <option value="never">never</option>
          </select>
        </div>
      </div>
    </div>

    <!-- API Section -->
    <div class="section">
      <div class="section-title">API</div>
      <div class="field">
        <span class="field-label">Provider</span>
        <div class="field-value">
          <select id="cfg-provider">
            <option value="deepseek">deepseek</option>
          </select>
        </div>
      </div>
      <div class="field">
        <span class="field-label">Base URL</span>
        <div class="field-value">
          <input type="text" id="cfg-base_url" placeholder="https://api.deepseek.com">
        </div>
      </div>
    </div>

    <!-- Behavior Section -->
    <div class="section">
      <div class="section-title">Behavior</div>
      <div class="field">
        <span class="field-label">Auto Compact</span>
        <div class="field-value">
          <select id="cfg-auto_compact">
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        </div>
      </div>
      <div class="field">
        <span class="field-label">Allow Shell</span>
        <div class="field-value">
          <select id="cfg-allow_shell">
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        </div>
      </div>
      <div class="field">
        <span class="field-label">Cost Currency</span>
        <div class="field-value">
          <select id="cfg-cost_currency">
            <option value="usd">usd</option>
            <option value="cny">cny</option>
          </select>
        </div>
      </div>
      <div class="field">
        <span class="field-label">Calm Mode</span>
        <div class="field-value">
          <select id="cfg-calm_mode">
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        </div>
      </div>
      <div class="field">
        <span class="field-label">Max History</span>
        <div class="field-value">
          <input type="text" id="cfg-max_history" placeholder="100">
        </div>
      </div>
      <div class="field">
        <span class="field-label">Prefer External pdftotext</span>
        <div class="field-value">
          <select id="cfg-prefer_external_pdftotext">
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        </div>
      </div>
      <div class="field">
        <span class="field-label">Follow Symlinks</span>
        <div class="field-value">
          <select id="cfg-workspace_follow_symlinks">
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Display Section -->
    <div class="section">
      <div class="section-title">Display</div>
      <div class="field">
        <span class="field-label">Show Thinking</span>
        <div class="field-value">
          <select id="cfg-show_thinking">
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        </div>
      </div>
      <div class="field">
        <span class="field-label">Show Tool Details</span>
        <div class="field-value">
          <select id="cfg-show_tool_details">
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        </div>
      </div>
      <div class="field">
        <span class="field-label">Locale</span>
        <div class="field-value">
          <select id="cfg-locale">
            <option value="auto">auto</option>
            <option value="en">en</option>
            <option value="zh-Hans">zh-Hans</option>
            <option value="ja">ja</option>
            <option value="pt-BR">pt-BR</option>
            <option value="es-419">es-419</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Subagents Section -->
    <div class="section">
      <div class="section-title">Subagents</div>
      <div class="field">
        <span class="field-label">Enabled</span>
        <div class="field-value">
          <select id="cfg-subagents_enabled">
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        </div>
      </div>
      <div class="field">
        <span class="field-label">Max Depth</span>
        <div class="field-value">
          <input type="text" id="cfg-subagents_max_depth" placeholder="3">
        </div>
      </div>
    </div>

    <!-- MCP Section -->
    <div class="section">
      <div class="section-title">MCP</div>
      <div class="field">
        <span class="field-label">Config Path</span>
        <div class="field-value">
          <input type="text" id="cfg-mcp_config_path" placeholder="~/.deepseek/mcp.json">
        </div>
      </div>
    </div>

    <!-- Security & Tools Section -->
    <div class="section">
      <div class="section-title">Security &amp; Tools</div>
      <div class="field">
        <span class="field-label">Sandbox Mode</span>
        <div class="field-value">
          <select id="cfg-sandbox_mode">
            <option value="workspace-write">workspace-write</option>
            <option value="read-only">read-only</option>
            <option value="danger-full-access">danger-full-access</option>
            <option value="none">none</option>
            <option value="opensandbox">opensandbox</option>
          </select>
        </div>
      </div>
      <div class="field">
        <span class="field-label">Strict Tool Mode</span>
        <div class="field-value">
          <select id="cfg-strict_tool_mode">
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        </div>
      </div>
      <div class="field">
        <span class="field-label">Memory</span>
        <div class="field-value">
          <select id="cfg-memory_enabled">
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        </div>
      </div>
      <div class="field">
        <span class="field-label">Search Provider</span>
        <div class="field-value">
          <select id="cfg-search_provider">
            <option value="duckduckgo">duckduckgo</option>
            <option value="bing">bing</option>
            <option value="tavily">tavily</option>
            <option value="bocha">bocha</option>
            <option value="metaso">metaso</option>
            <option value="searxng">searxng</option>
            <option value="baidu">baidu</option>
            <option value="volcengine">volcengine</option>
            <option value="sofya">sofya</option>
          </select>
        </div>
      </div>
      <div class="field">
        <span class="field-label">Prompt Suggestion</span>
        <div class="field-value">
          <select id="cfg-prompt_suggestion">
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        </div>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let currentConfig = null;
    let pendingChanges = {};

    // ── Helpers ──

    function $(id) { return document.getElementById(id); }

    function showStatus(text, type) {
      const el = $('status');
      el.textContent = text;
      el.className = 'status ' + type;
      el.classList.remove('hidden');
      if (type !== 'error') {
        setTimeout(function() { el.classList.add('hidden'); }, 3000);
      }
    }

    function setFieldValue(id, value) {
      const el = $(id);
      if (!el) return;
      if (el.tagName === 'SELECT') {
        // Add option if not exists
        var found = false;
        for (var i = 0; i < el.options.length; i++) {
          if (el.options[i].value === String(value)) { found = true; break; }
        }
        if (!found) {
          var opt = document.createElement('option');
          opt.value = String(value);
          opt.textContent = String(value);
          el.appendChild(opt);
        }
        el.value = String(value);
      } else {
        el.value = String(value);
      }
    }

    function getChangedFields() {
      var changes = {};
      var keys = ['model', 'default_mode', 'reasoning_effort', 'approval_mode',
                   'provider', 'base_url', 'auto_compact', 'allow_shell',
                   'cost_currency', 'calm_mode', 'max_history',
                   'prefer_external_pdftotext', 'workspace_follow_symlinks',
                   'show_thinking', 'show_tool_details', 'locale',
                   'subagents_enabled', 'subagents_max_depth',
                   'mcp_config_path',
                   'sandbox_mode', 'strict_tool_mode', 'memory_enabled',
                   'search_provider', 'prompt_suggestion'];
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var el = $('cfg-' + key);
        if (!el) continue;
        var currentVal = currentConfig ? String(currentConfig[key]) : '';
        var newVal = el.value;
        if (newVal !== currentVal) {
          changes[key] = newVal;
        }
      }
      return changes;
    }

    // ── Populate from config data ──

    function populateForm(config) {
      var normalizedMode = String(config.default_mode || '').toLowerCase();
      if (normalizedMode === 'agent' || normalizedMode === 'auto' || normalizedMode === 'yolo') {
        normalizedMode = 'act';
      }
      currentConfig = Object.assign({}, config, { default_mode: normalizedMode || 'act' });
      var keys = Object.keys(config);
      for (var i = 0; i < keys.length; i++) {
        setFieldValue('cfg-' + keys[i], keys[i] === 'default_mode' ? currentConfig.default_mode : config[keys[i]]);
      }
    }

    // ── Event listeners ──

    $('btn-reload').addEventListener('click', function() {
      vscode.postMessage({ type: 'reloadConfig' });
      showStatus('Fetching from backend...', 'info');
    });

    $('btn-save').addEventListener('click', async function() {
      var changes = getChangedFields();
      var keys = Object.keys(changes);
      if (keys.length === 0) {
        showStatus('No changes to apply', 'info');
        return;
      }
      showStatus('Applying ' + keys.length + ' change(s)...', 'info');
      // Send all changes at once; the backend will persist each and
      // trigger a single reload after the batch completes.
      vscode.postMessage({ type: 'setConfigBatch', changes: changes });
    });

    $('ext-show-agent-tool-cards').addEventListener('change', function() {
      vscode.postMessage({
        type: 'setExtensionSetting',
        key: 'showAgentToolCards',
        value: this.checked
      });
      showStatus('Saving display preference...', 'info');
    });

    $('ext-auto-wake-master-agents').addEventListener('change', function() {
      vscode.postMessage({
        type: 'setExtensionSetting',
        key: 'autoWakeMasterForAgents',
        value: this.checked
      });
      $('ext-agent-wake-interval').disabled = !this.checked;
      showStatus('Saving agent watchdog preference...', 'info');
    });

    $('ext-agent-wake-interval').addEventListener('change', function() {
      var seconds = Math.min(3600, Math.max(10, Math.round(Number(this.value) || 30)));
      this.value = String(seconds);
      vscode.postMessage({
        type: 'setExtensionSetting',
        key: 'agentWakeIntervalSeconds',
        value: seconds
      });
      showStatus('Saving agent watchdog interval...', 'info');
    });

    // ── Message handling ──

    window.addEventListener('message', function(event) {
      var msg = event.data;
      if (msg.type === 'configData') {
        populateForm(msg.config);
        showStatus('Config loaded', 'info');
      } else if (msg.type === 'extensionSettings') {
        $('ext-show-agent-tool-cards').checked = !!msg.showAgentToolCards;
        $('ext-auto-wake-master-agents').checked = !!msg.autoWakeMasterForAgents;
        $('ext-agent-wake-interval').value = String(msg.agentWakeIntervalSeconds || 30);
        $('ext-agent-wake-interval').disabled = !msg.autoWakeMasterForAgents;
      } else if (msg.type === 'extensionSettingResult') {
        if (msg.success) {
          showStatus('Display preference saved', 'success');
        } else {
          showStatus('Failed to save display preference: ' + msg.error, 'error');
        }
      } else if (msg.type === 'setConfigResult') {
        if (msg.success) {
          showStatus(msg.key + ' = ' + msg.value + ' applied', 'success');
        } else {
          showStatus('Failed to apply ' + msg.key + ': ' + msg.error, 'error');
        }
      } else if (msg.type === 'setConfigBatchResult') {
        if (msg.success) {
          showStatus(msg.saved + '/' + msg.total + ' config(s) applied and refreshed', 'success');
        } else {
          showStatus('Batch apply: ' + msg.saved + '/' + msg.total + ' applied. Error: ' + msg.error, 'error');
        }
      } else if (msg.type === 'reloadResult') {
        if (msg.success) {
          showStatus('Config fetched from backend', 'success');
        } else {
          showStatus('Fetch failed: ' + msg.error, 'error');
        }
      } else if (msg.type === 'error') {
        showStatus(msg.message, 'error');
      }
    });
  </script>
</body>
</html>`;
  }

  private dispose(): void {
    ConfigPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const d = this.disposables.pop();
      if (d) d.dispose();
    }
  }
}
