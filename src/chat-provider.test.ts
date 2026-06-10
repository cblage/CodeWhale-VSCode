import { describe, it, expect } from "vitest";
import { getModelPricing, calculateTurnCost, formatCostAmount } from "./cost-calculator";
import { parseDiffToSides } from "./diff-utils";
import { shouldRefreshTaskList, TASK_REFRESH_TOOL_NAMES } from "./tool-utils";

describe("Cost calculation", () => {
  describe("getModelPricing", () => {
    it("returns null for non-DeepSeek models", () => {
      expect(getModelPricing("gpt-4")).toBeNull();
      expect(getModelPricing("claude-3")).toBeNull();
      expect(getModelPricing("")).toBeNull();
    });

    it("returns flash pricing for deepseek-v4-flash", () => {
      const pricing = getModelPricing("deepseek-v4-flash");
      expect(pricing).not.toBeNull();
      expect(pricing!.inputCacheHitPerMillion).toBe(0.0028);
      expect(pricing!.inputCacheMissPerMillion).toBe(0.14);
      expect(pricing!.outputPerMillion).toBe(0.28);
    });

    it("returns flash pricing for deepseek-chat alias", () => {
      expect(getModelPricing("deepseek-chat")).not.toBeNull();
      expect(getModelPricing("deepseek-chat")!.inputCacheMissPerMillion).toBe(0.14);
    });

    it("returns pro pricing for deepseek-v4-pro", () => {
      const pricing = getModelPricing("deepseek-v4-pro");
      expect(pricing).not.toBeNull();
    });

    it("is case-insensitive", () => {
      expect(getModelPricing("DeepSeek-V4-Pro")).not.toBeNull();
      expect(getModelPricing("DEEPSEEK-V4-FLASH")).not.toBeNull();
    });

    it("recognizes v4pro without hyphen", () => {
      const pricing = getModelPricing("deepseek-v4pro");
      expect(pricing).not.toBeNull();
    });
  });

  describe("calculateTurnCost", () => {
    it("returns null for non-DeepSeek model", () => {
      expect(calculateTurnCost("gpt-4", 1000, 500)).toBeNull();
    });

    it("calculates cost for flash model with cache hit", () => {
      const cost = calculateTurnCost("deepseek-v4-flash", 10000, 2000, 8000, 2000);
      expect(cost).not.toBeNull();
      expect(cost!.usd).toBeGreaterThan(0);
      expect(cost!.cny).toBeGreaterThan(0);
    });

    it("calculates cost for flash model without cache info", () => {
      const cost = calculateTurnCost("deepseek-v4-flash", 10000, 2000);
      expect(cost).not.toBeNull();
      expect(cost!.usd).toBeGreaterThan(0);
    });

    it("includes reasoning tokens in output cost", () => {
      const costWithoutReasoning = calculateTurnCost("deepseek-v4-flash", 1000, 500, 0, 1000);
      const costWithReasoning = calculateTurnCost("deepseek-v4-flash", 1000, 500, 0, 1000, 300);
      expect(costWithReasoning!.usd).toBeGreaterThan(costWithoutReasoning!.usd);
    });

    it("handles zero tokens", () => {
      const cost = calculateTurnCost("deepseek-v4-flash", 0, 0, 0, 0);
      expect(cost).not.toBeNull();
      expect(cost!.usd).toBe(0);
      expect(cost!.cny).toBe(0);
    });

    it("cache hit is cheaper than cache miss", () => {
      const allHit = calculateTurnCost("deepseek-v4-flash", 10000, 1000, 10000, 0);
      const allMiss = calculateTurnCost("deepseek-v4-flash", 10000, 1000, 0, 10000);
      expect(allHit!.usd).toBeLessThan(allMiss!.usd);
    });

    it("CNY cost is higher than USD cost for same tokens", () => {
      const cost = calculateTurnCost("deepseek-v4-flash", 10000, 2000, 5000, 5000);
      expect(cost!.cny).toBeGreaterThan(cost!.usd);
    });
  });

  describe("formatCostAmount", () => {
    it("formats very small costs with < symbol", () => {
      expect(formatCostAmount(0.00001, "usd")).toBe("<$0.0001");
      expect(formatCostAmount(0.00001, "cny")).toBe("<¥0.0001");
    });

    it("formats small costs with 4 decimal places", () => {
      expect(formatCostAmount(0.005, "usd")).toBe("$0.0050");
      expect(formatCostAmount(0.005, "cny")).toBe("¥0.0050");
    });

    it("formats normal costs with 2 decimal places", () => {
      expect(formatCostAmount(1.5, "usd")).toBe("$1.50");
      expect(formatCostAmount(12.345, "cny")).toBe("¥12.35");
    });

    it("formats zero cost", () => {
      expect(formatCostAmount(0, "usd")).toBe("<$0.0001");
    });

    it("formats large costs", () => {
      expect(formatCostAmount(100, "usd")).toBe("$100.00");
      expect(formatCostAmount(999.99, "cny")).toBe("¥999.99");
    });
  });
});

