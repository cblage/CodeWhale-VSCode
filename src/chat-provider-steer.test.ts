import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
  env: { language: "en" },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: "/workspace" } }],
    getConfiguration: vi.fn(() => ({
      get: (_key: string, fallback?: unknown) => fallback,
      update: vi.fn(async () => undefined),
    })),
    registerTextDocumentContentProvider: vi.fn(() => ({ dispose: vi.fn() })),
  },
  window: {
    showWarningMessage: vi.fn(),
    setStatusBarMessage: vi.fn(),
    showErrorMessage: vi.fn(),
  },
  commands: { executeCommand: vi.fn(async () => undefined) },
  ConfigurationTarget: { Global: "global" },
  Uri: {
    file: (fsPath: string) => ({ fsPath }),
    joinPath: (_base: unknown, ...segments: string[]) => ({ fsPath: segments.join("/") }),
  },
}));

import { ChatProvider } from "./chat-provider";
import type { ThreadRecord, TurnRecord } from "./types";

function makeThread(): ThreadRecord {
  return {
    schema_version: 1,
    id: "thread-master",
    created_at: "2026-07-11T00:00:00Z",
    updated_at: "2026-07-11T00:00:00Z",
    model: "deepseek-v4-pro",
    workspace: "/workspace",
    mode: "agent",
    allow_shell: true,
    trust_mode: false,
    auto_approve: false,
    latest_turn_id: "turn-master",
    archived: false,
    coherence_state: "healthy",
  };
}

function makeTurn(status: TurnRecord["status"] = "in_progress"): TurnRecord {
  return {
    schema_version: 1,
    id: "turn-master",
    thread_id: "thread-master",
    status,
    input_summary: "Initial request",
    created_at: "2026-07-11T00:00:00Z",
    item_ids: [],
    steer_count: 0,
  };
}

function createProvider() {
  const api = {
    bindEngine: vi.fn(),
    ensureReady: vi.fn(async () => undefined),
    steerTurn: vi.fn(async () => makeTurn()),
    getThreadDetail: vi.fn(async () => ({
      thread: makeThread(),
      turns: [makeTurn()],
      items: [],
      latest_seq: 1,
    })),
    startTurn: vi.fn(),
    cancelAgentRun: vi.fn(),
  };
  const provider: any = new ChatProvider(
    {} as any,
    { baseUrl: "http://127.0.0.1:7878" } as any,
    api as any,
  );
  provider.debugLog = vi.fn();
  provider.postMessage = vi.fn();
  provider.currentThread = makeThread();
  provider.sessionState.data.currentTurnId = "turn-master";
  return { provider, api };
}

describe("ChatProvider master-turn steering", () => {
  beforeEach(() => vi.clearAllMocks());

  it("steers only the current master turn and never starts a turn or targets a subagent", async () => {
    const { provider, api } = createProvider();

    await provider.handleSteer("  Focus on the failing tests  ");

    expect(api.ensureReady).toHaveBeenCalledOnce();
    expect(api.steerTurn).toHaveBeenCalledWith(
      "thread-master",
      "turn-master",
      "Focus on the failing tests",
    );
    expect(api.startTurn).not.toHaveBeenCalled();
    expect(api.cancelAgentRun).not.toHaveBeenCalled();
    expect(provider.postMessage).toHaveBeenCalledWith({ type: "status", text: "Steer sent" });
  });

  it("reconciles a just-started master turn before steering", async () => {
    const { provider, api } = createProvider();
    provider.sessionState.data.currentTurnId = null;

    await provider.handleSteer("Use the smaller patch");

    expect(api.getThreadDetail).toHaveBeenCalledWith("thread-master");
    expect(api.steerTurn).toHaveBeenCalledWith(
      "thread-master",
      "turn-master",
      "Use the smaller patch",
    );
  });

  it("renders the durable steer between existing and subsequent master output", () => {
    const { provider } = createProvider();
    provider.messages = [{
      id: "assistant-turn-master",
      role: "assistant",
      content: "Before steer.",
      status: "streaming",
      timestamp: 1,
      blocks: [{ type: "text", content: "Before steer." }],
    }];
    provider.sessionState.data.currentTextBlockIdx = 0;
    provider.sessionState.data.currentThinkingBlockIdx = 0;

    provider.handleRuntimeEvent({
      seq: 2,
      timestamp: "2026-07-11T00:00:01Z",
      thread_id: "thread-master",
      turn_id: "turn-master",
      item_id: "item-steer-1",
      event: "turn.steered",
      payload: { input: "Focus on the failing test" },
    });
    provider.handleRuntimeEvent({
      seq: 3,
      timestamp: "2026-07-11T00:00:01Z",
      thread_id: "thread-master",
      turn_id: "turn-master",
      item_id: "item-steer-1",
      event: "item.completed",
      payload: {
        item: {
          id: "item-steer-1",
          kind: "user_message",
          status: "completed",
          summary: "Focus on the failing test",
          detail: "Focus on the failing test",
        },
      },
    });
    provider.handleRuntimeEvent({
      seq: 4,
      timestamp: "2026-07-11T00:00:02Z",
      thread_id: "thread-master",
      turn_id: "turn-master",
      item_id: "item-agent-after",
      event: "item.delta",
      payload: { kind: "agent_message", delta: "After steer." },
    });

    expect(provider.messages[0].blocks).toEqual([
      { type: "text", content: "Before steer." },
      { type: "steer", content: "Focus on the failing test", sourceId: "item-steer-1" },
      { type: "text", content: "After steer." },
    ]);
    expect(provider.postMessage).toHaveBeenCalledWith({
      type: "addSteerBlock",
      messageId: "assistant-turn-master",
      blockIdx: 1,
      content: "Focus on the failing test",
    });
    expect(provider.postMessage).toHaveBeenCalledWith({
      type: "addTextBlock",
      messageId: "assistant-turn-master",
      blockIdx: 2,
    });
  });

  it("does not convert a steer into a new turn when the master turn has ended", async () => {
    const { provider, api } = createProvider();
    provider.sessionState.data.currentTurnId = null;
    api.getThreadDetail.mockResolvedValue({
      thread: makeThread(),
      turns: [makeTurn("completed")],
      items: [],
      latest_seq: 2,
    });

    await provider.handleSteer("Too late");

    expect(api.steerTurn).not.toHaveBeenCalled();
    expect(api.startTurn).not.toHaveBeenCalled();
    expect(provider.postMessage).toHaveBeenCalledWith({
      type: "error",
      message: "Cannot steer: the master turn is no longer active.",
    });
  });
});
