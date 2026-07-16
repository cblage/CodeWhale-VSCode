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
    syncFromEngine: vi.fn(),
    listThreads: vi.fn(async () => []),
    listThreadsSummary: vi.fn(async () => []),
    listSessions: vi.fn(async () => ({ sessions: [] })),
    getThreadDetail: vi.fn(),
    deleteSession: vi.fn(async () => undefined),
    interruptTurn: vi.fn(async () => undefined),
    updateThread: vi.fn(async (id: string, patch: Partial<ThreadRecord>) => ({ id, ...patch })),
    ...apiOverrides,
  };
  const engine = { baseUrl: "http://127.0.0.1:7878", isRunning: true };
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
    const callOrder: string[] = [];
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
    const { provider, api } = createProvider({
      syncFromEngine: vi.fn(() => { callOrder.push("sync"); }),
      listThreads: vi.fn(async () => {
        callOrder.push("listThreads");
        return [current, linked];
      }),
      deleteSession: vi.fn(async () => { callOrder.push("deleteSession"); }),
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
    provider.currentTurnId = "turn-active";

    await provider.handleDeleteSession("session-deleted", "Deleted session");

    expect(vscodeState.showWarningMessage).toHaveBeenCalledWith(
      "Delete session?",
      {
        modal: true,
        detail: 'This will permanently delete the session "Deleted session". This cannot be undone.',
      },
      "Delete",
    );
    expect(callOrder).toEqual(["sync", "deleteSession"]);
    expect(api.ensureReady).not.toHaveBeenCalled();
    expect(api.deleteSession).toHaveBeenCalledWith("session-deleted");
    expect(api.interruptTurn).toHaveBeenCalledWith(current.id, "turn-active");
    expect(api.listThreads).not.toHaveBeenCalled();
    expect(api.getThreadDetail).not.toHaveBeenCalled();
    expect(api.updateThread).not.toHaveBeenCalled();
    expect(provider.postMessage).toHaveBeenCalledWith({
      type: "sessionDeletePending",
      sessionId: "session-deleted",
    });
    expect(provider.currentThread).toBeNull();
    expect(provider.messages).toEqual([]);
    expect(provider.postMessage).toHaveBeenCalledWith({ type: "clearChat" });
    expect(provider.postMessage).toHaveBeenCalledWith({ type: "status", text: "Ready" });
    expect(vscodeState.showErrorMessage).not.toHaveBeenCalled();

    await provider.reconcileDeletedSessions();

    expect(api.updateThread).toHaveBeenCalledWith(current.id, { archived: true });
    expect(api.updateThread).toHaveBeenCalledWith(linked.id, { archived: true });
    expect(api.getThreadDetail).not.toHaveBeenCalled();
    expect(api.listThreadsSummary).not.toHaveBeenCalled();
    expect(api.listSessions).toHaveBeenCalledOnce();
  });

  it("treats an already-missing session as deleted and reconciles stale rows", async () => {
    const current = makeThread({
      id: "thread-already-deleted",
      latest_turn_id: "turn-active",
      session_id: "session-already-deleted",
    });
    const { provider, api } = createProvider({
      listThreads: vi.fn(async () => [current]),
      deleteSession: vi.fn(async () => {
        throw new Error("API error 404: Not Found");
      }),
    });
    provider.sessionState.update({
      currentThread: current,
      currentSessionId: "session-already-deleted",
      messages: [{
        id: "message-stale",
        role: "assistant",
        content: "This stale session must disappear",
        status: "complete",
        timestamp: Date.now(),
      }],
    });
    provider.currentTurnId = "turn-active";

    await provider.handleDeleteSession("session-already-deleted", "Stale session");

    expect(api.interruptTurn).toHaveBeenCalledWith(current.id, "turn-active");
    expect(provider.currentThread).toBeNull();
    expect(provider.messages).toEqual([]);
    expect(provider.postMessage).toHaveBeenCalledWith({ type: "clearChat" });
    expect(api.listThreads).not.toHaveBeenCalled();

    await provider.reconcileDeletedSessions();

    expect(api.updateThread).toHaveBeenCalledWith(current.id, { archived: true });
    expect(api.listSessions).toHaveBeenCalled();
    expect(api.listThreadsSummary).not.toHaveBeenCalled();
    expect(vscodeState.setStatusBarMessage).toHaveBeenCalledWith("Session deleted", 3000);
    expect(vscodeState.showErrorMessage).not.toHaveBeenCalled();
  });

  it("preserves the current chat on a real deletion failure and still refreshes lists", async () => {
    const current = makeThread({
      id: "thread-delete-failed",
      latest_turn_id: "turn-completed",
      session_id: "session-delete-failed",
    });
    const originalMessages = [{
      id: "message-preserved",
      role: "assistant" as const,
      content: "Keep this after a real failure",
      status: "complete" as const,
      timestamp: Date.now(),
    }];
    const { provider, api } = createProvider({
      listThreads: vi.fn(async () => [current]),
      deleteSession: vi.fn(async () => {
        throw new Error("API error 500: Internal Server Error");
      }),
    });
    provider.sessionState.update({
      currentThread: current,
      currentSessionId: "session-delete-failed",
      messages: originalMessages,
    });

    await provider.handleDeleteSession("session-delete-failed", "Failed session");

    await provider.reconcileDeletedSessions();

    expect(provider.currentThread).toBe(current);
    expect(provider.messages).toEqual(originalMessages);
    expect(api.getThreadDetail).not.toHaveBeenCalled();
    expect(api.updateThread).not.toHaveBeenCalled();
    expect(provider.deletedSessionIds.has("session-delete-failed")).toBe(false);
    expect(provider.retiredThreadIds.has(current.id)).toBe(false);
    expect(api.listSessions).toHaveBeenCalled();
    expect(api.listThreadsSummary).not.toHaveBeenCalled();
    expect(vscodeState.setStatusBarMessage).not.toHaveBeenCalled();
    expect(vscodeState.showErrorMessage).toHaveBeenCalledWith(
      "Failed to delete session: API error 500: Internal Server Error",
    );
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

    await provider.reconcileDeletedSessions();

    expect(api.deleteSession).toHaveBeenCalledWith("session-panel-open");
    expect(provider.currentThread).toBeNull();
    expect(provider.sessionState.data.viewingSessionId).toBeNull();
    expect(provider.sessionState.data.currentSessionId).toBeNull();
    expect(provider.messages).toEqual([]);
    expect(provider.postMessage).toHaveBeenCalledWith({ type: "clearChat" });
    expect(provider.postMessage).toHaveBeenCalledWith({ type: "status", text: "Ready" });
  });

  it("deduplicates repeated clicks for the same session", async () => {
    let releaseDelete!: () => void;
    const deletePending = new Promise<void>((resolve) => { releaseDelete = resolve; });
    const { provider, api } = createProvider({
      deleteSession: vi.fn(async () => deletePending),
    });

    const first = provider.handleDeleteSession("session-duplicate", "Duplicate");
    await vi.waitFor(() => expect(api.deleteSession).toHaveBeenCalledOnce());
    const second = provider.handleDeleteSession("session-duplicate", "Duplicate");
    await second;

    expect(vscodeState.showWarningMessage).toHaveBeenCalledOnce();
    expect(api.deleteSession).toHaveBeenCalledOnce();

    releaseDelete();
    await first;
    await provider.reconcileDeletedSessions();
  });

  it("serializes destructive requests across different sessions", async () => {
    let releaseFirst!: () => void;
    const firstPending = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const calls: string[] = [];
    const { provider, api } = createProvider({
      deleteSession: vi.fn(async (sessionId: string) => {
        calls.push(sessionId);
        if (sessionId === "session-one") await firstPending;
      }),
    });

    const first = provider.handleDeleteSession("session-one", "One");
    await vi.waitFor(() => expect(api.deleteSession).toHaveBeenCalledOnce());
    const second = provider.handleDeleteSession("session-two", "Two");
    await Promise.resolve();

    expect(calls).toEqual(["session-one"]);

    releaseFirst();
    await Promise.all([first, second]);
    expect(calls).toEqual(["session-one", "session-two"]);
    await provider.reconcileDeletedSessions();
  });
});
