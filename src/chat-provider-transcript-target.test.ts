import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: (_key: string, fallback?: unknown) => fallback,
      update: vi.fn(async () => undefined),
    })),
    workspaceFolders: [{ uri: { fsPath: "/workspace" } }],
  },
  commands: { executeCommand: vi.fn() },
  window: {
    showWarningMessage: vi.fn(async () => undefined),
  },
  env: { language: "en" },
  Uri: {
    file: (fsPath: string) => ({ fsPath }),
    parse: (value: string) => ({ toString: () => value }),
  },
  ConfigurationTarget: { Global: "global" },
}));

import { ChatProvider } from "./chat-provider";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeSession(id: string, text = id) {
  return {
    metadata: {
      id,
      title: id,
      model: "deepseek-v4-pro",
      mode: "yolo",
      total_tokens: 0,
    },
    messages: [{ role: "user", content: [{ type: "text", text }] }],
  };
}

function createProvider(target?: unknown) {
  const workspaceState = {
    get: vi.fn((_key: string) => target),
    update: vi.fn(async (_key: string, _value?: unknown) => undefined),
  };
  const api = {
    bindEngine: vi.fn(),
    ensureReady: vi.fn(async () => undefined),
    listThreads: vi.fn(async () => []),
    getThread: vi.fn(),
    getThreadDetail: vi.fn(),
    getSession: vi.fn(),
  };
  const provider = new ChatProvider(
    {} as any,
    { baseUrl: "http://runtime" } as any,
    api as any,
    workspaceState as any,
  );
  (provider as any).postMessage = vi.fn();
  (provider as any).refreshRuntimeVersion = vi.fn(async () => undefined);
  (provider as any).refreshApiCapabilities = vi.fn(async () => undefined);
  (provider as any).refreshAgentRuns = vi.fn(async () => undefined);
  (provider as any).refreshWorkPanel = vi.fn();
  (provider as any).confirmSwitchWhenActive = vi.fn(async () => true);
  return { provider: provider as any, api, workspaceState };
}