describe("Event handling state machine", () => {
  interface WorkState {
    cycleCount: number;
    checklistItems: { id: string; content: string; status: string }[];
    checklistCompletionPct: number;
    coherenceState: string;
    coherenceLabel: string;
  }

  function createInitialWorkState(): WorkState {
    return {
      cycleCount: 0,
      checklistItems: [],
      checklistCompletionPct: 0,
      coherenceState: "healthy",
      coherenceLabel: "",
    };
  }

  it("initializes with default state", () => {
    const state = createInitialWorkState();
    expect(state.cycleCount).toBe(0);
    expect(state.checklistItems).toHaveLength(0);
    expect(state.checklistCompletionPct).toBe(0);
    expect(state.coherenceState).toBe("healthy");
    expect(state.coherenceLabel).toBe("");
  });

  it("updates cycle count on cycle.advanced event", () => {
    const state = createInitialWorkState();
    const payload = { from: 0, to: 1, cycle: 1 };
    state.cycleCount = payload.to ?? payload.cycle ?? 0;
    expect(state.cycleCount).toBe(1);
  });

  it("updates cycle count using 'to' field preferentially", () => {
    const state = createInitialWorkState();
    const payload = { from: 2, to: 5, cycle: 3 };
    state.cycleCount = payload.to ?? payload.cycle ?? 0;
    expect(state.cycleCount).toBe(5);
  });

  it("falls back to 'cycle' field when 'to' is missing", () => {
    const state = createInitialWorkState();
    const payload: { from?: number; to?: number; cycle?: number } = { from: 0, cycle: 7 };
    state.cycleCount = payload.to ?? payload.cycle ?? 0;
    expect(state.cycleCount).toBe(7);
  });

  it("updates coherence state on coherence.state event", () => {
    const state = createInitialWorkState();
    const payload = { state: "refreshing_context", label: "Refreshing context…" };
    state.coherenceState = payload.state || "healthy";
    state.coherenceLabel = payload.label || "";
    expect(state.coherenceState).toBe("refreshing_context");
    expect(state.coherenceLabel).toBe("Refreshing context…");
  });

  it("falls back to description when label is missing", () => {
    const state = createInitialWorkState();
    const payload = { state: "getting_crowded", description: "Context is getting crowded" };
    state.coherenceState = payload.state || "healthy";
    state.coherenceLabel = (payload as any).label || payload.description || "";
    expect(state.coherenceState).toBe("getting_crowded");
    expect(state.coherenceLabel).toBe("Context is getting crowded");
  });

  it("defaults coherence state to healthy when state is missing", () => {
    const state = createInitialWorkState();
    const payload = {};
    state.coherenceState = (payload as any).state || "healthy";
    expect(state.coherenceState).toBe("healthy");
  });

  it("updates checklist items from task_updates metadata", () => {
    const state = createInitialWorkState();
    const metadata = {
      task_updates: {
        checklist: {
          items: [
            { id: "1", content: "Step 1", status: "completed" },
            { id: "2", content: "Step 2", status: "in_progress" },
          ],
          completion_pct: 50,
        },
      },
    };
    const checklist = (metadata.task_updates as Record<string, unknown>).checklist;
    if (checklist && typeof checklist === "object") {
      const cl = checklist as Record<string, unknown>;
      if (Array.isArray(cl.items)) {
        state.checklistItems = cl.items as { id: string; content: string; status: string }[];
      }
      if (typeof cl.completion_pct === "number") {
        state.checklistCompletionPct = cl.completion_pct;
      }
    }
    expect(state.checklistItems).toHaveLength(2);
    expect(state.checklistCompletionPct).toBe(50);
    expect(state.checklistItems[0].status).toBe("completed");
  });

  it("resets all state on new thread", () => {
    const state: WorkState = {
      cycleCount: 5,
      checklistItems: [{ id: "1", content: "Done", status: "completed" }],
      checklistCompletionPct: 100,
      coherenceState: "refreshing_context",
      coherenceLabel: "Refreshing…",
    };
    state.cycleCount = 0;
    state.checklistItems = [];
    state.checklistCompletionPct = 0;
    state.coherenceState = "healthy";
    state.coherenceLabel = "";
    expect(state.cycleCount).toBe(0);
    expect(state.checklistItems).toHaveLength(0);
    expect(state.checklistCompletionPct).toBe(0);
    expect(state.coherenceState).toBe("healthy");
    expect(state.coherenceLabel).toBe("");
  });
});

describe("Tool call status transitions", () => {
  type ToolCallStatus = "pending" | "running" | "complete" | "error" | "awaiting_approval";

  interface ToolCallInfo {
    name: string;
    status: ToolCallStatus;
    output?: string;
    approvalId?: string;
  }

  it("transitions from running to complete", () => {
    const tc: ToolCallInfo = { name: "read_file", status: "running" };
    tc.status = "complete";
    tc.output = "file contents";
    expect(tc.status).toBe("complete");
    expect(tc.output).toBe("file contents");
  });

  it("transitions from running to awaiting_approval", () => {
    const tc: ToolCallInfo = { name: "exec_shell", status: "running" };
    tc.status = "awaiting_approval";
    tc.approvalId = "appr-1";
    expect(tc.status).toBe("awaiting_approval");
    expect(tc.approvalId).toBe("appr-1");
  });

  it("transitions from awaiting_approval to complete after approval", () => {
    const tc: ToolCallInfo = { name: "exec_shell", status: "awaiting_approval", approvalId: "appr-1" };
    tc.status = "complete";
    tc.output = "command output";
    expect(tc.status).toBe("complete");
  });

  it("tracks multiple tool calls in a single message", () => {
    const toolCalls: ToolCallInfo[] = [
      { name: "read_file", status: "complete", output: "contents" },
      { name: "exec_shell", status: "running" },
      { name: "write_file", status: "awaiting_approval", approvalId: "appr-2" },
    ];
    expect(toolCalls).toHaveLength(3);
    expect(toolCalls.filter((tc) => tc.status === "complete")).toHaveLength(1);
    expect(toolCalls.filter((tc) => tc.status === "running")).toHaveLength(1);
    expect(toolCalls.filter((tc) => tc.status === "awaiting_approval")).toHaveLength(1);
  });
});

describe("Task refresh trigger conditions", () => {
  it("triggers task refresh on agent tools", () => {
    for (const name of ["agent_open", "agent_spawn", "agent_close", "agent_cancel"]) {
      expect(shouldRefreshTaskList(name)).toBe(true);
    }
  });

  it("triggers task refresh on todo tools", () => {
    for (const name of ["todo_write", "todo_add", "todo_update"]) {
      expect(shouldRefreshTaskList(name)).toBe(true);
    }
  });

  it("triggers task refresh on checklist tools", () => {
    for (const name of ["checklist_write", "checklist_add", "checklist_update"]) {
      expect(shouldRefreshTaskList(name)).toBe(true);
    }
  });

  it("triggers task refresh on shell tools", () => {
    expect(shouldRefreshTaskList("task_shell_start")).toBe(true);
    expect(shouldRefreshTaskList("exec_shell")).toBe(true);
  });

  it("does not trigger task refresh on read-only tools", () => {
    for (const name of ["read_file", "grep_files", "project_map"]) {
      expect(shouldRefreshTaskList(name)).toBe(false);
    }
  });

  it("TASK_REFRESH_TOOL_NAMES set matches expected tools", () => {
    const expected = [
      "agent_open", "agent_spawn", "agent_close", "agent_cancel",
      "todo_write", "todo_add", "todo_update",
      "checklist_write", "checklist_add", "checklist_update",
      "task_shell_start", "exec_shell",
    ];
    for (const name of expected) {
      expect(TASK_REFRESH_TOOL_NAMES.has(name)).toBe(true);
    }
  });
});

