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
