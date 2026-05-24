import * as http from "http";

// ── Types matching DeepSeek Runtime API ──

export interface ThreadRecord {
  schema_version: number;
  id: string;
  created_at: string;
  updated_at: string;
  model: string;
  workspace: string;
  mode: string;
  allow_shell: boolean;
  trust_mode: boolean;
  auto_approve: boolean;
  latest_turn_id: string | null;
  latest_response_bookmark?: string | null;
  archived: boolean;
  system_prompt?: string | null;
  task_id?: string | null;
  title?: string | null;
  coherence_state: string;
}

export interface ThreadSummary {
  id: string;
  title: string;
  preview: string;
  model: string;
  mode: string;
  archived: boolean;
  updated_at: string;
  latest_turn_id: string | null;
  latest_turn_status: string | null;
}

export interface TurnRecord {
  schema_version: number;
  id: string;
  thread_id: string;
  status: "queued" | "in_progress" | "completed" | "failed" | "interrupted" | "canceled";
  input_summary: string;
  created_at: string;
  started_at?: string | null;
  ended_at?: string | null;
  duration_ms?: number | null;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
    reasoning_tokens?: number;
  } | null;
  error?: string | null;
  item_ids: string[];
  steer_count: number;
}

export interface TurnItemRecord {
  schema_version: number;
  id: string;
  turn_id: string;
  kind: "user_message" | "agent_message" | "agent_reasoning" | "tool_call" | "file_change" | "command_execution" | "context_compaction" | "status" | "error";
  status: "queued" | "in_progress" | "completed" | "failed" | "interrupted" | "canceled";
  summary: string;
  detail: string | null;
  metadata?: Record<string, unknown> | null;
  artifact_refs: string[];
  started_at?: string | null;
  ended_at?: string | null;
}

export interface RuntimeEvent {
  seq: number;
  timestamp: string;
  thread_id: string;
  turn_id: string | null;
  item_id: string | null;
  event: string;
  payload: Record<string, unknown>;
}

export interface StartTurnResponse {
  thread: ThreadRecord;
  turn: TurnRecord;
}

export interface ThreadDetailResponse {
  thread: ThreadRecord;
  turns: TurnRecord[];
  /** Always present since v0.6.something; Array.isArray guard is cheap */
  items: TurnItemRecord[];
}

export interface ApprovalRequest {
  approval_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  reason: string;
}

export interface TaskSummary {
  id: string;
  status: string;
  prompt_summary: string;
  model: string;
  mode: string;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  duration_ms: number | null;
  error: string | null;
  thread_id: string | null;
  turn_id: string | null;
}

export interface TaskCounts {
  queued: number;
  running: number;
  completed: number;
  failed: number;
  canceled: number;
}

export interface TaskToolCallSummary {
  id: string;
  name: string;
  status: string;
  input_summary: string | null;
  output_summary: string | null;
  duration_ms: number | null;
  detail_path: string | null;
  patch_ref: string | null;
}

export interface TaskTimelineEntry {
  timestamp: string;
  kind: string;
  summary: string;
  detail_path: string | null;
}

export interface TaskRecord {
  id: string;
  prompt: string;
  model: string;
  workspace: string;
  mode: string;
  status: string;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  duration_ms: number | null;
  result_summary: string | null;
  result_detail_path: string | null;
  error: string | null;
  thread_id: string | null;
  turn_id: string | null;
  tool_calls: TaskToolCallSummary[];
  timeline: TaskTimelineEntry[];
  allow_shell: boolean;
  trust_mode: boolean;
  auto_approve: boolean;
}

export type EventListener = (event: RuntimeEvent) => void;

export class DeepSeekApiClient {
  private authToken: string | null;

  constructor(private baseUrl: string, token?: string) {
    this.authToken = token ?? null;
  }

  setToken(token: string | null): void {
    this.authToken = token;
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url;
  }

  // ── Threads ──