describe("Session stats tracking", () => {
  interface SessionStats {
    sessionCostUsd: number;
    sessionCostCny: number;
    lastCacheHitTokens: number;
    lastCacheMissTokens: number;
    lastInputTokens: number;
    lastOutputTokens: number;
    totalInputTokens: number;
    totalOutputTokens: number;
  }

  function createInitialStats(): SessionStats {
    return {
      sessionCostUsd: 0,
      sessionCostCny: 0,
      lastCacheHitTokens: 0,
      lastCacheMissTokens: 0,
      lastInputTokens: 0,
      lastOutputTokens: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
    };
  }

  it("starts with zero values", () => {
    const stats = createInitialStats();
    expect(stats.sessionCostUsd).toBe(0);
    expect(stats.sessionCostCny).toBe(0);
    expect(stats.totalInputTokens).toBe(0);
    expect(stats.totalOutputTokens).toBe(0);
  });

  it("accumulates token counts across turns", () => {
    const stats = createInitialStats();
    const turn1 = { input_tokens: 1000, output_tokens: 500 };
    stats.lastInputTokens = turn1.input_tokens;
    stats.lastOutputTokens = turn1.output_tokens;
    stats.totalInputTokens += turn1.input_tokens;
    stats.totalOutputTokens += turn1.output_tokens;

    const turn2 = { input_tokens: 2000, output_tokens: 800 };
    stats.lastInputTokens = turn2.input_tokens;
    stats.lastOutputTokens = turn2.output_tokens;
    stats.totalInputTokens += turn2.input_tokens;
    stats.totalOutputTokens += turn2.output_tokens;

    expect(stats.totalInputTokens).toBe(3000);
    expect(stats.totalOutputTokens).toBe(1300);
    expect(stats.lastInputTokens).toBe(2000);
    expect(stats.lastOutputTokens).toBe(800);
  });

  it("accumulates cost across turns", () => {
    const stats = createInitialStats();
    const cost1 = calculateTurnCost("deepseek-v4-flash", 1000, 500)!;
    stats.sessionCostUsd += cost1.usd;
    stats.sessionCostCny += cost1.cny;

    const cost2 = calculateTurnCost("deepseek-v4-flash", 2000, 800)!;
    stats.sessionCostUsd += cost2.usd;
    stats.sessionCostCny += cost2.cny;

    expect(stats.sessionCostUsd).toBeGreaterThan(cost1.usd);
    expect(stats.sessionCostUsd).toBeCloseTo(cost1.usd + cost2.usd, 10);
  });

  it("resets on new session", () => {
    const stats = createInitialStats();
    stats.sessionCostUsd = 0.5;
    stats.totalInputTokens = 5000;
    stats.totalOutputTokens = 2000;

    stats.sessionCostUsd = 0;
    stats.sessionCostCny = 0;
    stats.lastCacheHitTokens = 0;
    stats.lastCacheMissTokens = 0;
    stats.lastInputTokens = 0;
    stats.lastOutputTokens = 0;
    stats.totalInputTokens = 0;
    stats.totalOutputTokens = 0;

    expect(stats.sessionCostUsd).toBe(0);
    expect(stats.totalInputTokens).toBe(0);
  });

  it("computes cache miss from input minus cache hit", () => {
    const inputTokens = 10000;
    const cacheHitTokens = 8000;
    const cacheMissTokens = Math.max(0, inputTokens - cacheHitTokens);
    expect(cacheMissTokens).toBe(2000);
  });

  it("handles case where cache hit exceeds input tokens gracefully", () => {
    const inputTokens = 5000;
    const cacheHitTokens = 8000;
    const cacheMissTokens = Math.max(0, inputTokens - cacheHitTokens);
    expect(cacheMissTokens).toBe(0);
  });
});

describe("Message model", () => {
  interface ChatMessage {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    thinking?: string;
    toolCalls?: { name: string; status: string }[];
    status: "streaming" | "complete" | "error";
    timestamp: number;
  }

  it("creates user message with complete status", () => {
    const msg: ChatMessage = {
      id: "msg-1",
      role: "user",
      content: "Hello",
      status: "complete",
      timestamp: Date.now(),
    };
    expect(msg.role).toBe("user");
    expect(msg.status).toBe("complete");
  });

  it("creates assistant message with streaming status", () => {
    const msg: ChatMessage = {
      id: "msg-2",
      role: "assistant",
      content: "",
      status: "streaming",
      timestamp: Date.now(),
    };
    expect(msg.status).toBe("streaming");
  });

  it("appends content during streaming", () => {
    const msg: ChatMessage = {
      id: "msg-2",
      role: "assistant",
      content: "",
      status: "streaming",
      timestamp: Date.now(),
    };
    msg.content += "Hello ";
    msg.content += "world";
    expect(msg.content).toBe("Hello world");
  });

  it("appends thinking during streaming", () => {
    const msg: ChatMessage = {
      id: "msg-2",
      role: "assistant",
      content: "",
      status: "streaming",
      timestamp: Date.now(),
    };
    msg.thinking = (msg.thinking || "") + "Let me think... ";
    msg.thinking = (msg.thinking || "") + "I should check the code.";
    expect(msg.thinking).toBe("Let me think... I should check the code.");
  });

  it("transitions from streaming to complete", () => {
    const msg: ChatMessage = {
      id: "msg-2",
      role: "assistant",
      content: "Final answer",
      status: "streaming",
      timestamp: Date.now(),
    };
    msg.status = "complete";
    expect(msg.status).toBe("complete");
  });

  it("transitions from streaming to error", () => {
    const msg: ChatMessage = {
      id: "msg-2",
      role: "assistant",
      content: "Partial answer",
      status: "streaming",
      timestamp: Date.now(),
    };
    msg.status = "error";
    expect(msg.status).toBe("error");
  });

  it("tracks tool calls on assistant messages", () => {
    const msg: ChatMessage = {
      id: "msg-3",
      role: "assistant",
      content: "I'll read the file.",
      status: "streaming",
      timestamp: Date.now(),
      toolCalls: [
        { name: "read_file", status: "running" },
      ],
    };
    expect(msg.toolCalls).toHaveLength(1);
    expect(msg.toolCalls![0].name).toBe("read_file");
  });
});

