import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");
const manifest = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8")
);
const extensionSource = readFileSync(
  resolve(root, "src", "extension.ts"),
  "utf8"
);
const englishManifestStrings = JSON.parse(
  readFileSync(resolve(root, "package.nls.json"), "utf8")
);
const chineseManifestStrings = JSON.parse(
  readFileSync(resolve(root, "package.nls.zh-cn.json"), "utf8")
);
const i18nSource = readFileSync(resolve(root, "src", "i18n.ts"), "utf8");
const chatProviderSource = readFileSync(
  resolve(root, "src", "chat-provider.ts"),
  "utf8"
);

describe("extension view contribution", () => {
  it("uses the gorilla HarambeChat UI title and Harambe composer prompt", () => {
    expect(englishManifestStrings["viewsContainers.secondarySidebar.title"]).toBe("🦍 HarambeChat");
    expect(chineseManifestStrings["viewsContainers.secondarySidebar.title"]).toBe("🦍 HarambeChat");
    expect(englishManifestStrings["views.chat.name"]).toBe("🦍 HarambeChat");
    expect(chineseManifestStrings["views.chat.name"]).toBe("🦍 HarambeChat");
    expect(chatProviderSource).not.toContain("webviewView.title =");
    expect(i18nSource.match(/inputPlaceholder: "Ask Harambe\.\.\."/g)).toHaveLength(2);
  });

  it("uses a fully isolated cblage extension and view identity", () => {
    expect(`${manifest.publisher}.${manifest.name}`).toBe("cblage.codewhale-vscode");
    expect(manifest.engines.vscode).toBe("^1.106.0");
    expect(manifest.contributes.viewsContainers.activitybar).toBeUndefined();
    expect(manifest.contributes.viewsContainers.secondarySidebar).toEqual([
      expect.objectContaining({ id: "cblage-codewhale" })
    ]);
    expect(
      manifest.contributes.viewsContainers.secondarySidebar.every(
        (container: { id: string }) => /^[A-Za-z0-9_-]+$/.test(container.id)
      )
    ).toBe(true);
    expect(manifest.contributes.views["cblage-codewhale"]).toEqual([
      expect.objectContaining({ id: "cblage.codewhale.chat", type: "webview" })
    ]);
    expect(manifest.contributes.commands).toContainEqual(
      expect.objectContaining({ command: "cblage.codewhale.openChat" })
    );
    expect(
      manifest.contributes.commands.every((entry: { command: string }) =>
        entry.command.startsWith("cblage.codewhale.")
      )
    ).toBe(true);
    expect(
      Object.keys(manifest.contributes.configuration.properties).every((key) =>
        key.startsWith("cblage.codewhale.")
      )
    ).toBe(true);
    expect(JSON.stringify(manifest.contributes)).not.toContain("brotherwhale");
    expect(JSON.stringify(manifest.contributes)).not.toContain("deepcode");
  });

  it("opens the Secondary Side Bar container and focuses the chat view", () => {
    expect(extensionSource).toContain(
      'executeCommand("workbench.view.extension.cblage-codewhale")'
    );
    expect(extensionSource).toContain(
      'executeCommand("cblage.codewhale.chat.focus")'
    );
    expect(extensionSource).toContain(
      'registerCommand("cblage.codewhale.openChat", openChat)'
    );
  });

  it("retains the chat webview while the Secondary Side Bar is hidden", () => {
    expect(extensionSource).toContain("retainContextWhenHidden: true");
  });

  it("declares raw agent tool cards as an opt-in display setting", () => {
    expect(
      manifest.contributes.configuration.properties[
        "cblage.codewhale.showAgentToolCards"
      ]
    ).toEqual(expect.objectContaining({ type: "boolean", default: false }));
    expect(extensionSource).toContain(
      'affectsConfiguration("cblage.codewhale.showAgentToolCards")'
    );
    expect(extensionSource).toContain("chatProvider.notifyDisplaySettingsChanged()");
  });

  it("declares the configurable master-agent watchdog", () => {
    const properties = manifest.contributes.configuration.properties;
    expect(properties["cblage.codewhale.autoWakeMasterForAgents"]).toEqual(
      expect.objectContaining({ type: "boolean", default: true })
    );
    expect(properties["cblage.codewhale.agentWakeIntervalSeconds"]).toEqual(
      expect.objectContaining({
        type: "number",
        default: 30,
        minimum: 10,
        maximum: 3600,
      })
    );
    expect(extensionSource).toContain(
      'affectsConfiguration("cblage.codewhale.autoWakeMasterForAgents")'
    );
    expect(extensionSource).toContain(
      'affectsConfiguration("cblage.codewhale.agentWakeIntervalSeconds")'
    );
    expect(extensionSource).toContain("chatProvider.notifyAgentWatchdogSettingsChanged()");
  });
});
