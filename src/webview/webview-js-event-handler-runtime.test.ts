import { describe, expect, it } from "vitest";
import vm from "node:vm";
import { getEventHandlerScript } from "./webview-js-event-handler";
import { makeTr } from "./webview-test-helpers";

class FakeClassList {
  private values = new Set<string>();

  add(...names: string[]): void {
    for (const name of names) this.values.add(name);
  }

  remove(...names: string[]): void {
    for (const name of names) this.values.delete(name);
  }

  contains(name: string): boolean {
    return this.values.has(name);
  }

  toggle(name: string, force?: boolean): boolean {
    if (force === undefined) {
      if (this.values.has(name)) {
        this.values.delete(name);
        return false;
      }
      this.values.add(name);
      return true;
    }
    if (force) {
      this.values.add(name);
      return true;
    }
    this.values.delete(name);
    return false;
  }
}

class FakeElement {
  public textContent = "";
  public innerHTML = "";
  public className = "";
  public title = "";
  public type = "";
  public value = "";
  public scrollTop = 0;
  public scrollHeight = 0;
  public children: FakeElement[] = [];
  public removed = false;
  public classList = new FakeClassList();
  public parentElement: FakeElement | null = null;
  private listeners = new Map<string, (event: unknown) => void>();
  private attributes = new Map<string, string>();

  addEventListener(name: string, handler: (event: unknown) => void): void {
    this.listeners.set(name, handler);
  }