describe("Approval flow", () => {
  interface PendingApproval {
    approvalId: string;
    toolName: string;
    status: "awaiting_approval" | "approved" | "denied";
  }

  it("stores pending approval", () => {
    const pending = new Map<string, PendingApproval>();
    const approval: PendingApproval = {
      approvalId: "appr-1",
      toolName: "exec_shell",
      status: "awaiting_approval",
    };
    pending.set(approval.approvalId, approval);
    expect(pending.has("appr-1")).toBe(true);
    expect(pending.get("appr-1")!.toolName).toBe("exec_shell");
  });

  it("resolves approval with allow", () => {
    const pending = new Map<string, PendingApproval>();
    pending.set("appr-1", { approvalId: "appr-1", toolName: "exec_shell", status: "awaiting_approval" });
    const approval = pending.get("appr-1")!;
    approval.status = "approved";
    expect(approval.status).toBe("approved");
  });

  it("resolves approval with deny", () => {
    const pending = new Map<string, PendingApproval>();
    pending.set("appr-1", { approvalId: "appr-1", toolName: "exec_shell", status: "awaiting_approval" });
    const approval = pending.get("appr-1")!;
    approval.status = "denied";
    expect(approval.status).toBe("denied");
  });

  it("handles multiple concurrent approvals", () => {
    const pending = new Map<string, PendingApproval>();
    pending.set("appr-1", { approvalId: "appr-1", toolName: "exec_shell", status: "awaiting_approval" });
    pending.set("appr-2", { approvalId: "appr-2", toolName: "write_file", status: "awaiting_approval" });
    expect(pending.size).toBe(2);
  });
});

describe("Active items tracking", () => {
  it("tracks item by item_id with kind and message reference", () => {
    const activeItems = new Map<string, { kind: string; msgId: string; toolCallName?: string; toolCallIdx?: number }>();
    activeItems.set("item-1", { kind: "tool_call", msgId: "msg-1", toolCallName: "read_file", toolCallIdx: 0 });
    expect(activeItems.get("item-1")!.kind).toBe("tool_call");
    expect(activeItems.get("item-1")!.toolCallName).toBe("read_file");
  });

  it("removes item on completion", () => {
    const activeItems = new Map<string, { kind: string; msgId: string }>();
    activeItems.set("item-1", { kind: "tool_call", msgId: "msg-1" });
    activeItems.delete("item-1");
    expect(activeItems.has("item-1")).toBe(false);
  });

  it("tracks multiple concurrent items", () => {
    const activeItems = new Map<string, { kind: string; msgId: string }>();
    activeItems.set("item-1", { kind: "tool_call", msgId: "msg-1" });
    activeItems.set("item-2", { kind: "agent_message", msgId: "msg-1" });
    activeItems.set("item-3", { kind: "agent_reasoning", msgId: "msg-1" });
    expect(activeItems.size).toBe(3);
  });
});

describe("Event sequence tracking", () => {
  it("tracks last event sequence number", () => {
    let lastEventSeq = 0;
    lastEventSeq = 5;
    expect(lastEventSeq).toBe(5);
  });

  it("uses sequence number for SSE reconnection", () => {
    let lastEventSeq = 42;
    const sinceSeq = lastEventSeq;
    const params = new URLSearchParams();
    params.set("since_seq", String(sinceSeq ?? 0));
    expect(params.get("since_seq")).toBe("42");
  });

  it("defaults to 0 for initial connection", () => {
    let lastEventSeq = 0;
    const sinceSeq = lastEventSeq;
    const params = new URLSearchParams();
    params.set("since_seq", String(sinceSeq ?? 0));
    expect(params.get("since_seq")).toBe("0");
  });
});

describe("parseDiffToSides", () => {
  it("extracts old and new content from a simple diff", () => {
    const diff = [
      "@@ -1,3 +1,3 @@",
      " line1",
      "-line2_old",
      "+line2_new",
      " line3",
    ].join("\n");
    const { oldContent, newContent } = parseDiffToSides(diff);
    expect(oldContent).toBe("line1\nline2_old\nline3");
    expect(newContent).toBe("line1\nline2_new\nline3");
  });

  it("handles pure addition (new file)", () => {
    const diff = [
      "@@ -0,0 +1,2 @@",
      "+new line 1",
      "+new line 2",
    ].join("\n");
    const { oldContent, newContent } = parseDiffToSides(diff);
    expect(oldContent).toBe("");
    expect(newContent).toBe("new line 1\nnew line 2");
  });

  it("handles pure deletion", () => {
    const diff = [
      "@@ -1,2 +0,0 @@",
      "-deleted line 1",
      "-deleted line 2",
    ].join("\n");
    const { oldContent, newContent } = parseDiffToSides(diff);
    expect(oldContent).toBe("deleted line 1\ndeleted line 2");
    expect(newContent).toBe("");
  });

  it("handles multiple hunks", () => {
    const diff = [
      "@@ -1,3 +1,3 @@",
      " line1",
      "-old2",
      "+new2",
      " line3",
      "@@ -10,3 +10,3 @@",
      " line10",
      "-old11",
      "+new11",
      " line12",
    ].join("\n");
    const { oldContent, newContent } = parseDiffToSides(diff);
    expect(oldContent).toBe("line1\nold2\nline3\nline10\nold11\nline12");
    expect(newContent).toBe("line1\nnew2\nline3\nline10\nnew11\nline12");
  });

  it("skips diff header lines", () => {
    const diff = [
      "diff --git a/foo.ts b/foo.ts",
      "index abc123..def456 100644",
      "--- a/foo.ts",
      "+++ b/foo.ts",
      "@@ -1,2 +1,2 @@",
      " line1",
      "-old",
      "+new",
    ].join("\n");
    const { oldContent, newContent } = parseDiffToSides(diff);
    expect(oldContent).toBe("line1\nold");
    expect(newContent).toBe("line1\nnew");
  });

  it("handles \\ No newline at end of file", () => {
    const diff = [
      "@@ -1,2 +1,2 @@",
      " line1",
      "-old",
      "+new",
      "\\ No newline at end of file",
    ].join("\n");
    const { oldContent, newContent } = parseDiffToSides(diff);
    expect(oldContent).toBe("line1\nold");
    expect(newContent).toBe("line1\nnew");
  });

  it("returns empty strings for diff with no hunks", () => {
    const diff = "diff --git a/foo.ts b/foo.ts\nindex abc..def 100644\n--- a/foo.ts\n+++ b/foo.ts";
    const { oldContent, newContent } = parseDiffToSides(diff);
    expect(oldContent).toBe("");
    expect(newContent).toBe("");
  });

  it("returns empty strings for empty diff", () => {
    const { oldContent, newContent } = parseDiffToSides("");
    expect(oldContent).toBe("");
    expect(newContent).toBe("");
  });

  it("preserves context lines in both sides", () => {
    const diff = [
      "@@ -1,5 +1,5 @@",
      " ctx1",
      " ctx2",
      "-removed",
      "+added",
      " ctx3",
      " ctx4",
    ].join("\n");
    const { oldContent, newContent } = parseDiffToSides(diff);
    expect(oldContent).toBe("ctx1\nctx2\nremoved\nctx3\nctx4");
    expect(newContent).toBe("ctx1\nctx2\nadded\nctx3\nctx4");
  });

  it("handles consecutive additions and deletions", () => {
    const diff = [
      "@@ -1,4 +1,4 @@",
      "-old1",
      "-old2",
      "+new1",
      "+new2",
      "+new3",
      " ctx",
    ].join("\n");
    const { oldContent, newContent } = parseDiffToSides(diff);
    expect(oldContent).toBe("old1\nold2\nctx");
    expect(newContent).toBe("new1\nnew2\nnew3\nctx");
  });
});

