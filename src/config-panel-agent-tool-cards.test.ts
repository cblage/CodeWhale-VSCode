import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "config-panel.ts"), "utf8");

describe("config panel extension preferences", () => {
  it("uses the compact Effort label", () => {
    expect(source).toContain('<span class="field-label">Effort</span>');
    expect(source).not.toContain('<span class="field-label">Reasoning Effort</span>');
  });

  it("exposes a clear persisted checkbox", () => {
    expect(source).toContain('id="ext-show-agent-tool-cards"');
    expect(source).toContain("tr.showAgentToolCardsDescription");
    expect(source).toContain("type: 'setExtensionSetting'");
    expect(source).toContain("key: 'showAgentToolCards'");
    expect(source).toContain("vscode.ConfigurationTarget.Global");
  });

  it("keeps the checkbox synchronized with external setting changes", () => {
    expect(source).toContain(
      'event.affectsConfiguration("cblage.codewhale.showAgentToolCards")'
    );
    expect(source).toContain('type: "extensionSettings"');
    expect(source).toContain("$('ext-show-agent-tool-cards').checked = !!msg.showAgentToolCards");
  });

  it("exposes a persisted, configurable master-agent watchdog", () => {
    expect(source).toContain('id="ext-auto-wake-master-agents"');
    expect(source).toContain("key: 'autoWakeMasterForAgents'");
    expect(source).toContain('id="ext-agent-wake-interval" min="10" max="3600"');
    expect(source).toContain("key: 'agentWakeIntervalSeconds'");
    expect(source).toContain("Math.min(3600, Math.max(10");
    expect(source).toContain("$('ext-agent-wake-interval').disabled = !msg.autoWakeMasterForAgents");
  });

  it("notifies the chat webview after runtime display settings change or reload", () => {
    expect(source).toContain("onRuntimeDisplaySettingsChanged?: () => void | Promise<void>");
    expect(source).toContain('key === "show_tool_details" || key === "calm_mode"');
    expect(source).toContain('keys.includes("show_tool_details") || keys.includes("calm_mode")');
    expect(source).toContain("await this.notifyRuntimeDisplaySettingsChanged()");
  });
});
