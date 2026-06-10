import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SlashCommandContext } from "./slash-command-handler";

const vscodeState = vi.hoisted(() => {
  const configValues = new Map<string, unknown>([
    ["defaultMode", "agent"],
    ["defaultModel", "deepseek-v4-pro"],
    ["reasoningEffort", "auto"],
    ["autoApprove", false],
    ["goalObjective", undefined],
    ["goalTokenBudget", undefined],
  ]);

  return {
    configValues,
    updateMock: vi.fn(async (key: string, value: unknown) => {
      vscodeState.configValues.set(key, value);
    }),
    executeCommandMock: vi.fn(),
  };
});

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: (key: string, fallback?: unknown) =>
        vscodeState.configValues.has(key)
          ? vscodeState.configValues.get(key)
          : fallback,
      update: vscodeState.updateMock,
    })),
    workspaceFolders: [{ uri: { fsPath: "/workspace" } }],
  },
  commands: {
    executeCommand: vscodeState.executeCommandMock,
  },
  ConfigurationTarget: {
    Global: "global",
  },
}));

import { SlashCommandHandler } from "./slash-command-handler";

function createContext(overrides: Partial<SlashCommandContext> = {}): SlashCommandContext {
  return {
    api: {
      updateThread: vi.fn(async () => undefined),
      listSessions: vi.fn(async () => ({ sessions: [] })),
    } as any,
    engine: {} as any,
    currentThread: null,
    messages: [],
    sessionCostUsd: 0,
    sessionCostCny: 0,
    lastCacheHitTokens: 0,
    lastCacheMissTokens: 0,
    lastInputTokens: 0,
    lastOutputTokens: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    postMessage: vi.fn(),
    getCurrentModel: vi.fn(() => "deepseek-v4-pro"),
    refreshSessionList: vi.fn(),
    refreshTaskList: vi.fn(async () => undefined),
    refreshWorkPanel: vi.fn(),
    loadSessionMessages: vi.fn(async () => undefined),
    handleInterrupt: vi.fn(async () => undefined),
    handleCompact: vi.fn(async () => undefined),
    handleUndoLastTurn: vi.fn(async () => undefined),
    handleRetryLastTurn: vi.fn(async () => undefined),
    handleAttachFile: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("SlashCommandHandler", () => {
  beforeEach(() => {
    vscodeState.configValues.clear();
    vscodeState.configValues.set("defaultMode", "agent");
    vscodeState.configValues.set("defaultModel", "deepseek-v4-pro");
    vscodeState.configValues.set("reasoningEffort", "auto");
    vscodeState.configValues.set("autoApprove", false);
    vscodeState.configValues.set("goalObjective", undefined);
    vscodeState.configValues.set("goalTokenBudget", undefined);
    vscodeState.updateMock.mockClear();
    vscodeState.executeCommandMock.mockClear();
  });

  it("delegates /undo to the injected context", async () => {
    const ctx = createContext();
    const handler = new SlashCommandHandler(ctx);

    await handler.handle("/undo", "");

    expect(ctx.handleUndoLastTurn).toHaveBeenCalledOnce();
  });

  it("delegates /retry to the injected context", async () => {
    const ctx = createContext();
    const handler = new SlashCommandHandler(ctx);

    await handler.handle("/retry", "");

    expect(ctx.handleRetryLastTurn).toHaveBeenCalledOnce();
  });

  it("updates config and thread state for /mode yolo", async () => {
    const updateThread = vi.fn(async () => undefined);
    const postMessage = vi.fn();
    const ctx = createContext({
      api: { updateThread } as any,
      currentThread: { id: "thread-1" } as any,
      postMessage,
    });
    const handler = new SlashCommandHandler(ctx);

    await handler.handle("/mode", "yolo");

    expect(vscodeState.updateMock).toHaveBeenCalledWith("defaultMode", "yolo", "global");
    expect(updateThread).toHaveBeenCalledWith("thread-1", {
      mode: "yolo",
      trust_mode: true,
      auto_approve: true,
    });
    expect(postMessage).toHaveBeenCalledWith({
      type: "settingsUpdated",
      mode: "yolo",
      model: "deepseek-v4-pro",
      reasoningEffort: "auto",
    });
    expect(postMessage).toHaveBeenCalledWith({
      type: "info",
      message: "Mode changed to yolo",
    });
  });

  it("stores goal objective and budget for /goal", async () => {
    const postMessage = vi.fn();
    const refreshWorkPanel = vi.fn();
    const ctx = createContext({ postMessage, refreshWorkPanel });
    const handler = new SlashCommandHandler(ctx);

    await handler.handle("/goal", "Ship refactor | budget: 1234");

    expect(vscodeState.updateMock).toHaveBeenCalledWith("goalObjective", "Ship refactor", "global");
    expect(vscodeState.updateMock).toHaveBeenCalledWith("goalTokenBudget", 1234, "global");
    expect(postMessage).toHaveBeenCalledWith({
      type: "info",
      message: 'Goal set: "Ship refactor" (budget: 1234 tokens) — tracking progress.',
    });
    expect(refreshWorkPanel).toHaveBeenCalledOnce();
  });

  it("clears goal config for /goal clear", async () => {
    const postMessage = vi.fn();
    const refreshWorkPanel = vi.fn();
    const ctx = createContext({ postMessage, refreshWorkPanel });
    const handler = new SlashCommandHandler(ctx);

    await handler.handle("/goal", "clear");

    expect(vscodeState.updateMock).toHaveBeenCalledWith("goalObjective", undefined, "global");
    expect(vscodeState.updateMock).toHaveBeenCalledWith("goalTokenBudget", undefined, "global");
    expect(postMessage).toHaveBeenCalledWith({
      type: "info",
      message: "Goal cleared.",
    });
    expect(refreshWorkPanel).toHaveBeenCalledOnce();
  });

  it("posts clearChat for /clear", async () => {
    const postMessage = vi.fn();
    const ctx = createContext({ postMessage });
    const handler = new SlashCommandHandler(ctx);

    await handler.handle("/clear", "");

    expect(postMessage).toHaveBeenCalledWith({ type: "clearChat" });
  });
});