describe("parseDiffStats", () => {
  function parseDiffStats(diff: string): { added: number; removed: number } {
    let added = 0;
    let removed = 0;
    for (const line of diff.split("\n")) {
      if (line.startsWith("+") && !line.startsWith("+++")) added++;
      else if (line.startsWith("-") && !line.startsWith("---")) removed++;
    }
    return { added, removed };
  }

  it("counts added and removed lines", () => {
    const diff = [
      "@@ -1,3 +1,3 @@",
      " line1",
      "-line2_old",
      "+line2_new",
      " line3",
    ].join("\n");
    const stats = parseDiffStats(diff);
    expect(stats.added).toBe(1);
    expect(stats.removed).toBe(1);
  });

  it("counts multiple additions and deletions", () => {
    const diff = [
      "@@ -1,5 +1,6 @@",
      "-old1",
      "-old2",
      "+new1",
      "+new2",
      "+new3",
      " ctx",
    ].join("\n");
    const stats = parseDiffStats(diff);
    expect(stats.added).toBe(3);
    expect(stats.removed).toBe(2);
  });

  it("excludes +++ and --- header lines", () => {
    const diff = [
      "--- a/foo.ts",
      "+++ b/foo.ts",
      "@@ -1,1 +1,1 @@",
      "-old",
      "+new",
    ].join("\n");
    const stats = parseDiffStats(diff);
    expect(stats.added).toBe(1);
    expect(stats.removed).toBe(1);
  });

  it("returns zeros for empty diff", () => {
    const stats = parseDiffStats("");
    expect(stats.added).toBe(0);
    expect(stats.removed).toBe(0);
  });

  it("returns zeros for diff with only context lines", () => {
    const diff = "@@ -1,3 +1,3 @@\n line1\n line2\n line3";
    const stats = parseDiffStats(diff);
    expect(stats.added).toBe(0);
    expect(stats.removed).toBe(0);
  });

  it("handles pure addition diff", () => {
    const diff = "@@ -0,0 +1,3 @@\n+line1\n+line2\n+line3";
    const stats = parseDiffStats(diff);
    expect(stats.added).toBe(3);
    expect(stats.removed).toBe(0);
  });

  it("handles pure deletion diff", () => {
    const diff = "@@ -1,3 +0,0 @@\n-line1\n-line2\n-line3";
    const stats = parseDiffStats(diff);
    expect(stats.added).toBe(0);
    expect(stats.removed).toBe(3);
  });
});

describe("extractDiffFromOutput", () => {
  function extractDiffFromOutput(output: string): string | undefined {
    const lines = output.split("\n");
    let diffStart = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith("diff --git ")) { diffStart = i; break; }
      if (line.startsWith("--- ") && i + 2 < lines.length && lines[i + 1].startsWith("+++ ")) { diffStart = i; break; }
      if (line.startsWith("@@")) { diffStart = i; break; }
    }
    if (diffStart < 0) return undefined;

    let diffEnd = lines.length;
    for (let i = diffStart + 1; i < lines.length; i++) {
      const line = lines[i];
      const nextLine = i + 1 < lines.length ? lines[i + 1] : "";
      if (
        line.trim() === "" &&
        nextLine.trim() !== "" &&
        !nextLine.startsWith("+") &&
        !nextLine.startsWith("-") &&
        !nextLine.startsWith("@@") &&
        !nextLine.startsWith(" ") &&
        !nextLine.startsWith("diff ") &&
        !nextLine.startsWith("--- ") &&
        !nextLine.startsWith("+++ ") &&
        !nextLine.startsWith("index ") &&
        !nextLine.startsWith("\\")
      ) {
        diffEnd = i + 1;
        break;
      }
    }
    return lines.slice(diffStart, diffEnd).join("\n");
  }

  it("extracts diff starting with diff --git header", () => {
    const output = [
      "I modified the file:",
      "",
      "diff --git a/foo.ts b/foo.ts",
      "index abc..def 100644",
      "--- a/foo.ts",
      "+++ b/foo.ts",
      "@@ -1,2 +1,2 @@",
      " line1",
      "-old",
      "+new",
    ].join("\n");
    const diff = extractDiffFromOutput(output);
    expect(diff).toBeDefined();
    expect(diff!).toContain("diff --git a/foo.ts");
    expect(diff!).toContain("-old");
    expect(diff!).toContain("+new");
  });

  it("extracts diff starting with --- header", () => {
    const output = [
      "--- a/foo.ts",
      "+++ b/foo.ts",
      "@@ -1,1 +1,1 @@",
      "-old",
      "+new",
    ].join("\n");
    const diff = extractDiffFromOutput(output);
    expect(diff).toBeDefined();
    expect(diff!).toContain("--- a/foo.ts");
  });

  it("extracts diff starting with @@ hunk header", () => {
    const output = [
      "@@ -1,1 +1,1 @@",
      "-old",
      "+new",
    ].join("\n");
    const diff = extractDiffFromOutput(output);
    expect(diff).toBeDefined();
    expect(diff!).toContain("@@");
  });

  it("returns undefined when no diff markers found", () => {
    const output = "Just some regular text\nNo diff here";
    expect(extractDiffFromOutput(output)).toBeUndefined();
  });

  it("truncates diff at prose after blank line", () => {
    const output = [
      "diff --git a/foo.ts b/foo.ts",
      "--- a/foo.ts",
      "+++ b/foo.ts",
      "@@ -1,1 +1,1 @@",
      "-old",
      "+new",
      "",
      "Summary of changes made.",
    ].join("\n");
    const diff = extractDiffFromOutput(output);
    expect(diff).toBeDefined();
    expect(diff!).not.toContain("Summary of changes");
  });

  it("includes diff content when followed by another hunk", () => {
    const output = [
      "diff --git a/foo.ts b/foo.ts",
      "@@ -1,2 +1,2 @@",
      "-old1",
      "+new1",
      "",
      "@@ -5,2 +5,2 @@",
      "-old2",
      "+new2",
    ].join("\n");
    const diff = extractDiffFromOutput(output);
    expect(diff).toBeDefined();
    expect(diff!).toContain("@@ -5,2 +5,2 @@");
    expect(diff!).toContain("-old2");
  });

  it("returns undefined for empty output", () => {
    expect(extractDiffFromOutput("")).toBeUndefined();
  });
});