  async createThread(opts?: {
    model?: string;
    mode?: string;
    workspace?: string;
    allow_shell?: boolean;
    trust_mode?: boolean;
    auto_approve?: boolean;
    system_prompt?: string;
    title?: string;
  }): Promise<ThreadRecord> {
    const body: Record<string, unknown> = {};
    if (opts?.model) body.model = opts.model;
    if (opts?.mode) body.mode = opts.mode;
    if (opts?.workspace) body.workspace = opts.workspace;
    if (opts?.allow_shell !== undefined) body.allow_shell = opts.allow_shell;
    if (opts?.trust_mode !== undefined) body.trust_mode = opts.trust_mode;
    if (opts?.auto_approve !== undefined) body.auto_approve = opts.auto_approve;
    if (opts?.system_prompt) body.system_prompt = opts.system_prompt;
    if (opts?.title) body.title = opts.title;
    return (await this.post("/v1/threads", body)) as ThreadRecord;
  }

  async listThreads(opts?: {
    limit?: number;
    include_archived?: boolean;
  }): Promise<ThreadRecord[]> {
    const params = new URLSearchParams();
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.include_archived) params.set("include_archived", "true");
    const qs = params.toString() ? `?${params.toString()}` : "";
    return (await this.get(`/v1/threads${qs}`)) as ThreadRecord[];
  }

  async listThreadsSummary(opts?: {
    limit?: number;
    search?: string;
  }): Promise<ThreadSummary[]> {
    const params = new URLSearchParams();
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.search) params.set("search", opts.search);
    const qs = params.toString() ? `?${params.toString()}` : "";
    return (await this.get(`/v1/threads/summary${qs}`)) as ThreadSummary[];
  }

  async getThread(threadId: string): Promise<ThreadRecord> {
    const resp = (await this.get(`/v1/threads/${threadId}`)) as any;
    // The server returns ThreadDetail { thread, turns, items, latest_seq }
    // so we must extract the inner ThreadRecord.
    if (resp && typeof resp === 'object' && resp.thread) {
      return resp.thread as ThreadRecord;
    }
    return resp as ThreadRecord;
  }

  async updateThread(threadId: string, updates: {
    archived?: boolean;
    allow_shell?: boolean;
    trust_mode?: boolean;
    auto_approve?: boolean;
    mode?: string;
    model?: string;
    title?: string;
  }): Promise<ThreadRecord> {
    return (await this.patch(`/v1/threads/${threadId}`, updates)) as ThreadRecord;
  }

  // ── Turns ──

  async startTurn(
    threadId: string,
    prompt: string,
    opts?: { model?: string; mode?: string; reasoning_effort?: string; auto_approve?: boolean; trust_mode?: boolean }
  ): Promise<StartTurnResponse> {
    const body: Record<string, unknown> = { prompt };
    if (opts?.model) body.model = opts.model;
    if (opts?.mode) body.mode = opts.mode;
    if (opts?.reasoning_effort) body.reasoning_effort = opts.reasoning_effort;
    if (opts?.auto_approve !== undefined) body.auto_approve = opts.auto_approve;
    if (opts?.trust_mode !== undefined) body.trust_mode = opts.trust_mode;
    return (await this.post(
      `/v1/threads/${threadId}/turns`,
      body
    )) as StartTurnResponse;
  }

  async interruptTurn(threadId: string, turnId: string): Promise<void> {
    await this.post(`/v1/threads/${threadId}/turns/${turnId}/interrupt`, {});
  }

  async compactThread(threadId: string, reason?: string): Promise<void> {
    const body: Record<string, unknown> = {};
    if (reason) body.reason = reason;
    await this.post(`/v1/threads/${threadId}/compact`, body);
  }

  // ── Approvals ──

  async decideApproval(
    approvalId: string,
    decision: "allow" | "deny",
    remember = false
  ): Promise<void> {
    await this.post(`/v1/approvals/${approvalId}`, { decision, remember });
  }

  // ── Detail ──

  async getThreadDetail(threadId: string): Promise<ThreadDetailResponse> {
    return (await this.get(
      `/v1/threads/${threadId}`
    )) as ThreadDetailResponse;
  }

  // ── Health ──

  async health(): Promise<{ status: string; service: string; mode: string }> {
    return (await this.get("/health")) as { status: string; service: string; mode: string };
  }

  // ── Tasks ──

  async listTasks(opts?: { limit?: number }): Promise<{ tasks: TaskSummary[]; counts: TaskCounts }> {
    const params = new URLSearchParams();
    if (opts?.limit) params.set("limit", String(opts.limit));
    const qs = params.toString() ? `?${params.toString()}` : "";
    return (await this.get(`/v1/tasks${qs}`)) as { tasks: TaskSummary[]; counts: TaskCounts };
  }

  async createTask(opts: {
    prompt: string;
    model?: string;
    mode?: string;
    workspace?: string;
    auto_approve?: boolean;
  }): Promise<TaskRecord> {
    return (await this.post("/v1/tasks", opts)) as TaskRecord;
  }

  async getTask(taskId: string): Promise<TaskRecord> {
    return (await this.get(`/v1/tasks/${taskId}`)) as TaskRecord;
  }

  async cancelTask(taskId: string): Promise<void> {
    await this.post(`/v1/tasks/${taskId}/cancel`, {});
  }

  // ── SSE Event Stream ──

  streamEvents(
    threadId: string,
    sinceSeq: number | null,
    onEvent: EventListener,
    onError?: (err: Error) => void
  ): AbortController {
    const controller = new AbortController();
    const params = new URLSearchParams();
    // always send since_seq param (0 for initial)
    params.set("since_seq", String(sinceSeq ?? 0));
    const qs = params.toString();
    const path = `/v1/threads/${threadId}/events?${qs}`;
    const url = new URL(path, this.baseUrl);

    const headers: Record<string, string> = { Accept: "text/event-stream" };
    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }

    const req = http.get(
      url,
      { headers, signal: controller.signal },
      (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          let body = "";
          res.on("data", (c: Buffer) => (body += c.toString()));
          res.on("end", () => onError?.(new Error(`SSE error ${res.statusCode}: ${body}`)));
          return;
        }

        let buffer = "";
        let currentEvent: string | null = null;
        let currentData: string | null = null;

        res.on("data", (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("event:")) {
              currentEvent = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              currentData = line.slice(5).trim();
            } else if (line === "" && currentEvent && currentData) {
              try {
                const parsed = JSON.parse(currentData) as RuntimeEvent;
                onEvent(parsed);
              } catch {
                // skip malformed events
              }
              currentEvent = null;
              currentData = null;
            }
            // ignore comment lines (starting with ':') and empty lines without event+data
          }
        });

        res.on("error", (err: Error) => {
          if (!controller.signal.aborted) onError?.(err);
        });
      }
    );

    req.on("error", (err: Error) => {
      if (!controller.signal.aborted) onError?.(err);
    });
    return controller;
  }

  // ── HTTP helpers ──

  private async get(path: string): Promise<unknown> {
    return this.request("GET", path, undefined);
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    return this.request("POST", path, body);
  }

  private async patch(path: string, body: unknown): Promise<unknown> {
    return this.request("PATCH", path, body);
  }

  private request(
    method: string,
    path: string,
    body: unknown
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const payload = body ? JSON.stringify(body) : undefined;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (this.authToken) {
        headers["Authorization"] = `Bearer ${this.authToken}`;
      }
      if (payload) {
        headers["Content-Length"] = String(Buffer.byteLength(payload));
      }

      const req = http.request(
        url,
        { method, headers },
        (res) => {
          let data = "";
          res.on("data", (chunk: Buffer) => (data += chunk.toString()));
          res.on("end", () => {
            if (res.statusCode && res.statusCode >= 400) {
              reject(
                new Error(
                  `API error ${res.statusCode}: ${data.slice(0, 500)}`
                )
              );
              return;
            }
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve(data);
            }
          });
        }
      );

      req.on("error", reject);
      req.setTimeout(30000, () => {
        req.destroy(new Error("Request timed out (30s)"));
      });
      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  }
}
