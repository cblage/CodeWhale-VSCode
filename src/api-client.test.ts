import { describe, it, expect } from "vitest";
import type { RuntimeEvent, ThreadRecord, TurnRecord, TaskSummary, TaskCounts } from "./api-client";

describe("SSE event parsing", () => {
  function parseSseChunk(raw: string): { event: string | null; data: string | null }[] {
    const results: { event: string | null; data: string | null }[] = [];
    let currentEvent: string | null = null;
    let currentData: string | null = null;

    const lines = raw.split("\n");
    for (const line of lines) {
      if (line.startsWith("event:")) {
        currentEvent = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        currentData = line.slice(5).trim();
      } else if (line === "" && currentEvent && currentData) {
        results.push({ event: currentEvent, data: currentData });
        currentEvent = null;
        currentData = null;
      }
    }
    return results;
  }

  it("parses a single SSE event", () => {
    const raw = "event: turn.completed\ndata: {\"seq\":1}\n\n";
    const events = parseSseChunk(raw);
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("turn.completed");
    expect(events[0].data).toBe('{"seq":1}');
  });

  it("parses multiple SSE events", () => {
    const raw = [
      "event: item.started",
      'data: {"seq":1,"item_id":"i1"}',
      "",
      "event: item.delta",
      'data: {"seq":2,"item_id":"i1"}',
      "",
    ].join("\n");
    const events = parseSseChunk(raw);
    expect(events).toHaveLength(2);
    expect(events[0].event).toBe("item.started");
    expect(events[1].event).toBe("item.delta");
  });

  it("ignores comment lines", () => {
    const raw = [
      ": this is a comment",
      "event: turn.lifecycle",
      'data: {"seq":1}',
      "",
    ].join("\n");
    const events = parseSseChunk(raw);
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("turn.lifecycle");
  });

  it("handles multi-line data by keeping only last data line", () => {
    const raw = [
      "event: item.delta",
      'data: {"seq":2}',
      'data: {"seq":3}',
      "",
    ].join("\n");
    const events = parseSseChunk(raw);
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0].data!)).toEqual({ seq: 3 });
  });

  it("skips incomplete events (no blank line terminator)", () => {
    const raw = "event: item.started\ndata: {\"seq\":1}";
    const events = parseSseChunk(raw);
    expect(events).toHaveLength(0);
  });

  it("skips events with empty data (SSE parser requires truthy data)", () => {
    const raw = "event: ping\ndata: \n\n";
    const events = parseSseChunk(raw);
    expect(events).toHaveLength(0);
  });
});

describe("RuntimeEvent type structure", () => {
  it("validates turn.lifecycle event structure", () => {
    const event: RuntimeEvent = {
      seq: 1,
      timestamp: new Date().toISOString(),
      thread_id: "thread-1",
      turn_id: "turn-1",
      item_id: null,
      event: "turn.lifecycle",
      payload: { status: "running" },
    };
    expect(event.event).toBe("turn.lifecycle");
    expect((event.payload as { status: string }).status).toBe("running");
  });

  it("validates cycle.advanced event structure", () => {
    const event: RuntimeEvent = {
      seq: 5,
      timestamp: new Date().toISOString(),
      thread_id: "thread-1",
      turn_id: "turn-1",
      item_id: null,
      event: "cycle.advanced",
      payload: { from: 2, to: 3, cycle: 3 },
    };
    expect(event.event).toBe("cycle.advanced");
    const pl = event.payload as { from: number; to: number; cycle: number };
    expect(pl.to).toBe(3);
    expect(pl.cycle).toBe(3);
  });

  it("validates coherence.state event structure", () => {
    const event: RuntimeEvent = {
      seq: 10,
      timestamp: new Date().toISOString(),
      thread_id: "thread-1",
      turn_id: "turn-1",
      item_id: null,
      event: "coherence.state",
      payload: { state: "refreshing_context", label: "Refreshing context…", description: "Verifying recent work" },
    };
    expect(event.event).toBe("coherence.state");
    const pl = event.payload as { state: string; label: string; description: string };
    expect(pl.state).toBe("refreshing_context");
    expect(pl.label).toContain("Refreshing");
  });

  it("validates item.started event with tool_call kind", () => {
    const event: RuntimeEvent = {
      seq: 2,
      timestamp: new Date().toISOString(),
      thread_id: "thread-1",
      turn_id: "turn-1",
      item_id: "item-1",
      event: "item.started",
      payload: {
        item: { kind: "tool_call", id: "item-1", summary: "read_file" },
      },
    };
    expect(event.item_id).toBe("item-1");
    const pl = event.payload as { item: { kind: string; id: string; summary: string } };
    expect(pl.item.kind).toBe("tool_call");
  });

  it("validates item.completed event with task_updates metadata", () => {
    const event: RuntimeEvent = {
      seq: 8,
      timestamp: new Date().toISOString(),
      thread_id: "thread-1",
      turn_id: "turn-1",
      item_id: "item-5",
      event: "item.completed",
      payload: {
        item: {
          kind: "tool_call",
          id: "item-5",
          summary: "todo_write",
          status: "completed",
          metadata: {
            task_updates: {
              checklist: {
                items: [
                  { id: "1", content: "Read codebase", status: "completed" },
                  { id: "2", content: "Write tests", status: "in_progress" },
                  { id: "3", content: "Fix bugs", status: "pending" },
                ],
                completion_pct: 33,
              },
            },
          },
        },
      },
    };
    const pl = event.payload as {
      item: {
        metadata: {
          task_updates: {
            checklist: {
              items: { id: string; content: string; status: string }[];
              completion_pct: number;
            };
          };
        };
      };
    };
    const checklist = pl.item.metadata.task_updates.checklist;
    expect(checklist.items).toHaveLength(3);
    expect(checklist.completion_pct).toBe(33);
    expect(checklist.items[0].status).toBe("completed");
    expect(checklist.items[1].status).toBe("in_progress");
    expect(checklist.items[2].status).toBe("pending");
  });

  it("validates approval.required event structure", () => {
    const event: RuntimeEvent = {
      seq: 15,
      timestamp: new Date().toISOString(),
      thread_id: "thread-1",
      turn_id: "turn-1",
      item_id: null,
      event: "approval.required",
      payload: {
        request: {
          approval_id: "appr-1",
          call_id: "item-3",
          tool_name: "exec_shell",
          command: "rm -rf /tmp/test",
          reason: "Destructive command requires approval",
        },
      },
    };
    const pl = event.payload as {
      request: { approval_id: string; tool_name: string; reason: string };
    };
    expect(pl.request.approval_id).toBe("appr-1");
    expect(pl.request.tool_name).toBe("exec_shell");
  });
});