describe("extractFilePathFromDiff", () => {
  function extractFilePathFromDiff(diff: string): string {
    for (const line of diff.split("\n")) {
      const m = line.match(/^\+\+\+ b\/(.+)$/);
      if (m) return m[1];
    }
    for (const line of diff.split("\n")) {
      const m = line.match(/^--- a\/(.+)$/);
      if (m) return m[1];
    }
    return "";
  }

  it("extracts file path from +++ b/ line", () => {
    const diff = "diff --git a/src/foo.ts b/src/foo.ts\n--- a/src/foo.ts\n+++ b/src/foo.ts\n@@ -1 +1 @@";
    expect(extractFilePathFromDiff(diff)).toBe("src/foo.ts");
  });

  it("falls back to --- a/ line when +++ b/ is missing", () => {
    const diff = "--- a/src/bar.ts\n@@ -1 +1 @@\n-old\n+new";
    expect(extractFilePathFromDiff(diff)).toBe("src/bar.ts");
  });

  it("returns empty string when no path found", () => {
    const diff = "@@ -1 +1 @@\n-old\n+new";
    expect(extractFilePathFromDiff(diff)).toBe("");
  });

  it("handles paths with spaces", () => {
    const diff = "+++ b/my project/file.ts\n@@ -1 +1 @@";
    expect(extractFilePathFromDiff(diff)).toBe("my project/file.ts");
  });

  it("prefers +++ b/ over --- a/", () => {
    const diff = "--- a/old_name.ts\n+++ b/new_name.ts\n@@ -1 +1 @@";
    expect(extractFilePathFromDiff(diff)).toBe("new_name.ts");
  });
});

describe("isFileChangeTool", () => {
  const FILE_CHANGE_TOOLS = new Set([
    "write_file",
    "edit_file",
    "apply_patch",
    "replace_text",
    "delete_file",
    "move_file",
    "copy_file",
    "create_directory",
  ]);

  function isFileChangeTool(toolName: string): boolean {
    return FILE_CHANGE_TOOLS.has(toolName) || FILE_CHANGE_TOOLS.has(toolName.toLowerCase());
  }

  it("recognizes write_file as a file change tool", () => {
    expect(isFileChangeTool("write_file")).toBe(true);
  });

  it("recognizes edit_file as a file change tool", () => {
    expect(isFileChangeTool("edit_file")).toBe(true);
  });

  it("recognizes delete_file as a file change tool", () => {
    expect(isFileChangeTool("delete_file")).toBe(true);
  });

  it("recognizes apply_patch as a file change tool", () => {
    expect(isFileChangeTool("apply_patch")).toBe(true);
  });

  it("recognizes replace_text as a file change tool", () => {
    expect(isFileChangeTool("replace_text")).toBe(true);
  });

  it("recognizes move_file as a file change tool", () => {
    expect(isFileChangeTool("move_file")).toBe(true);
  });

  it("recognizes copy_file as a file change tool", () => {
    expect(isFileChangeTool("copy_file")).toBe(true);
  });

  it("recognizes create_directory as a file change tool", () => {
    expect(isFileChangeTool("create_directory")).toBe(true);
  });

  it("does not recognize read_file as a file change tool", () => {
    expect(isFileChangeTool("read_file")).toBe(false);
  });

  it("does not recognize grep_files as a file change tool", () => {
    expect(isFileChangeTool("grep_files")).toBe(false);
  });

  it("does not recognize exec_shell as a file change tool", () => {
    expect(isFileChangeTool("exec_shell")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isFileChangeTool("Write_File")).toBe(true);
    expect(isFileChangeTool("EDIT_FILE")).toBe(true);
    expect(isFileChangeTool("DELETE_FILE")).toBe(true);
  });
});

describe("extractFilePath", () => {
  function extractFilePath(_toolName: string, input: Record<string, unknown>): string {
    return (input.file_path || input.path || input.destination || input.source || "") as string;
  }

  it("extracts file_path first", () => {
    expect(extractFilePath("write_file", { file_path: "/src/foo.ts", path: "/src/bar.ts" })).toBe("/src/foo.ts");
  });

  it("falls back to path when file_path is missing", () => {
    expect(extractFilePath("edit_file", { path: "/src/bar.ts" })).toBe("/src/bar.ts");
  });

  it("falls back to destination for move_file", () => {
    expect(extractFilePath("move_file", { source: "/src/old.ts", destination: "/src/new.ts" })).toBe("/src/new.ts");
  });

  it("falls back to source when others are missing", () => {
    expect(extractFilePath("move_file", { source: "/src/old.ts" })).toBe("/src/old.ts");
  });

  it("returns empty string when no path fields exist", () => {
    expect(extractFilePath("read_file", { content: "hello" })).toBe("");
  });

  it("returns empty string for empty input", () => {
    expect(extractFilePath("write_file", {})).toBe("");
  });
});

