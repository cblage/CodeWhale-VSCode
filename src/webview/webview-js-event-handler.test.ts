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

  it("updates delegate-card status text and color classes when agent calls finish", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("tcEl.querySelector('.delegate-status')");
    expect(script).toContain("tcEl.classList.remove('delegate-running')");
    expect(script).toContain("tcEl.classList.add('delegate-completed')");
    expect(script).toContain("tcEl.classList.add('delegate-failed')");
  });

  it("updates generic tool status classes so failures remain expanded", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("tcEl.classList.remove('tool-call-' + toolStatusClasses[sci])");
    expect(script).toContain("tcEl.classList.add('tool-call-' + (msg.status || 'unknown'))");
  });

  it("handles 'status' message type", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("case 'status'");
  });

  it("renders live context usage and refreshes it when the webview becomes visible", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("function renderContextUsage(available, usage)");
    expect(script).toContain("case 'contextUsage'");
    expect(script).toContain("__i18n.contextUsage || 'Context'");
    expect(script).toContain("__i18n.contextUsageUnavailable || 'Context usage unavailable'");
    expect(script).toContain("renderContextUsage(!!msg.available, msg.usage || null)");
    expect(script).toContain("type: 'refreshContextUsage'");
    expect(script).toContain("used.toLocaleString(__i18n.locale || undefined)");
    expect(script).toContain("percent.toFixed(1) + '%)'");
    expect(script).toContain("setAttribute('stroke-dashoffset', String(dashOffset))");
    expect(script).not.toContain("setAttribute('style'");
  });

  it("formats per-message token usage with locale separators", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("Number(msg.usage.input_tokens || 0).toLocaleString('en-US')");
    expect(script).toContain("Number(msg.usage.output_tokens || 0).toLocaleString('en-US')");
  });

  it("drives Mode, Model, Effort, and Compact from an exclusive dashboard popover", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("document.getElementById('btn-session-controls')");
    expect(script).toContain("document.getElementById('session-controls-popover')");
    expect(script).toContain("function setSessionControlsOpen(open)");
    expect(script).toContain("sessionControlsPopover.classList.toggle('open', sessionControlsOpen)");
    expect(script).toContain("sessionControlsButton.setAttribute('aria-expanded', sessionControlsOpen ? 'true' : 'false')");
    expect(script).toContain("sessionControlsPopover.style.left = Math.min(");
    expect(script).toContain("sessionControlsPopover.style.right = 'auto'");
    expect(script).toContain("window.__wvSidebar.closeFloatingPopovers()");
    expect(script).toContain("command: '/mode'");
    expect(script).toContain("command: '/model'");
    expect(script).toContain("command: '/reasoning'");
    expect(script).toContain("target.closest('#btn-compact')");
    expect(script).toContain("if (e.key === 'Escape' && sessionControlsOpen) setSessionControlsOpen(false)");
    expect(script).toContain("window.__wvSessionControls = {");
    expect(script).not.toContain("settingsBar.querySelectorAll('.dropdown-menu')");
  });

  it("keeps the Config action wired after moving settings out of the top bar", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("document.getElementById('btn-config')");
    expect(script).toContain("type: 'openConfigPanel'");
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

  it("handles 'agentDetail' message type", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("case 'agentDetail'");
  });

  it("releases optimistic agent stop state from provider results", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("case 'agentStopResult'");
    expect(script).toContain("if (msg.all) window.__wvSidebar.finishAgentStop(null)");
    expect(script).toContain("window.__wvSidebar.finishAgentStop(attemptedAgentRunIds)");
    expect(script).toContain("else window.__wvSidebar.finishAgentStop(null)");
  });

  it("handles 'workState' message type", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("case 'workState'");
  });

  it("handles 'apiCapabilities' message type", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("case 'apiCapabilities'");
  });

  it("handles dynamic skill command updates", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("case 'skillCommands'");
    expect(script).toContain("window.__wvInput.setSkillCommands(msg.skills || [])");
  });

  it("handles 'error' message type", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("case 'error'");
  });

  it("handles 'info' message type", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("case 'info'");
  });

  it("applies raw agent tool-card visibility on ready and live setting changes", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("applyShowAgentToolCards(!!msg.showAgentToolCards)");
    expect(script).toContain("applyToolDetailSettings(!!msg.showToolDetails, !!msg.calmMode)");
    expect(script).toContain("case 'displaySettingsUpdated'");
  });

  it("inserts and updates live subagent transcript blocks in arrival order", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("case 'addSubagentTranscriptBlock'");
    expect(script).toContain("renderSubagentTranscriptBlock(msg.entry, msg.blockIdx)");
    expect(script).toContain("case 'updateSubagentTranscriptBlock'");
    expect(script).toContain("updateSubagentTranscriptBlock(msg.entry)");
  });

  it("inserts live steer blocks in assistant block order", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("case 'addSteerBlock'");
    expect(script).toContain("renderSteerBlock(msg.content || '', msg.blockIdx)");
  });

  it("renders info notes with an individually dismissible close button", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("function appendDismissibleSystemMessage(message)");
    expect(script).toContain("dismissEl.type = 'button'");
    expect(script).toContain("dismissEl.className = 'system-message-dismiss'");
    expect(script).toContain("var dismissLabel = __i18n.dismissNotification || 'Dismiss notification'");
    expect(script).toContain("dismissEl.setAttribute('aria-label', dismissLabel)");
    expect(script).toContain("dismissEl.title = dismissLabel");
    expect(script).toContain("dismissEl.textContent = '✕'");
    expect(script).toContain("infoEl.remove()");
    expect(script).toContain("appendDismissibleSystemMessage(msg.message)");
    expect(script).toContain("appendDismissibleSystemMessage(__i18n.noPreviousMessage)");
  });

  it("handles 'settingsUpdated' message type", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("case 'settingsUpdated'");
  });

  it("restores the authoritative running state when a webview is recreated", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("var turnInProgress = !!msg.turnInProgress");
    expect(script).toContain("window.__wvMessages.setStreaming(turnInProgress)");
    expect(script).toContain("window.__wvMessages.setStreaming(true)");
    expect(script).toContain("setStreamingState(window.__wvMessages.isStreaming(), msg.text)");
    expect(script).toContain("case 'turnState'");
    expect(script).toContain("type: 'refreshTurnState'");
  });

  it("handles 'sessionLoaded' message type", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("case 'sessionLoaded'");
    const sessionLoaded = script.slice(
      script.indexOf("case 'sessionLoaded'"),
      script.indexOf("case 'threadLoaded'"),
    );
    expect(sessionLoaded).toContain("renderContextUsage(false, null)");
    expect(sessionLoaded).toContain("type: 'refreshContextUsage'");
  });

  it("handles 'threadLoaded' message type", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("case 'threadLoaded'");
  });

  it("clears stale task/agent panels on threadLoaded", () => {
    const script = getEventHandlerScript(makeTr());
    // The threadLoaded case must reset task and agent panels so data from
    // the previous thread doesn't linger before the refresh arrives.
    const threadLoadedIdx = script.indexOf("case 'threadLoaded'");
    const taskListIdx = script.indexOf("case 'taskList'");
    // The clearing renderTasks([]) call must appear between threadLoaded and
    // the next case (taskList).
    expect(threadLoadedIdx).toBeGreaterThan(-1);
    expect(taskListIdx).toBeGreaterThan(threadLoadedIdx);
    const slice = script.slice(threadLoadedIdx, taskListIdx);
    expect(slice).toContain("renderTasks([])");
    expect(slice).toContain("updateAgentRuns([])");
  });

  it("closes detail overlays and clears work/changes on threadLoaded", () => {
    const script = getEventHandlerScript(makeTr());
    const threadLoadedIdx = script.indexOf("case 'threadLoaded'");
    const taskListIdx = script.indexOf("case 'taskList'");
    const slice = script.slice(threadLoadedIdx, taskListIdx);
    // Both detail overlays from the previous thread must be closed
    expect(slice).toContain("closeTaskDetail()");
    expect(slice).toContain("closeAgentDetail()");
    // Work panel state must be reset to empty
    expect(slice).toContain("setWorkState(");
    expect(slice).toContain("coherenceState: 'healthy'");
    // Changes panel must be cleared
    expect(slice).toContain("setChangesState([])");
    expect(slice).toContain("renderWork()");
    expect(slice).toContain("renderChanges()");
  });

  it("handles 'clearChat' message type", () => {
    const script = getEventHandlerScript(makeTr());
    expect(script).toContain("case 'clearChat'");
  });

  it("closes both task and agent detail overlays on clearChat", () => {
    const script = getEventHandlerScript(makeTr());
    const clearChatIdx = script.indexOf("case 'clearChat'");
    const errorIdx = script.indexOf("case 'error'", clearChatIdx);
    const slice = script.slice(clearChatIdx, errorIdx);
    // Both overlays must be closed
    expect(slice).toContain("closeTaskDetail()");
    expect(slice).toContain("closeAgentDetail()");
  });

  it("clears task/agent panels on clearChat", () => {
    const script = getEventHandlerScript(makeTr());
    const clearChatIdx = script.indexOf("case 'clearChat'");
    const errorIdx = script.indexOf("case 'error'", clearChatIdx);
    const slice = script.slice(clearChatIdx, errorIdx);
    expect(slice).toContain("renderTasks([])");
    expect(slice).toContain("updateAgentRuns([])");
  });

  it("clears work and changes panels on clearChat", () => {
    const script = getEventHandlerScript(makeTr());
    const clearChatIdx = script.indexOf("case 'clearChat'");
    const errorIdx = script.indexOf("case 'error'", clearChatIdx);
    const slice = script.slice(clearChatIdx, errorIdx);
    // Work state must be reset
    expect(slice).toContain("setWorkState(");
    expect(slice).toContain("coherenceState: 'healthy'");
    // Changes state must be cleared
    expect(slice).toContain("setChangesState([])");
    expect(slice).toContain("renderWork()");
    expect(slice).toContain("renderChanges()");
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