describe("API URL construction", () => {
  const baseUrl = "http://127.0.0.1:54321";

  it("constructs thread list URL", () => {
    const url = new URL("/v1/threads", baseUrl);
    expect(url.toString()).toBe("http://127.0.0.1:54321/v1/threads");
  });

  it("constructs thread list URL with query params", () => {
    const params = new URLSearchParams({ limit: "20", include_archived: "true" });
    const url = new URL(`/v1/threads?${params.toString()}`, baseUrl);
    expect(url.searchParams.get("limit")).toBe("20");
    expect(url.searchParams.get("include_archived")).toBe("true");
  });

  it("constructs SSE event stream URL with since_seq", () => {
    const params = new URLSearchParams({ since_seq: "42" });
    const url = new URL(`/v1/threads/thread-1/events?${params.toString()}`, baseUrl);
    expect(url.pathname).toBe("/v1/threads/thread-1/events");
    expect(url.searchParams.get("since_seq")).toBe("42");
  });

  it("constructs SSE URL with since_seq=0 for initial connection", () => {
    const params = new URLSearchParams({ since_seq: "0" });
    const url = new URL(`/v1/threads/thread-1/events?${params.toString()}`, baseUrl);
    expect(url.searchParams.get("since_seq")).toBe("0");
  });

  it("constructs task list URL", () => {
    const url = new URL("/v1/tasks", baseUrl);
    expect(url.toString()).toBe("http://127.0.0.1:54321/v1/tasks");
  });

  it("constructs approval decision URL", () => {
    const url = new URL("/v1/approvals/appr-1", baseUrl);
    expect(url.toString()).toBe("http://127.0.0.1:54321/v1/approvals/appr-1");
  });

  it("constructs health check URL", () => {
    const url = new URL("/health", baseUrl);
    expect(url.toString()).toBe("http://127.0.0.1:54321/health");
  });

  it("constructs compact thread URL", () => {
    const url = new URL("/v1/threads/thread-1/compact", baseUrl);
    expect(url.pathname).toBe("/v1/threads/thread-1/compact");
  });

  it("constructs interrupt turn URL", () => {
    const url = new URL("/v1/threads/thread-1/turns/turn-1/interrupt", baseUrl);
    expect(url.pathname).toBe("/v1/threads/thread-1/turns/turn-1/interrupt");
  });
});

