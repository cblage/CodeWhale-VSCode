// ── Types matching DeepSeek Runtime API ──
// Extracted from api-client.ts for clean module boundaries.
// api-client.ts re-exports these for backward compatibility.

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

export interface UndoTurnResponse {
  thread: ThreadRecord;
  original_user_text: string | null;
}

export interface PatchUndoResult {
  files_restored: boolean;
  summary: string | null;
  snapshot_label: string | null;
}

export interface PatchUndoResponse {
  patch_result: PatchUndoResult;
  thread: ThreadRecord;
  original_user_text: string | null;
}

export interface RetryTurnResponse {
  thread: ThreadRecord;
  turn: TurnRecord;
}

export interface SnapshotEntry {
  id: string;
  label: string;
  timestamp: number;
}

export interface ThreadDetailResponse {
  thread: ThreadRecord;
  turns: TurnRecord[];
  items: TurnItemRecord[];
  latest_seq?: number;
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

export interface SkillEntry {
  name: string;
  description: string;
  path: string;
  enabled: boolean;
  is_bundled: boolean;
}

export interface SkillsResponse {
  directory: string;
  directories: string[];
  warnings: string[];
  skills: SkillEntry[];
}

export interface SetSkillEnabledResponse {
  name: string;
  enabled: boolean;
}

export interface SessionMetadata {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  total_tokens: number;
  model: string;
  workspace: string;
  mode?: string | null;
  cost?: {
    session_cost_usd: number;
    session_cost_cny: number;
    subagent_cost_usd: number;
    subagent_cost_cny: number;
  };
  parent_session_id?: string | null;
  forked_from_message_count?: number | null;
}

export interface SessionsResponse {
  sessions: SessionMetadata[];
}

export interface SessionDetailResponse {
  metadata: SessionMetadata;
  messages: Record<string, unknown>[];
  system_prompt?: string | null;
}

export interface ResumeSessionResponse {
  thread_id: string;
  session_id: string;
  message_count: number;
  summary: string;
}

export interface SaveThreadAsSessionRequest {
  thread_id: string;
  session_id?: string;
  title?: string;
}

export interface SaveThreadAsSessionResponse {
  session_id: string;
  thread_id: string;
  message_count: number;
  title: string;
}

export interface WorkspaceStatusResponse {
  workspace: string;
  git_repo: boolean;
  branch?: string | null;
  staged: number;
  unstaged: number;
  untracked: number;
  ahead?: number | null;
  behind?: number | null;
}

export interface RuntimeInfoResponse {
  bind_host: string;
  port: number;
  auth_required: boolean;
  version: string;
}

export interface RuntimeApiCapabilities {
  saveSession: boolean;
  threadUndo: boolean;
  threadPatchUndo: boolean;
  threadRetry: boolean;
  snapshotList: boolean;
  snapshotRestore: boolean;
}

export interface UsageTotals {
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  reasoning_tokens: number;
  cost_usd: number;
  turns: number;
}

export interface UsageBucket {
  key: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  reasoning_tokens: number;
  cost_usd: number;
  turns: number;
}

export interface UsageAggregation {
  since?: string | null;
  until?: string | null;
  group_by: string;
  totals: UsageTotals;
  buckets: UsageBucket[];
}

export type AutomationStatus = "active" | "paused";
export type AutomationRunStatus = "queued" | "running" | "completed" | "failed" | "canceled";

export interface AutomationRecord {
  schema_version: number;
  id: string;
  name: string;
  prompt: string;
  rrule: string;
  cwds: string[];
  status: AutomationStatus;
  created_at: string;
  updated_at: string;
  next_run_at?: string | null;
  last_run_at?: string | null;
}

export interface AutomationRunRecord {
  schema_version: number;
  id: string;
  automation_id: string;
  scheduled_for: string;
  status: AutomationRunStatus;
  created_at: string;
  started_at?: string | null;
  ended_at?: string | null;
  task_id?: string | null;
  thread_id?: string | null;
  turn_id?: string | null;
  error?: string | null;
}

export interface CreateAutomationRequest {
  name: string;
  prompt: string;
  rrule: string;
  cwds?: string[];
  status?: AutomationStatus;
}

export interface UpdateAutomationRequest {
  name?: string;
  prompt?: string;
  rrule?: string;
  cwds?: string[];
  status?: AutomationStatus;
}

export type EventListener = (event: RuntimeEvent) => void;

/** Interface for the engine object that ApiClient syncs with */
export interface EngineRef {
  ensureRunning(): Promise<void>;
  readonly baseUrl: string;
  readonly token: string | null;
}

// ── Re-exports from other modules ──

export { CodeWhaleEngine } from "./api/engine";
export { CodeWhaleApiClient } from "./api/api-client";
