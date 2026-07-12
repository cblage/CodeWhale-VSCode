import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { configValues } = vi.hoisted(() => ({
  configValues: {
    autoWakeMasterForAgents: true,
    agentWakeIntervalSeconds: 30,
  } as Record<string, unknown>,
}));

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: (key: string, fallback?: unknown) => key in configValues ? configValues[key] : fallback,
    })),
    workspaceFolders: undefined,
  },
  window: { showErrorMessage: vi.fn() },
  commands: { executeCommand: vi.fn() },
  env: { language: "en" },
  Uri: {
    file: (fsPath: string) => ({ fsPath }),
    parse: (value: string) => ({ toString: () => value }),
  },
  ConfigurationTarget: { Global: "global" },
}));

import { ChatProvider } from "./chat-provider";

function run(workerId: string, status = "running") {
  return {
    status,
    latest_message: "working",
    parent_run_id: null,
    spec: {
      worker_id: workerId,
      run_id: workerId,
      session_name: workerId,
      objective: `Inspect ${workerId}`,
    },
  } as any;
}

function completedRun(workerId: string) {
  return {
    ...run(workerId, "completed"),
    completed_at_ms: Date.parse("2026-07-11T10:00:01Z"),
    latest_message: "completed",
  } as any;
}

function activeThreadDetail(active = true) {
  const turn = {
    id: "turn-current",
    thread_id: "thread-current",
    status: active ? "in_progress" : "completed",
    created_at: "2026-07-11T00:00:00Z",
    input_summary: "Do the work",
    item_ids: [],
    steer_count: 0,
  };
  return {
    thread: { id: "thread-current", latest_turn_id: turn.id },
    turns: [turn],
    items: [],
    latest_seq: 1,
  };
}

function makeProvider(options: {
  runs?: any[];
  activeTurn?: boolean;
  nudge?: ReturnType<typeof vi.fn>;
} = {}) {
  const runs = options.runs || [run("agent-b"), run("agent-a", "waiting_for_user")];
  const nudgeAgentRuns = options.nudge || vi.fn().mockResolvedValue({
    accepted: true,
    coalesced: false,
    thread_id: "thread-current",
    turn_id: "turn-current",
    agent_ids: runs.map((item) => item.spec.worker_id),
  });
  const api = {
    bindEngine: vi.fn(),
    ensureReady: vi.fn().mockResolvedValue(undefined),
    getThreadDetail: vi.fn().mockResolvedValue(activeThreadDetail(options.activeTurn !== false)),
    listAgentRuns: vi.fn().mockResolvedValue({ runs }),
    nudgeAgentRuns,
  };
  const provider = new ChatProvider({} as any, {} as any, api as any);
  provider.currentThread = { id: "thread-current" } as any;
  provider.messages = [];
  (provider as any).cachedScopedAgentRuns = runs;
  (provider as any).apiCapabilities.agentRunNudge = true;
  (provider as any).debugLog = vi.fn();
  provider.postMessage = vi.fn();
  return { provider, api, nudgeAgentRuns };
}

