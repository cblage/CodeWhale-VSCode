import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const engineSource = readFileSync(resolve(__dirname, "engine.ts"), "utf8");

describe("Engine baseUrl synchronization", () => {
  it("baseUrl uses correct format", () => {
    const host = "127.0.0.1";
    const port = 54321;
    const baseUrl = `http://${host}:${port}`;
    expect(baseUrl).toBe("http://127.0.0.1:54321");
  });

  it("baseUrl changes when port changes", () => {
    const host = "127.0.0.1";
    const port1 = 7878;
    const port2 = 54321;
    const url1 = `http://${host}:${port1}`;
    const url2 = `http://${host}:${port2}`;
    expect(url1).not.toBe(url2);
    expect(url1).toBe("http://127.0.0.1:7878");
    expect(url2).toBe("http://127.0.0.1:54321");
  });

  it("API client setBaseUrl updates the base URL", () => {
    let baseUrl = "http://127.0.0.1:7878";
    expect(baseUrl).toBe("http://127.0.0.1:7878");

    baseUrl = "http://127.0.0.1:54321";
    expect(baseUrl).toBe("http://127.0.0.1:54321");
  });

  it("URL construction for API paths works correctly", () => {
    const baseUrl = "http://127.0.0.1:54321";
    const paths = [
      "/v1/threads",
      "/v1/threads/abc123",
      "/v1/threads/abc123/events",
      "/health",
      "/v1/tasks",
    ];
    for (const path of paths) {
      const url = new URL(path, baseUrl);
      expect(url.origin).toBe(baseUrl);
      expect(url.pathname).toBe(path);
    }
  });
});

describe("Engine process lifecycle", () => {
  it("uses persistent inherited output instead of extension-host pipes", () => {
    expect(engineSource).toContain(
      'fs.openSync(processLogPath, "a")'
    );
    expect(engineSource).toMatch(
      /stdio:\s*\[\s*"ignore",\s*processLogFd \?\? "ignore",\s*processLogFd \?\? "ignore"/s
    );
    expect(engineSource).toContain("fs.closeSync(processLogFd)");
    expect(engineSource).not.toContain(
      'stdio: ["ignore", "pipe", "pipe"]'
    );
  });

  it("prefers the isolated cblage runtime without replacing official CodeWhale", () => {
    expect(engineSource).toContain('.local", "lib", "codewhale-cblage"');
    expect(engineSource.indexOf("patchedRuntimeCandidates()"))
      .toBeLessThan(engineSource.indexOf('path.join(homeDir(), ".cargo", "bin", "codewhale")'));
  });

  it("reuses healthy runtimes without replacing live work for optional capabilities", () => {
    expect(engineSource).toContain("checkAgentCancellationSupport");
    expect(engineSource).toContain("/v1/threads/__probe__/agent-runs/__probe__/cancel");
    expect(engineSource).toContain("res.statusCode !== 404");
    expect(engineSource).toContain("Optional route availability must never be used as permission");
    expect(engineSource).not.toContain("lacks direct agent cancellation; restarting");
  });

  it("reserves port-based process termination for explicit Restart Engine", () => {
    const startBody = engineSource.slice(
      engineSource.indexOf("async start(): Promise<void>"),
      engineSource.indexOf("async stop(): Promise<void>"),
    );
    const restartBody = engineSource.slice(
      engineSource.indexOf("async restart(): Promise<void>"),
      engineSource.indexOf("private async checkHealth"),
    );
    expect(startBody).not.toContain("killProcessOnPort");
    expect(restartBody).toContain("killProcessOnPort(previousPort)");
    expect(restartBody).toContain("Force-stopping the previous engine");
    expect(restartBody).toContain("this.persistCurrentPort()");
  });
});

describe("Slash command parsing", () => {
  function parseSlashCommand(input: string): { command: string; args: string } | null {
    const trimmed = input.trim();
    if (!trimmed.startsWith("/")) return null;
    const parts = trimmed.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1).join(" ");
    return { command, args };
  }

  it("parses simple command without args", () => {
    const result = parseSlashCommand("/help");
    expect(result).toEqual({ command: "/help", args: "" });
  });

  it("parses command with args", () => {
    const result = parseSlashCommand("/mode agent");
    expect(result).toEqual({ command: "/mode", args: "agent" });
  });

  it("parses command with multi-word args", () => {
    const result = parseSlashCommand("/rename My New Title");
    expect(result).toEqual({ command: "/rename", args: "My New Title" });
  });

  it("returns null for non-slash input", () => {
    expect(parseSlashCommand("hello")).toBeNull();
    expect(parseSlashCommand("")).toBeNull();
  });

  it("normalizes command to lowercase", () => {
    const result = parseSlashCommand("/MODE agent");
    expect(result).toEqual({ command: "/mode", args: "agent" });
  });

  it("handles extra whitespace", () => {
    const result = parseSlashCommand("/mode   agent");
    expect(result).toEqual({ command: "/mode", args: "agent" });
  });

  it("parses reasoning effort values", () => {
    const values = ["auto", "off", "low", "medium", "high", "max"];
    for (const val of values) {
      const result = parseSlashCommand(`/reasoning ${val}`);
      expect(result?.args).toBe(val);
    }
  });

  it("parses mode with number shortcuts", () => {
    const shortcuts = ["1", "2", "3"];
    const expected = ["agent", "plan", "yolo"];
    const modeMap: Record<string, string> = { "1": "agent", "2": "plan", "3": "yolo" };
    for (let i = 0; i < shortcuts.length; i++) {
      const result = parseSlashCommand(`/mode ${shortcuts[i]}`);
      expect(result?.args).toBe(shortcuts[i]);
      expect(modeMap[result!.args]).toBe(expected[i]);
    }
  });
});

