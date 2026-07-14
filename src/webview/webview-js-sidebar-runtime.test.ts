import { describe, expect, it } from "vitest";
import vm from "node:vm";
import { getSidebarScript } from "./webview-js-sidebar";
import { makeTr } from "./webview-test-helpers";

class FakeClassList {
  private values = new Set<string>();

  setFromClassName(value: string): void {
    this.values = new Set(value.split(/\s+/).filter(Boolean));
  }

  add(name: string): void { this.values.add(name); }
  remove(name: string): void { this.values.delete(name); }
  contains(name: string): boolean { return this.values.has(name); }
  toggle(name: string, force?: boolean): boolean {
    const next = force === undefined ? !this.values.has(name) : force;
    if (next) this.values.add(name);
    else this.values.delete(name);
    return next;
  }
}

class FakeElement {
  public textContent = "";
  public disabled = false;
  public style: Record<string, string> = {};
  public children: FakeElement[] = [];
  public parentElement: FakeElement | null = null;
  public tagName: string;
  public offsetHeight = 0;
  public onclick: ((event: any) => void) | null = null;
  public classList = new FakeClassList();
  private classValue = "";
  private htmlValue = "";
  private attributes = new Map<string, string>();
  private listeners = new Map<string, Array<(event: any) => void>>();

  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
  }

  set className(value: string) {
    this.classValue = value;
    this.classList.setFromClassName(value);
  }

  get className(): string { return this.classValue; }
  set innerHTML(value: string) {
    this.htmlValue = value;
    this.children = [];
  }
  get innerHTML(): string { return this.htmlValue; }
  get firstChild(): FakeElement | null { return this.children[0] || null; }

  addEventListener(name: string, handler: (event: any) => void): void {
    const handlers = this.listeners.get(name) || [];
    handlers.push(handler);
    this.listeners.set(name, handlers);
  }

  dispatch(name: string, event: Record<string, unknown> = {}): void {
    const payload = { target: this, stopPropagation: () => {}, ...event };
    for (const handler of this.listeners.get(name) || []) handler(payload);
    if (name === "click" && this.onclick) this.onclick(payload);
  }

  appendChild(child: FakeElement): void {
    child.parentElement = this;
    this.children.push(child);
  }

  insertBefore(child: FakeElement): void { this.appendChild(child); }
  remove(): void {
    if (!this.parentElement) return;
    const index = this.parentElement.children.indexOf(this);
    if (index >= 0) this.parentElement.children.splice(index, 1);
    this.parentElement = null;
  }

  setAttribute(name: string, value: string): void { this.attributes.set(name, String(value)); }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }

  querySelector(): FakeElement | null { return null; }
  querySelectorAll(selector: string): FakeElement[] {
    const classNames = selector
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.startsWith("."))
      .map((part) => part.slice(1));
    const matches: FakeElement[] = [];
    const visit = (node: FakeElement) => {
      for (const child of node.children) {
        if (classNames.some((name) => child.classList.contains(name))) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches;
  }

  closest(selector: string): FakeElement | null {
    if (!selector.startsWith(".")) return null;
    const name = selector.slice(1);
    let node: FakeElement | null = this;
    while (node) {
      if (node.classList.contains(name)) return node;
      node = node.parentElement;
    }
    return null;
  }
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function createHarness() {
  const elements = new Map<string, FakeElement>();
  const documentListeners = new Map<string, Array<(event: any) => void>>();
  const getElement = (id: string) => {
    let element = elements.get(id);
    if (!element) {
      element = new FakeElement(id.startsWith("btn-") ? "button" : "div");
      elements.set(id, element);
    }
    return element;
  };
  const postMessages: Array<Record<string, unknown>> = [];
  const intervals = new Map<number, () => void>();
  let nextInterval = 1;

  const documentObj = {
    getElementById: getElement,
    createElement: (tagName: string) => new FakeElement(tagName),
    querySelectorAll: () => [] as FakeElement[],
    addEventListener: (name: string, handler: (event: any) => void) => {
      const handlers = documentListeners.get(name) || [];
      handlers.push(handler);
      documentListeners.set(name, handlers);
    },
  };
  const windowObj: Record<string, any> = {
    __wvI18n: makeTr(),
    __wvEscapeHtml: escapeHtml,
    __wvFormatRelativeTime: () => "now",
    __wvFormatThreadsCount: (count: number) => `${count} sessions`,
    __wvVscode: { postMessage: (message: Record<string, unknown>) => postMessages.push(message) },
    __wvApiCapabilities: { stopAgents: true },
    __wvDiffStore: new Map(),
    __wvDiffIdCounter: { value: 0 },
  };
  const context = vm.createContext({
    window: windowObj,
    document: documentObj,
    setTimeout: () => 1,
    clearTimeout: () => {},
    setInterval: (handler: () => void) => {
      const id = nextInterval++;
      intervals.set(id, handler);
      return id;
    },
    clearInterval: (id: number) => intervals.delete(id),
    console,
  });
  vm.runInContext(getSidebarScript(makeTr()), context);

  return { windowObj, getElement, postMessages, intervals };
}

function sampleRun(status: string, id: string, nickname: string, createdAt = 0) {
  return {
    nickname,
    latest_output: `<latest ${id}>`,
    status,
    updated_at_ms: status === "running" ? 20 : 10,
    created_at_ms: createdAt,
    steps_taken: 3,
    spec: {
      run_id: id,
      worker_id: id,
      session_name: `lane-${id}`,
      agent_type: "review",
      profile: "engineering-review-subagent",
      role: "reviewer",
      model: "deepseek-v4-pro",
      objective: "Review this",
    },
    usage: { status: "reported", input_tokens: 100, output_tokens: 20 },
    artifacts: [],
    events: [],
  };
}

describe("agent popover runtime", () => {
  it("keeps the pawn disabled and inert when the conversation has no agents", () => {
    const harness = createHarness();
    const button = harness.getElement("btn-agents");
    const popover = harness.getElement("agent-popover");
    const stopAll = harness.getElement("btn-stop-agents");

    expect(button.disabled).toBe(true);
    expect(stopAll.disabled).toBe(true);
    expect(stopAll.innerHTML).toContain("codicon codicon-debug-stop");
    expect(stopAll.innerHTML).not.toContain("Stop all agents");
    expect(stopAll.getAttribute("title")).toBe("Stop all agents");
    button.dispatch("click");

    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(popover.classList.contains("open")).toBe(false);
    expect(harness.postMessages).not.toContainEqual({ type: "refreshAgentRuns" });
  });

  it("shows the active-agent badge, toggles rows, preserves expansion, and opens Details", () => {
    const harness = createHarness();
    const running = sampleRun("running", "agent-running", "Fin <One>", 10);
    const completed = sampleRun("completed", "agent-done", "Done Whale", 20);

    harness.windowObj.__wvSidebar.updateAgentRuns([completed, running]);

    const button = harness.getElement("btn-agents");
    const badge = harness.getElement("agent-count-badge");
    const popover = harness.getElement("agent-popover");
    const list = harness.getElement("agent-popover-list");
    const stopAll = harness.getElement("btn-stop-agents");
    expect(button.disabled).toBe(false);
    expect(stopAll.disabled).toBe(false);
    expect(button.classList.contains("has-agents")).toBe(true);
    expect(badge.textContent).toBe("1");
    expect(list.children[0].innerHTML).toContain("Fin &lt;One&gt;");
    expect(list.children[0].innerHTML).toContain("▶");
    expect(list.children[0].innerHTML).toContain("(active)");

    button.dispatch("click");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(popover.classList.contains("open")).toBe(true);
    expect(harness.postMessages).toContainEqual({ type: "refreshAgentRuns" });

    const toggle = new FakeElement("button");
    toggle.className = "agent-popover-toggle";
    toggle.setAttribute("data-run-id", "agent-running");
    popover.dispatch("click", { target: toggle });
    expect(harness.getElement("agent-popover-list").children[0].innerHTML).toContain("▼");
    expect(harness.getElement("agent-popover-list").children[0].innerHTML).toContain("review");
    expect(harness.getElement("agent-popover-list").children[0].innerHTML).toContain("Profile");
    expect(harness.getElement("agent-popover-list").children[0].innerHTML).toContain("engineering-review-subagent");
    expect(harness.getElement("agent-popover-list").children[0].innerHTML).toContain("Session");
    expect(harness.getElement("agent-popover-list").children[0].innerHTML).toContain("lane-agent-running");
    expect(harness.getElement("agent-popover-list").children[0].innerHTML).toContain("&lt;latest agent-running&gt;");
    expect(harness.getElement("agent-popover-list").children[0].innerHTML).toContain("agent-popover-stop");
    expect(harness.getElement("agent-popover-list").children[0].innerHTML).toContain("codicon codicon-debug-stop");
    expect(harness.getElement("agent-popover-list").children[0].innerHTML).toContain("Stop");

    harness.windowObj.__wvSidebar.updateAgentRuns([completed, running]);
    expect(harness.getElement("agent-popover-list").children[0].innerHTML).toContain("▼");

    const details = new FakeElement("button");
    details.className = "agent-popover-details";
    details.setAttribute("data-run-id", "agent-running");
    popover.dispatch("click", { target: details });
    expect(harness.postMessages).toContainEqual({ type: "showAgentSessions", runId: "agent-running" });

    harness.windowObj.__wvSidebar.updateAgentRuns([]);
    expect(button.disabled).toBe(true);
    expect(button.classList.contains("has-agents")).toBe(false);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(popover.classList.contains("open")).toBe(false);
  });

  it("posts individual stop requests, keeps them pending, and omits Stop for terminal agents", () => {
    const harness = createHarness();
    const running = sampleRun("working", "agent-running", "Runner", 10);
    const completed = sampleRun("completed", "agent-done", "Done", 20);
    harness.windowObj.__wvSidebar.updateAgentRuns([running, completed]);

    const popover = harness.getElement("agent-popover");
    const runningToggle = new FakeElement("button");
    runningToggle.className = "agent-popover-toggle";
    runningToggle.setAttribute("data-run-id", "agent-running");
    popover.dispatch("click", { target: runningToggle });

    const stop = new FakeElement("button");
    stop.className = "agent-popover-stop";
    stop.setAttribute("data-run-id", "agent-running");
    popover.dispatch("click", { target: stop });

    expect(harness.postMessages).toContainEqual({ type: "stopAgent", runId: "agent-running" });
    expect(harness.getElement("btn-stop-agents").disabled).toBe(true);
    expect(harness.getElement("agent-popover-list").children[0].innerHTML).toContain("codicon codicon-debug-stop");
    expect(harness.getElement("agent-popover-list").children[0].innerHTML).toContain("Stopping…");
    expect(harness.getElement("agent-popover-list").children[0].innerHTML).toContain("disabled aria-busy=\"true\"");

    const completedToggle = new FakeElement("button");
    completedToggle.className = "agent-popover-toggle";
    completedToggle.setAttribute("data-run-id", "agent-done");
    popover.dispatch("click", { target: completedToggle });
    expect(harness.getElement("agent-popover-list").children[1].innerHTML).not.toContain("agent-popover-stop");

    running.status = "cancelled";
    harness.windowObj.__wvSidebar.updateAgentRuns([running, completed]);
    expect(harness.getElement("btn-stop-agents").disabled).toBe(true);
    expect(harness.getElement("btn-stop-agents").innerHTML).toContain("codicon codicon-debug-stop");
    expect(harness.getElement("btn-stop-agents").innerHTML).not.toContain("Stop all agents");
    expect(harness.getElement("btn-stop-agents").getAttribute("title")).toBe("Stop all agents");
  });

  it("posts one Stop All request and can release pending state after a provider failure", () => {
    const harness = createHarness();
    const running = sampleRun("in_progress", "agent-running", "Runner");
    harness.windowObj.__wvSidebar.updateAgentRuns([running]);
    const stopAll = harness.getElement("btn-stop-agents");

    expect(stopAll.disabled).toBe(false);
    stopAll.dispatch("click");
    expect(harness.postMessages).toContainEqual({ type: "stopAllAgents" });
    expect(stopAll.disabled).toBe(true);
    expect(stopAll.innerHTML).toContain("codicon codicon-debug-stop");
    expect(stopAll.innerHTML).not.toContain("Stopping…");
    expect(stopAll.getAttribute("title")).toBe("Stopping…");

    harness.windowObj.__wvSidebar.finishAgentStop(null);
    expect(stopAll.disabled).toBe(false);
    expect(stopAll.innerHTML).toContain("codicon codicon-debug-stop");
    expect(stopAll.innerHTML).not.toContain("Stop all agents");
    expect(stopAll.getAttribute("title")).toBe("Stop all agents");
  });

  it("keeps completed agents inspectable without showing a red badge", () => {
    const harness = createHarness();
    harness.windowObj.__wvSidebar.updateAgentRuns([sampleRun("completed", "agent-done", "Fin")]);
    expect(harness.getElement("btn-agents").disabled).toBe(false);
    expect(harness.getElement("btn-agents").classList.contains("has-agents")).toBe(false);
    expect(harness.getElement("agent-count-badge").textContent).toBe("");
    expect(harness.getElement("agent-popover-list").children[0].innerHTML).toContain("(inactive)");
    expect(harness.getElement("btn-stop-agents").disabled).toBe(true);
  });

  it("shows parked checkpoints as needing parent action without Stop controls", () => {
    const harness = createHarness();
    const parked = {
      ...sampleRun("waiting_for_user", "agent-parked", "Parked"),
      completed_at_ms: 123,
      recommended_action: { action: "inspect_or_replace" },
    };
    harness.windowObj.__wvSidebar.updateAgentRuns([parked]);

    const popover = harness.getElement("agent-popover");
    const toggle = new FakeElement("button");
    toggle.className = "agent-popover-toggle";
    toggle.setAttribute("data-run-id", "agent-parked");
    popover.dispatch("click", { target: toggle });

    const html = harness.getElement("agent-popover-list").children[0].innerHTML;
    expect(html).toContain("(inactive)");
    expect(html).toContain("Needs parent action");
    expect(html).not.toContain("agent-popover-stop");
    expect(harness.getElement("btn-stop-agents").disabled).toBe(true);
  });

  it("keeps a stale running receipt inactive when its runtime is unavailable", () => {
    const harness = createHarness();
    const stale = {
      ...sampleRun("running", "agent-stale", "Stale"),
      completed_at_ms: null,
      runtime_available: false,
    };
    harness.windowObj.__wvSidebar.updateAgentRuns([stale]);

    expect(harness.getElement("agent-popover-list").children[0].innerHTML).toContain("(inactive)");
    expect(harness.getElement("btn-stop-agents").disabled).toBe(true);
  });

  it("keeps spawn ordering stable when statuses and update timestamps change", () => {
    const harness = createHarness();
    const first = sampleRun("completed", "agent-first", "First", 10);
    const second = sampleRun("running", "agent-second", "Second", 20);

    harness.windowObj.__wvSidebar.updateAgentRuns([second, first]);
    let list = harness.getElement("agent-popover-list");
    expect(list.children[0].innerHTML).toContain("First");
    expect(list.children[1].innerHTML).toContain("Second");

    first.status = "running";
    first.updated_at_ms = 9999;
    second.status = "completed";
    second.updated_at_ms = 1;
    harness.windowObj.__wvSidebar.updateAgentRuns([first, second]);
    list = harness.getElement("agent-popover-list");
    expect(list.children[0].innerHTML).toContain("First");
    expect(list.children[1].innerHTML).toContain("Second");
  });
});

describe("work checklist popover runtime", () => {
  const workState = (checklist: Array<{ id: string; content: string; status: string }>) => ({
    goal: null,
    checklist,
    checklistCompletionPct: 0,
    strategy: [],
    cycleCount: 0,
    coherenceState: "healthy",
    coherenceLabel: "",
  });

  it("is disabled without todos and shows a pending badge plus all items in Work order", () => {
    const harness = createHarness();
    const sidebar = harness.windowObj.__wvSidebar;
    const button = harness.getElement("btn-work-popover");
    const badge = harness.getElement("work-pending-badge");
    const list = harness.getElement("work-popover-list");

    expect(button.disabled).toBe(true);
    button.dispatch("click");
    expect(harness.getElement("work-popover").classList.contains("open")).toBe(false);

    sidebar.setWorkState(workState([
      { id: "first", content: "First <pending>", status: "pending" },
      { id: "second", content: "Second done", status: "completed" },
      { id: "third", content: "Third active", status: "in_progress" },
    ]));

    expect(button.disabled).toBe(false);
    expect(button.classList.contains("has-pending")).toBe(true);
    expect(button.getAttribute("aria-label")).toBe("To-do (2)");
    expect(badge.textContent).toBe("2");
    expect(list.children).toHaveLength(3);
    expect(list.children[0].innerHTML).toContain("First &lt;pending&gt;");
    expect(list.children[0].innerHTML).toContain("codicon-circle");
    expect(list.children[1].innerHTML).toContain("Second done");
    expect(list.children[1].classList.contains("completed")).toBe(true);
    expect(list.children[1].innerHTML).toContain("codicon-check");
    expect(list.children[2].innerHTML).toContain("Third active");
    expect(list.children[2].classList.contains("in-progress")).toBe(true);
    expect(list.children[2].innerHTML).toContain("codicon codicon-broadcast");

    button.dispatch("click");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(harness.getElement("work-popover").classList.contains("open")).toBe(true);
  });

  it("preserves replacement Work ordering and keeps completed-only lists available without a badge", () => {
    const harness = createHarness();
    const sidebar = harness.windowObj.__wvSidebar;
    const button = harness.getElement("btn-work-popover");

    sidebar.setWorkState(workState([
      { id: "a", content: "Alpha", status: "pending" },
      { id: "b", content: "Beta", status: "completed" },
    ]));
    sidebar.setWorkState(workState([
      { id: "b", content: "Beta", status: "completed" },
      { id: "a", content: "Alpha", status: "completed" },
    ]));

    const list = harness.getElement("work-popover-list");
    expect(list.children[0].innerHTML).toContain("Beta");
    expect(list.children[1].innerHTML).toContain("Alpha");
    expect(button.disabled).toBe(false);
    expect(button.classList.contains("has-pending")).toBe(false);
    expect(button.getAttribute("aria-label")).toBe("To-do");
  });

  it("allows only one top-right popover to be open and closes Work when its list clears", () => {
    const harness = createHarness();
    const sidebar = harness.windowObj.__wvSidebar;
    const tasksButton = harness.getElement("btn-tasks-popover");
    const tasksPopover = harness.getElement("tasks-popover");
    const workButton = harness.getElement("btn-work-popover");
    const agentButton = harness.getElement("btn-agents");
    const workPopover = harness.getElement("work-popover");
    const agentPopover = harness.getElement("agent-popover");
    const changesButton = harness.getElement("btn-changes");
    const changesPopover = harness.getElement("changes-popover");

    sidebar.setWorkState(workState([{ id: "todo", content: "Do it", status: "pending" }]));
    sidebar.updateAgentRuns([sampleRun("running", "agent-running", "Runner")]);
    sidebar.setChangesState([{ filePath: "src/a.ts", changeType: "modified", addedLines: 2, removedLines: 1, diff: "patch" }]);
    sidebar.renderChanges();
    sidebar.renderTasks([{ id: "task-active", status: "running", prompt_summary: "Background task", model: "deepseek-v4-pro" }]);

    tasksButton.dispatch("click");
    expect(tasksPopover.classList.contains("open")).toBe(true);

    workButton.dispatch("click");
    expect(workPopover.classList.contains("open")).toBe(true);
    expect(tasksPopover.classList.contains("open")).toBe(false);
    expect(agentPopover.classList.contains("open")).toBe(false);

    agentButton.dispatch("click");
    expect(agentPopover.classList.contains("open")).toBe(true);
    expect(workPopover.classList.contains("open")).toBe(false);
    expect(workButton.getAttribute("aria-expanded")).toBe("false");

    workButton.dispatch("click");
    expect(workPopover.classList.contains("open")).toBe(true);
    expect(agentPopover.classList.contains("open")).toBe(false);
    expect(agentButton.getAttribute("aria-expanded")).toBe("false");

    changesButton.dispatch("click");
    expect(changesPopover.classList.contains("open")).toBe(true);
    expect(workPopover.classList.contains("open")).toBe(false);
    expect(agentPopover.classList.contains("open")).toBe(false);

    agentButton.dispatch("click");
    expect(agentPopover.classList.contains("open")).toBe(true);
    expect(changesPopover.classList.contains("open")).toBe(false);

    tasksButton.dispatch("click");
    expect(tasksPopover.classList.contains("open")).toBe(true);
    expect(agentPopover.classList.contains("open")).toBe(false);

    sidebar.setWorkState(workState([]));
    expect(workButton.disabled).toBe(true);
    expect(workPopover.classList.contains("open")).toBe(false);
  });
});

describe("background tasks popover runtime", () => {
  it("disables when empty, then renders task actions and preserves detail and cancel commands", () => {
    const harness = createHarness();
    const sidebar = harness.windowObj.__wvSidebar;
    const button = harness.getElement("btn-tasks-popover");
    const popover = harness.getElement("tasks-popover");
    const list = harness.getElement("tasks-popover-list");

    expect(button.disabled).toBe(true);
    button.dispatch("click");
    expect(popover.classList.contains("open")).toBe(false);
    expect(list.children).toHaveLength(1);
    expect(list.children[0].innerHTML).toContain("No tasks");

    sidebar.renderTasks([
      { id: "task-1", status: "running", prompt_summary: "Review <changes>", model: "deepseek-v4-pro", result_summary: "partial" },
    ]);

    expect(button.disabled).toBe(false);
    button.dispatch("click");
    expect(popover.classList.contains("open")).toBe(true);
    expect(list.children).toHaveLength(1);
    const card = list.children[0];
    expect(card.innerHTML).toContain("Review &lt;changes&gt;");
    expect(card.innerHTML).toContain("deepseek-v4-pro");
    expect(card.children).toHaveLength(1);
    const actions = card.children[0];
    expect(actions.children.map((child) => child.textContent)).toEqual(["Details", "Result", "Cancel"]);

    card.dispatch("click");
    expect(harness.postMessages).toContainEqual({ type: "showTaskDetail", taskId: "task-1" });

    actions.children[2].dispatch("click");
    expect(harness.postMessages).toContainEqual({ type: "slashCommand", command: "/task", args: "cancel task-1" });

    sidebar.renderTasks([]);
    expect(button.disabled).toBe(true);
    expect(popover.classList.contains("open")).toBe(false);
  });
});

describe("changes popover runtime", () => {
  it("shows a changed-file badge and preserves Diff/Open actions", () => {
    const harness = createHarness();
    const sidebar = harness.windowObj.__wvSidebar;
    const button = harness.getElement("btn-changes");
    const badge = harness.getElement("changes-count-badge");
    const popover = harness.getElement("changes-popover");

    expect(button.disabled).toBe(true);
    sidebar.setChangesState([
      { filePath: "src/a.ts", changeType: "modified", addedLines: 3, removedLines: 1, diff: "@@ patch" },
      { filePath: "src/b.ts", changeType: "created", addedLines: 4, removedLines: 0 },
    ]);
    sidebar.renderChanges();

    expect(button.disabled).toBe(false);
    expect(button.classList.contains("has-changes")).toBe(true);
    expect(button.getAttribute("aria-label")).toBe("Changes (2)");
    expect(badge.textContent).toBe("2");
    expect(harness.getElement("changes-popover-count").textContent).toBe("2");

    button.dispatch("click");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(popover.classList.contains("open")).toBe(true);

    const container = harness.getElement("changes-popover-list");
    expect(container.children).toHaveLength(2);
    expect(container.children[0].innerHTML).toContain("1 Modified");
    expect(container.children[0].innerHTML).toContain("+7");
    expect(container.children[1].innerHTML).toContain("change-view-diff");
    expect(container.children[1].innerHTML).toContain("change-open-file");

    const diff = new FakeElement("button");
    diff.className = "change-view-diff";
    diff.setAttribute("data-file-path", "src/a.ts");
    const diffKeyMatch = container.children[1].innerHTML.match(/data-diff-key="([^"]+)"/);
    diff.setAttribute("data-diff-key", diffKeyMatch?.[1] || "");
    container.children[1].dispatch("click", { target: diff });
    expect(harness.postMessages).toContainEqual({
      type: "openDiff",
      filePath: "src/a.ts",
      diff: "@@ patch",
      useCumulative: true,
    });

    const open = new FakeElement("button");
    open.className = "change-open-file";
    open.setAttribute("data-file-path", "src/b.ts");
    container.children[1].dispatch("click", { target: open });
    expect(harness.postMessages).toContainEqual({ type: "openFile", filePath: "src/b.ts" });
  });

  it("disables and closes when the changed-file list clears", () => {
    const harness = createHarness();
    const sidebar = harness.windowObj.__wvSidebar;
    const button = harness.getElement("btn-changes");
    const popover = harness.getElement("changes-popover");

    sidebar.setChangesState([{ filePath: "a.ts", changeType: "modified", addedLines: 1, removedLines: 0 }]);
    sidebar.renderChanges();
    button.dispatch("click");
    expect(popover.classList.contains("open")).toBe(true);

    sidebar.setChangesState([]);
    sidebar.renderChanges();
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(popover.classList.contains("open")).toBe(false);
    expect(harness.getElement("changes-count-badge").textContent).toBe("");
  });
});

