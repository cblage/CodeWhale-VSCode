import { describe, it, expect } from "vitest";
import { getDebugScript } from "./webview-js-debug";
import { makeTr } from "./webview-test-helpers";

describe("webview-js-debug.ts", () => {
  it("returns a non-empty string", () => {
    const script = getDebugScript(makeTr());
    expect(script).toBeTruthy();
    expect(script.length).toBeGreaterThan(50);
  });

  it("is wrapped in an IIFE", () => {
    const script = getDebugScript(makeTr());
    expect(script.startsWith("(function()")).toBe(true);
    expect(script.endsWith("})();")).toBe(true);
  });

  it("uses strict mode", () => {
    const script = getDebugScript(makeTr());
    expect(script).toContain("'use strict'");
  });

  it("defines __wvDbg on window", () => {
    const script = getDebugScript(makeTr());
    expect(script).toContain("window.__wvDbg");
  });

  it("defines __wvPostUiProbe on window", () => {
    const script = getDebugScript(makeTr());
    expect(script).toContain("window.__wvPostUiProbe");
  });

  it("defines __wvPostUiDebug on window", () => {
    const script = getDebugScript(makeTr());
    expect(script).toContain("window.__wvPostUiDebug");
  });

  it("defines __wvDescribeElement on window", () => {
    const script = getDebugScript(makeTr());
    expect(script).toContain("window.__wvDescribeElement");
  });

  it("defines __wvProbeHitTarget on window", () => {
    const script = getDebugScript(makeTr());
    expect(script).toContain("window.__wvProbeHitTarget");
  });

  it("contains global error handler", () => {
    const script = getDebugScript(makeTr());
    expect(script).toContain("window.onerror");
  });

  it("contains unhandled rejection handler", () => {
    const script = getDebugScript(makeTr());
    expect(script).toContain("unhandledrejection");
  });

  it("debug mode defaults to false", () => {
    const script = getDebugScript(makeTr());
    expect(script).toContain("_debugMode = false");
  });

  it("postUiProbe sends debugUiProbe message type", () => {
    const script = getDebugScript(makeTr());
    expect(script).toContain("debugUiProbe");
  });

  it("postUiProbe probes key UI elements", () => {
    const script = getDebugScript(makeTr());
    expect(script).toContain("messages");
    expect(script).toContain("toolbar");
    expect(script).toContain("input-area");
    expect(script).toContain("btn-send-stop");
  });

  it("has debug event budget", () => {
    const script = getDebugScript(makeTr());
    expect(script).toContain("_debugEventBudget");
  });

  it("listens for click and keydown events in debug mode", () => {
    const script = getDebugScript(makeTr());
    expect(script).toContain("addEventListener('click'");
    expect(script).toContain("addEventListener('keydown'");
  });

  it("listens for visibilitychange", () => {
    const script = getDebugScript(makeTr());
    expect(script).toContain("visibilitychange");
  });
});
