/**
 * Webview JS utilities module — shared helper functions injected into the webview.
 * Returns an IIFE-wrapped script string that defines utility functions on the
 * webview's global scope so other modules can use them.
 */
import type { WebviewTranslations } from "./webview-html";

export function getUtilitiesScript(tr: WebviewTranslations): string {
  return `(function(){
  'use strict';
  // ── Locale & i18n ──
  var __locale = '${tr.locale || "en"}';
  var __i18n = {
    locale: __locale,
    thinking: '${tr.thinking}',
    streaming: '${tr.streaming}',
    processing: '${tr.processing}',
    error: '${tr.error}',
    ready: '${tr.ready}',
    approvalAwaiting: '${tr.approvalAwaiting}',
    noConversations: '${tr.noConversations}',
    noTasks: '${tr.noTasks}',
    approvalRequired: '${tr.approvalRequired}',
    allow: '${tr.allow}',
    deny: '${tr.deny}',
    thinkingOpen: '${tr.thinkingOpen}',
    thinkingClose: '${tr.thinkingClose}',
    thinkingToggle: '${tr.thinkingToggle}',
    welcomeTitle: '${tr.welcomeTitle}',
    welcomeSubtitle: '${tr.welcomeSubtitle}',
    welcomeQuote: '${tr.welcomeQuote}',
    welcomeQuoteAuthor: '${tr.welcomeQuoteAuthor}',
    welcomeSuggestionTitle: '${tr.welcomeSuggestionTitle}',
    welcomeSuggestion1: '${tr.welcomeSuggestion1}',
    welcomeSuggestion2: '${tr.welcomeSuggestion2}',
    welcomeSuggestion3: '${tr.welcomeSuggestion3}',
    welcomeSuggestion4: '${tr.welcomeSuggestion4}',
    noActiveWork: '${tr.noActiveWork}',
    cancel: '${tr.cancel}',
    goal: '${tr.goal}',
    checklist: '${tr.checklist}',
    changes: '${tr.changes || "Changes"}',
    contextUsage: '${tr.contextUsage || "Context"}',
    contextUsageUnavailable: '${tr.contextUsageUnavailable || "Context usage unavailable"}',
    strategy: '${tr.strategy}',
    cycles: '${tr.cycles}',
    readyTimedOut: '${tr.readyTimedOut}',
    note: '${tr.note}',
    dismissNotification: '${tr.dismissNotification}',
    noPreviousMessage: '${tr.noPreviousMessage}',
    justNow: '${tr.justNow}',
    minutesAgoPattern: '${tr.minutesAgoPattern}',
    hoursAgoPattern: '${tr.hoursAgoPattern}',
    daysAgoPattern: '${tr.daysAgoPattern}',
    undoUnsupportedTooltip: '${tr.undoUnsupportedTooltip}',
    retryUnsupportedTooltip: '${tr.retryUnsupportedTooltip}',
    revertUnsupportedTooltip: '${tr.revertUnsupportedTooltip}',
    fileCreated: '${tr.fileCreated || "Created"}',
    fileDeleted: '${tr.fileDeleted || "Deleted"}',
    fileModified: '${tr.fileModified || "Modified"}',
    viewDiff: '${tr.viewDiff || "Diff"}',
    viewDiffTooltip: '${tr.viewDiffTooltip || "View diff"}',
    openFile: '${tr.openFile || "Open"}',
    openFileTooltip: '${tr.openFileTooltip || "Open file"}',
    revertFile: '${tr.revertFile || "Revert"}',
    revertFileTooltip: '${tr.revertFileTooltip || "Revert file"}',
    fileChanges: '${tr.fileChanges || "File Changes"}',
    userInputAwaiting: '${tr.userInputAwaiting || "Awaiting user input"}',
    showAllWorkspaces: '${tr.showAllWorkspaces || "All"}',
    filterCurrentWorkspace: '${tr.filterCurrentWorkspace || "Project"}',
    showingWorkspaceSessions: '${tr.showingWorkspaceSessions || "Show sessions from this project"}',
    showingAllSessions: '${tr.showingAllSessions || "Show sessions from all workspaces"}',
    searchSessions: '${tr.searchSessions || "Search"}',
    searchPlaceholder: '${tr.searchPlaceholder || "Search sessions..."}',
    deleteSession: '${tr.deleteSession || "Delete"}',
    deleteSessionConfirmTitle: '${tr.deleteSessionConfirmTitle || "Delete session?"}',
    deleteSessionConfirmMessage: '${(tr.deleteSessionConfirmMessage || "").replace(/'/g, "\\'")}',
    deleteSessionConfirmButton: '${tr.deleteSessionConfirmButton || "Delete"}',
    deleteSessionSuccess: '${tr.deleteSessionSuccess || "Session deleted"}',
    deleteSessionFailed: '${tr.deleteSessionFailed || "Failed to delete session"}',
    noSearchResults: '${tr.noSearchResults || "No matching sessions"}',
    agents: '${tr.agents || "Agents"}',
    noAgentRuns: '${tr.noAgentRuns || "No agent runs"}',
    agentStatusQueued: '${tr.agentStatusQueued || "Queued"}',
    agentStatusStarting: '${tr.agentStatusStarting || "Starting"}',
    agentStatusRunning: '${tr.agentStatusRunning || "Running"}',
    agentStatusWaitingForUser: '${tr.agentStatusWaitingForUser || "Waiting for input"}',
    agentStatusModelWait: '${tr.agentStatusModelWait || "Waiting for model"}',
    agentStatusRunningTool: '${tr.agentStatusRunningTool || "Running tool"}',
    agentStatusCompleted: '${tr.agentStatusCompleted || "Completed"}',
    agentStatusFailed: '${tr.agentStatusFailed || "Failed"}',
    agentStatusCancelled: '${tr.agentStatusCancelled || "Cancelled"}',
    agentStatusInterrupted: '${tr.agentStatusInterrupted || "Interrupted"}',
    agentObjective: '${tr.agentObjective || "Objective"}',
    agentModel: '${tr.agentModel || "Model"}',
    agentProfile: '${tr.agentProfile || "Profile"}',
    agentSteps: '${tr.agentSteps || "Steps"}',
    agentResult: '${tr.agentResult || "Result"}',
    agentError: '${tr.agentError || "Error"}',
    agentRole: '${tr.agentRole || "Role"}',
    agentArtifacts: '${tr.agentArtifacts || "Artifacts"}',
    agentUsage: '${tr.agentUsage || "Token usage"}',
    agentSpawned: '${tr.agentSpawned || "Spawned"}',
    agentDelegating: '${tr.agentDelegating || "Delegating"}',
    agentFanout: '${tr.agentFanout || "Fan-out"}',
    agentActive: '${tr.agentActive || "active"}',
    agentInactive: '${tr.agentInactive || "inactive"}',
    agentType: '${tr.agentType || "Type"}',
    agentLatestOutput: '${tr.agentLatestOutput || "Latest output"}',
    agentDetails: '${tr.agentDetails || "Details"}',
    stopAgent: '${tr.stopAgent || "Stop"}',
    stopAllAgents: '${tr.stopAllAgents || "Stop all agents"}',
    stoppingAgent: '${tr.stoppingAgent || "Stopping…"}',
    agentTranscript: '${tr.agentTranscript || "Transcript"}',
    agentEvents: '${tr.agentEvents || "Events"}',
    agentAssignment: '${tr.agentAssignment || "Assignment"}',
    agentRunMetadata: '${tr.agentRunMetadata || "Run metadata"}',
    agentReferences: '${tr.agentReferences || "References"}',
    agentNoTranscript: '${tr.agentNoTranscript || "No transcript content is available"}',
    agentNoEvents: '${tr.agentNoEvents || "No lifecycle events are available"}',
    agentPartialTranscript: '${tr.agentPartialTranscript || "Earlier transcript messages were omitted from this bounded checkpoint"}',
    subagent: '${tr.subagent || "Subagent"}',
  };

  // ── Utility functions ──
  window.__wvFormatThreadsCount = function(n, type) {
    if (type === 'threads') {
      return __locale === 'zh-cn' ? n + ' \\u4E2A\\u7EBF\\u7A0B' : n + ' thread' + (n !== 1 ? 's' : '');
    }
    return __locale === 'zh-cn' ? n + ' \\u4E2A\\u4F1A\\u8BDD' : n + ' session' + (n !== 1 ? 's' : '');
  };

  window.__wvFormatLoadedThread = function(title) {
    return __locale === 'zh-cn' ? '\\u5DF2\\u52A0\\u8F7D: ' + title : 'Loaded: ' + title;
  };

  window.__wvEscapeHtml = function(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  window.__wvFormatRelativeTime = function(dateStr) {
    try {
      var d = new Date(dateStr);
      var now = new Date();
      var diffMs = now - d;
      var diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return __i18n.justNow;
      if (diffMin < 60) return __i18n.minutesAgoPattern.replace('{n}', String(diffMin));
      var diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return __i18n.hoursAgoPattern.replace('{n}', String(diffHr));
      var diffDay = Math.floor(diffHr / 24);
      if (diffDay < 30) return __i18n.daysAgoPattern.replace('{n}', String(diffDay));
      return d.toLocaleDateString();
    } catch(e) { return ''; }
  };

  window.__wvI18n = __i18n;
  window.__wvLocale = __locale;
  })();`;
}
