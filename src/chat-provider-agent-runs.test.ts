import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({ get: (_key: string, fallback?: unknown) => fallback })),
    workspaceFolders: undefined,
  },
  window: { showErrorMessage: vi.fn() },
  commands: { executeCommand: vi.fn() },
  env: { language: "en" },
  Uri: { file: (fsPath: string) => ({ fsPath }), parse: (value: string) => ({ toString: () => value }) },
  ConfigurationTarget: { Global: "global" },
}));

import { ChatProvider } from "./chat-provider";

function receipt(status: string, latest: string) {
  return {
    status,
    latest_message: latest,
    parent_run_id: null,
    spec: {
      worker_id: "agent_current",
      run_id: "agent_current",
      session_name: "lane-current",
      objective: "Inspect current conversation",
    },
  };
}

function currentConversationMessages() {
  return [{
    id: "message-agent",
    role: "assistant",
    content: "",
    status: "complete",
    timestamp: 1,
    toolCalls: [{
      name: "agent",
      input: { name: "lane-current", prompt: "Inspect current conversation" },
      output: "started agent_current",
      status: "complete",
    }],
  }] as any;
}

describe("ChatProvider agent receipt refresh ordering", () => {
  it("prevents an older refresh from overwriting a newer receipt", async () => {
    let resolveOlder!: (value: unknown) => void;
    const older = new Promise((resolve) => { resolveOlder = resolve; });
    const api = {
      bindEngine: vi.fn(),
      listAgentRuns: vi
        .fn()
        .mockReturnValueOnce(older)
        .mockResolvedValueOnce({ runs: [receipt("completed", "new state")] }),
    };
    const provider = new ChatProvider({} as any, {} as any, api as any);
    provider.messages = currentConversationMessages();
    provider.postMessage = vi.fn();

    const first = provider.refreshAgentRuns();
    const second = provider.refreshAgentRuns();
    await second;
    resolveOlder({ runs: [receipt("running", "stale state")] });
    await first;

    const calls = (provider.postMessage as ReturnType<typeof vi.fn>).mock.calls
      .map((call) => call[0])
      .filter((message) => message.type === "agentRunList");
    expect(calls).toHaveLength(1);
    expect(calls[0].runs[0].status).toBe("completed");
    expect(calls[0].runs[0].latest_message).toBe("new state");
  });

  it("never republishes a raw fallback name after learning the real nickname", async () => {
    const api = {
      bindEngine: vi.fn(),
      listAgentRuns: vi.fn().mockResolvedValue({ runs: [receipt("running", "working")] }),
    };
    const provider = new ChatProvider({} as any, {} as any, api as any);
    provider.messages = currentConversationMessages();
    (provider as any).readPersistedSubagentState = vi.fn()
      .mockResolvedValueOnce({
        agents: [{ id: "agent_current", nickname: "Fin", checkpoint: null }],
      })
      .mockResolvedValueOnce(null);
    provider.postMessage = vi.fn();

    await provider.refreshAgentRuns();
    await provider.refreshAgentRuns();

    const lists = (provider.postMessage as ReturnType<typeof vi.fn>).mock.calls
      .map((call) => call[0])
      .filter((posted) => posted.type === "agentRunList");
    expect(lists).toHaveLength(2);
    expect(lists.map((posted) => posted.runs[0].nickname)).toEqual(["Fin", "Fin"]);
    provider.dispose();
  });

  it("advances all receipt fallbacks while preserving real checkpoint output", async () => {
    const multiReceipt = (id: string, name: string, latest: string) => ({
      ...receipt("model_wait", latest),
      spec: {
        worker_id: id,
        run_id: id,
        session_name: name,
        objective: `Inspect ${name}`,
      },
    });
    const api = {
      bindEngine: vi.fn(),
      listAgentRuns: vi.fn()
        .mockResolvedValueOnce({ runs: [
          multiReceipt("agent-a", "lane-a", "step 2: requesting model response"),
          multiReceipt("agent-b", "lane-b", "step 20: running tool"),
          multiReceipt("agent-c", "lane-c", "step 1: requesting model response"),
        ] })
        .mockResolvedValueOnce({ runs: [
          multiReceipt("agent-a", "lane-a", "step 32: requesting model response"),
          multiReceipt("agent-b", "lane-b", "step 33: requesting model response"),
          multiReceipt("agent-c", "lane-c", "step 27: requesting model response"),
        ] }),
    };
    const provider = new ChatProvider({} as any, {} as any, api as any);
    provider.messages = [{
      id: "message-agents",
      role: "assistant",
      content: "",
      status: "complete",
      timestamp: 1,
      toolCalls: ["a", "b", "c"].map((lane) => ({
        name: "agent",
        input: { name: `lane-${lane}`, prompt: `Inspect lane-${lane}` },
        output: `started agent-${lane}`,
        status: "complete",
      })),
    }] as any;
    const state = {
      agents: [
        {
          id: "agent-a",
          nickname: "A",
          checkpoint: {
            message_count: 1,
            messages: [{ role: "assistant", content: [{ type: "thinking", thinking: "hidden" }] }],
          },
        },
        {
          id: "agent-b",
          nickname: "B",
          checkpoint: {
            message_count: 1,
            messages: [{ role: "assistant", content: [{ type: "text", text: "B checkpoint one" }] }],
          },
        },
        {
          id: "agent-c",
          nickname: "C",
          checkpoint: {
            message_count: 1,
            messages: [{ role: "assistant", content: [{ type: "tool_use", name: "read_file" }] }],
          },
        },
      ],
    };
    (provider as any).readPersistedSubagentState = vi.fn().mockResolvedValue(state);
    provider.postMessage = vi.fn();

    await provider.refreshAgentRuns();
    (state.agents[1].checkpoint.messages[0].content[0] as any).text = "B checkpoint two";
    await provider.refreshAgentRuns();

    const lists = (provider.postMessage as ReturnType<typeof vi.fn>).mock.calls
      .map((call) => call[0])
      .filter((posted) => posted.type === "agentRunList");
    const latest = lists.at(-1).runs;
    expect(latest.map((run: any) => ({
      id: run.spec.run_id,
      latest_message: run.latest_message,
      latest_output: run.latest_output,
    }))).toEqual([
      { id: "agent-a", latest_message: "step 32: requesting model response", latest_output: null },
      { id: "agent-b", latest_message: "step 33: requesting model response", latest_output: "B checkpoint two" },
      { id: "agent-c", latest_message: "step 27: requesting model response", latest_output: null },
    ]);
    provider.dispose();
  });

  it("updates only the latest child card, then preserves it once root output follows", async () => {
    const api = {
      bindEngine: vi.fn(),
      listAgentRuns: vi.fn().mockResolvedValue({ runs: [receipt("running", "working")] }),
    };
    const provider = new ChatProvider({} as any, {} as any, api as any);
    const [message] = currentConversationMessages();
    message.status = "streaming";
    message.content = "Root before";
    message.blocks = [{ type: "text", content: "Root before" }];
    provider.messages = [message];
    (provider as any).currentTextBlockIdx = 0;
    const state = {
      agents: [{
        id: "agent_current",
        nickname: "Fin",
        checkpoint: {
          created_at_ms: 100,
          message_count: 1,
          omitted_messages: 0,
          messages: [{ role: "assistant", content: [{ type: "text", text: "Child update" }] }],
        },
      }],
    };
    (provider as any).readPersistedSubagentState = vi.fn().mockResolvedValue(state);
    provider.postMessage = vi.fn();

    await provider.refreshAgentRuns();
    await provider.refreshAgentRuns();

    expect(message.blocks.map((block: any) => block.type)).toEqual(["text", "subagent_transcript"]);
    expect(message.blocks[1].subagent).toMatchObject({ nickname: "Fin", content: "Child update" });
    const addCalls = (provider.postMessage as ReturnType<typeof vi.fn>).mock.calls
      .map((call) => call[0])
      .filter((posted) => posted.type === "addSubagentTranscriptBlock");
    expect(addCalls).toHaveLength(1);

    state.agents[0].checkpoint.messages[0].content[0].text = "Child update expanded";
    await provider.refreshAgentRuns();
    expect(message.blocks).toHaveLength(2);
    expect(message.blocks[1].subagent.content).toBe("Child update expanded");
    expect((provider.postMessage as ReturnType<typeof vi.fn>).mock.calls
      .map((call) => call[0].type)).toContain("updateSubagentTranscriptBlock");

    state.agents[0].checkpoint.message_count = 2;
    state.agents[0].checkpoint.messages.push({
      role: "assistant",
      content: [{ type: "text", text: "Second child response" }],
    });
    await provider.refreshAgentRuns();
    expect(message.blocks).toHaveLength(2);
    expect(message.blocks[1].subagent.content).toBe(
      "Child update expanded\n\nSecond child response",
    );

    (provider as any).handleItemEvent({
      event: "item.delta",
      item_id: "root-delta",
      payload: { kind: "agent_message", delta: "Root after" },
    });
    expect(message.blocks.map((block: any) => block.type)).toEqual([
      "text",
      "subagent_transcript",
      "text",
    ]);
    expect(message.blocks[2].content).toBe("Root after");

    state.agents[0].checkpoint.messages[1].content[0].text = "Second child response revised later";
    await provider.refreshAgentRuns();
    expect(message.blocks.map((block: any) => block.type)).toEqual([
      "text",
      "subagent_transcript",
      "text",
      "subagent_transcript",
    ]);
    expect(message.blocks[1].subagent.content).toBe(
      "Child update expanded\n\nSecond child response",
    );
    expect(message.blocks[3].subagent).toMatchObject({
      content: "Second child response revised later",
      source_id: "agent_current:1:0",
    });
    const finalAddCalls = (provider.postMessage as ReturnType<typeof vi.fn>).mock.calls
      .map((call) => call[0])
      .filter((posted) => posted.type === "addSubagentTranscriptBlock");
    expect(finalAddCalls).toHaveLength(2);

    provider.dispose();
  });

  it("updates an existing child card when its canonical profile becomes available", async () => {
    const run = receipt("running", "working");
    Object.assign(run.spec, {
      agent_type: "review",
      model: "deepseek-v4-pro",
      profile: null,
    });
    const api = {
      bindEngine: vi.fn(),
      listAgentRuns: vi.fn().mockImplementation(async () => ({ runs: [run] })),
    };
    const provider = new ChatProvider({} as any, {} as any, api as any);
    provider.messages = currentConversationMessages();
    (provider as any).readPersistedSubagentState = vi.fn().mockResolvedValue({
      agents: [{
        id: "agent_current",
        nickname: "Fin",
        checkpoint: {
          message_count: 1,
          messages: [{ role: "assistant", content: [{ type: "text", text: "Reviewing" }] }],
        },
      }],
    });
    provider.postMessage = vi.fn();

    await provider.refreshAgentRuns();
    (run.spec as typeof run.spec & { profile: string | null }).profile =
      "engineering-review-subagent";
    await provider.refreshAgentRuns();

    const updates = (provider.postMessage as ReturnType<typeof vi.fn>).mock.calls
      .map((call) => call[0])
      .filter((posted) => posted.type === "updateSubagentTranscriptBlock");
    expect(updates.at(-1)?.entry.profile).toBe("engineering-review-subagent");
    provider.dispose();
  });

  it("replays a completed child before the master's later final answer after session reload", async () => {
    const api = {
      bindEngine: vi.fn(),
      getSession: vi.fn().mockResolvedValue({
        metadata: {
          id: "session-reload",
          title: "Reload ordering",
          total_tokens: 0,
          model: "deepseek-v4-pro",
          mode: "agent",
        },
        messages: [
          {
            role: "assistant",
            content: [{
              type: "tool_use",
              id: "spawn-agent",
              name: "agent",
              input: { name: "lane-current", prompt: "Inspect current conversation" },
            }],
          },
          {
            role: "user",
            content: [{
              type: "tool_result",
              tool_use_id: "spawn-agent",
              content: "started agent_current",
              is_error: false,
            }],
          },
          {
            role: "assistant",
            content: [{ type: "text", text: "Master final answer" }],
          },
        ],
      }),
      listAgentRuns: vi.fn().mockResolvedValue({ runs: [{
        ...receipt("completed", "completed"),
        completed_at_ms: 150,
      }] }),
    };
    const provider = new ChatProvider({} as any, {} as any, api as any);
    (provider as any).readPersistedSubagentState = vi.fn().mockResolvedValue({
      agents: [{
        id: "agent_current",
        nickname: "Fin",
        checkpoint: {
          created_at_ms: 100,
          message_count: 1,
          omitted_messages: 0,
          messages: [{
            role: "assistant",
            content: [{ type: "text", text: "Child completed before the final answer" }],
          }],
        },
      }],
    });
    provider.postMessage = vi.fn();

    await provider.loadSessionMessages("session-reload");
    expect(provider.messages.some((message) =>
      message.blocks?.some((block: any) => block.type === "subagent_transcript")
    )).toBe(true);

    const childMessageIndex = provider.messages.findIndex((message) =>
      message.blocks?.some((block: any) => block.type === "subagent_transcript")
    );
    const finalMessageIndex = provider.messages.findIndex(
      (message) => message.content === "Master final answer",
    );
    expect(childMessageIndex).toBeGreaterThanOrEqual(0);
    expect(finalMessageIndex).toBeGreaterThan(childMessageIndex);
    expect(provider.messages[finalMessageIndex].blocks?.map((block) => block.type)).toEqual(["text"]);

    provider.dispose();
  });

  it("orders restored child cards by each subagent's last transcript update", () => {
    const provider = new ChatProvider({} as any, {} as any, { bindEngine: vi.fn() } as any);
    provider.postMessage = vi.fn();
    provider.messages = [
      {
        id: "assistant-agent-control",
        role: "assistant",
        content: "",
        status: "complete",
        timestamp: 1,
        toolCalls: [
          { name: "agent", input: {}, status: "complete" },
          { name: "agent", input: {}, status: "complete" },
        ],
        blocks: [
          { type: "tool_call", toolCallIdx: 0 },
          { type: "tool_call", toolCallIdx: 1 },
        ],
      },
      {
        id: "assistant-master-final",
        role: "assistant",
        content: "Master final answer",
        status: "complete",
        timestamp: 2,
        blocks: [{ type: "text", content: "Master final answer" }],
      },
    ] as any;
    (provider as any).restoringSubagentTranscriptHistory = true;

    (provider as any).applySubagentTranscriptEntries([
      {
        id: "agent_late:0:0",
        agent_id: "agent_late",
        nickname: "Late",
        status: "completed",
        agent_type: "general",
        model: "deepseek-v4-pro",
        content: "Updated later",
        message_index: 0,
        block_index: 0,
        last_update_at_ms: 300,
        checkpoint_created_at_ms: 300,
      },
      {
        id: "agent_early:0:0",
        agent_id: "agent_early",
        nickname: "Early",
        status: "completed",
        agent_type: "general",
        model: "deepseek-v4-pro",
        content: "Updated earlier",
        message_index: 0,
        block_index: 0,
        last_update_at_ms: 100,
        checkpoint_created_at_ms: 100,
      },
    ]);

    const restoredOrder = provider.messages[0].blocks
      ?.filter((block: any) => block.type === "subagent_transcript")
      .map((block: any) => block.subagent.agent_id);
    expect(restoredOrder).toEqual(["agent_early", "agent_late"]);
    expect(provider.messages[1].blocks?.map((block) => block.type)).toEqual(["text"]);

    provider.dispose();
  });

  it("keeps detached background-agent lifecycle events alive across parent turns", () => {
    const api = { bindEngine: vi.fn() };
    const provider = new ChatProvider({} as any, {} as any, api as any);
    (provider as any).currentTurnId = "turn-new";
    const refresh = vi.fn();
    (provider as any).requestAgentRunsRefresh = refresh;

    (provider as any).handleRuntimeEvent({
      seq: 9,
      event: "agent.progress",
      turn_id: "turn-old",
      payload: { agent_id: "agent_current" },
    });

    expect(refresh).toHaveBeenCalledWith(6);
    provider.dispose();
  });
});