describe("ChatProvider deterministic transcript target", () => {
  beforeEach(() => vi.clearAllMocks());

  it("restores the exact saved-session target before heuristic thread selection", async () => {
    const { provider, api } = createProvider({
      version: 1,
      kind: "session",
      id: "session-selected",
    });
    provider.loadSessionMessages = vi.fn(async () => "loaded");
    provider.postReadyState = vi.fn();

    await provider.initializeThread();

    expect(provider.loadSessionMessages).toHaveBeenCalledWith(
      "session-selected",
      expect.objectContaining({
        confirmSwitch: false,
        persistTarget: false,
        silent: true,
      }),
    );
    expect(api.listThreads).not.toHaveBeenCalled();
    expect(provider.postReadyState).toHaveBeenCalledOnce();
  });

  it("restores an exact thread target and keeps an explicit empty target empty", async () => {
    const threadCase = createProvider({ version: 1, kind: "thread", id: "thread-selected" });
    threadCase.provider.loadThread = vi.fn(async () => "loaded");
    threadCase.provider.postReadyState = vi.fn();
    await threadCase.provider.initializeThread();
    expect(threadCase.provider.loadThread).toHaveBeenCalledWith(
      "thread-selected",
      expect.objectContaining({ confirmSwitch: false, persistTarget: false, silent: true }),
    );
    expect(threadCase.api.listThreads).not.toHaveBeenCalled();

    const emptyCase = createProvider({ version: 1, kind: "empty" });
    emptyCase.provider.postReadyState = vi.fn();
    await emptyCase.provider.initializeThread();
    expect(emptyCase.api.listThreads).not.toHaveBeenCalled();
    expect(emptyCase.provider.currentThread).toBeNull();
    expect(emptyCase.provider.postMessage).toHaveBeenCalledWith({ type: "clearChat" });
  });

  it("uses stable newest-first ordering only when no exact target is stored", async () => {
    const { provider, api } = createProvider();
    const older = {
      id: "thread-older",
      workspace: "/workspace",
      latest_turn_id: "turn-old",
      created_at: "2026-07-10T12:00:00Z",
      updated_at: "2026-07-10T12:00:00Z",
    };
    const newer = {
      id: "thread-newer",
      workspace: "/workspace",
      latest_turn_id: "turn-new",
      created_at: "2026-07-11T12:00:00Z",
      updated_at: "2026-07-11T12:00:00Z",
    };
    api.listThreads.mockResolvedValue([older, newer] as any);
    provider.refreshSessionList = vi.fn(async () => []);
    provider.loadThread = vi.fn(async () => "loaded");
    provider.postReadyState = vi.fn();

    await provider.initializeThread();

    expect(provider.loadThread).toHaveBeenCalledWith(
      "thread-newer",
      expect.objectContaining({ knownThread: newer }),
    );
  });

  it("clears a confirmed-missing target but keeps a transiently unavailable one", async () => {
    const missing = createProvider({ version: 1, kind: "session", id: "gone" });
    missing.provider.loadSessionMessages = vi.fn(async () => "not-found");
    missing.provider.refreshSessionList = vi.fn(async () => []);
    missing.provider.postReadyState = vi.fn();
    await missing.provider.initializeThread();
    expect(missing.workspaceState.update.mock.calls[0][1]).toBeUndefined();
    expect(missing.workspaceState.update.mock.calls.at(-1)?.[1]).toEqual({
      version: 1,
      kind: "empty",
    });

    const transient = createProvider({ version: 1, kind: "session", id: "retry-me" });
    transient.provider.loadSessionMessages = vi.fn(async () => "failed");
    transient.provider.postReadyState = vi.fn();
    await transient.provider.initializeThread();
    expect(transient.workspaceState.update).not.toHaveBeenCalled();
    expect(transient.api.listThreads).not.toHaveBeenCalled();
  });

  it("ignores a stale session load that resolves after a newer selection", async () => {
    const { provider, api, workspaceState } = createProvider();
    const first = deferred<any>();
    const second = deferred<any>();
    api.getSession.mockImplementation((id: string) => (
      id === "session-a" ? first.promise : second.promise
    ));

    const loadA = provider.loadSessionMessages("session-a");
    await Promise.resolve();
    const loadB = provider.loadSessionMessages("session-b");
    await Promise.resolve();

    second.resolve(makeSession("session-b", "newer transcript"));
    expect(await loadB).toBe("loaded");
    first.resolve(makeSession("session-a", "stale transcript"));
    expect(await loadA).toBe("stale");

    expect(provider.sessionState.data.viewingSessionId).toBe("session-b");
    expect(provider.messages[0].content).toBe("newer transcript");
    expect(workspaceState.update).toHaveBeenCalledTimes(1);
    expect(workspaceState.update.mock.calls[0][1]).toEqual({
      version: 1,
      kind: "session",
      id: "session-b",
    });
  });

  it("replays the canonical in-memory transcript on webviewReady without refetching history", async () => {
    const { provider, api } = createProvider();
    provider.currentThread = { id: "thread-current", model: "deepseek-v4-pro", mode: "agent" };
    provider.messages = [{
      id: "assistant-1",
      role: "assistant",
      content: "canonical transcript",
      status: "complete",
      timestamp: 1,
    }];
    provider.refreshRuntimeDisplaySettings = vi.fn(async () => undefined);
    provider.refreshSkillCommands = vi.fn(async () => undefined);
    provider.refreshSessionList = vi.fn(async () => []);
    provider.refreshThreadList = vi.fn(async () => undefined);
    provider.refreshTaskList = vi.fn(async () => undefined);
    provider.subscribeToEvents = vi.fn();

    provider.initializationPromise = Promise.resolve();
    await provider.handleWebviewMessage({ type: "webviewReady" });

    expect(api.getThreadDetail).not.toHaveBeenCalled();
    expect(provider.postMessage).toHaveBeenCalledWith({
      type: "loadHistory",
      messages: provider.messages,
      compactMode: false,
    });
  });

  it("treats an archived exact thread as missing without replacing visible state", async () => {
    const { provider, api, workspaceState } = createProvider();
    provider.messages = [{
      id: "existing",
      role: "assistant",
      content: "keep me",
      status: "complete",
      timestamp: 1,
    }];
    api.getThread.mockResolvedValue({ id: "archived", archived: true });

    expect(await provider.loadThread("archived")).toBe("not-found");
    expect(provider.messages[0].content).toBe("keep me");
    expect(workspaceState.update).not.toHaveBeenCalled();
  });
});
