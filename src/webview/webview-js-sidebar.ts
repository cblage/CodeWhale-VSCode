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
  var workPopoverOpen = false;

  // ── Changes state ──
  var changesState = [];
  var changesPopoverOpen = false;

  // ── Agent runs state ──
  var agentRuns = [];
  var expandedAgentRunIds = {};
  var agentRunOrder = {};
  var nextAgentRunOrder = 0;
  var agentPopoverOpen = false;
  var agentRefreshTimer = null;
  var pendingAgentStopIds = {};
  var stopAllAgentsPending = false;

  function isAgentActiveStatus(status) {
    status = String(status || '').toLowerCase();
    return ['queued', 'starting', 'running', 'in_progress', 'waiting_for_user', 'model_wait', 'running_tool', 'working', 'pending'].indexOf(status) >= 0;
  }

  function isAgentActive(run) {
    return !!run && run.runtime_available !== false && run.completed_at_ms == null && isAgentActiveStatus(run.status);
  }

  function agentRunId(run) {
    var spec = run && run.spec ? run.spec : {};
    return spec.run_id || spec.worker_id || '';
  }

  function agentNickname(run) {
    var spec = run && run.spec ? run.spec : {};
    var id = agentRunId(run);
    return run.nickname || spec.session_name || spec.role || spec.agent_type || (id ? 'Agent ' + id.slice(-8) : 'Agent');
  }

  function agentLatestOutput(run) {
    if (!run) return '';
    if (run.latest_output) return String(run.latest_output);
    if (isAgentActive(run) && run.latest_message) return String(run.latest_message);
    return String(run.result_summary || run.persisted_result || run.latest_message || run.error || '');
  }

  function sortAgentRuns(runs) {
    var unseen = (runs || []).filter(function(run) {
      var id = agentRunId(run);
      return id && agentRunOrder[id] === undefined;
    }).sort(function(a, b) {
      var createdDiff = (a.created_at_ms || Number.MAX_SAFE_INTEGER) - (b.created_at_ms || Number.MAX_SAFE_INTEGER);
      if (createdDiff !== 0) return createdDiff;
      return agentRunId(a).localeCompare(agentRunId(b));
    });
    for (var unseenIdx = 0; unseenIdx < unseen.length; unseenIdx++) {
      agentRunOrder[agentRunId(unseen[unseenIdx])] = nextAgentRunOrder++;
    }
    return (runs || []).slice().sort(function(a, b) {
      var aOrder = agentRunOrder[agentRunId(a)];
      var bOrder = agentRunOrder[agentRunId(b)];
      if (aOrder !== bOrder) return aOrder - bOrder;
      return agentRunId(a).localeCompare(agentRunId(b));
    });
  }

  // ── Agent status label helper ──
  function agentStatusLabel(status) {
    var map = {
      queued: __i18n.agentStatusQueued,
      pending: __i18n.agentStatusQueued,
      starting: __i18n.agentStatusStarting,
      running: __i18n.agentStatusRunning,
      in_progress: __i18n.agentStatusRunning,
      working: __i18n.agentStatusRunning,
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

  function agentStatusLabelForRun(run) {
    if (run && run.completed_at_ms != null && String(run.status || '').toLowerCase() === 'waiting_for_user') {
      return __i18n.agentStatusNeedsAction || 'Needs parent action';
    }
    return agentStatusLabel(run && run.status);
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
    var hasInput = typeof usage.input_tokens === 'number';
    var hasOutput = typeof usage.output_tokens === 'number';
    if (!hasInput && !hasOutput) return '';
    var inp = hasInput ? usage.input_tokens : 0;
    var out = hasOutput ? usage.output_tokens : 0;
    if (inp === 0 && out === 0 && usage.status !== 'reported') return '';
    var inpK = inp >= 1000 ? (inp / 1000).toFixed(1) + 'k' : String(inp);
    var outK = out >= 1000 ? (out / 1000).toFixed(1) + 'k' : String(out);
    return inpK + ' / ' + outK;
  }

  function formatDetailTime(value) {
    if (!value) return '-';
    var date = typeof value === 'number' ? new Date(value) : new Date(String(value));
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleString();
  }

  function hasOwnData(value) {
    if (!value) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return true;
  }

  function renderJsonBlock(value) {
    return '<pre class="detail-json">' + __wvEscapeHtml(JSON.stringify(value, null, 2)) + '</pre>';
  }

  function taskToolStatusIcon(status) {
    if (status === 'completed' || status === 'success') return '\\u2713';
    if (status === 'running' || status === 'queued') return '\\u27F3';
    if (status === 'failed' || status === 'error' || status === 'interrupted') return '\\u2717';
    return '\\u00B7';
  }

  function timelineKindLabel(kind) {
    if (!kind) return 'event';
    return String(kind).replace(/_/g, ' ');
  }

  function renderOpenFileButton(filePath, label) {
    if (!filePath) return '';
    return '<button class="detail-action-btn detail-open-file" data-file-path="' + __wvEscapeHtml(filePath) + '">' + __wvEscapeHtml(label || 'Open') + '</button>';
  }

  function renderOpenExternalButton(url, label) {
    if (!url) return '';
    return '<button class="detail-action-btn detail-open-external" data-url="' + __wvEscapeHtml(url) + '">' + __wvEscapeHtml(label || 'Open Link') + '</button>';
  }

  function renderDetailCodeBlock(text, className) {
    return '<pre class="' + __wvEscapeHtml(className || 'detail-text-block') + '">' + __wvEscapeHtml(text || '') + '</pre>';
  }

  function attachDetailOverlayActions(overlay, closeFn) {
    overlay.onclick = function(e) {
      if (e.target === overlay) {
        closeFn();
        return;
      }
      var target = e.target;
      var closeBtn = target.closest && target.closest('.close-btn');
      if (closeBtn) {
        e.stopPropagation();
        closeFn();
        return;
      }
      var openFileBtn = target.closest && target.closest('.detail-open-file');
      if (openFileBtn) {
        e.stopPropagation();
        var filePath = openFileBtn.getAttribute('data-file-path');
        if (filePath) vscode.postMessage({ type: 'openFile', filePath: filePath });
        return;
      }
      var openExternalBtn = target.closest && target.closest('.detail-open-external');
      if (openExternalBtn) {
        e.stopPropagation();
        var url = openExternalBtn.getAttribute('data-url');
        if (url) vscode.postMessage({ type: 'openExternal', url: url });
      }
    };
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
      filterToggle.innerHTML = '<span class="codicon ' + (showAllWorkspaces ? 'codicon-save-all' : 'codicon-save') + '" aria-hidden="true"></span>';
      var scopeLabel = showAllWorkspaces ? __i18n.showAllWorkspaces : __i18n.filterCurrentWorkspace;
      filterToggle.setAttribute('title', scopeLabel);
      filterToggle.setAttribute('aria-label', scopeLabel);
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
      el.className = 'work-empty session-empty-msg';
      var msg = sessionSearchQuery ? __i18n.noSearchResults : __i18n.noConversations;
      el.innerHTML = '<div class="work-empty-icon">\\uD83D\\uDDE8</div><div class="work-empty-text">' + __wvEscapeHtml(msg) + '</div>';
      container.appendChild(el);
      return;
    }

    for (var i = 0; i < sessions.length; i++) {
      var s = sessions[i];
      var el = document.createElement('div');
      el.className = 'thread-item session-item' + (s.id === activeSessionId ? ' active' : '');

      var titleEl = document.createElement('div');
      titleEl.className = 'thread-title';
      titleEl.textContent = s.title || s.id.slice(0, 8);
      el.appendChild(titleEl);

      var metaEl = document.createElement('div');
      metaEl.className = 'thread-meta';

      var modeEl = document.createElement('span');
      modeEl.className = 'session-mode-badge';
      modeEl.textContent = s.mode || 'agent';
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

      // Cost (if available)
      if (s.cost && typeof s.cost.session_cost_usd === 'number' && s.cost.session_cost_usd > 0) {
        var costEl = document.createElement('span');
        costEl.className = 'session-cost';
        costEl.textContent = '$' + s.cost.session_cost_usd.toFixed(2);
        metaEl.appendChild(costEl);
      }

      // Total tokens (if available)
      if (typeof s.total_tokens === 'number' && s.total_tokens > 0) {
        var tokEl = document.createElement('span');
        tokEl.className = 'session-tokens';
        if (s.total_tokens >= 1000) {
          tokEl.textContent = (s.total_tokens / 1000).toFixed(1) + 'k';
        } else {
          tokEl.textContent = String(s.total_tokens);
        }
        metaEl.appendChild(tokEl);
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
      deleteBtn.innerHTML = '<span class="codicon codicon-trash" aria-hidden="true"></span>';
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
      (function(taskId, taskStatus, hasResult) {
        card.addEventListener('click', function(e) {
          if (e.target.tagName === 'BUTTON') return;
          vscode.postMessage({ type: 'showTaskDetail', taskId: taskId });
        });
        var actions = document.createElement('div');
        actions.className = 'task-actions';
        var detailsBtn = document.createElement('button');
        detailsBtn.textContent = 'Details';
        detailsBtn.onclick = function() {
          vscode.postMessage({ type: 'showTaskDetail', taskId: taskId });
        };
        actions.appendChild(detailsBtn);
        if (hasResult) {
          var resultBtn = document.createElement('button');
          resultBtn.textContent = __i18n.agentResult || 'Result';
          resultBtn.onclick = function() {
            vscode.postMessage({ type: 'showTaskDetail', taskId: taskId });
          };
          actions.appendChild(resultBtn);
        }
        if (taskStatus === 'running' || taskStatus === 'queued') {
          var cancelBtn = document.createElement('button');
          cancelBtn.textContent = __i18n.cancel;
          cancelBtn.onclick = function() {
            vscode.postMessage({ type: 'slashCommand', command: '/task', args: 'cancel ' + taskId });
          };
          actions.appendChild(cancelBtn);
        }
        card.appendChild(actions);
      })(t.id, t.status, !!(t.result_detail_path || t.result_summary));
      container.appendChild(card);
    }
  }

  // ── Floating Agent Inspector ──
  function stopAgentRefreshTimer() {
    if (agentRefreshTimer) {
      clearInterval(agentRefreshTimer);
      agentRefreshTimer = null;
    }
  }

  function startAgentRefreshTimer() {
    stopAgentRefreshTimer();
    agentRefreshTimer = setInterval(function() {
      if (agentPopoverOpen) vscode.postMessage({ type: 'refreshAgentRuns' });
    }, 1000);
  }

  function setAgentPopoverOpen(open) {
    var button = document.getElementById('btn-agents');
    var popover = document.getElementById('agent-popover');
    agentPopoverOpen = !!open && agentRuns.length > 0;
    if (agentPopoverOpen) {
      setWorkPopoverOpen(false);
      setChangesPopoverOpen(false);
    }
    if (button) button.setAttribute('aria-expanded', agentPopoverOpen ? 'true' : 'false');
    if (popover) {
      popover.classList.toggle('open', agentPopoverOpen);
      popover.setAttribute('aria-hidden', agentPopoverOpen ? 'false' : 'true');
    }
    if (agentPopoverOpen) {
      renderAgentPopover();
      vscode.postMessage({ type: 'refreshAgentRuns' });
      startAgentRefreshTimer();
    } else {
      stopAgentRefreshTimer();
    }
  }

  function toggleAgentPopover() {
    if (agentRuns.length === 0) return;
    setAgentPopoverOpen(!agentPopoverOpen);
  }

  // ── Floating Work Checklist ──
  function checklistItems() {
    return workState && Array.isArray(workState.checklist) ? workState.checklist : [];
  }

  function pendingChecklistCount() {
    return checklistItems().filter(function(item) {
      return String(item && item.status || '').toLowerCase() !== 'completed';
    }).length;
  }

  function setWorkPopoverOpen(open) {
    var items = checklistItems();
    var button = document.getElementById('btn-work-popover');
    var popover = document.getElementById('work-popover');
    workPopoverOpen = !!open && items.length > 0;
    if (workPopoverOpen) {
      setAgentPopoverOpen(false);
      setChangesPopoverOpen(false);
    }
    if (button) button.setAttribute('aria-expanded', workPopoverOpen ? 'true' : 'false');
    if (popover) {
      popover.classList.toggle('open', workPopoverOpen);
      popover.setAttribute('aria-hidden', workPopoverOpen ? 'false' : 'true');
    }
    if (workPopoverOpen) renderWorkPopover();
  }

  function toggleWorkPopover() {
    if (checklistItems().length === 0) return;
    setWorkPopoverOpen(!workPopoverOpen);
  }

  // ── Floating File Changes ──
  function setChangesPopoverOpen(open) {
    var count = Array.isArray(changesState) ? changesState.length : 0;
    var button = document.getElementById('btn-changes');
    var popover = document.getElementById('changes-popover');
    changesPopoverOpen = !!open && count > 0;
    if (changesPopoverOpen) {
      setWorkPopoverOpen(false);
      setAgentPopoverOpen(false);
    }
    if (button) button.setAttribute('aria-expanded', changesPopoverOpen ? 'true' : 'false');
    if (popover) {
      popover.classList.toggle('open', changesPopoverOpen);
      popover.setAttribute('aria-hidden', changesPopoverOpen ? 'false' : 'true');
    }
    if (changesPopoverOpen) renderChanges();
  }

  function toggleChangesPopover() {
    if (!Array.isArray(changesState) || changesState.length === 0) return;
    setChangesPopoverOpen(!changesPopoverOpen);
  }

  function renderWorkPopover() {
    var items = checklistItems();
    var pending = pendingChecklistCount();
    var button = document.getElementById('btn-work-popover');
    var badge = document.getElementById('work-pending-badge');
    var list = document.getElementById('work-popover-list');

    if (button) {
      button.disabled = items.length === 0;
      button.classList.toggle('has-pending', pending > 0);
      button.setAttribute('aria-label', __i18n.checklist + (pending > 0 ? ' (' + pending + ')' : ''));
      button.setAttribute('title', __i18n.checklist + (pending > 0 ? ' (' + pending + ')' : ''));
      if (items.length === 0) button.setAttribute('aria-expanded', 'false');
    }
    if (badge) badge.textContent = pending > 99 ? '99+' : String(pending);
    if (items.length === 0 && workPopoverOpen) setWorkPopoverOpen(false);
    if (!list) return;

    list.innerHTML = '';
    // Preserve the exact ordering supplied by the Work checklist state.
    for (var index = 0; index < items.length; index++) {
      var item = items[index] || {};
      var status = String(item.status || '').toLowerCase();
      var completed = status === 'completed';
      var inProgress = status === 'in_progress';
      var row = document.createElement('div');
      row.className = 'work-popover-item' + (completed ? ' completed' : '') + (inProgress ? ' in-progress' : '');
      row.innerHTML = '<span class="work-popover-item-icon" aria-hidden="true"><span class="codicon ' +
        (completed ? 'codicon-check' : inProgress ? 'codicon-broadcast' : 'codicon-circle') + '"></span></span>' +
        '<span class="work-popover-item-text">' + __wvEscapeHtml(item.content || '') + '</span>';
      list.appendChild(row);
    }
  }

  function hasPendingAgentStops() {
    return Object.keys(pendingAgentStopIds).length > 0;
  }

  function activeAgentRuns() {
    return agentRuns.filter(function(run) {
      return !!agentRunId(run) && isAgentActive(run);
    });
  }

  function canStopAgents() {
    return !!(window.__wvApiCapabilities && window.__wvApiCapabilities.stopAgents);
  }

  function renderStopAllAgentsButton() {
    var button = document.getElementById('btn-stop-agents');
    if (!button) return;
    var pending = stopAllAgentsPending || hasPendingAgentStops();
    button.disabled = !canStopAgents() || activeAgentRuns().length === 0 || pending;
    button.classList.toggle('pending', pending);
    button.setAttribute('aria-busy', pending ? 'true' : 'false');
    button.innerHTML = '<span class="codicon codicon-debug-stop" aria-hidden="true"></span>' +
      __wvEscapeHtml(pending ? __i18n.stoppingAgent : __i18n.stopAllAgents);
  }

  function requestStopAgent(runId) {
    if (!canStopAgents() || !runId || pendingAgentStopIds[runId]) return;
    var run = agentRuns.find(function(candidate) { return agentRunId(candidate) === runId; });
    if (!run || !isAgentActive(run)) return;
    pendingAgentStopIds[runId] = true;
    renderAgentPopover();
    renderStopAllAgentsButton();
    vscode.postMessage({ type: 'stopAgent', runId: runId });
  }

  function requestStopAllAgents() {
    var active = activeAgentRuns();
    if (!canStopAgents() || active.length === 0 || stopAllAgentsPending || hasPendingAgentStops()) return;
    stopAllAgentsPending = true;
    for (var index = 0; index < active.length; index++) {
      pendingAgentStopIds[agentRunId(active[index])] = true;
    }
    renderAgentPopover();
    renderStopAllAgentsButton();
    vscode.postMessage({ type: 'stopAllAgents' });
  }

  function finishAgentStop(runIds) {
    if (Array.isArray(runIds) && runIds.length > 0) {
      for (var index = 0; index < runIds.length; index++) delete pendingAgentStopIds[runIds[index]];
    } else if (typeof runIds === 'string' && runIds) {
      delete pendingAgentStopIds[runIds];
    } else {
      pendingAgentStopIds = {};
    }
    if (!runIds || !hasPendingAgentStops()) stopAllAgentsPending = false;
    renderAgentPopover();
    renderStopAllAgentsButton();
  }

  function applyAgentStopCapabilities() {
    renderAgentPopover();
    renderStopAllAgentsButton();
  }

  function reconcilePendingAgentStops(runs) {
    var byId = {};
    for (var index = 0; index < runs.length; index++) {
      var id = agentRunId(runs[index]);
      if (id) byId[id] = runs[index];
    }
    Object.keys(pendingAgentStopIds).forEach(function(id) {
      if (!byId[id] || !isAgentActive(byId[id])) delete pendingAgentStopIds[id];
    });
    if (!hasPendingAgentStops()) stopAllAgentsPending = false;
  }

  function renderAgentPopover() {
    var button = document.getElementById('btn-agents');
    var badge = document.getElementById('agent-count-badge');
    var countEl = document.getElementById('agent-popover-count');
    var list = document.getElementById('agent-popover-list');
    var count = agentRuns.length;
    var activeCount = activeAgentRuns().length;

    if (button) {
      button.disabled = count === 0;
      if (count === 0) button.setAttribute('aria-expanded', 'false');
      button.classList.toggle('has-agents', activeCount > 0);
      button.setAttribute('aria-label', __i18n.agents + (activeCount > 0 ? ' (' + activeCount + ' active)' : ''));
    }
    if (badge) badge.textContent = activeCount === 0 ? '' : (activeCount > 99 ? '99+' : String(activeCount));
    if (countEl) countEl.textContent = String(count);
    if (!list) return;

    list.innerHTML = '';
    if (count === 0) {
      var empty = document.createElement('div');
      empty.className = 'agent-popover-empty';
      empty.textContent = __i18n.noAgentRuns;
      list.appendChild(empty);
      return;
    }

    var sorted = sortAgentRuns(agentRuns);
    for (var index = 0; index < sorted.length; index++) {
      var run = sorted[index];
      var spec = run.spec || {};
      var runId = agentRunId(run);
      var expanded = !!expandedAgentRunIds[runId];
      var active = isAgentActive(run);
      var stopPending = !!pendingAgentStopIds[runId];
      var latestOutput = agentLatestOutput(run);
      if (latestOutput.length > 1600) latestOutput = latestOutput.slice(0, 1600) + '\\u2026';
      var item = document.createElement('div');
      item.className = 'agent-popover-item';
      item.setAttribute('data-run-id', runId);
      var html = '<button type="button" class="agent-popover-toggle" data-run-id="' + __wvEscapeHtml(runId) + '" aria-expanded="' + (expanded ? 'true' : 'false') + '">';
      html += '<span class="agent-popover-arrow">' + (expanded ? '\\u25BC' : '\\u25B6') + '</span>';
      html += '<span class="agent-popover-name">' + __wvEscapeHtml(agentNickname(run)) + '</span>';
      html += '<span class="agent-popover-activity ' + (active ? 'active' : '') + '">(' + __wvEscapeHtml(active ? __i18n.agentActive : __i18n.agentInactive) + ')</span>';
      html += '</button>';
      if (expanded) {
        html += '<div class="agent-popover-body">';
        html += '<div class="agent-popover-field"><span class="agent-popover-field-label">Status</span><span class="agent-popover-field-value" style="color:' + agentStatusColor(run.status) + '">' + __wvEscapeHtml(agentStatusLabelForRun(run)) + '</span></div>';
        html += '<div class="agent-popover-field"><span class="agent-popover-field-label">' + __wvEscapeHtml(__i18n.agentType) + '</span><span class="agent-popover-field-value">' + __wvEscapeHtml(spec.agent_type || '-') + '</span></div>';
        html += '<div class="agent-popover-field"><span class="agent-popover-field-label">' + __wvEscapeHtml(__i18n.agentProfile) + '</span><span class="agent-popover-field-value">' + __wvEscapeHtml(spec.profile || '-') + '</span></div>';
        html += '<div class="agent-popover-field"><span class="agent-popover-field-label">' + __wvEscapeHtml(__i18n.agentModel) + '</span><span class="agent-popover-field-value">' + __wvEscapeHtml(spec.model || '-') + '</span></div>';
        html += '<div class="agent-popover-field"><span class="agent-popover-field-label">Session</span><span class="agent-popover-field-value">' + __wvEscapeHtml(spec.session_name || '-') + '</span></div>';
        html += '<div class="agent-popover-output"><div class="agent-popover-output-label">' + __wvEscapeHtml(__i18n.agentLatestOutput) + '</div>' + __wvEscapeHtml(latestOutput || '-') + '</div>';
        html += '<div class="agent-popover-actions">';
        if (active && canStopAgents()) {
          html += '<button type="button" class="agent-popover-stop' + (stopPending ? ' pending' : '') + '" data-run-id="' + __wvEscapeHtml(runId) + '"' + (stopPending ? ' disabled aria-busy="true"' : '') + '><span class="codicon codicon-debug-stop" aria-hidden="true"></span>' + __wvEscapeHtml(stopPending ? __i18n.stoppingAgent : __i18n.stopAgent) + '</button>';
        }
        html += '<button type="button" class="agent-popover-details" data-run-id="' + __wvEscapeHtml(runId) + '">' + __wvEscapeHtml(__i18n.agentDetails) + '</button>';
        html += '</div>';
        html += '</div>';
      }
      item.innerHTML = html;
      list.appendChild(item);
    }
  }

  function updateAgentRuns(runs) {
    agentRuns = Array.isArray(runs) ? runs : [];
    reconcilePendingAgentStops(agentRuns);
    if (agentRuns.length === 0) {
      agentRunOrder = {};
      nextAgentRunOrder = 0;
      expandedAgentRunIds = {};
    }
    if (agentRuns.length === 0 && agentPopoverOpen) setAgentPopoverOpen(false);
    renderAgents(agentRuns);
    renderAgentPopover();
    renderStopAllAgentsButton();
  }

  // ── Render Agent Runs ──
  function renderAgents(runs) {
    var container = document.getElementById('tab-agents');
    if (!container) return;
    container.innerHTML = '';
    if (!runs || runs.length === 0) {
      var el = document.createElement('div');
      el.className = 'work-empty';
      el.innerHTML = '<div class="work-empty-icon"><span class="codicon codicon-robot" aria-hidden="true"></span></div><div class="work-empty-text">' + __wvEscapeHtml(__i18n.noAgentRuns) + '</div>';
      container.appendChild(el);
      return;
    }
    // Keep one stable spawn-order slot per agent for this conversation.
    var sorted = sortAgentRuns(runs);
    for (var i = 0; i < sorted.length; i++) {
      var r = sorted[i];
      var spec = r.spec || {};
      var card = document.createElement('div');
      card.className = 'agent-card' + (isAgentActive(r) ? ' agent-active' : '');
      var icon = agentStatusIcon(r.status);
      var color = agentStatusColor(r.status);
      var statusLabel = agentStatusLabelForRun(r);
      var objective = agentNickname(r).slice(0, 60);
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
          var artLabel = art.name || art.path || art.kind || '';
          var artPath = String(artLabel).split('/').pop() || artLabel;
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
          var runId = runData.spec && (runData.spec.run_id || runData.spec.worker_id);
          vscode.postMessage({ type: 'showAgentSessions', runId: runId || '' });
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
    var count = Array.isArray(changesState) ? changesState.length : 0;
    var button = document.getElementById('btn-changes');
    var badge = document.getElementById('changes-count-badge');
    var countEl = document.getElementById('changes-popover-count');
    var container = document.getElementById('changes-popover-list');
    if (button) {
      button.disabled = count === 0;
      button.classList.toggle('has-changes', count > 0);
      button.setAttribute('aria-label', __i18n.changes + (count > 0 ? ' (' + count + ')' : ''));
      button.setAttribute('title', __i18n.changes + (count > 0 ? ' (' + count + ')' : ''));
      if (count === 0) button.setAttribute('aria-expanded', 'false');
    }
    if (badge) badge.textContent = count === 0 ? '' : (count > 99 ? '99+' : String(count));
    if (countEl) countEl.textContent = String(count);
    if (count === 0 && changesPopoverOpen) setChangesPopoverOpen(false);
    if (!container) return;
    container.innerHTML = '';
    // NOTE: Do NOT clear _diffStore or reset _diffIdCounter here.
    // Message cards in the stream share this store; clearing it invalidates
    // their diff keys (especially during real-time inference where
    // fileChangeDetected is sent before refreshWorkPanel).
    // The store is cleared on loadHistory/clearChat instead.
    if (count === 0) {
      var el = document.createElement('div');
      el.className = 'work-empty';
      el.innerHTML = '<div class="work-empty-icon">\\u26F6</div><div class="work-empty-text">' + __wvEscapeHtml(__i18n.noFileChanges) + '</div>';
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
    header.innerHTML = '<div class="change-summary-row">' + summaryParts.join(' ') + '</div>';
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
    var prompt = task.prompt || task.prompt_summary || '';
    var resultText = task.result_summary || '';
    var fullResultText = task.result_detail_content || '';
    var checklistItems = task.checklist && Array.isArray(task.checklist.items) ? task.checklist.items : [];
    var gates = Array.isArray(task.gates) ? task.gates : [];
    var attempts = Array.isArray(task.attempts) ? task.attempts : [];
    var artifacts = Array.isArray(task.artifacts) ? task.artifacts : [];
    var githubEvents = Array.isArray(task.github_events) ? task.github_events : [];
    var html = '<div class="task-detail-panel">';
    html += '<button class="close-btn" type="button">\\u2715</button>';
    html += '<h3>' + statusIcon + ' Task ' + __wvEscapeHtml((task.id || '').slice(0, 8)) + '</h3>';
    html += '<div class="detail-section"><div class="detail-label">Status</div><div class="detail-value" style="color:' + statusColor + '">' + __wvEscapeHtml(task.status) + '</div></div>';
    html += '<div class="detail-section"><div class="detail-label">Model / Mode</div><div class="detail-value">' + __wvEscapeHtml(task.model) + ' \\u00B7 ' + __wvEscapeHtml(task.mode) + '</div></div>';
    if (task.workspace) {
      html += '<div class="detail-section"><div class="detail-label">Workspace</div><div class="detail-value">' + __wvEscapeHtml(task.workspace) + '</div></div>';
    }
    html += '<div class="detail-section"><div class="detail-label">Created / Started / Ended</div><div class="detail-value">' + __wvEscapeHtml(formatDetailTime(task.created_at)) + ' \\u00B7 ' + __wvEscapeHtml(formatDetailTime(task.started_at)) + ' \\u00B7 ' + __wvEscapeHtml(formatDetailTime(task.ended_at)) + '</div></div>';
    html += '<div class="detail-section"><div class="detail-label">Duration</div><div class="detail-value">' + duration + '</div></div>';
    if (task.runtime_event_count) {
      html += '<div class="detail-section"><div class="detail-label">Runtime Events</div><div class="detail-value">' + __wvEscapeHtml(String(task.runtime_event_count)) + '</div></div>';
    }
    if (task.hunt_verdict) {
      html += '<div class="detail-section"><div class="detail-label">Verdict</div><div class="detail-value">' + __wvEscapeHtml(task.hunt_verdict) + '</div></div>';
    }
    if (task.thread_id || task.turn_id) {
      html += '<div class="detail-section"><div class="detail-label">Thread / Turn</div><div class="detail-value">' + __wvEscapeHtml(task.thread_id || '-') + ' \\u00B7 ' + __wvEscapeHtml(task.turn_id || '-') + '</div></div>';
    }
    html += '<div class="detail-section"><div class="detail-label">Prompt</div><div class="detail-value">' + __wvEscapeHtml(prompt) + '</div></div>';
    if (resultText) {
      html += '<div class="detail-section"><div class="detail-label">Result</div><div class="detail-value result">' + __wvEscapeHtml(resultText) + '</div></div>';
    }
    if (task.result_detail_path) {
      html += '<div class="detail-section"><div class="detail-label">Result Artifact</div><div class="detail-value">' + __wvEscapeHtml(task.result_detail_path) + '</div><div class="detail-actions">' + renderOpenFileButton(task.result_detail_path, 'Open Result File') + '</div></div>';
    }
    if (fullResultText) {
      html += '<div class="detail-section"><div class="detail-label">Full Result</div><div class="detail-value"><div class="markdown">' + simpleMarkdown(fullResultText) + '</div></div>';
      if (task.result_detail_truncated) {
        html += '<div class="detail-subtle">Preview truncated in GUI. Use "Open Result File" for the full artifact.</div>';
      }
      html += '</div>';
    }
    if (task.error) {
      html += '<div class="detail-section"><div class="detail-label">Error</div><div class="detail-value error">' + __wvEscapeHtml(task.error) + '</div></div>';
    }
    if (checklistItems.length > 0) {
      html += '<div class="detail-section"><div class="detail-label">Checklist</div>';
      if (typeof task.checklist.completion_pct === 'number') {
        html += '<div class="detail-subtle">Completion: ' + __wvEscapeHtml(String(task.checklist.completion_pct)) + '%</div>';
      }
      for (var ci = 0; ci < checklistItems.length; ci++) {
        var item = checklistItems[ci];
        html += '<div class="detail-list-item"><span class="detail-chip">' + __wvEscapeHtml(item.status || 'pending') + '</span> ' + __wvEscapeHtml(item.content || '') + '</div>';
      }
      html += '</div>';
    }
    if (task.tool_calls && task.tool_calls.length > 0) {
      html += '<div class="detail-section"><div class="detail-label">Tool Calls (' + task.tool_calls.length + ')</div>';
      for (var tci = 0; tci < task.tool_calls.length; tci++) {
        var tc = task.tool_calls[tci];
        var tcStatus = taskToolStatusIcon(tc.status);
        var tcDur = tc.duration_ms ? ' (' + (tc.duration_ms / 1000).toFixed(1) + 's)' : '';
        html += '<div class="tool-call-item">' + tcStatus + ' ' + __wvEscapeHtml(tc.name) + tcDur;
        if (tc.input_summary) html += '<div class="tool-call-subtle">In: ' + __wvEscapeHtml(tc.input_summary) + '</div>';
        if (tc.output_summary) html += '<div class="tool-call-subtle">Out: ' + __wvEscapeHtml(tc.output_summary) + '</div>';
        if (tc.detail_path || tc.patch_ref) {
          html += '<div class="detail-actions">';
          html += renderOpenFileButton(tc.detail_path, 'Open Detail');
          html += renderOpenFileButton(tc.patch_ref, 'Open Patch');
          html += '</div>';
        }
        html += '</div>';
      }
      html += '</div>';
    }
    if (task.timeline && task.timeline.length > 0) {
      html += '<div class="detail-section"><div class="detail-label">Timeline</div>';
      for (var ti = 0; ti < task.timeline.length; ti++) {
        var entry = task.timeline[ti];
        var time = entry.timestamp ? formatDetailTime(entry.timestamp) : '';
        html += '<div class="timeline-item">[' + __wvEscapeHtml(time) + '] ' + __wvEscapeHtml(timelineKindLabel(entry.kind)) + ': ' + __wvEscapeHtml(entry.summary || '');
        if (entry.detail_path) {
          html += '<div class="detail-actions">' + renderOpenFileButton(entry.detail_path, 'Open Detail') + '</div>';
        }
        html += '</div>';
      }
      html += '</div>';
    }
    if (gates.length > 0) {
      html += '<div class="detail-section"><div class="detail-label">Verification Gates (' + gates.length + ')</div>';
      for (var gi = 0; gi < gates.length; gi++) {
        var gate = gates[gi];
        html += '<div class="detail-list-item">';
        html += '<div><span class="detail-chip">' + __wvEscapeHtml(gate.status || 'unknown') + '</span> <strong>' + __wvEscapeHtml(gate.gate || 'gate') + '</strong> \\u00B7 ' + __wvEscapeHtml(gate.summary || '') + '</div>';
        html += '<div class="detail-subtle">' + __wvEscapeHtml(gate.command || '') + '</div>';
        html += '<div class="detail-subtle">cwd: ' + __wvEscapeHtml(gate.cwd || '') + '</div>';
        if (gate.log_path) {
          html += '<div class="detail-actions">' + renderOpenFileButton(gate.log_path, 'Open Log') + '</div>';
        }
        html += '</div>';
      }
      html += '</div>';
    }
    if (attempts.length > 0) {
      html += '<div class="detail-section"><div class="detail-label">Attempts (' + attempts.length + ')</div>';
      for (var ai = 0; ai < attempts.length; ai++) {
        var attempt = attempts[ai];
        html += '<div class="detail-list-item">';
        html += '<div><span class="detail-chip">' + __wvEscapeHtml(attempt.selected ? 'selected' : 'candidate') + '</span> Attempt ' + __wvEscapeHtml(String(attempt.attempt_index)) + '/' + __wvEscapeHtml(String(attempt.attempt_count)) + '</div>';
        html += '<div>' + __wvEscapeHtml(attempt.summary || '') + '</div>';
        if (attempt.changed_files && attempt.changed_files.length > 0) {
          html += '<div class="detail-subtle">Files: ' + __wvEscapeHtml(attempt.changed_files.slice(0, 6).join(', '));
          if (attempt.changed_files.length > 6) html += ' …';
          html += '</div>';
        }
        if (attempt.verification && attempt.verification.length > 0) {
          html += '<div class="detail-subtle">Verification: ' + __wvEscapeHtml(attempt.verification.join(' · ')) + '</div>';
        }
        if (attempt.patch_path) {
          html += '<div class="detail-actions">' + renderOpenFileButton(attempt.patch_path, 'Open Patch') + '</div>';
        }
        html += '</div>';
      }
      html += '</div>';
    }
    if (artifacts.length > 0) {
      html += '<div class="detail-section"><div class="detail-label">Artifacts (' + artifacts.length + ')</div>';
      for (var ar = 0; ar < artifacts.length; ar++) {
        var artifact = artifacts[ar];
        html += '<div class="detail-list-item">';
        html += '<div><strong>' + __wvEscapeHtml(artifact.label || 'artifact') + '</strong></div>';
        if (artifact.summary) html += '<div>' + __wvEscapeHtml(artifact.summary) + '</div>';
        html += '<div class="detail-subtle">' + __wvEscapeHtml(artifact.path || '') + '</div>';
        html += '<div class="detail-actions">' + renderOpenFileButton(artifact.path, 'Open Artifact') + '</div>';
        html += '</div>';
      }
      html += '</div>';
    }
    if (githubEvents.length > 0) {
      html += '<div class="detail-section"><div class="detail-label">GitHub Events (' + githubEvents.length + ')</div>';
      for (var ge = 0; ge < githubEvents.length; ge++) {
        var event = githubEvents[ge];
        html += '<div class="detail-list-item">';
        html += '<div><span class="detail-chip">' + __wvEscapeHtml(event.action || 'event') + '</span> ' + __wvEscapeHtml(event.summary || '') + '</div>';
        html += '<div class="detail-subtle">' + __wvEscapeHtml(event.target || '') + ' #' + __wvEscapeHtml(String(event.number || '')) + ' \\u00B7 ' + __wvEscapeHtml(formatDetailTime(event.recorded_at)) + '</div>';
        if (event.url) {
          html += '<div class="detail-actions">' + renderOpenExternalButton(event.url, 'Open GitHub') + '</div>';
        }
        html += '</div>';
      }
      html += '</div>';
    }
    html += '</div>';
    overlay.innerHTML = html;
    overlay.style.display = 'flex';
    attachDetailOverlayActions(overlay, closeTaskDetail);
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

  function compactJson(value, maxLength) {
    try {
      var text = JSON.stringify(value, null, 2);
      if (maxLength && text.length > maxLength) return text.slice(0, maxLength) + '\\u2026';
      return text;
    } catch(e) {
      return String(value || '');
    }
  }

  function transcriptContentText(content) {
    if (typeof content === 'string') return content.trim();
    if (!Array.isArray(content)) return '';
    var parts = [];
    for (var ci = 0; ci < content.length; ci++) {
      var block = content[ci];
      if (typeof block === 'string') {
        if (block.trim()) parts.push(block.trim());
        continue;
      }
      if (!block || typeof block !== 'object') continue;
      if (block.type === 'text' && block.text) {
        parts.push(String(block.text));
      } else if (block.type === 'tool_use') {
        var toolLine = 'Tool: ' + String(block.name || 'unknown');
        if (hasOwnData(block.input)) toolLine += '\\n' + compactJson(block.input, 900);
        parts.push(toolLine);
      } else if (block.type === 'tool_result') {
        var resultText = transcriptContentText(block.content);
        if (!resultText && block.content != null) resultText = compactJson(block.content, 1200);
        parts.push('Tool result' + (resultText ? ':\\n' + resultText : ''));
      } else if (block.message || block.summary || block.text) {
        parts.push(String(block.message || block.summary || block.text));
      }
    }
    return parts.join('\\n\\n').trim();
  }

  function normalizeAgentTranscript(run) {
    var raw = run ? run.transcript : null;
    var messages = [];
    var omitted = 0;
    var messageCount = 0;
    if (raw && !Array.isArray(raw) && typeof raw === 'object') {
      messages = Array.isArray(raw.messages) ? raw.messages : [];
      omitted = Number(raw.omitted_messages || 0);
      messageCount = Number(raw.message_count || messages.length);
    } else if (Array.isArray(raw)) {
      messages = raw;
      messageCount = raw.length;
    } else if (Array.isArray(run.transcript_messages)) {
      messages = run.transcript_messages;
      messageCount = messages.length;
    } else if (Array.isArray(run.messages)) {
      messages = run.messages;
      messageCount = messages.length;
    }

    var entries = [];
    for (var mi = 0; mi < messages.length; mi++) {
      var message = messages[mi];
      if (typeof message === 'string') {
        if (message.trim()) entries.push({ role: 'message', text: message.trim() });
        continue;
      }
      if (!message || typeof message !== 'object') continue;
      var text = transcriptContentText(message.content);
      if (!text && (message.text || message.message || message.summary)) {
        text = String(message.text || message.message || message.summary);
      }
      if (!text) continue;
      entries.push({ role: String(message.role || message.type || message.kind || 'message'), text: text });
    }

    if (entries.length === 0) {
      if (run.latest_message) entries.push({ role: 'activity', text: String(run.latest_message) });
      if (run.result_summary || run.persisted_result) entries.push({ role: 'result', text: String(run.result_summary || run.persisted_result) });
      if (run.error) entries.push({ role: 'error', text: String(run.error) });
      messageCount = entries.length;
    }
    return { entries: entries, omitted: omitted, messageCount: messageCount || entries.length };
  }

  function normalizedAgentEvent(event, index) {
    var ev = event && typeof event === 'object' ? event : {};
    var status = String(ev.status || ev.kind || ev.type || 'event');
    var message = ev.message || ev.summary || ev.detail || '';
    if (!message) {
      var extra = {};
      var keys = Object.keys(ev);
      for (var ki = 0; ki < keys.length; ki++) {
        var key = keys[ki];
        if (['seq', 'worker_id', 'status', 'kind', 'type', 'timestamp_ms', 'timestamp', 'created_at', 'step', 'tool_name'].indexOf(key) < 0) {
          extra[key] = ev[key];
        }
      }
      if (Object.keys(extra).length > 0) message = compactJson(extra, 1200);
    }
    if (!message) message = agentStatusLabel(status) || ('Event ' + (index + 1));
    return {
      seq: ev.seq != null ? ev.seq : index + 1,
      timestamp: ev.timestamp_ms || ev.timestamp || ev.created_at || null,
      status: status,
      message: String(message),
      step: ev.step,
      tool: ev.tool_name || ev.tool || '',
    };
  }

  function renderAgentDetailGroup(className, title, countLabel, body) {
    var html = '<details class="agent-detail-group ' + className + '">';
    html += '<summary><span>' + __wvEscapeHtml(title) + '</span>';
    if (countLabel !== '') html += '<span class="agent-detail-group-count">' + __wvEscapeHtml(String(countLabel)) + '</span>';
    html += '</summary><div class="agent-detail-group-body">' + body + '</div></details>';
    return html;
  }

  function showAgentDetail(run) {
    var overlay = document.getElementById('agent-detail-overlay');
    if (!overlay) return;
    var spec = run.spec || {};
    var statusColor = agentStatusColor(run.status);
    var statusLabel = agentStatusLabelForRun(run);
    var nickname = agentNickname(run);
    var objective = String(spec.objective || '');
    var role = String(spec.role || '');
    var agentType = String(spec.agent_type || '-');
    var profile = String(spec.profile || '-');
    var model = String(spec.model || '-');
    var steps = run.steps_taken || 0;
    var tokenUsage = formatAgentTokenUsage(run.usage);
    var runId = agentRunId(run);
    var parentId = run.parent_run_id || '';
    var createdAt = formatDetailTime(run.created_at_ms);
    var updatedAt = formatDetailTime(run.updated_at_ms);
    var startedAt = formatDetailTime(run.started_at_ms);
    var completedAt = formatDetailTime(run.completed_at_ms);
    var events = Array.isArray(run.events) ? run.events : [];
    var transcript = normalizeAgentTranscript(run);
    var latestOutput = agentLatestOutput(run);
    var html = '<div class="task-detail-panel agent-detail-panel">';
    html += '<div class="agent-detail-header"><button class="close-btn" type="button">\\u2715</button>';
    html += '<h3><span class="codicon codicon-robot" aria-hidden="true"></span> ' + __wvEscapeHtml(nickname) + '</h3>';
    var subtitle = [agentType, profile === '-' ? '' : profile, model].filter(Boolean).join(' \\u00B7 ');
    html += '<div class="agent-detail-subtitle">' + __wvEscapeHtml(subtitle) + '</div></div>';
    html += '<div class="agent-detail-content">';

    html += '<div class="agent-overview-grid">';
    html += '<div class="agent-overview-card"><div class="agent-overview-label">Status</div><div class="agent-overview-value" style="color:' + statusColor + '">' + __wvEscapeHtml(statusLabel) + '</div></div>';
    html += '<div class="agent-overview-card"><div class="agent-overview-label">' + __wvEscapeHtml(__i18n.agentType) + '</div><div class="agent-overview-value">' + __wvEscapeHtml(agentType) + '</div></div>';
    html += '<div class="agent-overview-card"><div class="agent-overview-label">' + __wvEscapeHtml(__i18n.agentProfile) + '</div><div class="agent-overview-value">' + __wvEscapeHtml(profile) + '</div></div>';
    html += '<div class="agent-overview-card"><div class="agent-overview-label">' + __wvEscapeHtml(__i18n.agentModel) + '</div><div class="agent-overview-value">' + __wvEscapeHtml(model) + '</div></div>';
    html += '<div class="agent-overview-card"><div class="agent-overview-label">' + __wvEscapeHtml(__i18n.agentRole) + '</div><div class="agent-overview-value">' + __wvEscapeHtml(role || '-') + '</div></div>';
    html += '<div class="agent-overview-card"><div class="agent-overview-label">' + __wvEscapeHtml(__i18n.agentSteps) + '</div><div class="agent-overview-value">' + steps + '</div></div>';
    html += '<div class="agent-overview-card"><div class="agent-overview-label">' + __wvEscapeHtml(__i18n.agentUsage) + '</div><div class="agent-overview-value">' + __wvEscapeHtml(tokenUsage || '-') + '</div></div>';
    html += '</div>';

    if (latestOutput) {
      html += '<div class="agent-latest-card"><div class="agent-overview-label">' + __wvEscapeHtml(__i18n.agentLatestOutput) + '</div><div class="agent-latest-text">' + __wvEscapeHtml(latestOutput) + '</div></div>';
    }

    if (objective) {
      var assignmentBody = '<div class="agent-transcript-text">' + __wvEscapeHtml(objective) + '</div>';
      html += renderAgentDetailGroup('agent-assignment-group', __i18n.agentAssignment, '', assignmentBody);
    }

    var transcriptBody = '';
    if (transcript.omitted > 0) {
      transcriptBody += '<div class="agent-detail-note">' + __wvEscapeHtml(__i18n.agentPartialTranscript) + ' (' + transcript.omitted + ')</div>';
    }
    if (transcript.entries.length > 0) {
      transcriptBody += '<div class="agent-transcript-list">';
      for (var ti = 0; ti < transcript.entries.length; ti++) {
        var entry = transcript.entries[ti];
        transcriptBody += '<div class="agent-transcript-entry"><div class="agent-transcript-role">' + __wvEscapeHtml(timelineKindLabel(entry.role)) + '</div><div class="agent-transcript-text">' + __wvEscapeHtml(entry.text) + '</div></div>';
      }
      transcriptBody += '</div>';
    } else {
      transcriptBody += '<div class="agent-detail-note">' + __wvEscapeHtml(__i18n.agentNoTranscript) + '</div>';
    }
    html += renderAgentDetailGroup('agent-transcript-group', __i18n.agentTranscript, transcript.messageCount, transcriptBody);

    var eventsBody = '';
    if (events.length > 0) {
      eventsBody += '<div class="agent-event-list">';
      for (var ei = 0; ei < events.length; ei++) {
        var ev = normalizedAgentEvent(events[ei], ei);
        eventsBody += '<div class="agent-event-row"><div class="agent-event-meta">';
        eventsBody += '<span>#' + __wvEscapeHtml(String(ev.seq)) + '</span><span>' + __wvEscapeHtml(formatDetailTime(ev.timestamp)) + '</span>';
        eventsBody += '<span class="agent-event-status">' + __wvEscapeHtml(agentStatusLabel(ev.status) || timelineKindLabel(ev.status)) + '</span>';
        if (ev.step != null) eventsBody += '<span>step ' + __wvEscapeHtml(String(ev.step)) + '</span>';
        if (ev.tool) eventsBody += '<span>' + __wvEscapeHtml(String(ev.tool)) + '</span>';
        eventsBody += '</div><div class="agent-event-message">' + __wvEscapeHtml(ev.message) + '</div></div>';
      }
      eventsBody += '</div>';
    } else {
      eventsBody = '<div class="agent-detail-note">' + __wvEscapeHtml(__i18n.agentNoEvents) + '</div>';
    }
    html += renderAgentDetailGroup('agent-events-group', __i18n.agentEvents, events.length, eventsBody);

    var artifacts = Array.isArray(run.artifacts) ? run.artifacts : [];
    if (artifacts.length > 0) {
      var referencesBody = '';
      for (var ai = 0; ai < artifacts.length; ai++) {
        var art = artifacts[ai] || {};
        var artName = art.name || art.path || art.kind || 'reference';
        referencesBody += '<div class="agent-reference"><div class="agent-reference-title">' + __wvEscapeHtml(artName) + ' <span class="detail-chip">' + __wvEscapeHtml(art.kind || '') + '</span></div>';
        if (art.target || art.path) referencesBody += '<div class="agent-reference-target">' + __wvEscapeHtml(art.target || art.path) + '</div>';
        if (art.description) referencesBody += '<div class="agent-reference-description">' + __wvEscapeHtml(art.description) + '</div>';
        referencesBody += '</div>';
      }
      html += renderAgentDetailGroup('agent-references-group', __i18n.agentReferences, artifacts.length, referencesBody);
    }

    var metadataBody = '<div class="agent-metadata-grid">';
    metadataBody += '<span class="agent-metadata-label">Run ID</span><span class="agent-metadata-value">' + __wvEscapeHtml(runId || '-') + '</span>';
    metadataBody += '<span class="agent-metadata-label">Worker ID</span><span class="agent-metadata-value">' + __wvEscapeHtml(spec.worker_id || '-') + '</span>';
    if (parentId) metadataBody += '<span class="agent-metadata-label">Parent run</span><span class="agent-metadata-value">' + __wvEscapeHtml(parentId) + '</span>';
    metadataBody += '<span class="agent-metadata-label">Created</span><span class="agent-metadata-value">' + __wvEscapeHtml(createdAt) + '</span>';
    metadataBody += '<span class="agent-metadata-label">Started</span><span class="agent-metadata-value">' + __wvEscapeHtml(startedAt) + '</span>';
    metadataBody += '<span class="agent-metadata-label">Updated</span><span class="agent-metadata-value">' + __wvEscapeHtml(updatedAt) + '</span>';
    metadataBody += '<span class="agent-metadata-label">Completed</span><span class="agent-metadata-value">' + __wvEscapeHtml(completedAt) + '</span>';
    metadataBody += '</div>';
    html += renderAgentDetailGroup('agent-metadata-group', __i18n.agentRunMetadata, '', metadataBody);

    var handoffParts = [];
    if (hasOwnData(run.follow_up)) handoffParts.push('<div class="detail-section"><div class="detail-label">Follow Up</div>' + renderJsonBlock(run.follow_up) + '</div>');
    if (hasOwnData(run.takeover)) handoffParts.push('<div class="detail-section"><div class="detail-label">Takeover</div>' + renderJsonBlock(run.takeover) + '</div>');
    if (hasOwnData(run.verification)) handoffParts.push('<div class="detail-section"><div class="detail-label">Verification</div>' + renderJsonBlock(run.verification) + '</div>');
    if (hasOwnData(run.recommended_action)) handoffParts.push('<div class="detail-section"><div class="detail-label">Recommended Action</div>' + renderJsonBlock(run.recommended_action) + '</div>');
    if (handoffParts.length > 0) html += renderAgentDetailGroup('agent-handoff-group', 'Handoff', handoffParts.length, handoffParts.join(''));

    html += '</div></div>';
    overlay.innerHTML = html;
    overlay.style.display = 'flex';
    attachDetailOverlayActions(overlay, closeAgentDetail);
  }

  // ── Sidebar toggle ──
  function renderThreadsPanelToggle() {
    var threadsPanel = document.getElementById('threads-panel');
    var button = document.getElementById('btn-threads');
    if (!threadsPanel || !button) return;
    var open = threadsPanel.classList.contains('open');
    button.innerHTML = '<span class="codicon ' + (open
      ? 'codicon-layout-sidebar-left-off'
      : 'codicon-layout-sidebar-left') + '" aria-hidden="true"></span>';
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function toggleThreadsPanel() {
    var threadsPanel = document.getElementById('threads-panel');
    var opening = !threadsPanel.classList.contains('open');
    threadsPanel.classList.toggle('open');
    renderThreadsPanelToggle();
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

  // ── Floating agent inspector ──
  var agentButton = document.getElementById('btn-agents');
  if (agentButton) agentButton.addEventListener('click', toggleAgentPopover);
  var workPopoverButton = document.getElementById('btn-work-popover');
  if (workPopoverButton) workPopoverButton.addEventListener('click', toggleWorkPopover);
  var changesPopoverButton = document.getElementById('btn-changes');
  if (changesPopoverButton) changesPopoverButton.addEventListener('click', toggleChangesPopover);
  var stopAllAgentsButton = document.getElementById('btn-stop-agents');
  if (stopAllAgentsButton) stopAllAgentsButton.addEventListener('click', requestStopAllAgents);
  renderStopAllAgentsButton();
  var agentPopover = document.getElementById('agent-popover');
  if (agentPopover) {
    agentPopover.addEventListener('click', function(e) {
      var target = e.target;
      var stopButton = target.closest && target.closest('.agent-popover-stop');
      if (stopButton) {
        e.stopPropagation();
        if (stopButton.disabled) return;
        var stopRunId = stopButton.getAttribute('data-run-id');
        if (stopRunId) requestStopAgent(stopRunId);
        return;
      }
      var detailsButton = target.closest && target.closest('.agent-popover-details');
      if (detailsButton) {
        e.stopPropagation();
        var detailRunId = detailsButton.getAttribute('data-run-id');
        if (detailRunId) vscode.postMessage({ type: 'showAgentSessions', runId: detailRunId });
        return;
      }
      var toggle = target.closest && target.closest('.agent-popover-toggle');
      if (!toggle) return;
      var runId = toggle.getAttribute('data-run-id');
      if (!runId) return;
      expandedAgentRunIds[runId] = !expandedAgentRunIds[runId];
      renderAgentPopover();
    });
  }
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && agentPopoverOpen) setAgentPopoverOpen(false);
    if (e.key === 'Escape' && workPopoverOpen) setWorkPopoverOpen(false);
    if (e.key === 'Escape' && changesPopoverOpen) setChangesPopoverOpen(false);
  });

  // ── Expose for event handler module ──
  window.__wvSidebar = {
    renderSessions: renderSessions,
    renderThreads: renderThreads,
    renderTasks: renderTasks,
    renderAgents: renderAgents,
    renderAgentPopover: renderAgentPopover,
    updateAgentRuns: updateAgentRuns,
    finishAgentStop: finishAgentStop,
    applyAgentStopCapabilities: applyAgentStopCapabilities,
    toggleAgentPopover: toggleAgentPopover,
    renderWorkPopover: renderWorkPopover,
    toggleWorkPopover: toggleWorkPopover,
    renderChanges: renderChanges,
    toggleChangesPopover: toggleChangesPopover,
    renderWork: renderWork,
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
    setWorkState: function(v) { workState = v; renderWorkPopover(); },
    getChangesState: function() { return changesState; },
    setChangesState: function(v) { changesState = v; },
    getAgentRuns: function() { return agentRuns; },
    setAgentRuns: updateAgentRuns,
    getSessionSearchQuery: function() { return sessionSearchQuery; },
    setSessionSearchQuery: function(v) { sessionSearchQuery = v; },
  };

  closeTaskDetail();
  closeAgentDetail();
  renderThreadsPanelToggle();
  renderWorkPopover();
  renderChanges();
  renderAgentPopover();
  })();`;
}
