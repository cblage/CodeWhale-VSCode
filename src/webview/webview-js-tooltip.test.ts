import { describe, it, expect } from "vitest";
import { getTooltipScript } from "./webview-js-tooltip";

describe("webview-js-tooltip.ts", () => {
  it("returns a non-empty string", () => {
    const script = getTooltipScript();
    expect(script).toBeTruthy();
    expect(script.length).toBeGreaterThan(50);
  });

  it("is wrapped in an IIFE", () => {
    const script = getTooltipScript();
    expect(script.startsWith("(function()")).toBe(true);
    expect(script.endsWith("})();")).toBe(true);
  });

  it("uses strict mode", () => {
    const script = getTooltipScript();
    expect(script).toContain("'use strict'");
  });

  it("references tooltip element by id", () => {
    const script = getTooltipScript();
    expect(script).toContain("ui-tooltip");
  });

  it("contains showTooltipForTarget function", () => {
    const script = getTooltipScript();
    expect(script).toContain("function showTooltipForTarget");
  });

  it("contains hideTooltip function", () => {
    const script = getTooltipScript();
    expect(script).toContain("function hideTooltip");
  });

  it("handles mouseover events for tooltip triggers", () => {
    const script = getTooltipScript();
    expect(script).toContain("mouseover");
  });

  it("handles mouseout events to hide tooltip", () => {
    const script = getTooltipScript();
    expect(script).toContain("mouseout");
  });

  it("handles mousemove for tooltip positioning", () => {
    const script = getTooltipScript();
    expect(script).toContain("mousemove");
  });

  it("positions tooltip using getBoundingClientRect", () => {
    const script = getTooltipScript();
    expect(script).toContain("getBoundingClientRect");
  });

  it("manages native title attribute suppression", () => {
    const script = getTooltipScript();
    expect(script).toContain("data-title-backup");
    expect(script).toContain("removeAttribute('title')");
  });

  it("keeps a suppressed parent tooltip discoverable from nested icons", () => {
    const script = getTooltipScript();
    expect(script).toContain(
      "[data-tooltip], [title], [data-title-backup]"
    );
    expect(script).toContain("el.getAttribute('data-title-backup')");
  });

  it("keeps the tooltip visible while crossing a button's nested icon", () => {
    const listeners = new Map<string, (event: any) => void>();
    const createElement = (attributes: Record<string, string> = {}) => {
      const attrs = new Map(Object.entries(attributes));
      const classes = new Set<string>();
      const element: any = {
        parentElement: null,
        style: {},
        classList: {
          add: (name: string) => classes.add(name),
          remove: (name: string) => classes.delete(name),
          contains: (name: string) => classes.has(name),
        },
        getAttribute: (name: string) => attrs.get(name) ?? null,
        setAttribute: (name: string, value: string) => attrs.set(name, value),
        removeAttribute: (name: string) => attrs.delete(name),
        hasAttribute: (name: string) => attrs.has(name),
        getBoundingClientRect: () => ({ left: 0, bottom: 26, width: 100, height: 20 }),
        contains(node: any) {
          return node === element || node?.parentElement === element;
        },
        closest(selector: string) {
          let current: any = element;
          while (current) {
            if (
              (selector.includes("[data-tooltip]") && current.hasAttribute("data-tooltip"))
              || (selector.includes("[title]") && current.hasAttribute("title"))
              || (selector.includes("[data-title-backup]") && current.hasAttribute("data-title-backup"))
            ) {
              return current;
            }
            current = current.parentElement;
          }
          return null;
        },
      };
      return element;
    };

    const tooltip = createElement({ "aria-hidden": "true" });
    const button = createElement({ title: "Session controls" });
    const icon = createElement();
    icon.parentElement = button;
    const document = {
      getElementById: (id: string) => id === "ui-tooltip" ? tooltip : null,
      addEventListener: (type: string, listener: (event: any) => void) => {
        listeners.set(type, listener);
      },
    };
    const window = { innerWidth: 800, innerHeight: 600 };
    Function("document", "window", getTooltipScript())(document, window);

    listeners.get("mouseover")?.({ target: button, clientX: 5, clientY: 5 });
    expect(tooltip.classList.contains("visible")).toBe(true);
    expect(button.getAttribute("title")).toBeNull();

    listeners.get("mouseout")?.({ target: button, relatedTarget: icon });
    listeners.get("mouseover")?.({ target: icon, clientX: 7, clientY: 7 });
    expect(tooltip.classList.contains("visible")).toBe(true);

    listeners.get("mouseout")?.({ target: icon, relatedTarget: button });
    listeners.get("mouseover")?.({ target: button, clientX: 9, clientY: 9 });
    expect(tooltip.classList.contains("visible")).toBe(true);

    listeners.get("mouseout")?.({ target: button, relatedTarget: null });
    expect(tooltip.classList.contains("visible")).toBe(false);
    expect(button.getAttribute("title")).toBe("Session controls");
    expect(button.getAttribute("data-title-backup")).toBeNull();
  });

  it("handles focusin/focusout for accessibility", () => {
    const script = getTooltipScript();
    expect(script).toContain("focusin");
    expect(script).toContain("focusout");
  });

  it("uses aria-hidden attribute for tooltip visibility", () => {
    const script = getTooltipScript();
    expect(script).toContain("aria-hidden");
  });
});