describe("full-chat history popover controls", () => {
  it("toggles the full-chat overlay and refreshes history when opened", () => {
    const harness = createHarness();
    const button = harness.getElement("btn-history");
    const popover = harness.getElement("history-popover");

    expect(button.getAttribute("aria-expanded")).toBe("false");

    button.dispatch("click");
    expect(popover.classList.contains("open")).toBe(true);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(harness.postMessages).toContainEqual({ type: "refreshSidebar" });

    button.dispatch("click");
    expect(popover.classList.contains("open")).toBe(false);
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("uses direct Project and All scope tabs and a red trash action for sessions", () => {
    const harness = createHarness();
    const sidebar = harness.windowObj.__wvSidebar;
    sidebar.setSessions([{ id: "session-1", title: "One", mode: "yolo", workspace: "/workspace" }]);
    sidebar.setShowAllWorkspaces(false);
    sidebar.renderSessions();

    const workspaceScope = harness.getElement("session-scope-workspace");
    const allScope = harness.getElement("session-scope-all");
    expect(workspaceScope.classList.contains("active")).toBe(true);
    expect(workspaceScope.getAttribute("aria-pressed")).toBe("true");
    expect(allScope.classList.contains("active")).toBe(false);
    expect(allScope.getAttribute("aria-pressed")).toBe("false");
    let container = harness.getElement("tab-sessions");
    let sessionItem = container.children.find((child) => child.classList.contains("thread-item"));
    expect(sessionItem?.classList.contains("session-item")).toBe(true);
    expect(sessionItem?.children[1].children[0].textContent).toBe("Yolo");
    expect(sessionItem?.children[2].innerHTML).toContain("codicon-trash");

    harness.getElement("btn-history").dispatch("click");
    expect(harness.getElement("history-popover").classList.contains("open")).toBe(true);
    sessionItem?.dispatch("click");
    expect(harness.postMessages).toContainEqual({ type: "loadSession", sessionId: "session-1" });
    expect(harness.getElement("history-popover").classList.contains("open")).toBe(false);

    sidebar.setShowAllWorkspaces(true);
    sidebar.renderSessions();
    expect(workspaceScope.classList.contains("active")).toBe(false);
    expect(workspaceScope.getAttribute("aria-pressed")).toBe("false");
    expect(allScope.classList.contains("active")).toBe(true);
    expect(allScope.getAttribute("aria-pressed")).toBe("true");

    workspaceScope.dispatch("click");
    allScope.dispatch("click");
    expect(harness.postMessages).toContainEqual({ type: "setAllWorkspaces", showAllWorkspaces: false });
    expect(harness.postMessages).toContainEqual({ type: "setAllWorkspaces", showAllWorkspaces: true });
  });
});

describe("sidebar empty states", () => {
  it("renders one speech-bubble placeholder across repeated empty session updates", () => {
    const harness = createHarness();
    const sidebar = harness.windowObj.__wvSidebar;

    sidebar.setSessions([]);
    sidebar.renderSessions();
    sidebar.renderSessions();

    const container = harness.getElement("tab-sessions");
    const emptyStates = container.querySelectorAll(".session-empty-msg");
    expect(emptyStates).toHaveLength(1);
    expect(emptyStates[0].innerHTML).toContain("🗨");
  });

  it("uses the requested empty Changes symbol", () => {
    const harness = createHarness();
    const sidebar = harness.windowObj.__wvSidebar;

    sidebar.setChangesState([]);
    sidebar.renderChanges();

    const container = harness.getElement("changes-popover-list");
    expect(container.children).toHaveLength(1);
    expect(container.children[0].innerHTML).toContain("⛶");
  });
});

describe("agent detail modal runtime", () => {
  it("renders real transcript/event/artifact schemas in separate collapsed groups", () => {
    const harness = createHarness();
    const run = {
      ...sampleRun("completed", "agent-detail", "Fin"),
      transcript: {
        message_count: 3,
        omitted_messages: 1,
        messages: [
          { role: "assistant", content: [{ type: "text", text: "Actual transcript output" }] },
        ],
      },
      events: [
        {
          seq: 7,
          worker_id: "agent-detail",
          status: "running_tool",
          timestamp_ms: 1_720_000_000_000,
          message: "Reading files",
          step: 4,
          tool_name: "read_file",
        },
        { timestamp_ms: 1_720_000_001_000, custom_payload: "fallback survives" },
      ],
      artifacts: [{
        kind: "transcript",
        name: "transcript_handle",
        target: "agent:agent-detail",
        description: "Bounded child transcript",
      }],
    };

    harness.windowObj.__wvSidebar.showAgentDetail(run);
    const overlay = harness.getElement("agent-detail-overlay");
    expect(overlay.style.display).toBe("flex");
    expect(overlay.innerHTML).toContain('class="codicon codicon-robot"');
    expect(overlay.innerHTML).toContain("review · engineering-review-subagent · deepseek-v4-pro");
    expect(overlay.innerHTML).toContain("Profile");
    expect(overlay.innerHTML).toContain('class="agent-detail-group agent-transcript-group"');
    expect(overlay.innerHTML).toContain('class="agent-detail-group agent-events-group"');
    expect(overlay.innerHTML).not.toContain("<details open");
    expect(overlay.innerHTML).toContain("Actual transcript output");
    expect(overlay.innerHTML).toContain("Reading files");
    expect(overlay.innerHTML).toContain("Running tool");
    expect(overlay.innerHTML).toContain("read_file");
    expect(overlay.innerHTML).toContain("fallback survives");
    expect(overlay.innerHTML).toContain("transcript_handle");
    expect(overlay.innerHTML).toContain("agent:agent-detail");
    expect(overlay.innerHTML).not.toContain("event:");

    const close = new FakeElement("button");
    close.className = "close-btn";
    overlay.onclick?.({ target: close, stopPropagation: () => {} });
    expect(overlay.style.display).toBe("none");
  });
});