describe("extractToolNameFromSummary", () => {
  function extractToolNameFromSummary(summary: string): string {
    const idx = summary.indexOf(":");
    if (idx > 0) return summary.slice(0, idx).trim();
    const spaceIdx = summary.indexOf(" ");
    if (spaceIdx > 0) return summary.slice(0, spaceIdx).trim();
    return summary.trim();
  }

  it("extracts tool name before colon", () => {
    expect(extractToolNameFromSummary("write_file: Created /src/foo.ts")).toBe("write_file");
  });

  it("extracts tool name before colon with spaces", () => {
    expect(extractToolNameFromSummary("edit_file : Modified /src/bar.ts")).toBe("edit_file");
  });

  it("extracts tool name before space when no colon", () => {
    expect(extractToolNameFromSummary("read_file /src/baz.ts")).toBe("read_file");
  });

  it("returns entire string when no colon or space", () => {
    expect(extractToolNameFromSummary("exec_shell")).toBe("exec_shell");
  });

  it("handles empty string", () => {
    expect(extractToolNameFromSummary("")).toBe("");
  });
});

describe("friendlyToolName", () => {
  const FRIENDLY_TOOL_NAMES: Record<string, string> = {
    write_file: "Write File",
    edit_file: "Edit File",
    read_file: "Read File",
    delete_file: "Delete File",
    exec_shell: "Execute Shell",
    apply_patch: "Apply Patch",
    replace_text: "Replace Text",
    move_file: "Move File",
    copy_file: "Copy File",
    create_directory: "Create Directory",
    grep_files: "Search Files",
    project_map: "Project Map",
  };

  function friendlyToolName(raw: string): string {
    if (FRIENDLY_TOOL_NAMES[raw]) return FRIENDLY_TOOL_NAMES[raw];
    if (raw.startsWith("mcp__")) return raw.slice(5).replace(/__/g, " / ");
    return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  it("returns friendly name for known tools", () => {
    expect(friendlyToolName("write_file")).toBe("Write File");
    expect(friendlyToolName("read_file")).toBe("Read File");
    expect(friendlyToolName("exec_shell")).toBe("Execute Shell");
  });

  it("handles MCP tool names", () => {
    expect(friendlyToolName("mcp__github__create_issue")).toBe("github / create_issue");
  });

  it("converts unknown snake_case names to Title Case", () => {
    expect(friendlyToolName("some_custom_tool")).toBe("Some Custom Tool");
  });

  it("handles single word tool names", () => {
    expect(friendlyToolName("search")).toBe("Search");
  });
});

describe("shortPath", () => {
  function shortPath(p: string): string {
    const parts = p.replace(/\\/g, "/").split("/");
    return parts.length > 3 ? "…/" + parts.slice(-3).join("/") : p;
  }

  it("returns path as-is for 3 or fewer segments", () => {
    expect(shortPath("src/foo.ts")).toBe("src/foo.ts");
    expect(shortPath("a/b/c")).toBe("a/b/c");
    expect(shortPath("foo.ts")).toBe("foo.ts");
  });

  it("truncates paths with more than 3 segments", () => {
    expect(shortPath("a/b/c/d/foo.ts")).toBe("…/c/d/foo.ts");
  });

  it("handles Windows-style backslashes", () => {
    expect(shortPath("a\\b\\c\\d\\foo.ts")).toBe("…/c/d/foo.ts");
  });

  it("handles absolute paths", () => {
    expect(shortPath("/Users/gaord/project/src/foo.ts")).toBe("…/project/src/foo.ts");
  });
});

describe("truncate", () => {
  function truncate(s: string, max: number): string {
    return s.length > max ? s.slice(0, max - 1) + "…" : s;
  }

  it("returns string as-is when within limit", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("truncates and adds ellipsis when exceeding limit", () => {
    expect(truncate("hello world", 8)).toBe("hello w…");
  });

  it("handles exact length", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });

  it("handles empty string", () => {
    expect(truncate("", 5)).toBe("");
  });
});

describe("FileChangeInfo changeType derivation", () => {
  function deriveChangeType(toolName: string, diff: string | undefined): "created" | "modified" | "deleted" {
    if (toolName === "delete_file") return "deleted";
    if (toolName === "write_file" && !diff) return "created";
    return "modified";
  }

  it("delete_file always results in deleted", () => {
    expect(deriveChangeType("delete_file", undefined)).toBe("deleted");
    expect(deriveChangeType("delete_file", "some diff")).toBe("deleted");
  });

  it("write_file without diff results in created", () => {
    expect(deriveChangeType("write_file", undefined)).toBe("created");
    expect(deriveChangeType("write_file", "")).toBe("created");
  });

  it("write_file with diff results in modified", () => {
    expect(deriveChangeType("write_file", "@@ -1 +1 @@\n-old\n+new")).toBe("modified");
  });

  it("edit_file always results in modified", () => {
    expect(deriveChangeType("edit_file", undefined)).toBe("modified");
    expect(deriveChangeType("edit_file", "@@ -1 +1 @@")).toBe("modified");
  });

  it("apply_patch always results in modified", () => {
    expect(deriveChangeType("apply_patch", undefined)).toBe("modified");
  });

  it("replace_text always results in modified", () => {
    expect(deriveChangeType("replace_text", "some diff")).toBe("modified");
  });

  it("move_file always results in modified", () => {
    expect(deriveChangeType("move_file", undefined)).toBe("modified");
  });
});

describe("Diff URI uniqueness for multiple cards", () => {
  it("generates different diffIds for concurrent diff views", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const diffId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      ids.add(diffId);
    }
    expect(ids.size).toBe(10);
  });

  it("constructs unique oldUri and newUri with diffId", () => {
    const diffId = "abc123";
    const absPath = "/project/src/foo.ts";
    const oldUri = `brotherwhale-diff:${absPath}?old&id=${diffId}`;
    const newUri = `brotherwhale-diff:${absPath}?new&id=${diffId}`;
    expect(oldUri).not.toBe(newUri);
    expect(oldUri).toContain("id=abc123");
    expect(newUri).toContain("id=abc123");
  });

  it("same file with different diffIds produces different URIs", () => {
    const absPath = "/project/src/foo.ts";
    const uri1 = `brotherwhale-diff:${absPath}?old&id=id1`;
    const uri2 = `brotherwhale-diff:${absPath}?old&id=id2`;
    expect(uri1).not.toBe(uri2);
  });
});

