import { beforeEach, describe, expect, it, vi } from "vitest";

const vscodeState = vi.hoisted(() => ({
  showWarningMessage: vi.fn(),
  setStatusBarMessage: vi.fn(),
  showErrorMessage: vi.fn(),
}));

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
    showWarningMessage: vscodeState.showWarningMessage,
    setStatusBarMessage: vscodeState.setStatusBarMessage,
    showErrorMessage: vscodeState.showErrorMessage,
  },
  commands: { executeCommand: vi.fn(async () => undefined) },
  ConfigurationTarget: { Global: "global" },
  Uri: {
    file: (fsPath: string) => ({ fsPath }),
    joinPath: (_base: unknown, ...segments: string[]) => ({ fsPath: segments.join("/") }),
  },
}));

import { ChatProvider } from "./chat-provider";
import type { ThreadDetailResponse, ThreadRecord, TurnRecord } from "./types";

function makeThread(overrides: Partial<ThreadRecord>): ThreadRecord {
  return {
    schema_version: 1,
    id: "thread-default",
    created_at: "2026-07-11T00:00:00Z",
    updated_at: "2026-07-11T00:00:00Z",
    model: "deepseek-v4-pro",
    workspace: "/workspace",
    mode: "agent",
    allow_shell: true,
    trust_mode: false,
    auto_approve: false,
    latest_turn_id: null,
    archived: false,
    coherence_state: "healthy",
    ...overrides,
  };
}

function makeTurn(threadId: string, id: string, status: TurnRecord["status"]): TurnRecord {
  return {
    schema_version: 1,
    id,
    thread_id: threadId,
    status,
    input_summary: "test",
    created_at: "2026-07-11T00:00:00Z",
    item_ids: [],
    steer_count: 0,
  };
}

function makeDetail(thread: ThreadRecord, turn: TurnRecord): ThreadDetailResponse {
  return { thread, turns: [turn], items: [], latest_seq: 1 };
}

function createProvider(apiOverrides: Record<string, unknown> = {}) {
  const api = {
    bindEngine: vi.fn(),
    ensureReady: vi.fn(async () => undefined),
    listThreads: vi.fn(async () => []),
    listThreadsSummary: vi.fn(async () => []),
    listSessions: vi.fn(async () => ({ sessions: [] })),
    getThreadDetail: vi.fn(),
    deleteSession: vi.fn(async () => undefined),
    interruptTurn: vi.fn(async () => undefined),
    updateThread: vi.fn(async (id: string, patch: Partial<ThreadRecord>) => ({ id, ...patch })),
    ...apiOverrides,
  };
  const engine = { baseUrl: "http://127.0.0.1:7878" };
  const provider: any = new ChatProvider({} as any, engine as any, api as any);
  provider.debugLog = vi.fn();
  provider.postMessage = vi.fn();
  return { provider, api };
}

describe("deleted session/runtime thread reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vscodeState.showWarningMessage.mockImplementation(
      async (_title: string, _options: unknown, confirmAction: string) => confirmAction,
    );
  });

  it("skips a completed dangling thread at startup but preserves an active one", async () => {
    const completed = makeThread({
      id: "thread-completed",
      latest_turn_id: "turn-completed",
      session_id: "deleted-session-completed",
    });
    const active = makeThread({
      id: "thread-active",
      latest_turn_id: "turn-active",
      session_id: "deleted-session-active",
    });
    const completedDetail = makeDetail(
      completed,
      makeTurn(completed.id, "turn-completed", "completed"),
    );
    const activeDetail = makeDetail(
      active,
      makeTurn(active.id, "turn-active", "in_progress"),
    );
    const { provider, api } = createProvider({
      listThreads: vi.fn(async () => [completed, active]),
      listSessions: vi.fn(async () => ({ sessions: [] })),
      getThreadDetail: vi.fn(async (threadId: string) => (
        threadId === completed.id ? completedDetail : activeDetail
      )),
    });
    provider.refreshRuntimeVersion = vi.fn(async () => undefined);
    provider.refreshApiCapabilities = vi.fn(async () => undefined);
    provider.loadHistory = vi.fn(async () => 0);
    provider.subscribeToEvents = vi.fn();

    await provider.initializeThread();

    expect(api.getThreadDetail).toHaveBeenCalledTimes(2);
    expect(provider.currentThread?.id).toBe(active.id);
    expect(provider.sessionState.data.currentSessionId).toBeNull();
    expect(provider.loadHistory).toHaveBeenCalledOnce();
    expect(provider.subscribeToEvents).toHaveBeenCalledOnce();
  });

  it("deleting the current saved session archives every linked thread and clears the chat", async () => {
    const current = makeThread({
      id: "thread-current",
      latest_turn_id: "turn-active",
      session_id: "session-deleted",
    });
    const linked = makeThread({
      id: "thread-linked",
      latest_turn_id: "turn-completed",
      session_id: "session-deleted",
    });
    const currentDetail = makeDetail(
      current,
      makeTurn(current.id, "turn-active", "in_progress"),
    );
    const linkedDetail = makeDetail(
      linked,
      makeTurn(linked.id, "turn-completed", "completed"),
    );
    const { provider, api } = createProvider({
      listThreads: vi.fn(async () => [current, linked]),
      getThreadDetail: vi.fn(async (threadId: string) => (
        threadId === current.id ? currentDetail : linkedDetail
      )),
    });
    provider.sessionState.update({
      currentThread: current,
      currentSessionId: "session-deleted",
      messages: [{
        id: "message-1",
        role: "assistant",
        content: "This must disappear",
        status: "complete",
        timestamp: Date.now(),
      }],
    });

    await provider.handleDeleteSession("session-deleted", "Deleted session");

    expect(api.deleteSession).toHaveBeenCalledWith("session-deleted");
    expect(api.interruptTurn).toHaveBeenCalledWith(current.id, "turn-active");
    expect(api.updateThread).toHaveBeenCalledWith(current.id, { archived: true });
    expect(api.updateThread).toHaveBeenCalledWith(linked.id, { archived: true });
    expect(provider.currentThread).toBeNull();
    expect(provider.messages).toEqual([]);
    expect(provider.postMessage).toHaveBeenCalledWith({ type: "clearChat" });
    expect(provider.postMessage).toHaveBeenCalledWith({ type: "status", text: "Ready" });
    expect(vscodeState.showErrorMessage).not.toHaveBeenCalled();
  });

  it("closes a snapshot-only session opened from the Sessions panel", async () => {
    const { provider, api } = createProvider({
      listThreads: vi.fn(async () => []),
    });
    provider.sessionState.update({
      currentThread: null,
      viewingSessionId: "session-panel-open",
      currentSessionId: null,
      messages: [{
        id: "message-from-snapshot",
        role: "assistant",
        content: "Deleted snapshot content",
        status: "complete",
        timestamp: Date.now(),
      }],
    });

    await provider.handleDeleteSession("session-panel-open", "Panel session");

    expect(api.deleteSession).toHaveBeenCalledWith("session-panel-open");
    expect(provider.currentThread).toBeNull();
    expect(provider.sessionState.data.viewingSessionId).toBeNull();
    expect(provider.sessionState.data.currentSessionId).toBeNull();
    expect(provider.messages).toEqual([]);
    expect(provider.postMessage).toHaveBeenCalledWith({ type: "clearChat" });
    expect(provider.postMessage).toHaveBeenCalledWith({ type: "status", text: "Ready" });
  });
});
