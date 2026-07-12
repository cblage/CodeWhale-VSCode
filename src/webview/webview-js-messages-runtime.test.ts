import { describe, expect, it } from "vitest";
import vm from "node:vm";
import { getMessagesScript } from "./webview-js-messages";
import { makeTr } from "./webview-test-helpers";

class FakeClassList {
  constructor(private readonly element: FakeElement) {}
  contains(name: string): boolean {
    return this.element.className.split(/\s+/).includes(name);
  }
  add(name: string): void {
    if (!this.contains(name)) this.element.className += ` ${name}`;
  }
  remove(name: string): void {
    this.element.className = this.element.className
      .split(/\s+/)
      .filter((value) => value && value !== name)
      .join(" ");
  }
  toggle(name: string, force?: boolean): boolean {
    const next = force === undefined ? !this.contains(name) : force;
    if (next) this.add(name);
    else this.remove(name);
    return next;
  }
}

class FakeElement {
  public id = "";
  public className = "";
  public textContent = "";
  public innerHTML = "";
  public style: Record<string, string> = {};
  public dataset: Record<string, string> = {};
  public children: FakeElement[] = [];
  public parentElement: FakeElement | null = null;
  public scrollTop = 0;
  public scrollHeight = 0;
  public clientHeight = 100;
  public classList = new FakeClassList(this);
  private attributes = new Map<string, string>();

  appendChild(child: FakeElement): void {
    child.parentElement = this;
    this.children.push(child);
  }

  replaceChildren(...children: FakeElement[]): void {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    for (const child of children) this.appendChild(child);
  }

  addEventListener(): void {}

  remove(): void {
    if (!this.parentElement) return;
    const index = this.parentElement.children.indexOf(this);
    if (index >= 0) this.parentElement.children.splice(index, 1);
    this.parentElement = null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  querySelector(selector: string): FakeElement | null {
    const match = (element: FakeElement) => selector.startsWith(".")
      ? element.className.split(/\s+/).includes(selector.slice(1))
      : selector.startsWith("#") && element.id === selector.slice(1);
    for (const child of this.children) {
      if (match(child)) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
}

function createHarness() {
  const body = new FakeElement();
  const messages = new FakeElement();
  messages.id = "messages";
  const input = new FakeElement();
  input.id = "input";
  const roots = [messages, input];
  const findById = (id: string): FakeElement | null => {
    const visit = (element: FakeElement): FakeElement | null => {
      if (element.id === id) return element;
      for (const child of element.children) {
        const found = visit(child);
        if (found) return found;
      }
      return null;
    };
    for (const root of roots) {
      const found = visit(root);
      if (found) return found;
    }
    return null;
  };
  const windowObj: Record<string, any> = {
    __wvI18n: makeTr(),
    __wvEscapeHtml: (value: unknown) => String(value ?? ""),
    __wvVscode: { postMessage: () => {} },
    __wvDiffStore: new Map(),
    __wvDiffIdCounter: { value: 0 },
    __wvApiCapabilities: {},
    __wvInput: { centerInputTextVertically: () => {} },
  };
  const documentObj = {
    body,
    getElementById: findById,
    createElement: () => new FakeElement(),
    querySelector: () => null,
  };
  vm.runInContext(getMessagesScript(makeTr()), vm.createContext({
    window: windowObj,
    document: documentObj,
    console,
  }));
  return { windowObj, body, messages };
}

describe("subagent transcript message runtime", () => {
  it("compacts tool details when either runtime setting requests it", () => {
    const harness = createHarness();

    harness.windowObj.__wvMessages.applyToolDetailSettings(false, false);
    expect(harness.body.classList.contains("compact-tool-details")).toBe(true);

    harness.windowObj.__wvMessages.applyToolDetailSettings(true, false);
    expect(harness.body.classList.contains("compact-tool-details")).toBe(false);

    harness.windowObj.__wvMessages.applyToolDetailSettings(true, true);
    expect(harness.body.classList.contains("compact-tool-details")).toBe(true);
  });

  it("renders a distinct labeled card and updates that same card in place", () => {
    const harness = createHarness();
    const entry = {
      id: "agent_a:3:0",
      agent_id: "agent_a",
      nickname: "Fin <One>",
      status: "running",
      agent_type: "review",
      profile: "engineering-review-subagent",
      model: "deepseek-v4-pro",
      session_name: "review-lane-a-159-v2",
      content: "First",
      contentHtml: "<p>First</p>",
    };
    const card = harness.windowObj.__wvMessages.renderSubagentTranscriptBlock(entry, 4) as FakeElement;
    harness.messages.appendChild(card);

    expect(card.className).toBe("subagent-transcript-block");
    const name = card.querySelector(".subagent-transcript-name");
    expect(name?.querySelector(".codicon-robot")).toBeTruthy();
    expect(card.querySelector(".subagent-transcript-label")?.textContent)
      .toBe('Subagent "Fin <One>"');
    expect(card.querySelector(".subagent-transcript-meta")?.textContent)
      .toBe("review · engineering-review-subagent · deepseek-v4-pro · review-lane-a-159-v2");
    expect(card.querySelector(".subagent-transcript-status")?.textContent).toBe("active");
    expect(card.querySelector(".subagent-transcript-content")?.innerHTML).toBe("<p>First</p>");

    harness.windowObj.__wvMessages.updateSubagentTranscriptBlock({
      ...entry,
      status: "completed",
      content: "Completed",
      contentHtml: "<p>Completed</p>",
    });

    expect(harness.messages.children).toHaveLength(2); // welcome + the same card
    expect(card.querySelector(".subagent-transcript-status")?.textContent).toBe("inactive");
    expect(card.querySelector(".subagent-transcript-content")?.innerHTML).toBe("<p>Completed</p>");
  });

  it("renders steer text as a labeled nested user card without treating it as HTML", () => {
    const harness = createHarness();
    const card = harness.windowObj.__wvMessages.renderSteerBlock(
      "Use <smaller> patch",
      2,
    ) as FakeElement;

    expect(card.className).toBe("steer-block");
    expect(card.querySelector(".steer-block-label")?.textContent).toBe("Steer");
    expect(card.querySelector(".steer-block-content")?.textContent)
      .toBe("Use <smaller> patch");
    expect(card.querySelector(".steer-block-content")?.innerHTML).toBe("");
  });

  it("renders a completed parked checkpoint as inactive despite waiting status", () => {
    const harness = createHarness();
    const card = harness.windowObj.__wvMessages.renderSubagentTranscriptBlock({
      id: "agent_parked:1:0",
      agent_id: "agent_parked",
      nickname: "Parked",
      status: "waiting_for_user",
      completed_at_ms: 123,
      agent_type: "review",
      model: "deepseek-v4-pro",
      content: "Needs parent action",
    }, 1) as FakeElement;

    expect(card.querySelector(".subagent-transcript-status")?.textContent).toBe("inactive");
  });
});
