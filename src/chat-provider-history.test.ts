import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: (_key: string, fallback?: unknown) => fallback,
      update: vi.fn(async () => undefined),
    })),
    workspaceFolders: undefined,
  },
  commands: {
    executeCommand: vi.fn(),
  },
  window: {},
  env: {
    language: "en",
  },
  Uri: {
    file: (fsPath: string) => ({ fsPath }),
    parse: (value: string) => ({ toString: () => value }),
  },
  ConfigurationTarget: {
    Global: "global",
  },
}));

import { ChatProvider } from "./chat-provider";

function createProvider(detail: Record<string, unknown>) {
  const api = {
    bindEngine: vi.fn(),
    getThreadDetail: vi.fn(async () => detail),
    getSession: vi.fn(async () => detail),
  };

  const provider = new ChatProvider({} as any, {} as any, api as any);
  provider.postMessage = vi.fn();
  provider.refreshWorkPanel = vi.fn();

  return { provider, api, postMessage: provider.postMessage as any };
}

describe("ChatProvider thread history rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips blank user bubbles for tool_result-only turns", async () => {
    const detail = {
      latest_seq: 12,
      thread: { id: "thread-1", model: "deepseek-v4-pro" },
      turns: [
        {
          id: "turn-1",
          input_summary: "",
          created_at: "2026-06-18T10:00:00Z",
          ended_at: "2026-06-18T10:00:02Z",
          status: "completed",
          item_ids: ["tool-call-1", "tool-result-1", "assistant-1"],
        },
      ],
      items: [
        {
          id: "tool-call-1",
          kind: "tool_call",
          summary: "read_file: a.txt",
          detail: null,
          status: "completed",
          metadata: {
            tool_use_id: "tool-1",
            path: "a.txt",
          },
        },
        {
          id: "tool-result-1",
          kind: "tool_call",
          summary: "contents from a.txt",
          detail: "hello world",
          status: "completed",
          metadata: {
            tool_result_for: "tool-1",
            is_error: false,
          },
        },
        {
          id: "assistant-1",
          kind: "agent_message",
          summary: "Done",
          detail: "Done",
          status: "completed",
          metadata: null,
        },
      ],
    };

    const { provider, postMessage } = createProvider(detail);

    const loadedCount = await (provider as any).loadHistory("thread-1");

    expect(loadedCount).toBe(12);
    expect(provider.messages).toHaveLength(1);
    expect(provider.messages[0].role).toBe("assistant");
    expect(provider.messages[0].content).toBe("Done");
    expect(provider.messages[0].toolCalls).toHaveLength(1);
    expect(provider.messages[0].toolCalls?.[0].output).toBe("hello world");
    expect(postMessage).toHaveBeenCalledWith({
      type: "loadHistory",
      messages: provider.messages,
    });
  });

  it("restores an active backend turn and its running tool after reopening", async () => {
    const detail = {
      latest_seq: 24,
      thread: {
        id: "thread-1",
        model: "deepseek-v4-pro",
        latest_turn_id: "turn-running",
      },
      turns: [{
        id: "turn-running",
        input_summary: "Review the project",
        created_at: "2026-07-11T05:00:00Z",
        ended_at: null,
        status: "in_progress",
        item_ids: ["user-running", "agent-running", "tool-running"],
      }],
      items: [
        {
          id: "user-running",
          kind: "user_message",
          summary: "Review the project",
          detail: "Review the project",
          status: "completed",
          metadata: null,
        },
        {
          id: "agent-running",
          kind: "agent_message",
          summary: "I am checking it.",
          detail: "I am checking it.",
          status: "completed",
          metadata: null,
        },
        {
          id: "tool-running",
          kind: "tool_call",
          summary: "read_file: src/app.ts",
          detail: null,
          status: "in_progress",
          metadata: { tool_use_id: "tool-use-running", path: "src/app.ts" },
        },
      ],
    };
    const { provider, postMessage } = createProvider(detail);

    await (provider as any).loadHistory("thread-1");

    expect((provider as any).sessionState.data.currentTurnId).toBe("turn-running");
    expect(provider.messages.at(-1)).toEqual(expect.objectContaining({
      id: "assistant-turn-running",
      role: "assistant",
      status: "streaming",
    }));
    expect(provider.messages.at(-1)?.toolCalls?.[0].status).toBe("running");
    expect((provider as any).activeItems.get("tool-running")).toEqual(
      expect.objectContaining({
        msgId: "assistant-turn-running",
        toolCallIdx: 0,
      }),
    );
    expect(postMessage).toHaveBeenCalledWith({
      type: "turnStarted",
      turnId: "turn-running",
    });
  });

  it("restores steer messages at their chronological position inside a turn", async () => {
    const detail = {
      latest_seq: 28,
      thread: { id: "thread-1", model: "deepseek-v4-pro", latest_turn_id: "turn-1" },
      turns: [{
        id: "turn-1",
        input_summary: "Initial request",
        created_at: "2026-07-11T05:00:00Z",
        ended_at: "2026-07-11T05:00:04Z",
        status: "completed",
        item_ids: ["user-initial", "agent-before", "user-steer", "agent-after"],
      }],
      items: [
        {
          id: "user-initial",
          kind: "user_message",
          summary: "Initial request",
          detail: "Initial request",
          status: "completed",
          metadata: null,
        },
        {
          id: "agent-before",
          kind: "agent_message",
          summary: "Before steer.",
          detail: "Before steer.",
          status: "completed",
          metadata: null,
        },
        {
          id: "user-steer",
          kind: "user_message",
          summary: "Focus on tests",
          detail: "Focus on tests",
          status: "completed",
          metadata: null,
        },
        {
          id: "agent-after",
          kind: "agent_message",
          summary: "After steer.",
          detail: "After steer.",
          status: "completed",
          metadata: null,
        },
      ],
    };
    const { provider } = createProvider(detail);

    await (provider as any).loadHistory("thread-1");

    expect(provider.messages).toHaveLength(2);
    expect(provider.messages[0]).toEqual(expect.objectContaining({
      role: "user",
      content: "Initial request",
    }));
    expect(provider.messages[1].blocks).toEqual([
      expect.objectContaining({ type: "text", content: "Before steer." }),
      { type: "steer", content: "Focus on tests", sourceId: "user-steer" },
      expect.objectContaining({ type: "text", content: "After steer." }),
    ]);
  });

  it("hides internal runtime-event user messages and adjacent turn metadata from thread history", async () => {
    const internalEvent = [
      '<codewhale:runtime_event kind="subagent_completion" visibility="internal">',
      "Child result for model coordination only.",
      "</codewhale:runtime_event>",
      "<turn_meta>Input provenance: subagent_handoff</turn_meta>",
    ].join("\n");
    const detail = {
      latest_seq: 29,
      thread: { id: "thread-1", model: "deepseek-v4-pro", latest_turn_id: "turn-2" },
      turns: [
        {
          id: "turn-1",
          input_summary: internalEvent,
          created_at: "2026-07-11T05:00:00Z",
          ended_at: "2026-07-11T05:00:01Z",
          status: "completed",
          item_ids: ["internal-opening", "internal-answer"],
        },
        {
          id: "turn-2",
          input_summary: "Visible request",
          created_at: "2026-07-11T05:00:02Z",
          ended_at: "2026-07-11T05:00:05Z",
          status: "completed",
          item_ids: [
            "visible-opening",
            "answer-before",
            "internal-steer-position",
            "adjacent-turn-meta",
            "answer-after",
          ],
        },
      ],
      items: [
        {
          id: "internal-opening",
          kind: "user_message",
          summary: internalEvent,
          detail: internalEvent,
          status: "completed",
          metadata: null,
        },
        {
          id: "internal-answer",
          kind: "agent_reasoning",
          summary: "Model-only follow-up.",
          detail: "Model-only follow-up.",
          status: "completed",
          metadata: null,
        },
        {
          id: "visible-opening",
          kind: "user_message",
          summary: "Visible request",
          detail: "Visible request",
          status: "completed",
          metadata: null,
        },
        {
          id: "answer-before",
          kind: "agent_message",
          summary: "Before event.",
          detail: "Before event.",
          status: "completed",
          metadata: null,
        },
        {
          id: "internal-steer-position",
          kind: "user_message",
          summary: internalEvent,
          detail: internalEvent,
          status: "completed",
          metadata: null,
        },
        {
          id: "adjacent-turn-meta",
          kind: "user_message",
          summary: "<turn_meta>Input authority: non_authoritative</turn_meta>",
          detail: "<turn_meta>Input authority: non_authoritative</turn_meta>",
          status: "completed",
          metadata: null,
        },
        {
          id: "answer-after",
          kind: "agent_message",
          summary: "After event.",
          detail: "After event.",
          status: "completed",
          metadata: null,
        },
      ],
    };
    const { provider } = createProvider(detail);

    await (provider as any).loadHistory("thread-1");

    const userMessages = provider.messages.filter((message) => message.role === "user");
    expect(userMessages).toHaveLength(1);
    expect(userMessages[0].content).toBe("Visible request");
    expect(JSON.stringify(provider.messages)).not.toContain("codewhale:runtime_event");
    expect(JSON.stringify(provider.messages)).not.toContain("turn_meta");
    expect(provider.messages.at(-1)?.blocks).toEqual([
      expect.objectContaining({
        type: "text",
        content: "Before event.After event.",
      }),
    ]);
    expect(provider.messages.at(-1)?.blocks?.some((block) => block.type === "steer")).toBe(false);
  });

  it("clears a stale running state when the backend turn finished while hidden", async () => {
    const detail = {
      latest_seq: 25,
      thread: {
        id: "thread-1",
        model: "deepseek-v4-pro",
        latest_turn_id: "turn-finished",
      },
      turns: [{
        id: "turn-finished",
        input_summary: "Done request",
        created_at: "2026-07-11T05:00:00Z",
        ended_at: "2026-07-11T05:00:03Z",
        status: "completed",
        item_ids: [],
      }],
      items: [],
    };
    const { provider, postMessage } = createProvider(detail);
    (provider as any).sessionState.data.currentTurnId = "turn-finished";

    await (provider as any).loadHistory("thread-1");

    expect((provider as any).sessionState.data.currentTurnId).toBeNull();
    expect(provider.messages.at(-1)?.status).toBe("complete");
    expect(postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "turnStarted" }),
    );
  });

  it("refreshes Send/Stop from the backend when the retained view becomes visible", async () => {
    const runningDetail = {
      latest_seq: 30,
      thread: {
        id: "thread-1",
        model: "deepseek-v4-pro",
        latest_turn_id: "turn-visible",
      },
      turns: [{
        id: "turn-visible",
        input_summary: "Keep working",
        created_at: "2026-07-11T05:10:00Z",
        status: "in_progress",
        item_ids: [],
      }],
      items: [],
    };
    const { provider, api, postMessage } = createProvider(runningDetail);
    provider.currentThread = runningDetail.thread as any;
    (provider as any).subscribeToEvents = vi.fn();
    (provider as any).startPeriodicTaskRefresh = vi.fn();
    (provider as any).stopPeriodicTaskRefresh = vi.fn();

    await (provider as any).refreshTurnState();

    expect((provider as any).sessionState.data.currentTurnId).toBe("turn-visible");
    expect(postMessage).toHaveBeenCalledWith({
      type: "turnState",
      turnInProgress: true,
      turnId: "turn-visible",
    });
    expect((provider as any).subscribeToEvents).toHaveBeenCalledOnce();

    api.getThreadDetail.mockResolvedValueOnce({
      ...runningDetail,
      thread: { ...runningDetail.thread, latest_turn_id: "turn-visible" },
      turns: [{ ...runningDetail.turns[0], status: "completed" }],
    });
    await (provider as any).refreshTurnState();

    expect((provider as any).sessionState.data.currentTurnId).toBeNull();
    expect(postMessage).toHaveBeenCalledWith({
      type: "turnState",
      turnInProgress: false,
      turnId: null,
    });
  });

  it("renders file-edit tool calls from session history as diff cards", async () => {
    const session = {
      metadata: {
        id: "sess-1",
        title: "Session with file edit",
        total_tokens: 123,
      },
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "edit src/app.ts" }],
        },
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "tool-edit-1",
              name: "write_file",
              input: { file_path: "src/app.ts" },
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "tool-edit-1",
              content: [
                "Updated src/app.ts",
                "diff --git a/src/app.ts b/src/app.ts",
                "--- a/src/app.ts",
                "+++ b/src/app.ts",
                "@@ -1 +1 @@",
                "-old line",
                "+new line",
              ].join("\n"),
            },
          ],
        },
        {
          role: "assistant",
          content: [{ type: "text", text: "done" }],
        },
      ],
    };

    const { provider, postMessage } = createProvider(session);

    await provider.loadSessionMessages("sess-1");

    expect(provider.messages[0].role).toBe("user");
    const assistantMsg = provider.messages.find(
      (message) => message.role === "assistant" && (message.toolCalls?.length || 0) > 0,
    );
    expect(assistantMsg).toBeDefined();
    if (!assistantMsg) {
      throw new Error("Expected assistant message with tool calls");
    }
    expect(assistantMsg.role).toBe("assistant");
    expect(assistantMsg.toolCalls).toHaveLength(1);
    expect(assistantMsg.toolCalls?.[0].fileChange).toEqual(
      expect.objectContaining({
        filePath: "src/app.ts",
        changeType: "modified",
        toolName: "write_file",
      }),
    );
    expect(assistantMsg.toolCalls?.[0].fileChange?.diff).toContain("diff --git a/src/app.ts b/src/app.ts");
    expect(postMessage).toHaveBeenCalledWith({
      type: "loadHistory",
      messages: provider.messages,
      compactMode: true,
    });
  });

  it("hides persisted internal runtime-event user messages and their sibling turn metadata", async () => {
    const session = {
      metadata: {
        id: "sess-1",
        title: "Session with internal event",
        total_tokens: 456,
      },
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "Visible request" }],
        },
        {
          role: "assistant",
          content: [{ type: "text", text: "Master response before child completion." }],
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: '<codewhale:runtime_event kind="watchdog_nudge" visibility="internal">internal payload</codewhale:runtime_event>',
            },
            {
              type: "text",
              text: "<turn_meta>Input provenance: subagent_handoff</turn_meta>",
            },
          ],
        },
        {
          role: "assistant",
          content: [{ type: "thinking", thinking: "Correctly retained metacognition." }],
        },
      ],
    };
    const { provider } = createProvider(session);

    await provider.loadSessionMessages("sess-1");

    expect(provider.messages.filter((message) => message.role === "user")).toEqual([
      expect.objectContaining({ content: "Visible request" }),
    ]);
    expect(JSON.stringify(provider.messages)).not.toContain("codewhale:runtime_event");
    expect(JSON.stringify(provider.messages)).not.toContain("turn_meta");
    expect(JSON.stringify(provider.messages)).toContain("Correctly retained metacognition.");
  });
});