describe("DiffContentStore lifecycle", () => {
  it("stores and retrieves content by URI string", () => {
    const store = new Map<string, string>();
    const uri = "brotherwhale-diff:/foo.ts?old&id=abc";
    store.set(uri, "old content");
    expect(store.get(uri)).toBe("old content");
  });

  it("stores old and new content separately", () => {
    const store = new Map<string, string>();
    const oldUri = "brotherwhale-diff:/foo.ts?old&id=abc";
    const newUri = "brotherwhale-diff:/foo.ts?new&id=abc";
    store.set(oldUri, "old content");
    store.set(newUri, "new content");
    expect(store.get(oldUri)).toBe("old content");
    expect(store.get(newUri)).toBe("new content");
  });

  it("supports multiple diffs for the same file", () => {
    const store = new Map<string, string>();
    const oldUri1 = "brotherwhale-diff:/foo.ts?old&id=id1";
    const newUri1 = "brotherwhale-diff:/foo.ts?new&id=id1";
    const oldUri2 = "brotherwhale-diff:/foo.ts?old&id=id2";
    const newUri2 = "brotherwhale-diff:/foo.ts?new&id=id2";
    store.set(oldUri1, "old v1");
    store.set(newUri1, "new v1");
    store.set(oldUri2, "old v2");
    store.set(newUri2, "new v2");
    expect(store.size).toBe(4);
    expect(store.get(oldUri1)).toBe("old v1");
    expect(store.get(oldUri2)).toBe("old v2");
  });

  it("clear removes all entries", () => {
    const store = new Map<string, string>();
    store.set("uri1", "content1");
    store.set("uri2", "content2");
    store.clear();
    expect(store.size).toBe(0);
  });
});

describe("FileChangeInfo with toolName", () => {
  interface FileChangeInfo {
    filePath: string;
    changeType: "created" | "modified" | "deleted";
    addedLines: number;
    removedLines: number;
    diff?: string;
    toolName?: string;
  }

  it("includes toolName in FileChangeInfo", () => {
    const fc: FileChangeInfo = {
      filePath: "/src/foo.ts",
      changeType: "modified",
      addedLines: 5,
      removedLines: 3,
      diff: "@@ -1 +1 @@",
      toolName: "write_file",
    };
    expect(fc.toolName).toBe("write_file");
  });

  it("toolName is optional", () => {
    const fc: FileChangeInfo = {
      filePath: "/src/foo.ts",
      changeType: "created",
      addedLines: 10,
      removedLines: 0,
    };
    expect(fc.toolName).toBeUndefined();
  });

  it("toolName is preserved through serialization", () => {
    const fc: FileChangeInfo = {
      filePath: "/src/foo.ts",
      changeType: "modified",
      addedLines: 2,
      removedLines: 1,
      diff: "@@ -1 +1 @@",
      toolName: "edit_file",
    };
    const serialized = JSON.stringify(fc);
    const deserialized: FileChangeInfo = JSON.parse(serialized);
    expect(deserialized.toolName).toBe("edit_file");
  });
});

describe("Cost calculation edge cases", () => {
  function getModelPricing(model: string) {
    const lower = model.toLowerCase();
    if (!lower.includes("deepseek")) return null;
    return {
      inputCacheHitPerMillion: 0.0028,
      inputCacheMissPerMillion: 0.14,
      outputPerMillion: 0.28,
      inputCacheHitPerMillionCny: 0.02,
      inputCacheMissPerMillionCny: 1.0,
      outputPerMillionCny: 2.0,
    };
  }

  function calculateTurnCost(
    model: string,
    inputTokens: number,
    outputTokens: number,
    cacheHitTokens?: number,
    cacheMissTokens?: number,
    reasoningTokens?: number,
  ) {
    const pricing = getModelPricing(model);
    if (!pricing) return null;
    const hit = cacheHitTokens ?? 0;
    const miss = cacheMissTokens ?? Math.max(0, inputTokens - hit);
    const uncategorized = Math.max(0, inputTokens - hit - miss);
    const effectiveMiss = miss + uncategorized;
    const effectiveOutput = outputTokens + (reasoningTokens ?? 0);
    const hitCost = (hit / 1_000_000) * pricing.inputCacheHitPerMillion;
    const missCost = (effectiveMiss / 1_000_000) * pricing.inputCacheMissPerMillion;
    const outputCost = (effectiveOutput / 1_000_000) * pricing.outputPerMillion;
    const hitCostCny = (hit / 1_000_000) * pricing.inputCacheHitPerMillionCny;
    const missCostCny = (effectiveMiss / 1_000_000) * pricing.inputCacheMissPerMillionCny;
    const outputCostCny = (effectiveOutput / 1_000_000) * pricing.outputPerMillionCny;
    return {
      usd: hitCost + missCost + outputCost,
      cny: hitCostCny + missCostCny + outputCostCny,
    };
  }

  it("handles very large token counts", () => {
    const cost = calculateTurnCost("deepseek-v4-flash", 1_000_000, 500_000, 800_000, 200_000);
    expect(cost).not.toBeNull();
    expect(cost!.usd).toBeGreaterThan(0);
    expect(isFinite(cost!.usd)).toBe(true);
  });

  it("handles all cache hit (cheapest scenario)", () => {
    const cost = calculateTurnCost("deepseek-v4-flash", 10000, 1000, 10000, 0);
    expect(cost).not.toBeNull();
    expect(cost!.usd).toBeGreaterThan(0);
  });

  it("handles all cache miss (most expensive scenario)", () => {
    const cost = calculateTurnCost("deepseek-v4-flash", 10000, 1000, 0, 10000);
    expect(cost).not.toBeNull();
    const allHitCost = calculateTurnCost("deepseek-v4-flash", 10000, 1000, 10000, 0);
    expect(cost!.usd).toBeGreaterThan(allHitCost!.usd);
  });

  it("cost increases with reasoning tokens", () => {
    const noReasoning = calculateTurnCost("deepseek-v4-flash", 1000, 500, 0, 1000);
    const withReasoning = calculateTurnCost("deepseek-v4-flash", 1000, 500, 0, 1000, 5000);
    expect(withReasoning!.usd).toBeGreaterThan(noReasoning!.usd);
    const diff = withReasoning!.usd - noReasoning!.usd;
    const expectedDiff = (5000 / 1_000_000) * 0.28;
    expect(diff).toBeCloseTo(expectedDiff, 8);
  });

  it("handles single token", () => {
    const cost = calculateTurnCost("deepseek-v4-flash", 1, 1, 0, 1);
    expect(cost).not.toBeNull();
    expect(cost!.usd).toBeGreaterThan(0);
  });
});
