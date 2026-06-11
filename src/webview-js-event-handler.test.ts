import { describe, it, expect } from "vitest";
import { getEventHandlerScript } from "./webview-js-event-handler";
import { makeTr } from "./webview-test-helpers";

describe("webview-js-event-handler.ts", () => {
  it("returns a non-empty string", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toBeTruthy();
    expect(script.length).toBeGreaterThan(100);
  });

  it("is wrapped in an IIFE", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script.startsWith("(function()")).toBe(true);
    expect(script.endsWith("})();")).toBe(true);
  });

  it("uses strict mode", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("'use strict'");
  });

  it("references __wvEscapeHtml from utilities", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("window.__wvEscapeHtml");
  });

  it("listens for window messages", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("window.addEventListener('message'");
  });

  it("handles 'ready' message type", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("case 'ready'");
  });

  it("handles 'addMessage' message type", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("case 'addMessage'");
  });

  it("handles 'updateToolCall' message type", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("case 'updateToolCall'");
  });

  it("handles 'status' message type", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("case 'status'");
  });

  it("handles 'sessionList' message type", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("case 'sessionList'");
  });

  it("handles 'threadList' message type", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("case 'threadList'");
  });

  it("handles 'taskList' message type", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("case 'taskList'");
  });

  it("handles 'workState' message type", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("case 'workState'");
  });

  it("handles 'apiCapabilities' message type", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("case 'apiCapabilities'");
  });

  it("handles 'error' message type", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("case 'error'");
  });

  it("handles 'info' message type", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("case 'info'");
  });

  it("handles 'settingsUpdated' message type", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("case 'settingsUpdated'");
  });

  it("handles 'sessionLoaded' message type", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("case 'sessionLoaded'");
  });

  it("handles 'threadLoaded' message type", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("case 'threadLoaded'");
  });

  it("handles 'clearChat' message type", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("case 'clearChat'");
  });

  it("uses __wvSidebar for sidebar state updates", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("__wvSidebar");
  });

  it("uses __wvMessages for adding messages", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("__wvMessages");
  });

  it("uses __wvVscode for postMessage", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("__wvVscode");
  });

  it("renders status stats with session info", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("function renderStatusStats");
    expect(script).toContain("sessionStats");
  });

  it("handles approval messages", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("case 'approvalRequired'");
    expect(script).toContain("case 'approvalResolved'");
  });

  it("handles user input messages", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("case 'userInputRequired'");
    expect(script).toContain("case 'userInputResolved'");
  });

  it("handles thinking block updates", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("case 'updateThinking'");
    expect(script).toContain("case 'addThinkingBlock'");
  });

  it("handles turn lifecycle events", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("case 'turnStarted'");
    expect(script).toContain("case 'turnInterrupted'");
  });

  it("handles file change events", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("case 'fileChangeDetected'");
  });

  it("handles message complete event", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("case 'messageComplete'");
  });

  it("handles session stats event", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("case 'sessionStats'");
  });

  it("sends webviewReady message on init", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("type: 'webviewReady'");
  });
});
