/**
 * Webview JS sidebar module — injected into the webview as an IIFE.
 * Handles sessions, threads, tasks, work panel rendering, and sidebar tab switching.
 */
import type { WebviewTranslations } from "./webview-html";

export function getSidebarScript(tr: WebviewTranslations): string {
  return `(function(){
  'use strict';
  var __i18n = window.__wvI18n;
  var __wvEscapeHtml = window.__wvEscapeHtml;
  var __wvFormatRelativeTime = window.__wvFormatRelativeTime;
  var __wvFormatThreadsCount = window.__wvFormatThreadsCount;
  var vscode = window.__wvVscode;

  // ── Sidebar state ──
  var sessions = [];
  var activeSessionId = null;
  var threads = [];
  var activeThreadId = null;
  var showAllWorkspaces = false;
  var sidebarTab = 'sessions';
  var showThreadList = false;
  var threadCountEl = document.getElementById('thread-count');
  var sessionSearchQuery = '';

  // ── Work state ──
  var workState = { goal: null, checklist: [], checklistCompletionPct: 0, strategy: [], cycleCount: 0, coherenceState: 'healthy', coherenceLabel: '' };

  // ── Changes state ──
  var changesState = [];

  // ── Agent runs state ──
  var agentRuns = [];

  // ── Agent status label helper ──
  function agentStatusLabel(status) {
    var map = {
      queued: __i18n.agentStatusQueued,
      starting: __i18n.agentStatusStarting,
      running: __i18n.agentStatusRunning,
      waiting_for_user: __i18n.agentStatusWaitingForUser,
      model_wait: __i18n.agentStatusModelWait,
      running_tool: __i18n.agentStatusRunningTool,
      completed: __i18n.agentStatusCompleted,
      failed: __i18n.agentStatusFailed,
      cancelled: __i18n.agentStatusCancelled,
      interrupted: __i18n.agentStatusInterrupted,
    };
    return map[status] || status;
  }

  function agentStatusIcon(status) {
    if (status === 'completed') return '\\u2713';
    if (status === 'failed') return '\\u2717';
    if (status === 'cancelled') return '\\u2298';
    if (status === 'interrupted') return '\\u2717';
    if (status === 'running' || status === 'starting' || status === 'running_tool' || status === 'model_wait') return '\\u27F3';
    if (status === 'queued') return '\\u23F3';
    if (status === 'waiting_for_user') return '\\u2709';
    return '\\u00B7';
  }

  function agentStatusColor(status) {
    if (status === 'completed') return '#4caf50';
    if (status === 'failed' || status === 'interrupted') return '#f44336';
    if (status === 'cancelled') return '#888';
    if (status === 'running' || status === 'starting' || status === 'running_tool' || status === 'model_wait') return '#ff9800';
    if (status === 'queued') return '#888';
    if (status === 'waiting_for_user') return '#2196f3';
    return '#888';
  }

  function formatAgentTokenUsage(usage) {
    if (!usage) return '';
    var inp = usage.input_tokens || 0;
    var out = usage.output_tokens || 0;
    if (inp === 0 && out === 0) return '';
    var inpK = inp >= 1000 ? (inp / 1000).toFixed(1) + 'k' : String(inp);
    var outK = out >= 1000 ? (out / 1000).toFixed(1) + 'k' : String(out);
    return inpK + ' / ' + outK;
  }
  var _diffStore = window.__wvDiffStore;
  var _diffIdCounter = window.__wvDiffIdCounter;

  // ── Render Sessions ──
  var _sessionSearchInited = false;
  var _searchDebounce = null;

  function initSessionSearch() {
    if (_sessionSearchInited) return;
    var container = document.getElementById('tab-sessions');
    if (!container) return;
    // Insert search bar as the first child, before any session items
    var searchBar = document.createElement('div');
    searchBar.className = 'session-search-bar';
    searchBar.id = 'session-search-bar';
    var searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'session-search-input';
    searchInput.id = 'session-search-input';
    searchInput.placeholder = __i18n.searchPlaceholder;
    searchInput.value = sessionSearchQuery;
    searchInput.addEventListener('input', function() {
      sessionSearchQuery = searchInput.value;
      if (_searchDebounce) clearTimeout(_searchDebounce);
      _searchDebounce = setTimeout(function() {
        vscode.postMessage({ type: 'searchSessions', query: sessionSearchQuery });
      }, 300);
    });
    searchBar.appendChild(searchInput);
    container.insertBefore(searchBar, container.firstChild);
    _sessionSearchInited = true;
  }

  function renderSessions() {
    var container = document.getElementById('tab-sessions');
    if (!container) return;
    var count = sessions.length;
    if (threadCountEl) threadCountEl.textContent = __wvFormatThreadsCount(count, 'sessions');

    var filterToggle = document.getElementById('workspace-filter-toggle');
    if (filterToggle) {
      filterToggle.textContent = showAllWorkspaces ? '\\uD83C\\uDF0D' : '\\uD83C\\uDF10';
      filterToggle.title = showAllWorkspaces ? __i18n.filterCurrentWorkspace : __i18n.showAllWorkspaces;
      filterToggle.style.opacity = showAllWorkspaces ? '1' : '0.5';
    }

    // Ensure search bar exists (only created once)
    initSessionSearch();

    // Remove only session items, keep the search bar
    var existing = container.querySelectorAll('.thread-item, .session-empty-msg');
    for (var r = 0; r < existing.length; r++) {
      existing[r].remove();
    }

    if (count === 0) {
      var el = document.createElement('div');
      el.className = 'work-empty';
      var msg = sessionSearchQuery ? __i18n.noSearchResults : __i18n.noConversations;
      el.innerHTML = '<div class="work-empty-icon">\\uD83D\\uDCCB</div><div class="work-empty-text">' + __wvEscapeHtml(msg) + '</div>';
      container.appendChild(el);
      return;
    }

    for (var i = 0; i < sessions.length; i++) {
      var s = sessions[i];
      var el = document.createElement('div');
      el.className = 'thread-item' + (s.id === activeSessionId ? ' active' : '');

      var titleEl = document.createElement('div');
      titleEl.className = 'thread-title';
      titleEl.textContent = s.title || s.id.slice(0, 8);
      el.appendChild(titleEl);

      var metaEl = document.createElement('div');
      metaEl.className = 'thread-meta';

      var modeEl = document.createElement('span');
      modeEl.textContent = s.mode || '';
      metaEl.appendChild(modeEl);

      if (showAllWorkspaces && s.workspace) {
        var wsEl = document.createElement('span');
        wsEl.className = 'session-workspace';
        var wsName = s.workspace.split('/').pop() || s.workspace;
        wsEl.textContent = wsName;
        wsEl.title = s.workspace;
        metaEl.appendChild(wsEl);
      }

      if (s.message_count) {
        var msgEl = document.createElement('span');
        msgEl.textContent = s.message_count + ' msgs';
        metaEl.appendChild(msgEl);
      }

      if (s.updated_at) {
        var timeEl = document.createElement('span');
        timeEl.textContent = __wvFormatRelativeTime(s.updated_at);
        metaEl.appendChild(timeEl);
      }

      el.appendChild(metaEl);

      // Delete button
      var deleteBtn = document.createElement('button');
      deleteBtn.className = 'session-delete-btn';
      deleteBtn.textContent = '\\u2715';
      deleteBtn.title = __i18n.deleteSession;
      (function(sessionId, sessionTitle) {
        deleteBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          vscode.postMessage({ type: 'deleteSession', sessionId: sessionId, sessionTitle: sessionTitle });
        });
      })(s.id, s.title || s.id.slice(0, 8));
      el.appendChild(deleteBtn);

      (function(sessionId) {
        el.addEventListener('click', function() {
          vscode.postMessage({ type: 'loadSession', sessionId: sessionId });
        });
      })(s.id);

      container.appendChild(el);
    }
  }

  // ── Render Threads ──
  function renderThreads() {
    var container = document.getElementById('tab-threads-list');
    if (!container) return;
    var count = threads.length;
    if (sidebarTab === 'threads' && threadCountEl) {
      threadCountEl.textContent = __wvFormatThreadsCount(count, 'threads');
    }

    container.innerHTML = '';

    if (count === 0) {
      var el = document.createElement('div');
      el.className = 'work-empty';
      el.innerHTML = '<div class="work-empty-icon">\\uD83D\\uDCCB</div><div class="work-empty-text">' + __wvEscapeHtml(__i18n.noConversations) + '</div>';
      container.appendChild(el);
      return;
    }

    for (var i = 0; i < threads.length; i++) {
      var t = threads[i];
      var el = document.createElement('div');
      el.className = 'thread-item' + (t.id === activeThreadId ? ' active' : '');

      var titleEl = document.createElement('div');
      titleEl.className = 'thread-title';
      titleEl.textContent = t.title || t.id.slice(0, 8);
      el.appendChild(titleEl);

      if (t.preview) {
        var previewEl = document.createElement('div');
        previewEl.className = 'thread-preview';
        previewEl.textContent = t.preview;
        el.appendChild(previewEl);
      }

      var metaEl = document.createElement('div');
      metaEl.className = 'thread-meta';

      if (t.latest_turn_status) {
        var statusEl = document.createElement('span');
        statusEl.className = 'turn-status ' + t.latest_turn_status;
        statusEl.textContent = t.latest_turn_status;
        metaEl.appendChild(statusEl);
      }

      var modeEl = document.createElement('span');
      modeEl.textContent = t.mode || '';
      metaEl.appendChild(modeEl);

      if (t.updated_at) {
        var timeEl = document.createElement('span');
        timeEl.textContent = __wvFormatRelativeTime(t.updated_at);
        metaEl.appendChild(timeEl);
      }

      el.appendChild(metaEl);

      (function(threadId) {
        el.addEventListener('click', function() {
          vscode.postMessage({ type: 'loadThread', threadId: threadId });
        });
      })(t.id);

      container.appendChild(el);
    }
  }

  // ── Switch Sidebar Tab ──
  function switchSidebarTab(tab) {
    sidebarTab = tab;
    var sessionsBtn = document.getElementById('tab-sessions-btn');
    var threadsBtn = document.getElementById('tab-threads-btn');
    var sessionsContainer = document.getElementById('tab-sessions');
    var threadsContainer = document.getElementById('tab-threads-list');
    var section = document.getElementById('sidebar-threads');

    if (tab === 'sessions') {
      sessionsBtn.classList.add('active');
      threadsBtn.classList.remove('active');
      if (section) section.setAttribute('data-active-tab', 'sessions');
      sessionsContainer.style.display = '';
      threadsContainer.style.display = '';
      if (threadCountEl) threadCountEl.textContent = __wvFormatThreadsCount(sessions.length, 'sessions');
    } else {
      sessionsBtn.classList.remove('active');
      threadsBtn.classList.add('active');
      if (section) section.setAttribute('data-active-tab', 'threads');
      sessionsContainer.style.display = '';
      threadsContainer.style.display = '';
      if (threadCountEl) threadCountEl.textContent = __wvFormatThreadsCount(threads.length, 'threads');
    }
  }

  // ── Apply showThreadList setting ──
  function applyShowThreadList(show) {
    showThreadList = show;
    var threadsBtn = document.getElementById('tab-threads-btn');
    if (threadsBtn) {
      threadsBtn.style.display = show ? '' : 'none';
    }
    // If threads are hidden and currently on the threads tab, switch to sessions
    if (!show && sidebarTab === 'threads') {
      switchSidebarTab('sessions');
    }
  }

  // ── Render Tasks ──
  function renderTasks(tasks) {
    var container = document.getElementById('tab-tasks');
    if (!container) return;
    container.innerHTML = '';
    if (!tasks || tasks.length === 0) {
      var el = document.createElement('div');
      el.className = 'work-empty';
      el.innerHTML = '<div class="work-empty-icon">\\u2699</div><div class="work-empty-text">' + __wvEscapeHtml(__i18n.noTasks) + '</div>';
      container.appendChild(el);
      return;
    }
    for (var i = 0; i < tasks.length; i++) {
      var t = tasks[i];
      var card = document.createElement('div');
      card.className = 'task-card';
      var statusIcon = t.status === 'completed' ? '\\u2713' : t.status === 'running' ? '\\u27F3' : t.status === 'failed' ? '\\u2717' : t.status === 'queued' ? '\\u23F3' : '\\u00B7';
      var statusColor = t.status === 'completed' ? '#4caf50' : t.status === 'running' ? '#ff9800' : t.status === 'failed' ? '#f44336' : t.status === 'queued' ? '#888' : '#888';
      var title = (t.prompt_summary || t.id).slice(0, 30);
      card.innerHTML =
        '<div class="task-header">' +
          '<span class="task-status-icon" style="color:' + statusColor + '">' + statusIcon + '</span>' +
          '<span class="task-title">' + __wvEscapeHtml(title) + '</span>' +
        '</div>' +
        '<div class="task-meta">' + __wvEscapeHtml(t.status) + ' \\u00B7 ' + __wvEscapeHtml(t.model || '') + '</div>';
      (function(taskId, taskStatus) {
        card.addEventListener('click', function(e) {
          if (e.target.tagName === 'BUTTON') return;
          vscode.postMessage({ type: 'slashCommand', command: '/task', args: 'show ' + taskId });
        });
        if (taskStatus === 'running' || taskStatus === 'queued') {
          var actions = document.createElement('div');
          actions.className = 'task-actions';
          var cancelBtn = document.createElement('button');
          cancelBtn.textContent = __i18n.cancel;
          cancelBtn.onclick = function() {
            vscode.postMessage({ type: 'slashCommand', command: '/task', args: 'cancel ' + taskId });
          };
          actions.appendChild(cancelBtn);
          card.appendChild(actions);
        }
      })(t.id, t.status);
      container.appendChild(card);
    }
  }

  // ── Render Agent Runs ──
  function renderAgents(runs) {
    var container = document.getElementById('tab-agents');
    if (!container) return;
    container.innerHTML = '';
    if (!runs || runs.length === 0) {
      var el = document.createElement('div');
      el.className = 'work-empty';
      el.innerHTML = '<div class="work-empty-icon">\\uD83E\\uDD16</div><div class="work-empty-text">' + __wvEscapeHtml(__i18n.noAgentRuns) + '</div>';
      container.appendChild(el);
      return;
    }
    // Sort: running first, then by updated_at desc
    var sorted = runs.slice().sort(function(a, b) {
      var aActive = (a.status === 'running' || a.status === 'starting' || a.status === 'running_tool' || a.status === 'model_wait' || a.status === 'queued' || a.status === 'waiting_for_user') ? 0 : 1;
      var bActive = (b.status === 'running' || b.status === 'starting' || b.status === 'running_tool' || b.status === 'model_wait' || b.status === 'queued' || b.status === 'waiting_for_user') ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return (b.updated_at_ms || 0) - (a.updated_at_ms || 0);
    });
    for (var i = 0; i < sorted.length; i++) {
      var r = sorted[i];
      var spec = r.spec || {};
      var card = document.createElement('div');
      card.className = 'agent-card' + (r.status === 'running' || r.status === 'starting' || r.status === 'running_tool' || r.status === 'model_wait' ? ' agent-active' : '');
      var icon = agentStatusIcon(r.status);
      var color = agentStatusColor(r.status);
      var statusLabel = agentStatusLabel(r.status);
      var objective = (spec.objective || r.spec.run_id || '').slice(0, 60);
      var role = spec.role || '';
      var model = spec.model || '';
      var steps = r.steps_taken || 0;
      var html =
        '<div class="agent-header">' +
          '<span class="agent-status-icon" style="color:' + color + '">' + icon + '</span>' +
          '<span class="agent-objective">' + __wvEscapeHtml(objective) + '</span>' +
        '</div>' +
        '<div class="agent-meta">' +
          '<span class="agent-status-badge" style="color:' + color + '">' + __wvEscapeHtml(statusLabel) + '</span>';
      if (role) {
        html += ' <span class="agent-role-badge">' + __wvEscapeHtml(role) + '</span>';
      }
      html += ' <span class="agent-model-badge">' + __wvEscapeHtml(model) + '</span>';
      html += '</div>';
      // Steps & tokens
      var tokenUsage = formatAgentTokenUsage(r.usage);
      html += '<div class="agent-detail">';
      html += __i18n.agentSteps + ': ' + steps;
      if (tokenUsage) {
        html += ' \\u00B7 ' + __i18n.agentUsage + ': ' + __wvEscapeHtml(tokenUsage);
      }
      html += '</div>';
      // Result or error
      if (r.status === 'completed' && r.result_summary) {
        html += '<div class="agent-result">' + __wvEscapeHtml(r.result_summary.slice(0, 120)) + '</div>';
      }
      if ((r.status === 'failed' || r.status === 'interrupted') && r.error) {
        html += '<div class="agent-error-text">' + __wvEscapeHtml(r.error.slice(0, 120)) + '</div>';
      }
      // Artifacts
      if (r.artifacts && r.artifacts.length > 0) {
        html += '<div class="agent-artifacts">';
        for (var ai = 0; ai < r.artifacts.length && ai < 3; ai++) {
          var art = r.artifacts[ai];
          var artPath = (art.path || '').split('/').pop() || art.path || '';
          html += '<span class="agent-artifact-chip">' + __wvEscapeHtml(artPath) + '</span>';
        }
        if (r.artifacts.length > 3) {
          html += '<span class="agent-artifact-more">+' + (r.artifacts.length - 3) + '</span>';
        }
        html += '</div>';
      }
      card.innerHTML = html;
      (function(runData) {
        card.addEventListener('click', function(e) {
          if (e.target.tagName === 'BUTTON') return;
          showAgentDetail(runData);
        });
      })(r);
      container.appendChild(card);
    }
  }

  // ── Render Work ──
  function renderWork() {
    var container = document.getElementById('tab-work');
    if (!container) return;
    container.innerHTML = '';
    var hasContent = workState.goal || workState.checklist.length > 0 || workState.strategy.length > 0 || workState.cycleCount > 0 || (workState.coherenceState && workState.coherenceState !== 'healthy');
    if (!hasContent) {
      var el = document.createElement('div');
      el.className = 'work-empty';
      el.innerHTML = '<div class="work-empty-icon">&#9668;&#65039;</div><div class="work-empty-text">' + __wvEscapeHtml(__i18n.noActiveWork) + '</div>';
      container.appendChild(el);
      return;
    }
    // ── Coherence Banner ──
    if (workState.coherenceState && workState.coherenceState !== 'healthy') {
      var section = document.createElement('div');
      section.className = 'work-section';
      var stateKey = 'coherence' + workState.coherenceState.charAt(0).toUpperCase() + workState.coherenceState.slice(1).replace(/_([a-z])/g, function(_, c) { return c.toUpperCase(); });
      var stateLabel = __i18n[stateKey] || workState.coherenceLabel || workState.coherenceState;
      var isWarning = workState.coherenceState === 'refreshing_context' || workState.coherenceState === 'getting_crowded';
      var severity = isWarning ? 'warning' : 'info';
      var icon = isWarning ? '\\u26A0' : '\\u2139';
      section.innerHTML = '<div class="work-coherence ' + severity + '"><span class="work-coherence-icon">' + icon + '</span>' + __wvEscapeHtml(stateLabel) + '</div>';
      container.appendChild(section);
    }
    // ── Goal ──
    if (workState.goal) {
      var section = document.createElement('div');
      section.className = 'work-section';
      section.innerHTML =
        '<div class="work-section-title"><span class="work-section-title-icon">\\uD83C\\uDFAF</span>' + __wvEscapeHtml(__i18n.goal) + '</div>' +
        '<div class="work-goal-card">' +
          '<div class="work-goal-label">' + __wvEscapeHtml(__i18n.goal) + '</div>' +
          '<div class="work-goal-text">' + __wvEscapeHtml(workState.goal) + '</div>' +
        '</div>';
      container.appendChild(section);
    }
    // ── Checklist ──
    if (workState.checklist.length > 0) {
      var section = document.createElement('div');
      section.className = 'work-section';
      var html = '<div class="work-section-title"><span class="work-section-title-icon">\\u2611</span>' + __wvEscapeHtml(__i18n.checklist);
      if (workState.checklistCompletionPct > 0) {
        var pct = Number(workState.checklistCompletionPct);
        var pctStr = __i18n.completionPct.replace('{n}', String(pct));
        html += ' <span class="work-section-subtitle">' + __wvEscapeHtml(pctStr) + '</span>';
      }
      html += '</div>';
      // Progress bar
      if (workState.checklistCompletionPct > 0) {
        var pct = Number(workState.checklistCompletionPct);
        var fillClass = pct >= 100 ? 'completed' : pct >= 40 ? 'in-progress' : 'partial';
        html += '<div class="work-progress-bar-bg"><div class="work-progress-bar-fill ' + fillClass + '" style="width:' + pct + '%"></div></div>';
      }
      for (var ci = 0; ci < workState.checklist.length; ci++) {
        var item = workState.checklist[ci];
        var icon = item.status === 'completed' ? '\\u2713' : item.status === 'in_progress' ? '\\u27F3' : '\\u25CB';
        var itemClass = 'work-checklist-item' + (item.status === 'completed' ? ' completed' : '') + (item.status === 'in_progress' ? ' in-progress' : '');
        html += '<div class="' + itemClass + '"><span class="work-checklist-icon">' + icon + '</span><span class="work-checklist-text">' + __wvEscapeHtml(item.content) + '</span></div>';
      }
      section.innerHTML = html;
      container.appendChild(section);
    }
    // ── Strategy Steps ──
    if (workState.strategy.length > 0) {
      var section = document.createElement('div');
      section.className = 'work-section';
      var html = '<div class="work-section-title"><span class="work-section-title-icon">\\uD83D\\uDCD0</span>' + __wvEscapeHtml(__i18n.strategy) + '</div>';
      for (var si = 0; si < workState.strategy.length; si++) {
        var step = workState.strategy[si];
        var icon = step.status === 'completed' ? '\\u2713' : step.status === 'in_progress' ? '\\u27F3' : '\\u25CB';
        var stepClass = 'work-strategy-step' + (step.status === 'completed' ? ' completed' : '') + (step.status === 'in_progress' ? ' in-progress' : '');
        html += '<div class="' + stepClass + '"><span class="work-strategy-icon">' + icon + '</span><span class="work-strategy-text">' + __wvEscapeHtml(step.text) + '</span></div>';
      }
      section.innerHTML = html;
      container.appendChild(section);
    }
    // ── Cycle Count ──
    if (workState.cycleCount > 0) {
      var section = document.createElement('div');
      section.className = 'work-section';
      section.innerHTML = '<div class="work-cycle-count"><span class="work-cycle-icon">\\uD83D\\uDD04</span>' + __wvEscapeHtml(__i18n.cycles) + ': ' + workState.cycleCount + '</div>';
      container.appendChild(section);
    }
  }

  // ── Render Changes ──
  function renderChanges() {
    var container = document.getElementById('tab-changes');
    if (!container) return;
    container.innerHTML = '';
    // NOTE: Do NOT clear _diffStore or reset _diffIdCounter here.
    // Message cards in the stream share this store; clearing it invalidates
    // their diff keys (especially during real-time inference where
    // fileChangeDetected is sent before refreshWorkPanel).
    // The store is cleared on loadHistory/clearChat instead.
    if (!changesState || changesState.length === 0) {
      var el = document.createElement('div');
      el.className = 'work-empty';
      el.innerHTML = '<div class="work-empty-icon">\\uD83D\\uDCC4</div><div class="work-empty-text">' + __wvEscapeHtml(__i18n.noFileChanges) + '</div>';
      container.appendChild(el);
      return;
    }
    // Summary header
    var header = document.createElement('div');
    header.className = 'work-section';
    var createdCount = 0, modifiedCount = 0, deletedCount = 0;
    var totalAdded = 0, totalRemoved = 0;
    for (var si = 0; si < changesState.length; si++) {
      if (changesState[si].changeType === 'created') createdCount++;
      else if (changesState[si].changeType === 'deleted') deletedCount++;
      else modifiedCount++;
      totalAdded += changesState[si].addedLines || 0;
      totalRemoved += changesState[si].removedLines || 0;
    }
    var summaryParts = [];
    if (createdCount > 0) summaryParts.push('<span class="change-summary-item change-summary-created">' + createdCount + ' ' + __wvEscapeHtml(__i18n.fileCreated) + '</span>');
    if (modifiedCount > 0) summaryParts.push('<span class="change-summary-item change-summary-modified">' + modifiedCount + ' ' + __wvEscapeHtml(__i18n.fileModified) + '</span>');
    if (deletedCount > 0) summaryParts.push('<span class="change-summary-item change-summary-deleted">' + deletedCount + ' ' + __wvEscapeHtml(__i18n.fileDeleted) + '</span>');
    if (totalAdded > 0 || totalRemoved > 0) {
      summaryParts.push('<span class="change-summary-item change-summary-lines"><span class="change-added">+' + totalAdded + '</span> <span class="change-removed">-' + totalRemoved + '</span></span>');
    }
    header.innerHTML = '<div class="work-section-title"><span class="work-section-title-icon">\\uD83D\\uDCC1</span>' + __wvEscapeHtml(__i18n.fileChanges) + ' <span class="work-section-subtitle">(' + changesState.length + ')</span></div><div class="change-summary-row">' + summaryParts.join(' ') + '</div>';
    container.appendChild(header);

    // File list
    var list = document.createElement('div');
    list.className = 'work-section change-list';
    var html = '';
    for (var fi = 0; fi < changesState.length; fi++) {
      var fc = changesState[fi];
      var changeIcon = fc.changeType === 'created' ? 'A' : fc.changeType === 'deleted' ? 'D' : 'M';
      var changeTypeLabel = fc.changeType === 'created' ? __i18n.fileCreated : fc.changeType === 'deleted' ? __i18n.fileDeleted : __i18n.fileModified;
      var shortP = fc.filePath.replace(/\\\\/g, '/').split('/').slice(-3).join('/');
      var displayPath = fc.filePath.replace(/\\\\/g, '/').split('/').length > 3 ? '\\u2026/' + shortP : fc.filePath;
      var diffKey = fc.filePath + '@' + (++_diffIdCounter.value);
      if (fc.diff) _diffStore.set(diffKey, fc.diff);
      html += '<div class="change-item change-type-' + fc.changeType + '">';
      html += '<span class="change-badge change-badge-' + fc.changeType + '" title="' + __wvEscapeHtml(changeTypeLabel) + '">' + changeIcon + '</span>';
      html += '<span class="change-path" title="' + __wvEscapeHtml(fc.filePath) + '">' + __wvEscapeHtml(displayPath) + '</span>';
      if (fc.addedLines > 0 || fc.removedLines > 0) {
        html += '<span class="change-stats">';
        if (fc.addedLines > 0) html += '<span class="change-added">+' + fc.addedLines + '</span>';
        if (fc.removedLines > 0) html += '<span class="change-removed">-' + fc.removedLines + '</span>';
        html += '</span>';
      }
      html += '<span class="change-actions">';
      if (fc.diff) {
        html += '<button class="change-btn change-view-diff" data-file-path="' + __wvEscapeHtml(fc.filePath) + '" data-diff-key="' + diffKey + '" title="' + __wvEscapeHtml(__i18n.viewDiffTooltip) + '">Diff</button>';
      }
      if (fc.changeType !== 'deleted') {
        html += '<button class="change-btn change-open-file" data-file-path="' + __wvEscapeHtml(fc.filePath) + '" title="' + __wvEscapeHtml(__i18n.openFileTooltip) + '">Open</button>';
      }
      html += '</span>';
      html += '</div>';
    }
    list.innerHTML = html;
    container.appendChild(list);

    // Click delegation for diff/open buttons
    list.addEventListener('click', function(e) {
      var target = e.target;
      if (target.classList.contains('change-view-diff')) {
        var filePath = target.getAttribute('data-file-path');
        var diffKey = target.getAttribute('data-diff-key');
        vscode.postMessage({ type: 'openDiff', filePath: filePath, diff: (diffKey ? _diffStore.get(diffKey) : undefined) || undefined, useCumulative: true });
      } else if (target.classList.contains('change-open-file')) {
        var filePath = target.getAttribute('data-file-path');
        vscode.postMessage({ type: 'openFile', filePath: filePath });
      }
    });
  }

  // ── Task Detail ──
  function closeTaskDetail() {
    var overlay = document.getElementById('task-detail-overlay');
    if (overlay) {
      overlay.style.display = 'none';
      overlay.innerHTML = '';
      overlay.onclick = null;
    }
  }

  function showTaskDetail(task) {
    var overlay = document.getElementById('task-detail-overlay');
    if (!overlay) return;
    var statusIcon = task.status === 'completed' ? '\\u2713' : task.status === 'running' ? '\\u27F3' : task.status === 'failed' ? '\\u2717' : task.status === 'queued' ? '\\u23F3' : '\\u00B7';
    var statusColor = task.status === 'completed' ? '#4caf50' : task.status === 'running' ? '#ff9800' : task.status === 'failed' ? '#f44336' : '#888';
    var duration = task.duration_ms ? (task.duration_ms / 1000).toFixed(1) + 's' : '-';
    var html = '<div class="task-detail-panel">';
    html += '<button class="close-btn" type="button">\\u2715</button>';
    html += '<h3>' + statusIcon + ' Task ' + __wvEscapeHtml(task.id.slice(0, 8)) + '</h3>';
    html += '<div class="detail-section"><div class="detail-label">Status</div><div class="detail-value" style="color:' + statusColor + '">' + __wvEscapeHtml(task.status) + '</div></div>';
    html += '<div class="detail-section"><div class="detail-label">Model / Mode</div><div class="detail-value">' + __wvEscapeHtml(task.model) + ' \\u00B7 ' + __wvEscapeHtml(task.mode) + '</div></div>';
    html += '<div class="detail-section"><div class="detail-label">Duration</div><div class="detail-value">' + duration + '</div></div>';
    html += '<div class="detail-section"><div class="detail-label">Prompt</div><div class="detail-value">' + __wvEscapeHtml(task.prompt) + '</div></div>';
    if (task.result_summary) {
      html += '<div class="detail-section"><div class="detail-label">Result</div><div class="detail-value result">' + __wvEscapeHtml(task.result_summary) + '</div></div>';
    }
    if (task.result_detail_path) {
      html += '<div class="detail-section"><div class="detail-label">Result Artifact</div><div class="detail-value">' + __wvEscapeHtml(task.result_detail_path) + '</div></div>';
    }
    if (task.error) {
      html += '<div class="detail-section"><div class="detail-label">Error</div><div class="detail-value error">' + __wvEscapeHtml(task.error) + '</div></div>';
    }
    if (task.tool_calls && task.tool_calls.length > 0) {
      html += '<div class="detail-section"><div class="detail-label">Tool Calls (' + task.tool_calls.length + ')</div>';
      for (var tci = 0; tci < task.tool_calls.length; tci++) {
        var tc = task.tool_calls[tci];
        var tcStatus = tc.status === 'success' ? '\\u2713' : tc.status === 'running' ? '\\u27F3' : tc.status === 'failed' ? '\\u2717' : '\\u00B7';
        var tcDur = tc.duration_ms ? ' (' + (tc.duration_ms / 1000).toFixed(1) + 's)' : '';
        html += '<div class="tool-call-item">' + tcStatus + ' ' + __wvEscapeHtml(tc.name) + tcDur;
        if (tc.output_summary) html += ' \\u2014 ' + __wvEscapeHtml(tc.output_summary);
        html += '</div>';
      }
      html += '</div>';
    }
    if (task.timeline && task.timeline.length > 0) {
      html += '<div class="detail-section"><div class="detail-label">Timeline</div>';
      for (var ti = 0; ti < task.timeline.length; ti++) {
        var entry = task.timeline[ti];
        var time = entry.timestamp ? entry.timestamp.slice(11, 19) : '';
        html += '<div class="timeline-item">[' + time + '] ' + __wvEscapeHtml(entry.kind) + ': ' + __wvEscapeHtml(entry.summary) + '</div>';
      }
      html += '</div>';
    }
    html += '</div>';
    overlay.innerHTML = html;
    overlay.style.display = 'flex';
    var closeBtn = overlay.querySelector('.close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        closeTaskDetail();
      });
    }
    overlay.onclick = function(e) { if (e.target === overlay) closeTaskDetail(); };
  }

  // ── Agent Detail ──
  function closeAgentDetail() {
    var overlay = document.getElementById('agent-detail-overlay');
    if (overlay) {
      overlay.style.display = 'none';
      overlay.innerHTML = '';
      overlay.onclick = null;
    }
  }

  function showAgentDetail(run) {
    var overlay = document.getElementById('agent-detail-overlay');
    if (!overlay) return;
    var spec = run.spec || {};
    var statusIcon = agentStatusIcon(run.status);
    var statusColor = agentStatusColor(run.status);
    var statusLabel = agentStatusLabel(run.status);
    var objective = spec.objective || '';
    var role = spec.role || '';
    var model = spec.model || '';
    var steps = run.steps_taken || 0;
    var tokenUsage = formatAgentTokenUsage(run.usage);
    var runId = spec.run_id || spec.worker_id || '';
    var parentId = run.parent_run_id || '';
    var createdAt = run.created_at_ms ? new Date(run.created_at_ms).toLocaleString() : '-';
    var updatedAt = run.updated_at_ms ? new Date(run.updated_at_ms).toLocaleString() : '-';

    var html = '<div class="task-detail-panel">';
    html += '<button class="close-btn" type="button">\\u2715</button>';
    html += '<h3>' + statusIcon + ' ' + __wvEscapeHtml(__i18n.agents) + '</h3>';

    // Status
    html += '<div class="detail-section"><div class="detail-label">' + __wvEscapeHtml(__i18n.agentStatusRunning) + '</div>';
    html += '<div class="detail-value" style="color:' + statusColor + '">' + __wvEscapeHtml(statusLabel) + '</div></div>';

    // Run ID
    if (runId) {
      html += '<div class="detail-section"><div class="detail-label">Run ID</div>';
      html += '<div class="detail-value" style="font-family:monospace;font-size:0.85em">' + __wvEscapeHtml(runId) + '</div></div>';
    }

    // Objective
    if (objective) {
      html += '<div class="detail-section"><div class="detail-label">' + __wvEscapeHtml(__i18n.agentObjective) + '</div>';
      html += '<div class="detail-value">' + __wvEscapeHtml(objective) + '</div></div>';
    }

    // Role & Model
    if (role || model) {
      html += '<div class="detail-section"><div class="detail-label">' + __wvEscapeHtml(__i18n.agentRole) + ' / ' + __wvEscapeHtml(__i18n.agentModel) + '</div>';
      html += '<div class="detail-value">';
      if (role) html += __wvEscapeHtml(role);
      if (role && model) html += ' \\u00B7 ';
      if (model) html += __wvEscapeHtml(model);
      html += '</div></div>';
    }

    // Steps & tokens
    html += '<div class="detail-section"><div class="detail-label">' + __wvEscapeHtml(__i18n.agentSteps) + ' / ' + __wvEscapeHtml(__i18n.agentUsage) + '</div>';
    html += '<div class="detail-value">' + steps;
    if (tokenUsage) html += ' \\u00B7 ' + __wvEscapeHtml(tokenUsage);
    html += '</div></div>';

    // Parent run
    if (parentId) {
      html += '<div class="detail-section"><div class="detail-label">Parent Run</div>';
      html += '<div class="detail-value" style="font-family:monospace;font-size:0.85em">' + __wvEscapeHtml(parentId) + '</div></div>';
    }

    // Timestamps
    html += '<div class="detail-section"><div class="detail-label">Created</div>';
    html += '<div class="detail-value">' + __wvEscapeHtml(createdAt) + '</div></div>';
    html += '<div class="detail-section"><div class="detail-label">Updated</div>';
    html += '<div class="detail-value">' + __wvEscapeHtml(updatedAt) + '</div></div>';

    // Result
    if (run.result_summary) {
      html += '<div class="detail-section"><div class="detail-label">' + __wvEscapeHtml(__i18n.agentResult) + '</div>';
      html += '<div class="detail-value result">' + __wvEscapeHtml(run.result_summary) + '</div></div>';
    }

    // Error
    if (run.error) {
      html += '<div class="detail-section"><div class="detail-label">' + __wvEscapeHtml(__i18n.agentError) + '</div>';
      html += '<div class="detail-value error">' + __wvEscapeHtml(run.error) + '</div></div>';
    }

    // Artifacts
    if (run.artifacts && run.artifacts.length > 0) {
      html += '<div class="detail-section"><div class="detail-label">' + __wvEscapeHtml(__i18n.agentArtifacts) + ' (' + run.artifacts.length + ')</div>';
      for (var ai = 0; ai < run.artifacts.length; ai++) {
        var art = run.artifacts[ai];
        var artPath = art.path || '';
        var artKind = art.kind || '';
        html += '<div class="tool-call-item">\\u00B7 ' + __wvEscapeHtml(artPath);
        if (artKind) html += ' <span style="color:var(--muted)">(' + __wvEscapeHtml(artKind) + ')</span>';
        html += '</div>';
      }
      html += '</div>';
    }

    html += '</div>';
    overlay.innerHTML = html;
    overlay.style.display = 'flex';
    var closeBtn = overlay.querySelector('.close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        closeAgentDetail();
      });
    }
    overlay.onclick = function(e) { if (e.target === overlay) closeAgentDetail(); };
  }

  // ── Sidebar toggle ──
  function toggleThreadsPanel() {
    var threadsPanel = document.getElementById('threads-panel');
    var opening = !threadsPanel.classList.contains('open');
    threadsPanel.classList.toggle('open');
    if (opening) {
      void threadsPanel.offsetHeight;
      vscode.postMessage({ type: 'refreshSidebar' });
    }
  }

  // ── Sidebar section collapse toggle ──
  document.querySelectorAll('.sidebar-section-header').forEach(function(header) {
    header.addEventListener('click', function() {
      var section = header.parentElement;
      section.classList.toggle('collapsed');
    });
  });

  // ── Tab switching ──
  document.getElementById('tab-sessions-btn').addEventListener('click', function() {
    switchSidebarTab('sessions');
  });
  document.getElementById('tab-threads-btn').addEventListener('click', function() {
    switchSidebarTab('threads');
  });

  // ── Workspace filter toggle ──
  document.getElementById('workspace-filter-toggle').addEventListener('click', function(e) {
    e.stopPropagation();
    vscode.postMessage({ type: 'toggleAllWorkspaces' });
  });

  // ── Threads panel toggle buttons ──
  document.getElementById('btn-threads').addEventListener('click', toggleThreadsPanel);
  if (threadCountEl) threadCountEl.addEventListener('click', toggleThreadsPanel);

  // ── Expose for event handler module ──
  window.__wvSidebar = {
    renderSessions: renderSessions,
    renderThreads: renderThreads,
    renderTasks: renderTasks,
    renderAgents: renderAgents,
    renderWork: renderWork,
    renderChanges: renderChanges,
    switchSidebarTab: switchSidebarTab,
    applyShowThreadList: applyShowThreadList,
    closeTaskDetail: closeTaskDetail,
    showTaskDetail: showTaskDetail,
    closeAgentDetail: closeAgentDetail,
    showAgentDetail: showAgentDetail,
    getSessions: function() { return sessions; },
    setSessions: function(v) { sessions = v; },
    getActiveSessionId: function() { return activeSessionId; },
    setActiveSessionId: function(v) { activeSessionId = v; },
    getThreads: function() { return threads; },
    setThreads: function(v) { threads = v; },
    getActiveThreadId: function() { return activeThreadId; },
    setActiveThreadId: function(v) { activeThreadId = v; },
    getShowAllWorkspaces: function() { return showAllWorkspaces; },
    setShowAllWorkspaces: function(v) { showAllWorkspaces = v; },
    getWorkState: function() { return workState; },
    setWorkState: function(v) { workState = v; },
    getChangesState: function() { return changesState; },
    setChangesState: function(v) { changesState = v; },
    getAgentRuns: function() { return agentRuns; },
    setAgentRuns: function(v) { agentRuns = v; },
    getSessionSearchQuery: function() { return sessionSearchQuery; },
    setSessionSearchQuery: function(v) { sessionSearchQuery = v; },
  };

  closeTaskDetail();
  closeAgentDetail();
  })();`;
}