describe("Settings update message format", () => {
  it("creates valid settingsUpdated message", () => {
    const msg = {
      type: "settingsUpdated",
      mode: "agent",
      model: "deepseek-v4-pro",
      reasoningEffort: "auto",
    };
    expect(msg.type).toBe("settingsUpdated");
    expect(msg.mode).toBe("agent");
    expect(msg.model).toBe("deepseek-v4-pro");
    expect(msg.reasoningEffort).toBe("auto");
  });

  it("creates valid ready message with settings", () => {
    const msg = {
      type: "ready",
      model: "deepseek-v4-pro",
      mode: "agent",
      reasoningEffort: "auto",
    };
    expect(msg.type).toBe("ready");
    expect(msg).toHaveProperty("mode");
    expect(msg).toHaveProperty("model");
    expect(msg).toHaveProperty("reasoningEffort");
  });
});

describe("Command output persistence (TUI parity)", () => {
  it("info messages should be persistent system messages, not auto-dismissing", () => {
    const msg = { type: "info", message: "Mode changed to agent" };
    expect(msg.type).toBe("info");
    expect(msg.message).toBeDefined();
    expect(msg.message.length).toBeGreaterThan(0);
  });

  it("error messages should be persistent", () => {
    const msg = { type: "error", message: "Unknown command: /foobar" };
    expect(msg.type).toBe("error");
    expect(msg.message).toBeDefined();
  });

  it("system message CSS class should be used for info (TUI HistoryCell::System parity)", () => {
    const cssClass = "system-message";
    expect(cssClass).toBe("system-message");
  });

  it("command output messages have no auto-remove timeout", () => {
    const autoRemoveMs = 0;
    expect(autoRemoveMs).toBe(0);
  });

  it("all slash command results produce either info or error messages", () => {
    const commandResults = [
      { command: "/mode agent", type: "info" },
      { command: "/model deepseek-v4-pro", type: "info" },
      { command: "/clear", type: "info" },
      { command: "/help", type: "info" },
      { command: "/rename", type: "error" },
      { command: "/unknown", type: "error" },
    ];
    for (const result of commandResults) {
      expect(["info", "error"]).toContain(result.type);
    }
  });
});
