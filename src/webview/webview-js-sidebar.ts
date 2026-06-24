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
  var threadCountEl = document.getElementById('thread-count');
  var sessionSearchQuery = '';

  // ── Work state ──
  var workState = { goal: null, checklist: [], checklistCompletionPct: 0, strategy: [], cycleCount: 0, coherenceState: 'healthy', coherenceLabel: '' };

  // ── Changes state ──
  var changesState = [];
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
      el.className = 'thread-item session-empty-msg';
      el.textContent = sessionSearchQuery ? __i18n.noSearchResults : __i18n.noConversations;
      el.style.cssText = 'color:var(--muted);font-style:italic;text-align:center;padding:20px 10px';
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
      el.className = 'thread-item';
      el.textContent = __i18n.noConversations;
      el.style.cssText = 'color:var(--muted);font-style:italic;text-align:center;padding:20px 10px';
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

  // ── Render Tasks ──
  function renderTasks(tasks) {
    var container = document.getElementById('tab-tasks');
    if (!container) return;
    container.innerHTML = '';
    if (!tasks || tasks.length === 0) {
      var el = document.createElement('div');
      el.className = 'work-empty';
      el.textContent = __i18n.noTasks;
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

  // ── Render Work ──
  function renderWork() {
    var container = document.getElementById('tab-work');
    if (!container) return;
    container.innerHTML = '';
    var hasContent = workState.goal || workState.checklist.length > 0 || workState.strategy.length > 0 || workState.cycleCount > 0 || (workState.coherenceState && workState.coherenceState !== 'healthy');
    if (!hasContent) {
      var el = document.createElement('div');
      el.className = 'work-empty';
      el.textContent = __i18n.noActiveWork;
      container.appendChild(el);
      return;
    }
    if (workState.coherenceState && workState.coherenceState !== 'healthy') {
      var section = document.createElement('div');
      section.className = 'work-section';
      var stateKey = 'coherence' + workState.coherenceState.charAt(0).toUpperCase() + workState.coherenceState.slice(1).replace(/_([a-z])/g, function(_, c) { return c.toUpperCase(); });
      var stateLabel = __i18n[stateKey] || workState.coherenceLabel || workState.coherenceState;
      var isWarning = workState.coherenceState === 'refreshing_context' || workState.coherenceState === 'getting_crowded';
      var barColor = isWarning ? '#ff9800' : '#2196f3';
      section.innerHTML = '<div class="work-coherence" style="padding:4px 8px;border-radius:4px;background:' + barColor + '22;border-left:3px solid ' + barColor + ';font-size:0.82em;color:' + barColor + '">' + __wvEscapeHtml(stateLabel) + '</div>';
      container.appendChild(section);
    }
    if (workState.goal) {
      var section = document.createElement('div');
      section.className = 'work-section';
      section.innerHTML = '<div class="work-section-title">' + __wvEscapeHtml(__i18n.goal) + '</div><div class="work-goal">' + __wvEscapeHtml(workState.goal) + '</div>';
      container.appendChild(section);
    }
    if (workState.checklist.length > 0) {
      var section = document.createElement('div');
      section.className = 'work-section';
      var html = '<div class="work-section-title">' + __wvEscapeHtml(__i18n.checklist);
      if (workState.checklistCompletionPct > 0) {
        var pctStr = __i18n.completionPct.replace('{n}', String(workState.checklistCompletionPct));
        html += ' <span style="font-weight:400;color:var(--muted);font-size:0.9em">' + __wvEscapeHtml(pctStr) + '</span>';
      }
      html += '</div>';
      if (workState.checklistCompletionPct > 0) {
        html += '<div class="work-progress-bar" style="height:4px;background:var(--border);border-radius:2px;margin:4px 0 8px;overflow:hidden"><div style="height:100%;width:' + workState.checklistCompletionPct + '%;background:var(--brand-primary);border-radius:2px;transition:width 0.3s ease"></div></div>';
      }
      for (var ci = 0; ci < workState.checklist.length; ci++) {
        var item = workState.checklist[ci];
        var check = item.status === 'completed' ? '\\u2713' : item.status === 'in_progress' ? '\\u27F3' : '\\u25CB';
        var color = item.status === 'completed' ? '#4caf50' : item.status === 'in_progress' ? '#ff9800' : '#888';
        html += '<div class="work-checklist-item" style="color:' + color + ';display:flex;align-items:baseline;gap:6px;padding:2px 0"><span style="flex-shrink:0;width:16px;text-align:center">' + check + '</span><span>' + __wvEscapeHtml(item.content) + '</span></div>';
      }
      section.innerHTML = html;
      container.appendChild(section);
    }
    if (workState.strategy.length > 0) {
      var section = document.createElement('div');
      section.className = 'work-section';
      var html = '<div class="work-section-title">' + __wvEscapeHtml(__i18n.strategy) + '</div>';
      for (var si = 0; si < workState.strategy.length; si++) {
        var step = workState.strategy[si];
        var icon = step.status === 'completed' ? '\\u2713' : step.status === 'in_progress' ? '\\u27F3' : '\\u25CB';
        var color = step.status === 'completed' ? '#4caf50' : step.status === 'in_progress' ? '#ff9800' : '#888';
        html += '<div class="work-strategy-step" style="color:' + color + ';display:flex;align-items:baseline;gap:6px;padding:2px 0"><span style="flex-shrink:0;width:16px;text-align:center">' + icon + '</span><span>' + __wvEscapeHtml(step.text) + '</span></div>';
      }
      section.innerHTML = html;
      container.appendChild(section);
    }
    if (workState.cycleCount > 0) {
      var section = document.createElement('div');
      section.className = 'work-section';
      section.innerHTML = '<div style="font-size:0.8em;color:var(--muted)">' + __wvEscapeHtml(__i18n.cycles) + ': ' + workState.cycleCount + '</div>';
      container.appendChild(section);
    }
  }

  // ── Render Changes ──
  function renderChanges() {
    var container = document.getElementById('tab-changes');
    if (!container) return;
    container.innerHTML = '';
    _diffStore.clear();
    _diffIdCounter.value = 0;
    if (!changesState || changesState.length === 0) {
      var el = document.createElement('div');
      el.className = 'work-empty';
      el.textContent = __i18n.noFileChanges;
      container.appendChild(el);
      return;
    }
    // Summary header
    var header = document.createElement('div');
    header.className = 'work-section';
    var createdCount = 0, modifiedCount = 0, deletedCount = 0;
    for (var si = 0; si < changesState.length; si++) {
      if (changesState[si].changeType === 'created') createdCount++;
      else if (changesState[si].changeType === 'deleted') deletedCount++;
      else modifiedCount++;
    }
    var summaryParts = [];
    if (createdCount > 0) summaryParts.push('<span class="change-summary-created">' + createdCount + ' ' + __wvEscapeHtml(__i18n.fileCreated) + '</span>');
    if (modifiedCount > 0) summaryParts.push('<span class="change-summary-modified">' + modifiedCount + ' ' + __wvEscapeHtml(__i18n.fileModified) + '</span>');
    if (deletedCount > 0) summaryParts.push('<span class="change-summary-deleted">' + deletedCount + ' ' + __wvEscapeHtml(__i18n.fileDeleted) + '</span>');
    header.innerHTML = '<div class="work-section-title">' + __wvEscapeHtml(__i18n.fileChanges) + ' <span style="font-weight:400;color:var(--muted);font-size:0.9em">(' + changesState.length + ')</span></div><div class="change-summary-row">' + summaryParts.join(' ') + '</div>';
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
        vscode.postMessage({ type: 'openDiff', filePath: filePath, diff: (diffKey ? _diffStore.get(diffKey) : undefined) || undefined });
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
    renderWork: renderWork,
    renderChanges: renderChanges,
    switchSidebarTab: switchSidebarTab,
    closeTaskDetail: closeTaskDetail,
    showTaskDetail: showTaskDetail,
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
    getSessionSearchQuery: function() { return sessionSearchQuery; },
    setSessionSearchQuery: function(v) { sessionSearchQuery = v; },
  };

  closeTaskDetail();
  })();`;
}