describe("ChatProvider master-agent watchdog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-11T10:00:00Z"));
    configValues.autoWakeMasterForAgents = true;
    configValues.agentWakeIntervalSeconds = 30;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("nudges once per configured quiet interval without refresh calls postponing it", async () => {
    const { provider, nudgeAgentRuns } = makeProvider();

    (provider as any).reconcileAgentWatchdog();
    for (let elapsed = 0; elapsed < 30; elapsed += 5) {
      await vi.advanceTimersByTimeAsync(5_000);
      (provider as any).reconcileAgentWatchdog();
    }

    expect(nudgeAgentRuns).toHaveBeenCalledTimes(1);
    expect(nudgeAgentRuns).toHaveBeenCalledWith(
      "thread-current",
      ["agent-a", "agent-b"],
    );

    await vi.advanceTimersByTimeAsync(30_000);
    expect(nudgeAgentRuns).toHaveBeenCalledTimes(2);
    provider.dispose();
  });

  it("restarts the quiet interval after real master activity", async () => {
    const { provider, nudgeAgentRuns } = makeProvider();
    (provider as any).reconcileAgentWatchdog();

    await vi.advanceTimersByTimeAsync(20_000);
    (provider as any).noteMasterActivity();
    await vi.advanceTimersByTimeAsync(29_999);
    expect(nudgeAgentRuns).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(nudgeAgentRuns).toHaveBeenCalledTimes(1);
    provider.dispose();
  });

  it("does not nudge while approval or user input is pending", async () => {
    const blocked = makeProvider();
    (blocked.provider as any).pendingApprovals.set("approval-1", {});
    (blocked.provider as any).reconcileAgentWatchdog();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(blocked.nudgeAgentRuns).not.toHaveBeenCalled();
    (blocked.provider as any).pendingApprovals.clear();
    (blocked.provider as any).pendingUserInputs.set("input-1", {});
    await vi.advanceTimersByTimeAsync(30_000);
    expect(blocked.nudgeAgentRuns).not.toHaveBeenCalled();
    blocked.provider.dispose();
  });

  it("uses the core durable watchdog turn when the parent is idle", async () => {
    const idle = makeProvider({ activeTurn: false });
    (idle.provider as any).reconcileAgentWatchdog();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(idle.api.getThreadDetail).toHaveBeenCalledTimes(1);
    expect(idle.nudgeAgentRuns).toHaveBeenCalledTimes(1);
    expect((idle.provider as any).currentTurnId).toBe("turn-current");

    await vi.advanceTimersByTimeAsync(29_999);
    expect(idle.nudgeAgentRuns).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(idle.api.getThreadDetail).toHaveBeenCalledTimes(2);
    expect(idle.nudgeAgentRuns).toHaveBeenCalledTimes(2);
    idle.provider.dispose();
  });

  it("retains an active-to-zero batch until the core durable handoff becomes active", async () => {
    const { provider, api, nudgeAgentRuns } = makeProvider({
      runs: [run("agent-a"), run("agent-b")],
    });
    (provider as any).reconcileAgentWatchdog();

    (provider as any).cachedScopedAgentRuns = [
      completedRun("agent-a"),
      completedRun("agent-b"),
    ];
    (provider as any).reconcileAgentWatchdog();

    expect((provider as any).agentWatchdogCompletionPending).toBe(true);
    expect([...(provider as any).agentWatchdogBatchAgentIds]).toEqual([
      "agent-a",
      "agent-b",
    ]);
    expect(nudgeAgentRuns).not.toHaveBeenCalled();

    // Repeated terminal receipt refreshes must neither forget the batch nor
    // synthesize a user turn from ids that do not contain completion data.
    for (let i = 0; i < 4; i++) {
      (provider as any).reconcileAgentWatchdog();
    }
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(api.getThreadDetail).not.toHaveBeenCalled();
    expect((provider as any).agentWatchdogCompletionPending).toBe(true);
    expect(nudgeAgentRuns).not.toHaveBeenCalled();

    // Unrelated master activity is not proof that the completion payload was
    // durably handed off.
    (provider as any).noteMasterActivity();
    expect((provider as any).agentWatchdogCompletionPending).toBe(true);

    // The exact normal turn.started marker from core's SubAgentHandoff turn
    // is the acknowledgement; only then can the batch be discarded.
    (provider as any).handleRuntimeEvent({
      seq: 2,
      event: "turn.started",
      thread_id: "thread-current",
      turn_id: "turn-handoff",
      payload: {
        source: "subagent_completion",
        internal: true,
        agent_ids: ["agent-a", "agent-b"],
      },
    });
    expect((provider as any).agentWatchdogCompletionPending).toBe(false);
    expect((provider as any).agentWatchdogBatchAgentIds.size).toBe(0);
    provider.dispose();
  });

  it("accepts the durable completion marker before the terminal receipt refresh", () => {
    const { provider, nudgeAgentRuns } = makeProvider({
      runs: [run("agent-a"), run("agent-b")],
    });
    (provider as any).reconcileAgentWatchdog();
    // Even if a delayed current-turn id makes the new turn look stale to the
    // presentation router, the durable completion handshake must survive.
    (provider as any).currentTurnId = "turn-old";

    (provider as any).handleRuntimeEvent({
      seq: 2,
      event: "turn.started",
      thread_id: "thread-current",
      turn_id: "turn-handoff",
      payload: {
        source: "subagent_completion",
        internal: true,
        agent_ids: ["agent-a", "agent-b"],
      },
    });
    (provider as any).cachedScopedAgentRuns = [
      completedRun("agent-a"),
      completedRun("agent-b"),
    ];
    (provider as any).reconcileAgentWatchdog();

    expect((provider as any).agentWatchdogCompletionPending).toBe(false);
    expect((provider as any).agentWatchdogBatchAgentIds.size).toBe(0);
    expect(nudgeAgentRuns).not.toHaveBeenCalled();
    provider.dispose();
  });

  it("parks the legacy-core idle receipt instead of retrying it forever", async () => {
    const nudge = vi.fn().mockRejectedValue(
      new Error(
        "API error 409: No active turn on thread thread-current; "
        + "idle agent watchdog turns are not supported",
      ),
    );
    const { provider, api } = makeProvider({ nudge });
    (provider as any).reconcileAgentWatchdog();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(nudge).toHaveBeenCalledTimes(1);
    expect(api.getThreadDetail).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(nudge).toHaveBeenCalledTimes(1);
    expect(api.getThreadDetail).toHaveBeenCalledTimes(1);
    provider.dispose();
  });

  it("honors disablement, the minimum interval, and cleanup", async () => {
    configValues.agentWakeIntervalSeconds = 2;
    const { provider, nudgeAgentRuns } = makeProvider();
    (provider as any).reconcileAgentWatchdog();
    await vi.advanceTimersByTimeAsync(9_999);
    expect(nudgeAgentRuns).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(nudgeAgentRuns).toHaveBeenCalledTimes(1);

    configValues.autoWakeMasterForAgents = false;
    provider.notifyAgentWatchdogSettingsChanged();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(nudgeAgentRuns).toHaveBeenCalledTimes(1);

    configValues.autoWakeMasterForAgents = true;
    provider.notifyAgentWatchdogSettingsChanged();
    provider.dispose();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(nudgeAgentRuns).toHaveBeenCalledTimes(1);
  });

  it("coalesces overlapping ticks while the runtime request is in flight", async () => {
    let resolveNudge!: (value: unknown) => void;
    const pending = new Promise((resolve) => { resolveNudge = resolve; });
    const nudge = vi.fn().mockReturnValue(pending);
    const { provider } = makeProvider({ nudge });
    (provider as any).reconcileAgentWatchdog();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(nudge).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(90_000);
    expect(nudge).toHaveBeenCalledTimes(1);

    resolveNudge({
      accepted: true,
      coalesced: false,
      thread_id: "thread-current",
      turn_id: "turn-current",
      agent_ids: ["agent-a", "agent-b"],
    });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(nudge).toHaveBeenCalledTimes(2);
    provider.dispose();
  });

  it("nudges a parked checkpoint needing parent action but ignores unavailable receipts", async () => {
    const parked = {
      ...run("agent-parked", "waiting_for_user"),
      completed_at_ms: 123,
      recommended_action: { action: "inspect_or_replace" },
    };
    const unavailable = {
      ...run("agent-stale", "running"),
      completed_at_ms: null,
      runtime_available: false,
    };
    const { provider, nudgeAgentRuns } = makeProvider({ runs: [unavailable, parked] });

    (provider as any).reconcileAgentWatchdog();
    await vi.advanceTimersByTimeAsync(30_000);

    expect(nudgeAgentRuns).toHaveBeenCalledWith("thread-current", ["agent-parked"]);
    provider.dispose();
  });
});
