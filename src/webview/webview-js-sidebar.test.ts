import { describe, it, expect } from "vitest";
import { getSidebarScript } from "./webview-js-sidebar";
import { makeTr } from "./webview-test-helpers";

describe("webview-js-sidebar.ts", () => {
  it("returns a non-empty string", () => {
    const script = getSidebarScript(makeTr());
    expect(script).toBeTruthy();
    expect(script.length).toBeGreaterThan(100);
  });

  it("is wrapped in an IIFE", () => {
    const script = getSidebarScript(makeTr());
    expect(script.startsWith("(function()")).toBe(true);
    expect(script.endsWith("})();")).toBe(true);
  });

  it("uses strict mode", () => {
    const script = getSidebarScript(makeTr());
    expect(script).toContain("'use strict'");
  });

  it("references __wvEscapeHtml from utilities", () => {
    const script = getSidebarScript(makeTr());
    expect(script).toContain("window.__wvEscapeHtml");
  });

  it("references __wvI18n from utilities", () => {
    const script = getSidebarScript(makeTr());
    expect(script).toContain("window.__wvI18n");
  });

  it("contains renderSessions function", () => {
    const script = getSidebarScript(makeTr());
    expect(script).toContain("function renderSessions");
  });

  it("deduplicates the empty session state and uses the requested empty icons", () => {
    const script = getSidebarScript(makeTr());
    expect(script).toContain("work-empty session-empty-msg");
    expect(script).toContain("\\uD83D\\uDDE8");
    expect(script).toContain("\\u26F6");
  });

  it("contains renderThreads function", () => {
    const script = getSidebarScript(makeTr());
    expect(script).toContain("function renderThreads");
  });

  it("contains renderTasks function", () => {
    const script = getSidebarScript(makeTr());
    expect(script).toContain("function renderTasks");
  });

  it("adds task card action buttons for details and result access", () => {
    const script = getSidebarScript(makeTr());
    expect(script).toContain("detailsBtn.textContent = 'Details'");
    expect(script).toContain("resultBtn.textContent = __i18n.agentResult || 'Result'");
  });

  it("contains renderWork function", () => {
    const script = getSidebarScript(makeTr());
    expect(script).toContain("function renderWork");
  });

  it("contains sidebar tab switching logic", () => {
    const script = getSidebarScript(makeTr());
    expect(script).toContain("function switchSidebarTab");
  });

  it("contains task detail rendering", () => {
    const script = getSidebarScript(makeTr());
    expect(script).toContain("function showTaskDetail");
    expect(script).toContain("function closeTaskDetail");
  });

  it("renders richer task process sections and overlay actions", () => {
    const script = getSidebarScript(makeTr());
    expect(script).toContain("Full Result");
    expect(script).toContain("Verification Gates");
    expect(script).toContain("renderOpenFileButton");
    expect(script).toContain("detail-open-external");
  });

  it("contains agent detail rendering", () => {
    const script = getSidebarScript(makeTr());
    expect(script).toContain("function showAgentDetail");
    expect(script).toContain("codicon codicon-robot");
    expect(script).not.toContain("\\\\u2659");
    expect(script).toContain("function closeAgentDetail");
    expect(script).toContain("agent-transcript-group");
    expect(script).toContain("agent-events-group");
    expect(script).toContain("normalizedAgentEvent");
    expect(script).toContain("ev.status || ev.kind");
    expect(script).toContain("art.name || art.path || art.kind");
  });

  it("renders a toggleable agent popover with persistent expansion and Details reuse", () => {
    const script = getSidebarScript(makeTr());
    expect(script).toContain("function renderAgentPopover");
    expect(script).toContain("function updateAgentRuns");
    expect(script).toContain("expandedAgentRunIds");
    expect(script).toContain("\\u25B6");
    expect(script).toContain("\\u25BC");
    expect(script).toContain("agent-popover-details");
    expect(script).toContain("agent-popover-stop");
    expect(script).toContain("codicon codicon-debug-stop");
    expect(script).toContain("type: 'stopAgent'");
    expect(script).toContain("type: 'stopAllAgents'");
    expect(script).toContain("finishAgentStop: finishAgentStop");
    expect(script).toContain("showAgentSessions");
    expect(script).toContain("type: 'refreshAgentRuns'");
  });

  it("renders a checklist popover from Work state and makes it exclusive with Agents", () => {
    const script = getSidebarScript(makeTr());
    expect(script).toContain("function renderWorkPopover");
    expect(script).toContain("function toggleWorkPopover");
    expect(script).toContain("workState && Array.isArray(workState.checklist)");
    expect(script).toContain("setWorkPopoverOpen(false)");
    expect(script).toContain("setAgentPopoverOpen(false)");
    expect(script).toContain("row.className = 'work-popover-item'");
    expect(script).toContain("completed ? ' completed'");
    expect(script).toContain("codicon-check");
    expect(script).toContain("codicon-broadcast");
    expect(script).toContain("codicon-circle");
    expect(script).toContain("renderWorkPopover: renderWorkPopover");
  });

  it("keeps the dashboard popover mutually exclusive with Work, Changes, and Agents", () => {
    const script = getSidebarScript(makeTr());
    const agentSetter = script.slice(script.indexOf("function setAgentPopoverOpen"), script.indexOf("function toggleAgentPopover"));
    const workSetter = script.slice(script.indexOf("function setWorkPopoverOpen"), script.indexOf("function toggleWorkPopover"));
    const changesSetter = script.slice(script.indexOf("function setChangesPopoverOpen"), script.indexOf("function toggleChangesPopover"));
    expect(agentSetter).toContain("window.__wvSessionControls.close()");
    expect(workSetter).toContain("window.__wvSessionControls.close()");
    expect(changesSetter).toContain("window.__wvSessionControls.close()");
    expect(script).toContain("function closeFloatingPopovers()");
    expect(script).toContain("closeFloatingPopovers: closeFloatingPopovers");
  });

  it("uses one active-status definition for the sidebar and popover", () => {
    const script = getSidebarScript(makeTr());
    expect(script).toContain("function isAgentActiveStatus");
    expect(script).toContain("['queued', 'starting', 'running', 'in_progress', 'waiting_for_user', 'model_wait', 'running_tool', 'working', 'pending']");
    expect(script).toContain("run.runtime_available !== false && run.completed_at_ms == null");
    expect(script).toContain("card.className = 'agent-card' + (isAgentActive(r)");
    expect(script).toContain("agentStatusNeedsAction");
  });

  it("contains the full-chat history popover toggle", () => {
    const script = getSidebarScript(makeTr());
    expect(script).toContain("function toggleHistoryPopover");
    expect(script).toContain("setHistoryPopoverOpen");
    expect(script).not.toContain("toggleThreadsPanel");
  });

  it("handles workspace filter toggle", () => {
    const script = getSidebarScript(makeTr());
    expect(script).toContain("session-scope-workspace");
    expect(script).toContain("session-scope-all");
    expect(script).toContain("setAllWorkspaces");
    expect(script).toContain("showAllWorkspaces: false");
    expect(script).toContain("showAllWorkspaces: true");
    expect(script).not.toContain("workspace-filter-toggle");
    expect(script).not.toContain("toggleAllWorkspaces");
    expect(script).not.toContain("codicon-save-all");
    expect(script).toContain("codicon-trash");
  });

  it("removes obsolete sidebar section collapsing", () => {
    const script = getSidebarScript(makeTr());
    expect(script).not.toContain("sidebar-section-header");
    expect(script).not.toContain("classList.toggle('collapsed')");
  });

  it("wires render functions to window.__wvSidebar", () => {
    const script = getSidebarScript(makeTr());
    expect(script).toContain("window.__wvSidebar = {");
    expect(script).toContain("renderSessions: renderSessions");
    expect(script).toContain("renderThreads: renderThreads");
    expect(script).toContain("renderTasks: renderTasks");
    expect(script).toContain("renderWork: renderWork");
    expect(script).toContain("switchSidebarTab: switchSidebarTab");
  });

  it("exposes getter/setter for sessions, threads, workState", () => {
    const script = getSidebarScript(makeTr());
    expect(script).toContain("setSessions:");
    expect(script).toContain("setActiveSessionId:");
    expect(script).toContain("setThreads:");
    expect(script).toContain("setActiveThreadId:");
    expect(script).toContain("setShowAllWorkspaces:");
    expect(script).toContain("setWorkState:");
  });

  it("uses __wvFormatRelativeTime for time display", () => {
    const script = getSidebarScript(makeTr());
    expect(script).toContain("window.__wvFormatRelativeTime");
  });

  it("does not retain removed toolbar thread-count wiring", () => {
    const script = getSidebarScript(makeTr());
    expect(script).not.toContain("thread-count");
    expect(script).not.toContain("window.__wvFormatThreadsCount");
  });

  it("does not render file changes in work panel (TUI design: file changes are shown inline, not in Work sidebar)", () => {
    const script = getSidebarScript(makeTr());
    expect(script).not.toContain("workState.fileChanges");
  });

  it("contains renderChanges function for the Changes popover", () => {
    const script = getSidebarScript(makeTr());
    expect(script).toContain("function renderChanges");
  });

  it("wires renderChanges to window.__wvSidebar", () => {
    const script = getSidebarScript(makeTr());
    expect(script).toContain("renderChanges: renderChanges");
  });

  it("exposes setChangesState getter/setter", () => {
    const script = getSidebarScript(makeTr());
    expect(script).toContain("setChangesState:");
    expect(script).toContain("getChangesState:");
  });

  it("renders file changes in the Changes popover, not the Work panel", () => {
    const script = getSidebarScript(makeTr());
    expect(script).toContain("changesState");
    expect(script).toContain("changes-popover-list");
    expect(script).toContain("changes-count-badge");
    expect(script).toContain("function toggleChangesPopover");
    expect(script).not.toContain("workState.fileChanges");
  });

  it("tracks History popover accessibility state without sidebar icons", () => {
    const script = getSidebarScript(makeTr());
    expect(script).toContain("button.setAttribute('aria-expanded', historyPopoverOpen ? 'true' : 'false')");
    expect(script).not.toContain("renderThreadsPanelToggle");
    expect(script).not.toContain("codicon-layout-sidebar-left-off");
  });

  it("does not repeat the Changes heading inside the Changes popover list", () => {
    const script = getSidebarScript(makeTr());
    const start = script.indexOf("function renderChanges()");
    const end = script.indexOf("function closeTaskDetail", start);
    const renderChanges = script.slice(start, end);

    expect(renderChanges).toContain("change-summary-row");
    expect(renderChanges).not.toContain("__wvEscapeHtml(__i18n.fileChanges)");
    expect(renderChanges).not.toContain("work-section-subtitle");
    expect(renderChanges).not.toContain("\\uD83D\\uDCC1");
  });
});