  querySelector(selector: string): FakeElement | null {
    const className = selector.startsWith(".") ? selector.slice(1) : "";
    for (const child of this.children) {
      if (className && child.className.split(/\s+/).includes(className)) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }

  querySelectorAll(): FakeElement[] {
    return [];
  }

  appendChild(child: unknown): void {
    if (child instanceof FakeElement) {
      child.parentElement = this;
      this.children.push(child);
    }
  }

  insertBefore(_child: unknown, _before: unknown): void {}

  remove(): void {
    if (this.parentElement) {
      const index = this.parentElement.children.indexOf(this);
      if (index >= 0) this.parentElement.children.splice(index, 1);
      this.parentElement = null;
    }
    this.removed = true;
  }

  click(): void {
    this.listeners.get("click")?.({});
  }

  focus(): void {}

  setSelectionRange(_start: number, _end: number): void {}

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

function createRuntimeHarness() {
  const elements = new Map<string, FakeElement>();
  const getEl = (id: string) => {
    let element = elements.get(id);
    if (!element) {
      element = new FakeElement();
      elements.set(id, element);
    }
    return element;
  };

  // The generated HTML owns this SVG child. Seed it explicitly because this
  // runtime harness executes only the generated script, not the HTML shell.
  const contextUsageGauge = getEl("context-usage-gauge");
  const contextUsageValue = new FakeElement();
  contextUsageValue.className = "context-usage-value";
  contextUsageGauge.appendChild(contextUsageValue);

  const postMessages: Array<Record<string, unknown>> = [];
  const windowListeners = new Map<string, (event: any) => void>();
  const documentListeners = new Map<string, (event: any) => void>();
  const taskDetailCalls: unknown[] = [];
  const agentDetailCalls: unknown[] = [];
  const agentRunUpdates: unknown[] = [];
  const agentStopFinishes: Array<string[] | null> = [];
  const subagentAdds: unknown[] = [];
  const subagentUpdates: unknown[] = [];
  const steerAdds: unknown[] = [];
  const skillCommandCalls: unknown[] = [];
  const sendStopStateCalls: boolean[] = [];
  const showAgentToolCardCalls: boolean[] = [];
  const toolDetailSettingCalls: Array<{ showToolDetails: boolean; calmMode: boolean }> = [];
  let isStreaming = false;

  const windowObj: Record<string, any> = {
    __wvI18n: makeTr(),
    __wvEscapeHtml: (value: unknown) => String(value ?? ""),
    __wvFormatLoadedThread: () => "",
    __wvVscode: {
      postMessage: (msg: Record<string, unknown>) => {
        postMessages.push(msg);
      },
    },
    __wvDiffStore: {
      clear: () => {},
    },
    __wvDiffIdCounter: {
      value: 0,
    },
    __wvApiCapabilities: {},
    __wvSidebar: {
      closeTaskDetail: () => {},
      applyShowThreadList: () => {},
      setSessions: () => {},
      setShowAllWorkspaces: () => {},
      renderSessions: () => {},
      setThreads: () => {},
      renderThreads: () => {},
      renderTasks: () => {},
      setAgentRuns: () => {},
      renderAgents: () => {},
      updateAgentRuns: (runs: unknown) => {
        agentRunUpdates.push(runs);
      },
      finishAgentStop: (runIds: string[] | null) => {
        agentStopFinishes.push(runIds);
      },
      applyAgentStopCapabilities: () => {},
      setWorkState: () => {},
      renderWork: () => {},
      setChangesState: () => {},
      renderChanges: () => {},
      setActiveSessionId: () => {},
      setActiveThreadId: () => {},
      showTaskDetail: (task: unknown) => {
        taskDetailCalls.push(task);
      },
      closeAgentDetail: () => {},
      showAgentDetail: (run: unknown) => {
        agentDetailCalls.push(run);
      },
    },
    __wvMessages: {
      addMessage: () => {},
      setStreaming: (value: boolean) => {
        isStreaming = value;
      },
      getStreamingTimeout: () => null,
      setStreamingTimeout: () => {},
      isStreaming: () => isStreaming,
      smartScrollToBottom: () => {},
      renderWelcome: () => {},
      renderSubagentTranscriptBlock: (entry: unknown, blockIdx: number) => {
        subagentAdds.push({ entry, blockIdx });
        return new FakeElement();
      },
      renderSteerBlock: (content: string, blockIdx: number) => {
        steerAdds.push({ content, blockIdx });
        return new FakeElement();
      },
      updateSubagentTranscriptBlock: (entry: unknown) => {
        subagentUpdates.push(entry);
      },
      applyShowAgentToolCards: (show: boolean) => {
        showAgentToolCardCalls.push(show);
      },
      applyToolDetailSettings: (showToolDetails: boolean, calmMode: boolean) => {
        toolDetailSettingCalls.push({ showToolDetails, calmMode });
      },
    },
    __wvInput: {
      updateSendStopButton: (value: boolean) => {
        sendStopStateCalls.push(value);
      },
      applyApiCapabilities: () => {},
      setSkillCommands: (skills: unknown) => {
        skillCommandCalls.push(skills);
      },
      setCurrentAttachments: () => {},
      renderAttachments: () => {},
    },
    addEventListener: (name: string, handler: (event: any) => void) => {
      windowListeners.set(name, handler);
    },
  };

  const documentObj = {
    getElementById: (id: string) => getEl(id),
    querySelectorAll: () => [] as FakeElement[],
    addEventListener: (name: string, handler: (event: any) => void) => {
      documentListeners.set(name, handler);
    },
    createElement: () => new FakeElement(),
  };

  const context = vm.createContext({
    window: windowObj,
    document: documentObj,
    setTimeout: () => 0,
    clearTimeout: () => {},
    console,
  });

  vm.runInContext(getEventHandlerScript(makeTr()), context);

  return {
    dispatchMessage(msg: Record<string, unknown>) {
      const handler = windowListeners.get("message");
      if (!handler) throw new Error("message handler not registered");
      handler({ data: msg });
    },
    getElement: getEl,
    postMessages,
    documentListeners,
    taskDetailCalls,
    agentDetailCalls,
    agentRunUpdates,
    agentStopFinishes,
    subagentAdds,
    subagentUpdates,
    steerAdds,
    skillCommandCalls,
    sendStopStateCalls,
    showAgentToolCardCalls,
    toolDetailSettingCalls,
    isStreaming: () => isStreaming,
  };
}

describe("webview-js-event-handler runtime", () => {
  it("renders context usage, threshold colors, and the unavailable fallback", () => {
    const harness = createRuntimeHarness();
    const gauge = harness.getElement("context-usage-gauge");
    const value = gauge.querySelector(".context-usage-value")!;

    harness.dispatchMessage({
      type: "contextUsage",
      available: true,
      usage: {
        estimated_input_tokens: 742_000,
        context_window_tokens: 1_000_000,
        used_percent: 74.2,
        auto_compact_threshold_percent: 90,
      },
    });

    expect(Number(value.getAttribute("stroke-dashoffset"))).toBeCloseTo(25.8);
    expect(gauge.getAttribute("data-tooltip")).toBe("Context: 742,000 / 1,000,000 tokens (74.2%)");
    expect(gauge.getAttribute("aria-label")).toBe("Context: 742,000 / 1,000,000 tokens (74.2%)");
    expect(gauge.classList.contains("unavailable")).toBe(false);

    harness.dispatchMessage({
      type: "contextUsage",
      available: true,
      usage: {
        estimated_input_tokens: 820_000,
        context_window_tokens: 1_000_000,
        used_percent: 82,
        auto_compact_threshold_percent: 90,
      },
    });
    expect(gauge.classList.contains("warning")).toBe(true);
    expect(gauge.classList.contains("critical")).toBe(false);

    harness.dispatchMessage({
      type: "contextUsage",
      available: true,
      usage: {
        estimated_input_tokens: 910_000,
        context_window_tokens: 1_000_000,
        used_percent: 91,
        auto_compact_threshold_percent: 90,
      },
    });
    expect(gauge.classList.contains("warning")).toBe(false);
    expect(gauge.classList.contains("critical")).toBe(true);

    harness.dispatchMessage({ type: "contextUsage", available: false });
    expect(value.getAttribute("stroke-dashoffset")).toBe("100");
    expect(gauge.getAttribute("data-tooltip")).toBe("Context usage unavailable");
    expect(gauge.classList.contains("critical")).toBe(false);
    expect(gauge.classList.contains("unavailable")).toBe(true);
  });

  it("updates only the visible settings labels for ready/settingsUpdated messages", () => {
    const harness = createRuntimeHarness();

    expect(harness.postMessages).toEqual([{ type: "webviewReady" }]);

    harness.dispatchMessage({
      type: "ready",
      mode: "plan",
      model: "deepseek-v4-pro",
      reasoningEffort: "auto",
      runtimeVersion: "0.9.0",
      showThreadList: false,
    });

    expect(harness.getElement("current-mode").textContent).toBe("plan");
    expect(harness.getElement("current-model").textContent).toBe("deepseek-v4-pro");
    expect(harness.getElement("current-reasoning").textContent).toBe("auto");

    harness.dispatchMessage({
      type: "settingsUpdated",
      mode: "agent",
      model: "deepseek-v4-pro",
      reasoningEffort: "high",
    });

    expect(harness.getElement("current-mode").textContent).toBe("agent");
    expect(harness.getElement("current-model").textContent).toBe("deepseek-v4-pro");
    expect(harness.getElement("current-reasoning").textContent).toBe("high");
    expect(harness.postMessages).toEqual([{ type: "webviewReady" }]);
  });

  it("applies the opt-in agent tool-card preference initially and live", () => {
    const harness = createRuntimeHarness();

    harness.dispatchMessage({
      type: "ready",
      model: "deepseek-v4-pro",
      showAgentToolCards: false,
    });
    harness.dispatchMessage({
      type: "displaySettingsUpdated",
      showAgentToolCards: true,
    });

    expect(harness.showAgentToolCardCalls).toEqual([false, true]);
  });

  it("applies runtime tool-detail and calm-mode settings initially and live", () => {
    const harness = createRuntimeHarness();

    harness.dispatchMessage({
      type: "ready",
      model: "deepseek-v4-pro",
      showToolDetails: false,
      calmMode: true,
    });
    harness.dispatchMessage({
      type: "displaySettingsUpdated",
      showToolDetails: true,
      calmMode: false,
    });

    expect(harness.toolDetailSettingCalls).toEqual([
      { showToolDetails: false, calmMode: true },
      { showToolDetails: true, calmMode: false },
    ]);
  });

  it("moves delegate cards out of the stale yellow running state when they finish", () => {
    const harness = createRuntimeHarness();
    const card = harness.getElement("tc-assistant-1-0");
    card.classList.add("delegate-card");
    card.classList.add("delegate-running");
    const status = new FakeElement();
    status.className = "delegate-status";
    card.appendChild(status);

    harness.dispatchMessage({
      type: "updateToolCall",
      messageId: "assistant-1",
      toolCallIdx: 0,
      status: "complete",
      output: "done",
    });

    expect(status.textContent).toBe("✓ Completed");
    expect(card.classList.contains("delegate-running")).toBe(false);
    expect(card.classList.contains("delegate-completed")).toBe(true);
    expect(card.classList.contains("delegate-failed")).toBe(false);
    expect(card.querySelector(".tool-output")?.textContent).toBe("done");

    harness.dispatchMessage({
      type: "updateToolCall",
      messageId: "assistant-1",
      toolCallIdx: 0,
      status: "error",
    });

    expect(status.textContent).toBe("✗ Failed");
    expect(card.classList.contains("delegate-completed")).toBe(false);
    expect(card.classList.contains("delegate-failed")).toBe(true);
  });

  it("moves a live generic tool into the error class so compact mode preserves its details", () => {
    const harness = createRuntimeHarness();
    const card = harness.getElement("tc-assistant-2-0");
    card.classList.add("tool-call");
    card.classList.add("tool-call-running");

    harness.dispatchMessage({
      type: "updateToolCall",
      messageId: "assistant-2",
      toolCallIdx: 0,
      status: "error",
      output: "failed evidence",
    });

    expect(card.classList.contains("tool-call-running")).toBe(false);
    expect(card.classList.contains("tool-call-error")).toBe(true);
    expect(card.querySelector(".tool-output")?.textContent).toBe("failed evidence");
  });

  it("routes taskDetail and agentDetail messages to the sidebar detail views", () => {
    const harness = createRuntimeHarness();

    const task = { id: "task-1", status: "completed" };
    const run = { spec: { run_id: "run-1" }, status: "completed" };

    harness.dispatchMessage({ type: "taskDetail", task });
    harness.dispatchMessage({ type: "agentDetail", run });

    expect(harness.taskDetailCalls).toEqual([task]);
    expect(harness.agentDetailCalls).toEqual([run]);
  });

  it("routes agent lists through the shared sidebar and popover updater", () => {
    const harness = createRuntimeHarness();
    const runs = [{ spec: { run_id: "agent-1" }, status: "completed" }];

    harness.dispatchMessage({ type: "agentRunList", runs });

    expect(harness.agentRunUpdates).toEqual([runs]);
  });

  it("releases optimistic stop state for individual and Stop All results", () => {
    const harness = createRuntimeHarness();

    harness.dispatchMessage({ type: "agentStopResult", runIds: ["agent-1"], failedRunIds: ["agent-1"] });
    harness.dispatchMessage({ type: "agentStopResult", runIds: ["agent-2", "agent-3"], failedRunIds: [], all: true });
    harness.dispatchMessage({ type: "agentStopResult", runIds: [], failedRunIds: [], error: "runtime unavailable" });

    expect(harness.agentStopFinishes).toEqual([["agent-1"], null, null]);
  });

  it("routes dynamic skill commands to the input module", () => {
    const harness = createRuntimeHarness();
    const skills = [{
      name: "engineering-review",
      description: "Review a pull request",
    }];

    harness.dispatchMessage({ type: "skillCommands", skills });

    expect(harness.skillCommandCalls).toEqual([skills]);
  });

  it("restores and preserves the running state on a recreated webview", () => {
    const harness = createRuntimeHarness();

    harness.dispatchMessage({
      type: "ready",
      model: "deepseek-v4-pro",
      turnInProgress: true,
    });

    expect(harness.isStreaming()).toBe(true);
    expect(harness.sendStopStateCalls.at(-1)).toBe(true);
    expect(harness.getElement("status").classList.contains("is-streaming")).toBe(true);

    harness.dispatchMessage({ type: "status", text: "tool_call started" });
    expect(harness.isStreaming()).toBe(true);
    expect(harness.sendStopStateCalls.at(-1)).toBe(true);

    harness.dispatchMessage({
      type: "ready",
      model: "deepseek-v4-pro",
      turnInProgress: false,
    });
    expect(harness.isStreaming()).toBe(false);
    expect(harness.sendStopStateCalls.at(-1)).toBe(false);
  });

  it("turnStarted synchronizes the internal click-routing state", () => {
    const harness = createRuntimeHarness();

    harness.dispatchMessage({ type: "turnStarted", turnId: "turn-1" });

    expect(harness.isStreaming()).toBe(true);
    expect(harness.sendStopStateCalls.at(-1)).toBe(true);
  });

  it("applies an authoritative terminal turn-state refresh", () => {
    const harness = createRuntimeHarness();
    harness.dispatchMessage({ type: "turnStarted", turnId: "turn-1" });
    expect(harness.isStreaming()).toBe(true);

    harness.dispatchMessage({
      type: "turnState",
      turnInProgress: false,
      turnId: null,
    });

    expect(harness.isStreaming()).toBe(false);
    expect(harness.sendStopStateCalls.at(-1)).toBe(false);
  });

  it("formats completed-message token totals with thousands separators", () => {
    const harness = createRuntimeHarness();

    harness.dispatchMessage({
      type: "messageComplete",
      messageId: "assistant-usage",
      usage: { input_tokens: 3_594_961, output_tokens: 29_851 },
    });

    expect(harness.getElement("msg-assistant-usage").children[0].textContent)
      .toBe("↑3,594,961 ↓29,851");
  });

  it("routes live subagent transcript additions and updates", () => {
    const harness = createRuntimeHarness();
    const first = { id: "agent_a:3:0", nickname: "Fin", content: "First" };
    const updated = { ...first, content: "First completed" };

    harness.dispatchMessage({
      type: "addSubagentTranscriptBlock",
      messageId: "assistant-1",
      blockIdx: 4,
      entry: first,
    });
    harness.dispatchMessage({ type: "updateSubagentTranscriptBlock", entry: updated });

    expect(harness.subagentAdds).toEqual([{ entry: first, blockIdx: 4 }]);
    expect(harness.getElement("body-assistant-1").children).toHaveLength(1);
    expect(harness.subagentUpdates).toEqual([updated]);
  });

  it("routes a live steer into the active assistant body", () => {
    const harness = createRuntimeHarness();

    harness.dispatchMessage({
      type: "addSteerBlock",
      messageId: "assistant-1",
      blockIdx: 2,
      content: "Use the smaller patch",
    });

    expect(harness.steerAdds).toEqual([{
      content: "Use the smaller patch",
      blockIdx: 2,
    }]);
    expect(harness.getElement("body-assistant-1").children).toHaveLength(1);
  });

  it("dismisses only the selected sticky info notification", () => {
    const harness = createRuntimeHarness();

    harness.dispatchMessage({ type: "info", message: "Mode changed to yolo" });
    harness.dispatchMessage({ type: "info", message: "Skill enabled" });

    const messages = harness.getElement("messages");
    expect(messages.children).toHaveLength(2);

    const firstNote = messages.children[0];
    const secondNote = messages.children[1];
    const dismissButton = firstNote.querySelector(".system-message-dismiss");

    expect(firstNote.className).toBe("system-message");
    expect(firstNote.children[1].textContent).toBe("Mode changed to yolo");
    expect(dismissButton?.type).toBe("button");
    expect(dismissButton?.textContent).toBe("✕");
    expect(dismissButton?.getAttribute("aria-label")).toBe("Dismiss notification");
    expect(dismissButton?.title).toBe("Dismiss notification");

    dismissButton?.click();

    expect(firstNote.removed).toBe(true);
    expect(messages.children).toEqual([secondNote]);
    expect(harness.postMessages).toEqual([{ type: "webviewReady" }]);
  });

  it("makes the empty-history note dismissible too", () => {
    const harness = createRuntimeHarness();

    harness.dispatchMessage({ type: "loadLastUserMessage" });

    const messages = harness.getElement("messages");
    expect(messages.children).toHaveLength(1);
    expect(messages.children[0].children[1].textContent).toBe("No previous message");

    messages.children[0].querySelector(".system-message-dismiss")?.click();
    expect(messages.children).toHaveLength(0);
  });
});
