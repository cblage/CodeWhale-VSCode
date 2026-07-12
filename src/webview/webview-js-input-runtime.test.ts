import { describe, expect, it, vi } from "vitest";
import vm from "node:vm";
import { getInputScript } from "./webview-js-input";
import { makeTr } from "./webview-test-helpers";

class FakeClassList {
  private values = new Set<string>();

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
  public value = "";
  public innerHTML = "";
  public textContent = "";
  public style: Record<string, string> = {};
  public classList = new FakeClassList();
  public clientHeight = 44;
  public clientWidth = 320;
  public scrollHeight = 44;
  public selectionStart = 0;
  public selectionEnd = 0;
  public disabled = false;
  private attributes = new Map<string, string>();
  private listeners = new Map<string, (event: any) => void>();

  addEventListener(name: string, handler: (event: any) => void): void {
    this.listeners.set(name, handler);
  }

  dispatch(name: string, event: Record<string, unknown> = {}): void {
    this.listeners.get(name)?.(event);
  }

  querySelector(): FakeElement | null { return null; }
  querySelectorAll(): FakeElement[] { return []; }
  appendChild(_child: unknown): void {}
  focus(): void {}
  setSelectionRange(start: number, end: number): void {
    this.selectionStart = start;
    this.selectionEnd = end;
  }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  getBoundingClientRect() {
    return { top: 100, left: 20, width: 320, height: 20 };
  }
}

function createInputHarness() {
  const elements = new Map<string, FakeElement>();
  const getElement = (id: string): FakeElement => {
    let element = elements.get(id);
    if (!element) {
      element = new FakeElement();
      elements.set(id, element);
    }
    return element;
  };
  const posts: Array<Record<string, unknown>> = [];
  let streaming = false;
  const windowObj: Record<string, any> = {
    __wvI18n: makeTr(),
    __wvEscapeHtml: (value: unknown) => String(value ?? ""),
    __wvVscode: {
      postMessage: (message: Record<string, unknown>) => posts.push(message),
    },
    __wvApiCapabilities: {},
    __wvMessages: {
      isStreaming: () => streaming,
      setUserScrolledUp: () => {},
    },
    innerHeight: 800,
    addEventListener: () => {},
    getComputedStyle: () => ({
      paddingLeft: "0",
      paddingRight: "0",
      fontFamily: "sans-serif",
      fontSize: "13px",
      fontWeight: "400",
      fontStyle: "normal",
      letterSpacing: "normal",
      lineHeight: "20px",
      textTransform: "none",
      tabSize: "4",
    }),
  };
  const body = new FakeElement();
  const documentObj = {
    body,
    getElementById: (id: string) => getElement(id),
    createElement: () => new FakeElement(),
  };
  const context = vm.createContext({
    window: windowObj,
    document: documentObj,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    ResizeObserver: undefined,
    console,
  });

  vm.runInContext(getInputScript(makeTr()), context);

  return {
    window: windowObj,
    input: getElement("input"),
    sendButton: getElement("btn-send-stop"),
    menu: getElement("slash-menu"),
    posts,
    setStreaming(value: boolean) {
      streaming = value;
      windowObj.__wvInput.updateSendStopButton(value);
    },
  };
}

