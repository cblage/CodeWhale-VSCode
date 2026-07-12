import type { AgentRunRecord } from "../types";
import type { ChatMessage, SubagentTranscriptEntry } from "./session-state";

export interface AgentConversationRefs {
  ids: Set<string>;
  names: Set<string>;
  objectives: Set<string>;
}

interface PersistedAgentSnapshot {
  id?: string;
  nickname?: string;
  session_name?: string;
  result?: string | null;
  checkpoint?: {
    checkpoint_id?: string;
    created_at_ms?: number;
    message_count?: number;
    omitted_messages?: number;
    messages?: unknown[];
  } | null;
}

export interface PersistedSubagentState {
  agents?: PersistedAgentSnapshot[];
}

const AGENT_TOOL_NAMES = new Set([
  "agent",
  "agent_open",
  "agent_spawn",
  "agent_close",
  "agent_cancel",
]);

function normalizedText(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function addString(set: Set<string>, value: unknown): void {
  if (typeof value === "string" && value.trim()) {
    set.add(value.trim());
  }
}

function collectIdsFromText(ids: Set<string>, value: unknown): void {
  if (typeof value !== "string") return;
  const matches = value.match(/\b(?:agent|run)_[A-Za-z0-9_-]+\b/g) || [];
  for (const match of matches) ids.add(match);
}

/** Collect durable agent references mentioned by the currently loaded chat. */
export function collectConversationAgentRefs(messages: ChatMessage[]): AgentConversationRefs {
  const refs: AgentConversationRefs = {
    ids: new Set<string>(),
    names: new Set<string>(),
    objectives: new Set<string>(),
  };

  for (const message of messages) {
    for (const toolCall of message.toolCalls || []) {
      if (!AGENT_TOOL_NAMES.has(toolCall.name)) continue;
      const input = toolCall.input || {};
      addString(refs.ids, input.agent_id);
      addString(refs.ids, input.run_id);
      addString(refs.ids, input.worker_id);
      collectIdsFromText(refs.ids, toolCall.output);

      const action = normalizedText(input.action).toLowerCase();
      const isSpawn = !action || action === "start" || action === "open" || action === "spawn";
      if (isSpawn) {
        addString(refs.names, input.name);
        addString(refs.names, input.session_name);
        const objective = normalizedText(input.objective || input.prompt);
        if (objective) refs.objectives.add(objective);
      }
    }
  }

  return refs;
}

function runIds(run: AgentRunRecord): string[] {
  return [run.spec?.worker_id, run.spec?.run_id]
    .filter((value): value is string => typeof value === "string" && value.length > 0);
}

/** Keep only the runs rooted in this conversation, plus their descendants. */
export function filterAgentRunsForConversation(
  runs: AgentRunRecord[],
  refs: AgentConversationRefs,
): AgentRunRecord[] {
  const includedIds = new Set(refs.ids);
  const included = new Set<AgentRunRecord>();

  for (const run of runs) {
    const ids = runIds(run);
    const sessionName = run.spec?.session_name || "";
    const objective = normalizedText(run.spec?.objective);
    if (
      ids.some((id) => includedIds.has(id))
      || (sessionName && refs.names.has(sessionName))
      || (objective && refs.objectives.has(objective))
    ) {
      included.add(run);
      for (const id of ids) includedIds.add(id);
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const run of runs) {
      if (included.has(run)) continue;
      if (run.parent_run_id && includedIds.has(run.parent_run_id)) {
        included.add(run);
        for (const id of runIds(run)) includedIds.add(id);
        changed = true;
      }
    }
  }

  return runs.filter((run) => included.has(run));
}

function contentBlockText(block: unknown): string {
  if (typeof block === "string") return block.trim();
  if (!block || typeof block !== "object") return "";
  const record = block as Record<string, unknown>;
  if (record.type === "text" && typeof record.text === "string") return record.text.trim();
  return "";
}

export function latestAssistantTranscriptText(checkpoint: PersistedAgentSnapshot["checkpoint"]): string {
  const messages = checkpoint?.messages;
  if (!Array.isArray(messages)) return "";
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (!message || typeof message !== "object") continue;
    const record = message as Record<string, unknown>;
    if (record.role !== "assistant") continue;
    if (typeof record.content === "string" && record.content.trim()) return record.content.trim();
    if (Array.isArray(record.content)) {
      const text = record.content.map(contentBlockText).filter(Boolean).join("\n\n").trim();
      if (text) return text;
    }
  }
  return "";
}

function findPersistedAgent(
  run: AgentRunRecord,
  agents: PersistedAgentSnapshot[],
): PersistedAgentSnapshot | undefined {
  const ids = new Set(runIds(run));
  return agents.find((agent) =>
    (agent.id && ids.has(agent.id))
    || (agent.session_name && agent.session_name === run.spec?.session_name)
  );
}

