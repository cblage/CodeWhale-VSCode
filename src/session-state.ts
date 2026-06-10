/**
 * Unified session state for ChatProvider.
 *
 * Replaces the 20+ scattered instance variables that were manually
 * reset in handleNewThread(), loadThread(), loadSessionMessages(),
 * and cleanup(). A single reset() call now covers all fields.
 */

import type { ThreadRecord } from "./api-client";

// ── Re-exported from chat-provider for type safety ──

export interface ContentBlock {
  type: "text" | "thinking" | "tool_call";
  content?: string;
  contentHtml?: string;
  toolCallIdx?: number;
}

export interface ToolCallInfo {
  name: string;
  displayName?: string;
  input: Record<string, unknown>;
  output?: string;
  status: "pending" | "running" | "complete" | "error" | "awaiting_approval";
  approvalId?: string;
  approvalSummary?: string;
  itemId?: string;
  fileChange?: FileChangeInfo;
}

export interface FileChangeInfo {
  filePath: string;
  changeType: "created" | "modified" | "deleted";
  addedLines: number;
  removedLines: number;
  diff?: string;
  oldContent?: string;
  newContent?: string;
  toolName?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  thinking?: string;
  contentHtml?: string;
  thinkingHtml?: string;
  toolCalls?: ToolCallInfo[];
  blocks?: ContentBlock[];
  status: "streaming" | "complete" | "error";
  timestamp: number;
}

export interface ChecklistItem {
  id: string;
  content: string;
  status: string;
}

export interface ActiveItem {
  kind: string;
  msgId: string;
  toolCallName?: string;
  toolCallIdx?: number;
  blockIdx?: number;
}

export interface UserInputState {
  questions: Array<{
    header: string;
    id: string;
    question: string;
    options: Array<{ label: string; description: string }>;
  }>;
  answers: Array<{ id: string; label: string; value: string }>;
  answeredQuestions: Set<string>;
}

export interface SessionStats {
  sessionCostUsd: number;
  sessionCostCny: number;
  lastCacheHitTokens: number;
  lastCacheMissTokens: number;
  lastInputTokens: number;
  lastOutputTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

// ── Session State ──

export interface SessionStateData {
  currentThread: ThreadRecord | null;
  viewingSessionId: string | null;
  messages: ChatMessage[];
  lastEventSeq: number;
  currentTurnId: string | null;
  activeItems: Map<string, ActiveItem>;
  currentTextBlockIdx: number;
  currentThinkingBlockIdx: number;
  cycleCount: number;
  checklistItems: ChecklistItem[];
  checklistCompletionPct: number;
  coherenceState: string;
  coherenceLabel: string;
  turnFileChanges: FileChangeInfo[];
  stats: SessionStats;
  pendingApprovals: Map<string, ToolCallInfo>;
  pendingUserInputs: Map<string, UserInputState>;
}

function createEmptyState(): SessionStateData {
  return {
    currentThread: null,
    viewingSessionId: null,
    messages: [],
    lastEventSeq: 0,
    currentTurnId: null,
    activeItems: new Map(),
    currentTextBlockIdx: -1,
    currentThinkingBlockIdx: -1,
    cycleCount: 0,
    checklistItems: [],
    checklistCompletionPct: 0,
    coherenceState: "healthy",
    coherenceLabel: "",
    turnFileChanges: [],
    stats: {
      sessionCostUsd: 0,
      sessionCostCny: 0,
      lastCacheHitTokens: 0,
      lastCacheMissTokens: 0,
      lastInputTokens: 0,
      lastOutputTokens: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
    },
    pendingApprovals: new Map(),
    pendingUserInputs: new Map(),
  };
}

/**
 * Manages session state with a single reset point.
 * All state transitions go through update() or direct property access.
 */
export class SessionStateStore {
  private state: SessionStateData = createEmptyState();

  /** Reset all session state to initial values */
  reset(): void {
    this.state = createEmptyState();
  }

  /** Get the mutable state object (for direct property access) */
  get data(): SessionStateData {
    return this.state;
  }

  /** Update specific fields of the state */
  update(patch: Partial<SessionStateData>): void {
    Object.assign(this.state, patch);
  }

  /** Update only the stats sub-object */
  updateStats(patch: Partial<SessionStats>): void {
    Object.assign(this.state.stats, patch);
  }

  /** Check if a thread is currently active */
  get hasActiveThread(): boolean {
    return this.state.currentThread !== null;
  }

  /** Check if viewing a saved session */
  get isViewingSession(): boolean {
    return this.state.viewingSessionId !== null;
  }
}
