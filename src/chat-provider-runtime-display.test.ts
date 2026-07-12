import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: (_key: string, fallback?: unknown) => fallback,
    })),
    workspaceFolders: undefined,
  },
  window: { showErrorMessage: vi.fn() },
  commands: { executeCommand: vi.fn() },
  env: { language: "en" },
  Uri: {
    file: (fsPath: string) => ({ fsPath }),
    parse: (value: string) => ({ toString: () => value }),
  },
  ConfigurationTarget: { Global: "global" },
}));

import { ChatProvider } from "./chat-provider";

describe("ChatProvider runtime transcript display settings", () => {
  it("reads show_tool_details and calm_mode and pushes live webview updates", async () => {
    const api = {
      bindEngine: vi.fn(),
      getConfig: vi.fn().mockResolvedValue({
        show_tool_details: false,
        calm_mode: true,
      }),
    };
    const provider = new ChatProvider({} as any, {} as any, api as any);
    provider.postMessage = vi.fn();
    (provider as any).debugLog = vi.fn();

    await (provider as any).refreshRuntimeDisplaySettings(true);

    expect(api.getConfig).toHaveBeenCalledOnce();
    expect(provider.postMessage).toHaveBeenCalledWith({
      type: "displaySettingsUpdated",
      showToolDetails: false,
      calmMode: true,
    });
  });

  it("keeps compact defaults when runtime config cannot be read", async () => {
    const api = {
      bindEngine: vi.fn(),
      getConfig: vi.fn().mockRejectedValue(new Error("offline")),
    };
    const provider = new ChatProvider({} as any, {} as any, api as any);
    provider.postMessage = vi.fn();
    (provider as any).debugLog = vi.fn();

    await (provider as any).refreshRuntimeDisplaySettings(true);

    expect((provider as any).runtimeShowToolDetails).toBe(false);
    expect((provider as any).runtimeCalmMode).toBe(true);
    expect(provider.postMessage).not.toHaveBeenCalled();
  });
});
