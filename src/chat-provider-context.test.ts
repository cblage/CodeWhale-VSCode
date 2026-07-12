import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: (_key: string, fallback?: unknown) => fallback,
      update: vi.fn(async () => undefined),
    })),
    workspaceFolders: undefined,
  },
  commands: { executeCommand: vi.fn() },
  window: {},
  env: { language: "en" },
  Uri: {
    file: (fsPath: string) => ({ fsPath }),
    parse: (value: string) => ({ toString: () => value }),
  },
  ConfigurationTarget: { Global: "global" },
}));

import { ChatProvider } from "./chat-provider";
import type { RuntimeEvent, ThreadContextUsageResponse, ThreadRecord } from "./types";

function makeThread(id: string): ThreadRecord {
  return {
    schema_version: 1,
    id,
    created_at: "2026-07-12T00:00:00Z",
    updated_at: "2026-07-12T00:00:00Z",
    model: "deepseek-v4-pro",
    workspace: "/tmp/repo",
    mode: "yolo",
    allow_shell: true,
    trust_mode: true,
    auto_approve: true,
    latest_turn_id: null,
    archived: false,
    coherence_state: "healthy",
  };
}

function makeUsage(threadId = "thread-1"): ThreadContextUsageResponse {
  return {
    thread_id: threadId,
    provider: "deepseek",
    model: "deepseek-v4-pro",
    estimated_input_tokens: 742_000,
    context_window_tokens: 1_000_000,
    remaining_context_tokens: 258_000,
    used_percent: 74.2,
    auto_compact_enabled: true,
    auto_compact_threshold_tokens: 900_000,
    auto_compact_threshold_percent: 90,
    source: "estimated_current_messages",
  };
}

function createProvider(getThreadContext = vi.fn(async () => makeUsage())) {
  const api = {
    bindEngine: vi.fn(),
    getThreadContext,
    compactThread: vi.fn(async () => undefined),
  };
  const provider = new ChatProvider({} as any, {} as any, api as any);
  provider.postMessage = vi.fn();
  (provider as any).debugLog = vi.fn();
  provider.currentThread = makeThread("thread-1");
  return { provider, api, postMessage: provider.postMessage as ReturnType<typeof vi.fn> };
}

describe("ChatProvider context usage bridge", () => {
  it("posts the authoritative endpoint result for the current thread", async () => {
    const { provider, api, postMessage } = createProvider();

    await (provider as any).refreshContextUsage();

    expect(api.getThreadContext).toHaveBeenCalledWith("thread-1");
    expect(postMessage).toHaveBeenCalledWith({
      type: "contextUsage",
      available: true,
      usage: makeUsage(),
    });
  });

  it("discards a late context response after the selected thread changes", async () => {
    let resolveUsage!: (usage: ThreadContextUsageResponse) => void;
    const request = new Promise<ThreadContextUsageResponse>((resolve) => {
      resolveUsage = resolve;
    });
    const { provider, postMessage } = createProvider(vi.fn(() => request));

    const refresh = (provider as any).refreshContextUsage();
    provider.currentThread = makeThread("thread-2");
    resolveUsage(makeUsage("thread-1"));
    await refresh;

    expect(postMessage).not.toHaveBeenCalled();
  });

  it("degrades a missing endpoint to unavailable without an error banner", async () => {
    const { provider, postMessage } = createProvider(
      vi.fn(async () => { throw new Error("API error 404: not found"); }),
    );

    await (provider as any).refreshContextUsage();

    expect(postMessage).toHaveBeenCalledWith({ type: "contextUsage", available: false });
    expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "error" }));
  });

  it("routes a live context.updated event directly to the donut", () => {
    const { provider, postMessage } = createProvider();
    const usage = makeUsage();
    const event: RuntimeEvent = {
      seq: 12,
      timestamp: "2026-07-12T00:00:01Z",
      thread_id: "thread-1",
      turn_id: null,
      item_id: null,
      event: "context.updated",
      payload: usage as unknown as Record<string, unknown>,
    };

    (provider as any).handleRuntimeEvent(event);

    expect(postMessage).toHaveBeenCalledWith({
      type: "contextUsage",
      available: true,
      usage,
    });
  });

  it("clears the donut when there is no selected thread", async () => {
    const { provider, postMessage } = createProvider();
    provider.currentThread = null;

    await (provider as any).refreshContextUsage();

    expect(postMessage).toHaveBeenCalledWith({ type: "contextUsage", available: false });
  });
});