/**
 * Project the visible assistant text from bounded subagent checkpoints into
 * stable, presentation-only main-chat entries. Thinking and tool traffic are
 * intentionally excluded: this feed mirrors what the subagent said, not its
 * hidden reasoning or noisy execution protocol.
 */
export function extractSubagentTranscriptEntries(
  runs: AgentRunRecord[],
  state: PersistedSubagentState | null,
): SubagentTranscriptEntry[] {
  const agents = Array.isArray(state?.agents) ? state.agents : [];
  const entries: SubagentTranscriptEntry[] = [];

  for (const run of runs) {
    const persisted = findPersistedAgent(run, agents);
    const checkpoint = persisted?.checkpoint;
    const messages = Array.isArray(checkpoint?.messages) ? checkpoint.messages : [];
    if (!persisted || messages.length === 0) continue;

    const runId = runIds(run)[0] || persisted.id || run.spec?.session_name || "agent";
    const messageCount = typeof checkpoint?.message_count === "number"
      ? checkpoint.message_count
      : messages.length + (checkpoint?.omitted_messages || 0);
    const firstMessageIndex = Math.max(
      0,
      messageCount - messages.length,
      checkpoint?.omitted_messages || 0,
    );
    const nickname = persisted.nickname
      || run.nickname
      || run.spec?.session_name
      || runId;
    // A checkpoint is the last durable transcript snapshot and is therefore
    // the strongest cross-agent ordering signal. Fall back to the run's
    // terminal/activity timestamps only when an older checkpoint omits it.
    const lastUpdateAtMs = checkpoint?.created_at_ms
      ?? run.completed_at_ms
      ?? run.updated_at_ms
      ?? null;

    for (let localIndex = 0; localIndex < messages.length; localIndex++) {
      const message = messages[localIndex];
      if (!message || typeof message !== "object") continue;
      const record = message as Record<string, unknown>;
      if (record.role !== "assistant") continue;
      const absoluteMessageIndex = firstMessageIndex + localIndex;

      if (typeof record.content === "string" && record.content.trim()) {
        entries.push({
          id: `${runId}:${absoluteMessageIndex}:0`,
          agent_id: runId,
          nickname,
          status: String(run.status || ""),
          completed_at_ms: run.completed_at_ms,
          runtime_available: run.runtime_available,
          agent_type: run.spec?.agent_type || run.actor_kind || "",
          profile: run.spec?.profile || null,
          model: run.spec?.model || "",
          session_name: run.spec?.session_name || persisted.session_name || null,
          content: record.content.trim(),
          message_index: absoluteMessageIndex,
          block_index: 0,
          last_update_at_ms: lastUpdateAtMs,
          checkpoint_created_at_ms: checkpoint?.created_at_ms ?? null,
        });
        continue;
      }

      if (!Array.isArray(record.content)) continue;
      for (let blockIndex = 0; blockIndex < record.content.length; blockIndex++) {
        const content = contentBlockText(record.content[blockIndex]);
        if (!content) continue;
        entries.push({
          id: `${runId}:${absoluteMessageIndex}:${blockIndex}`,
          agent_id: runId,
          nickname,
          status: String(run.status || ""),
          completed_at_ms: run.completed_at_ms,
          runtime_available: run.runtime_available,
          agent_type: run.spec?.agent_type || run.actor_kind || "",
          profile: run.spec?.profile || null,
          model: run.spec?.model || "",
          session_name: run.spec?.session_name || persisted.session_name || null,
          content,
          message_index: absoluteMessageIndex,
          block_index: blockIndex,
          last_update_at_ms: lastUpdateAtMs,
          checkpoint_created_at_ms: checkpoint?.created_at_ms ?? null,
        });
      }
    }
  }

  return entries;
}

/** Merge nickname/latest output and, for detail views, the bounded transcript tail. */
export function enrichAgentRunsFromState(
  runs: AgentRunRecord[],
  state: PersistedSubagentState | null,
  includeTranscript = false,
): AgentRunRecord[] {
  const agents = Array.isArray(state?.agents) ? state.agents : [];
  return runs.map((run) => {
    const persisted = findPersistedAgent(run, agents);
    if (!persisted) return run;
    const checkpointText = latestAssistantTranscriptText(persisted.checkpoint);
    return {
      ...run,
      nickname: persisted.nickname || run.nickname || null,
      latest_output:
        checkpointText
        || persisted.result
        || run.latest_output
        || run.result_summary
        || null,
      persisted_result: persisted.result ?? run.persisted_result ?? null,
      ...(includeTranscript && persisted.checkpoint ? {
        transcript: {
          source: "checkpoint",
          message_count: persisted.checkpoint.message_count ?? persisted.checkpoint.messages?.length ?? 0,
          omitted_messages: persisted.checkpoint.omitted_messages ?? 0,
          messages: persisted.checkpoint.messages || [],
        },
      } : {}),
    };
  });
}