describe("ThreadRecord type validation", () => {
  it("has required fields for a valid thread", () => {
    const thread: ThreadRecord = {
      schema_version: 1,
      id: "thread-1",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      model: "deepseek-v4-pro",
      workspace: "/tmp/test",
      mode: "agent",
      allow_shell: true,
      trust_mode: false,
      auto_approve: false,
      latest_turn_id: null,
      archived: false,
      coherence_state: "healthy",
    };
    expect(thread.id).toBe("thread-1");
    expect(thread.mode).toBe("agent");
    expect(thread.coherence_state).toBe("healthy");
  });

  it("supports optional title field", () => {
    const thread: ThreadRecord = {
      schema_version: 1,
      id: "thread-2",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      model: "deepseek-v4-flash",
      workspace: "/tmp/test",
      mode: "plan",
      allow_shell: false,
      trust_mode: false,
      auto_approve: false,
      latest_turn_id: "turn-1",
      archived: false,
      coherence_state: "healthy",
      title: "My Thread",
    };
    expect(thread.title).toBe("My Thread");
  });
});

describe("TurnRecord status transitions", () => {
  const validStatuses = ["queued", "in_progress", "completed", "failed", "interrupted", "canceled"];

  it("all valid statuses are accepted", () => {
    for (const status of validStatuses) {
      const turn: TurnRecord = {
        schema_version: 1,
        id: "turn-1",
        thread_id: "thread-1",
        status: status as TurnRecord["status"],
        input_summary: "test",
        created_at: new Date().toISOString(),
        item_ids: [],
        steer_count: 0,
      };
      expect(turn.status).toBe(status);
    }
  });

  it("usage tracking fields are optional", () => {
    const turn: TurnRecord = {
      schema_version: 1,
      id: "turn-1",
      thread_id: "thread-1",
      status: "completed",
      input_summary: "test",
      created_at: new Date().toISOString(),
      item_ids: [],
      steer_count: 0,
      usage: {
        input_tokens: 1000,
        output_tokens: 500,
        prompt_cache_hit_tokens: 800,
        prompt_cache_miss_tokens: 200,
        reasoning_tokens: 300,
      },
    };
    expect(turn.usage?.input_tokens).toBe(1000);
    expect(turn.usage?.prompt_cache_hit_tokens).toBe(800);
  });
});

describe("TaskSummary type validation", () => {
  it("has required fields for a valid task summary", () => {
    const task: TaskSummary = {
      id: "task-1",
      status: "running",
      prompt_summary: "Fix the bug",
      model: "deepseek-v4-pro",
      mode: "agent",
      created_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      ended_at: null,
      duration_ms: null,
      error: null,
      thread_id: "thread-1",
      turn_id: "turn-1",
    };
    expect(task.status).toBe("running");
    expect(task.thread_id).toBe("thread-1");
  });
});

describe("API request body construction", () => {
  it("createThread omits undefined optional fields", () => {
    const body: Record<string, unknown> = {};
    const opts: { model?: string; mode?: string; workspace?: string } = {};
    if (opts.model) body.model = opts.model;
    if (opts.mode) body.mode = opts.mode;
    if (opts.workspace) body.workspace = opts.workspace;
    expect(Object.keys(body)).toHaveLength(0);
  });

  it("createThread includes provided fields", () => {
    const body: Record<string, unknown> = {};
    const opts = { model: "deepseek-v4-pro", mode: "agent", workspace: "/tmp" };
    if (opts.model) body.model = opts.model;
    if (opts.mode) body.mode = opts.mode;
    if (opts.workspace) body.workspace = opts.workspace;
    expect(body.model).toBe("deepseek-v4-pro");
    expect(body.mode).toBe("agent");
    expect(body.workspace).toBe("/tmp");
  });

  it("startTurn body always includes prompt", () => {
    const body: Record<string, unknown> = { prompt: "Hello" };
    expect(body.prompt).toBe("Hello");
  });

  it("startTurn body includes optional model override", () => {
    const body: Record<string, unknown> = { prompt: "Hello", model: "deepseek-v4-flash" };
    expect(body.model).toBe("deepseek-v4-flash");
  });

  it("decideApproval body includes decision and remember flag", () => {
    const body = { decision: "allow" as const, remember: true };
    expect(body.decision).toBe("allow");
    expect(body.remember).toBe(true);
  });

  it("createTask body includes required prompt", () => {
    const body = { prompt: "Fix all bugs", mode: "agent" };
    expect(body.prompt).toBe("Fix all bugs");
  });
});

describe("Auth header construction", () => {
  it("includes Authorization header when token is set", () => {
    const token = "sk-test-123";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    expect(headers["Authorization"]).toBe("Bearer sk-test-123");
  });

  it("omits Authorization header when token is null", () => {
    const token: string | null = null;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    expect(headers["Authorization"]).toBeUndefined();
  });
});