describe("ChatProvider agent cancellation", () => {
  function cancellableReceipt(
    runId: string,
    workerId: string,
    status = "running",
  ) {
    return {
      status,
      latest_message: "working",
      parent_run_id: null,
      spec: {
        worker_id: workerId,
        run_id: runId,
        session_name: runId,
        objective: "Inspect current conversation",
      },
    } as any;
  }

  function makeCancellationProvider(runs: any[], cancelAgentRun = vi.fn().mockResolvedValue(undefined)) {
    const api = {
      bindEngine: vi.fn(),
      listAgentRuns: vi.fn().mockResolvedValue({ runs }),
      cancelAgentRun,
    };
    const provider = new ChatProvider({} as any, {} as any, api as any);
    provider.currentThread = { id: "thread-current" } as any;
    (provider as any).cachedScopedAgentRuns = runs;
    (provider as any).apiCapabilities.agentRunCancel = true;
    (provider as any).requestAgentRunsRefresh = vi.fn();
    provider.postMessage = vi.fn();
    return { provider, api };
  }

  it("routes an individual stop through the current thread using spec.worker_id", async () => {
    const run = cancellableReceipt("ui-run-id", "runtime-worker-id");
    const { provider, api } = makeCancellationProvider([run]);

    await (provider as any).handleWebviewMessage({ type: "stopAgent", runId: "ui-run-id" });

    expect(api.cancelAgentRun).toHaveBeenCalledWith("thread-current", "runtime-worker-id");
    expect(provider.postMessage).toHaveBeenCalledWith({
      type: "agentStopResult",
      runIds: ["ui-run-id"],
      failedRunIds: [],
    });
    expect((provider as any).requestAgentRunsRefresh).toHaveBeenCalledWith(6);
    provider.dispose();
  });

  it("refuses to stop an agent outside the current conversation", async () => {
    const { provider, api } = makeCancellationProvider([
      cancellableReceipt("scoped-run", "scoped-worker"),
    ]);

    await (provider as any).handleWebviewMessage({ type: "stopAgent", runId: "other-run" });

    expect(api.cancelAgentRun).not.toHaveBeenCalled();
    expect(provider.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "agentStopResult",
      runIds: ["other-run"],
      failedRunIds: ["other-run"],
      error: expect.stringContaining("current conversation"),
    }));
    provider.dispose();
  });

  it("refuses to cancel a terminal receipt", async () => {
    const { provider, api } = makeCancellationProvider([
      cancellableReceipt("done-run", "done-worker", "completed"),
    ]);

    await (provider as any).handleWebviewMessage({ type: "stopAgent", runId: "done-run" });

    expect(api.cancelAgentRun).not.toHaveBeenCalled();
    expect(provider.postMessage).toHaveBeenCalledWith({
      type: "agentStopResult",
      runIds: ["done-run"],
      failedRunIds: [],
    });
    expect(provider.postMessage).toHaveBeenCalledWith({
      type: "info",
      message: "That agent is already inactive.",
    });
    expect((provider as any).requestAgentRunsRefresh).toHaveBeenCalledWith(2);
    provider.dispose();
  });

  it("treats a parked waiting-for-user checkpoint as already inactive", async () => {
    const parked = {
      ...cancellableReceipt("parked-run", "parked-worker", "waiting_for_user"),
      completed_at_ms: 123,
      recommended_action: { action: "inspect_or_replace" },
    };
    const { provider, api } = makeCancellationProvider([parked]);

    await (provider as any).handleWebviewMessage({ type: "stopAgent", runId: "parked-run" });

    expect(api.cancelAgentRun).not.toHaveBeenCalled();
    expect(provider.postMessage).toHaveBeenCalledWith({
      type: "agentStopResult",
      runIds: ["parked-run"],
      failedRunIds: [],
    });
    expect(provider.postMessage).toHaveBeenCalledWith({
      type: "info",
      message: "That agent is already inactive.",
    });
    provider.dispose();
  });

  it("marks a live-looking receipt unavailable after an inactive-owner 409", async () => {
    const stale = {
      ...cancellableReceipt("stale-run", "stale-worker", "model_wait"),
      updated_at_ms: 42,
      completed_at_ms: null,
    };
    const cancelAgentRun = vi.fn().mockRejectedValue(
      new Error('API error 409: {"error":{"message":"Thread thread-current is not active"}}'),
    );
    const { provider, api } = makeCancellationProvider([stale], cancelAgentRun);

    await (provider as any).handleWebviewMessage({ type: "stopAgent", runId: "stale-run" });

    expect(api.cancelAgentRun).toHaveBeenCalledTimes(1);
    expect((provider as any).cachedScopedAgentRuns[0].runtime_available).toBe(false);
    expect(provider.postMessage).toHaveBeenCalledWith({
      type: "info",
      message: "That agent is no longer running because its previous runtime ended.",
    });
    expect(provider.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({
      type: "error",
    }));

    await (provider as any).refreshAgentRunsBeforeCancellation();
    expect((provider as any).cachedScopedAgentRuns[0].runtime_available).toBe(false);

    await (provider as any).handleWebviewMessage({ type: "stopAgent", runId: "stale-run" });
    expect(api.cancelAgentRun).toHaveBeenCalledTimes(1);
    provider.dispose();
  });

  it("stops every active scoped agent concurrently and reports partial failures", async () => {
    const cancelAgentRun = vi.fn((_threadId: string, workerId: string) => {
      if (workerId === "worker-b") return Promise.reject(new Error("worker already exited"));
      return Promise.resolve();
    });
    const { provider } = makeCancellationProvider([
      cancellableReceipt("run-a", "worker-a", "running"),
      cancellableReceipt("run-b", "worker-b", "model_wait"),
      cancellableReceipt("run-done", "worker-done", "completed"),
    ], cancelAgentRun);

    await (provider as any).handleWebviewMessage({ type: "stopAllAgents" });

    expect(cancelAgentRun).toHaveBeenCalledTimes(2);
    expect(cancelAgentRun).toHaveBeenCalledWith("thread-current", "worker-a");
    expect(cancelAgentRun).toHaveBeenCalledWith("thread-current", "worker-b");
    expect(cancelAgentRun).not.toHaveBeenCalledWith("thread-current", "worker-done");
    expect(provider.postMessage).toHaveBeenCalledWith({
      type: "agentStopResult",
      runIds: ["run-a", "run-b"],
      failedRunIds: ["run-b"],
      error: expect.stringContaining("run-b: worker already exited"),
      all: true,
    });
    expect((provider as any).requestAgentRunsRefresh).toHaveBeenCalledWith(6);
    provider.dispose();
  });

  it("bounds a hung Stop All cancellation and always releases the UI", async () => {
    vi.useFakeTimers();
    try {
      const never = new Promise<void>(() => {});
      const { provider } = makeCancellationProvider([
        cancellableReceipt("run-hung", "worker-hung", "running"),
      ], vi.fn(() => never));

      const stopping = (provider as any).handleWebviewMessage({ type: "stopAllAgents" });
      await vi.advanceTimersByTimeAsync(5001);
      await stopping;

      expect(provider.postMessage).toHaveBeenCalledWith({
        type: "agentStopResult",
        runIds: ["run-hung"],
        failedRunIds: ["run-hung"],
        error: expect.stringContaining("timed out after 5s"),
        all: true,
      });
      provider.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("exposes cancellation support to the webview only when the route is available", () => {
    const { provider } = makeCancellationProvider([]);
    expect((provider as any).getWebviewCapabilities().stopAgents).toBe(true);
    (provider as any).apiCapabilities.agentRunCancel = false;
    expect((provider as any).getWebviewCapabilities().stopAgents).toBe(false);
    provider.dispose();
  });
});
