import { describe, expect, it } from "vitest";
import {
  collectConversationAgentRefs,
  enrichAgentRunsFromState,
  extractSubagentTranscriptEntries,
  filterAgentRunsForConversation,
  latestAssistantTranscriptText,
} from "./agent-runs";

function run(overrides: Record<string, unknown> = {}) {
  return {
    spec: {
      worker_id: "agent_a",
      run_id: "agent_a",
      parent_run_id: null,
      session_name: "lane-a",
      objective: "Inspect the parser",
      role: "reviewer",
      profile: "engineering-review-subagent",
      agent_type: "review",
      model: "deepseek-v4-pro",
      workspace: "/repo",
    },
    parent_run_id: null,
    status: "running",
    latest_message: "reading files",
    result_summary: null,
    error: null,
    artifacts: [],
    usage: { status: "unknown", input_tokens: null, output_tokens: null, budget_spent_tokens: null, budget_remaining_tokens: null },
    events: [],
    ...overrides,
  } as any;
}

describe("agent run conversation scoping", () => {
  it("collects unified agent names, prompts, and referenced ids", () => {
    const refs = collectConversationAgentRefs([{
      id: "m1",
      role: "assistant",
      content: "",
      status: "complete",
      timestamp: 1,
      toolCalls: [{
        name: "agent",
        input: { name: "lane-a", prompt: "Inspect the parser" },
        output: "started agent_a",
        status: "complete",
      }],
    }]);

    expect([...refs.names]).toEqual(["lane-a"]);
    expect([...refs.objectives]).toEqual(["Inspect the parser"]);
    expect(refs.ids.has("agent_a")).toBe(true);
  });

  it("keeps only conversation roots and their descendants", () => {
    const root = run();
    const child = run({
      spec: { ...root.spec, worker_id: "agent_child", run_id: "agent_child", session_name: "child" },
      parent_run_id: "agent_a",
    });
    const unrelated = run({
      spec: { ...root.spec, worker_id: "agent_other", run_id: "agent_other", session_name: "other", objective: "Other work" },
    });
    const refs = {
      ids: new Set<string>(),
      names: new Set(["lane-a"]),
      objectives: new Set<string>(),
    };

    expect(filterAgentRunsForConversation([root, child, unrelated], refs)).toEqual([root, child]);
  });
});

describe("persisted agent transcript enrichment", () => {
  const checkpoint = {
    message_count: 4,
    omitted_messages: 2,
    messages: [
      { role: "user", content: [{ type: "text", text: "Do the work" }] },
      { role: "assistant", content: [{ type: "thinking", thinking: "hidden" }, { type: "text", text: "Latest assistant output" }] },
    ],
  };

  it("extracts the latest assistant text from structured content", () => {
    expect(latestAssistantTranscriptText(checkpoint)).toBe("Latest assistant output");
  });

  it("adds the real nickname, latest output, and bounded transcript", () => {
    const [enriched] = enrichAgentRunsFromState([run()], {
      agents: [{
        id: "agent_a",
        nickname: "Fin",
        session_name: "lane-a",
        result: "Final result",
        checkpoint,
      }],
    }, true);

    expect(enriched.nickname).toBe("Fin");
    expect(enriched.latest_output).toBe("Latest assistant output");
    expect(enriched.persisted_result).toBe("Final result");
    expect(enriched.transcript).toEqual({
      source: "checkpoint",
      message_count: 4,
      omitted_messages: 2,
      messages: checkpoint.messages,
    });
  });

  it("projects stable assistant text entries without thinking or tool traffic", () => {
    const state = {
      agents: [{
        id: "agent_a",
        nickname: "Fin",
        checkpoint: {
          created_at_ms: 1234,
          message_count: 8,
          omitted_messages: 5,
          messages: [
            { role: "assistant", content: [{ type: "thinking", thinking: "hidden" }, { type: "text", text: "First visible update" }] },
            { role: "user", content: [{ type: "tool_result", content: "noisy" }] },
            { role: "assistant", content: [{ type: "text", text: "Same text" }, { type: "text", text: "Same text" }] },
          ],
        },
      }],
    };

    const entries = extractSubagentTranscriptEntries([run()], state);
    expect(entries.map((entry) => entry.id)).toEqual([
      "agent_a:5:1",
      "agent_a:7:0",
      "agent_a:7:1",
    ]);
    expect(entries.map((entry) => entry.content)).toEqual([
      "First visible update",
      "Same text",
      "Same text",
    ]);
    expect(entries[0]).toMatchObject({
      agent_id: "agent_a",
      nickname: "Fin",
      status: "running",
      runtime_available: undefined,
      profile: "engineering-review-subagent",
      session_name: "lane-a",
      checkpoint_created_at_ms: 1234,
    });
  });

  it("keeps an entry id stable while its latest text is updated", () => {
    const makeState = (text: string) => ({
      agents: [{
        id: "agent_a",
        checkpoint: {
          message_count: 4,
          omitted_messages: 3,
          messages: [{ role: "assistant", content: [{ type: "text", text }] }],
        },
      }],
    });

    const [before] = extractSubagentTranscriptEntries([run()], makeState("Partial"));
    const [after] = extractSubagentTranscriptEntries([run()], makeState("Partial response completed"));
    expect(after.id).toBe(before.id);
    expect(after.content).toBe("Partial response completed");
  });

  it("does not promote lifecycle activity into the sticky output cache", () => {
    const [enriched] = enrichAgentRunsFromState([run({
      latest_message: "step 32: requesting model response",
      latest_output: undefined,
    })], {
      agents: [{
        id: "agent_a",
        nickname: "Fin",
        checkpoint: {
          message_count: 2,
          messages: [{
            role: "assistant",
            content: [{ type: "thinking", thinking: "not projected" }, { type: "tool_use" }],
          }],
        },
      }],
    });

    expect(enriched.latest_message).toBe("step 32: requesting model response");
    expect(enriched.latest_output).toBeNull();
  });
});
