import { describe, it, expect } from "vitest";
import { getMessagesScript } from "./webview-js-messages";
import { makeTr } from "./webview-test-helpers";

describe("webview-js-messages.ts", () => {
  it("returns a non-empty string", () => {
    const script = getMessagesScript(makeTr());
    expect(script).toBeTruthy();
    expect(script.length).toBeGreaterThan(100);
  });

  it("is wrapped in an IIFE", () => {
    const script = getMessagesScript(makeTr());
    expect(script.startsWith("(function()")).toBe(true);
    expect(script.endsWith("})();")).toBe(true);
  });

  it("uses strict mode", () => {
    const script = getMessagesScript(makeTr());
    expect(script).toContain("'use strict'");
  });

  it("references __wvEscapeHtml from utilities", () => {
    const script = getMessagesScript(makeTr());
    expect(script).toContain("window.__wvEscapeHtml");
  });

  it("references __wvI18n from utilities", () => {
    const script = getMessagesScript(makeTr());
    expect(script).toContain("window.__wvI18n");
  });

  it("contains addMessage function", () => {
    const script = getMessagesScript(makeTr());
    expect(script).toContain("function addMessage");
  });

  it("renders labeled subagent transcript blocks inside assistant messages", () => {
    const script = getMessagesScript(makeTr());
    expect(script).toContain("function renderSubagentTranscriptBlock");
    expect(script).toContain("function updateSubagentTranscriptBlock");
    expect(script).toContain("b.type === 'subagent_transcript'");
    expect(script).toContain("subagent-transcript-block");
    expect(script).toContain("__i18n.subagent");
    expect(script).toContain("renderSubagentTranscriptBlock: renderSubagentTranscriptBlock");
  });

  it("renders interleaved steer blocks inside an active assistant message", () => {
    const script = getMessagesScript(makeTr());
    expect(script).toContain("function renderSteerBlock");
    expect(script).toContain("b.type === 'steer'");
    expect(script).toContain("steer-block-content");
    expect(script).toContain("renderSteerBlock: renderSteerBlock");
  });

  it("contains renderToolCall function", () => {
    const script = getMessagesScript(makeTr());
    expect(script).toContain("function renderToolCall");
  });

  it("marks raw agent tool calls separately and exposes live visibility control", () => {
    const script = getMessagesScript(makeTr());
    expect(script).toContain("function applyShowAgentToolCards");
    expect(script).toContain("delegate-card agent-tool-card");
    expect(script).toContain("delegate-icon codicon codicon-robot");
    expect(script).not.toContain("\\\\u2659");
    expect(script).toContain("applyShowAgentToolCards: applyShowAgentToolCards");
  });

  it("exposes compact runtime tool-detail settings and status-specific tool classes", () => {
    const script = getMessagesScript(makeTr());
    expect(script).toContain("function applyToolDetailSettings(showToolDetails, calmMode)");
    expect(script).toContain("!showToolDetails || calmMode");
    expect(script).toContain("applyToolDetailSettings: applyToolDetailSettings");
    expect(script).toContain("tool-call tool-call-' + __wvEscapeHtml(tc.status || 'unknown')");
  });

  it("contains renderFileChangeCard function", () => {
    const script = getMessagesScript(makeTr());
    expect(script).toContain("function renderFileChangeCard");
  });

  it("contains welcome screen rendering", () => {
    const script = getMessagesScript(makeTr());
    expect(script).toContain("welcome-screen");
    expect(script).toContain("welcome-brand");
  });

  it("contains file change card rendering", () => {
    const script = getMessagesScript(makeTr());
    expect(script).toContain("file-change-card");
    expect(script).toContain("fc-view-diff");
    expect(script).toContain("fc-open-file");
    expect(script).toContain("fc-revert");
  });

  it("contains approval bar rendering", () => {
    const script = getMessagesScript(makeTr());
    expect(script).toContain("approval-bar");
  });

  it("contains thinking block rendering", () => {
    const script = getMessagesScript(makeTr());
    expect(script).toContain("thinking-block");
    expect(script).toContain("thinking-toggle");
    expect(script).toContain("thinking-content");
  });

  it("handles file change diff store registration", () => {
    const script = getMessagesScript(makeTr());
    expect(script).toContain("__wvDiffStore");
    expect(script).toContain("__wvDiffIdCounter");
  });

  it("contains event delegation for message interactions", () => {
    const script = getMessagesScript(makeTr());
    expect(script).toContain("addEventListener");
    expect(script).toContain("click");
  });

  it("exposes __wvMessages on window for event handler", () => {
    const script = getMessagesScript(makeTr());
    expect(script).toContain("window.__wvMessages = {");
    expect(script).toContain("addMessage: addMessage");
    expect(script).toContain("renderWelcome: renderWelcome");
    expect(script).toContain("renderToolCall: renderToolCall");
    expect(script).toContain("smartScrollToBottom: smartScrollToBottom");
  });

  it("contains streaming state management", () => {
    const script = getMessagesScript(makeTr());
    expect(script).toContain("isStreaming");
    expect(script).toContain("streamingTimeout");
    expect(script).toContain("userScrolledUp");
  });

  it("contains smart scroll to bottom logic", () => {
    const script = getMessagesScript(makeTr());
    expect(script).toContain("function smartScrollToBottom");
    expect(script).toContain("function isNearBottom");
  });

  it("calls renderWelcome on init", () => {
    const script = getMessagesScript(makeTr());
    expect(script).toContain("renderWelcome()");
  });
});