describe("webview input dynamic skill runtime", () => {
  it("adds skills, rejects built-in collisions and duplicates, then removes stale entries", () => {
    const harness = createInputHarness();
    harness.input.value = "/eng";
    harness.window.__wvInput.setSkillCommands([
      { name: "engineering-review", description: "Review a PR" },
      { name: "Engineering-Review", description: "Duplicate" },
      { name: "help", description: "Must not shadow /help" },
      { name: "bad name", description: "Invalid" },
    ]);

    expect(harness.menu.classList.contains("open")).toBe(true);
    expect(harness.menu.innerHTML).toContain("/engineering-review");
    expect(harness.menu.innerHTML).not.toContain("Duplicate");
    expect(harness.menu.innerHTML).not.toContain("bad name");

    harness.input.value = "/help";
    harness.window.__wvInput.setSkillCommands([
      { name: "help", description: "Must not shadow /help" },
    ]);
    expect(harness.menu.innerHTML.match(/class="command-name"/g)).toHaveLength(1);
    expect(harness.menu.innerHTML).not.toContain("Must not shadow");

    harness.input.value = "/engineering";
    harness.window.__wvInput.setSkillCommands([]);
    expect(harness.menu.classList.contains("open")).toBe(false);
  });

  it("posts normalized fields plus the exact typed slash request", () => {
    const harness = createInputHarness();
    harness.input.value = "/Engineering-Review  review #177";

    harness.input.dispatch("keydown", {
      key: "Enter",
      shiftKey: false,
      preventDefault: () => {},
    });

    expect(harness.posts).toEqual([{
      type: "slashCommand",
      command: "/engineering-review",
      args: "review #177",
      text: "/Engineering-Review  review #177",
    }]);
  });

  it("cycles autocomplete with arrows and completes with Tab without sending", () => {
    const harness = createInputHarness();
    const selectedCommand = () => harness.menu.innerHTML.match(
      /slash-menu-item selected[\s\S]*?class="command-name">([^<]+)/,
    )?.[1];
    const preventDefault = vi.fn();
    harness.input.value = "/";
    harness.input.dispatch("input");

    expect(selectedCommand()).toBe("/mode");

    harness.input.dispatch("keydown", {
      key: "ArrowDown",
      preventDefault,
    });
    expect(selectedCommand()).toBe("/model");

    harness.input.dispatch("keydown", {
      key: "ArrowUp",
      preventDefault,
    });
    expect(selectedCommand()).toBe("/mode");

    harness.input.dispatch("keydown", {
      key: "ArrowUp",
      preventDefault,
    });
    expect(selectedCommand()).toBe("/logout");

    harness.input.dispatch("keydown", {
      key: "ArrowDown",
      preventDefault,
    });
    expect(selectedCommand()).toBe("/mode");

    harness.input.dispatch("keydown", {
      key: "Tab",
      preventDefault,
    });

    expect(preventDefault).toHaveBeenCalledTimes(5);
    expect(harness.input.value).toBe("/mode ");
    expect(harness.input.selectionStart).toBe("/mode ".length);
    expect(harness.input.selectionEnd).toBe("/mode ".length);
    expect(harness.menu.classList.contains("open")).toBe(false);
    expect(harness.posts).toEqual([]);
  });

  it("switches Stop to Steer only for non-whitespace input during the active master turn", () => {
    const harness = createInputHarness();
    harness.setStreaming(true);

    expect(harness.sendButton.classList.contains("streaming")).toBe(true);
    expect(harness.sendButton.classList.contains("steering")).toBe(false);

    harness.input.value = "   ";
    harness.input.dispatch("input");
    expect(harness.sendButton.classList.contains("steering")).toBe(false);

    harness.input.value = "Focus on the failing test";
    harness.input.dispatch("input");
    expect(harness.sendButton.classList.contains("steering")).toBe(true);

    harness.input.value = "";
    harness.input.dispatch("input");
    expect(harness.sendButton.classList.contains("steering")).toBe(false);
  });

  it("posts a steer instead of interrupting or starting a turn when active text is submitted", () => {
    const harness = createInputHarness();
    harness.setStreaming(true);
    harness.input.value = "  Use the smaller patch  ";
    harness.input.dispatch("input");

    harness.sendButton.dispatch("click");

    expect(harness.posts).toEqual([{ type: "steer", text: "Use the smaller patch" }]);
    expect(harness.input.value).toBe("");
    expect(harness.sendButton.classList.contains("streaming")).toBe(true);
    expect(harness.sendButton.classList.contains("steering")).toBe(false);
  });

  it("keeps the active empty button as Stop", () => {
    const harness = createInputHarness();
    harness.setStreaming(true);
    harness.input.value = "   ";
    harness.input.dispatch("input");

    harness.sendButton.dispatch("click");

    expect(harness.posts).toEqual([{ type: "interrupt" }]);
  });
});
