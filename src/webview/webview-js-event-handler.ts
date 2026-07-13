/**
 * Webview JS event handler module — injected into the webview as an IIFE.
 * Handles the window 'message' event listener with the main switch statement.
 */
import type { WebviewTranslations } from "./webview-html";

export function getEventHandlerScript(tr: WebviewTranslations): string {
  return `(function(){
  'use strict';
  var __i18n = window.__wvI18n;
  var __wvEscapeHtml = window.__wvEscapeHtml;
  var __wvFormatLoadedThread = window.__wvFormatLoadedThread;
  var vscode = window.__wvVscode;
  var messagesEl = document.getElementById('messages');
  var inputEl = document.getElementById('input');
  var statusTextEl = document.getElementById('status-text');
  var statusStatsEl = document.getElementById('status-stats');
  var currentModeEl = document.getElementById('current-mode');
  var currentModelEl = document.getElementById('current-model');
  var currentReasoningEl = document.getElementById('current-reasoning');
  var contextUsageGaugeEl = document.getElementById('context-usage-gauge');
  var contextUsageValueEl = contextUsageGaugeEl ? contextUsageGaugeEl.querySelector('.context-usage-value') : null;
  var _diffStore = window.__wvDiffStore;
  var _diffIdCounter = window.__wvDiffIdCounter;

  var apiCapabilities = window.__wvApiCapabilities || {};
  var runtimeVersion = '';
  var sessionStats = null;

  // ── Streaming state helpers ──
  var statusBarEl = document.getElementById('status');

  function setStreamingState(streaming, label) {
    if (statusBarEl) {
      if (streaming) {
        statusBarEl.classList.add('is-streaming');
      } else {
        statusBarEl.classList.remove('is-streaming');
      }
    }
    if (statusTextEl) {
      statusTextEl.textContent = label || (streaming ? __i18n.thinking : __i18n.ready);
    }
    // Sync send/stop button state
    if (window.__wvInput && window.__wvInput.updateSendStopButton) {
      window.__wvInput.updateSendStopButton(streaming);
    }
  }

  function showThinkingActivity(messageId, label) {
    var bodyEl = document.getElementById('body-' + messageId);
    if (!bodyEl) return;
    var existing = bodyEl.querySelector('.thinking-activity');
    if (existing) {
      var labelEl = existing.querySelector('.thinking-activity-label');
      if (labelEl) labelEl.textContent = label || __i18n.thinking;
      return;
    }
    var indicator = document.createElement('div');
    indicator.className = 'thinking-activity';
    indicator.innerHTML = '<div class="thinking-activity-dots"><span></span><span></span><span></span></div><span class="thinking-activity-label">' + __wvEscapeHtml(label || __i18n.thinking) + '</span>';
    bodyEl.insertBefore(indicator, bodyEl.firstChild);
  }

  function updateThinkingActivityLabel(messageId, label) {
    var bodyEl = document.getElementById('body-' + messageId);
    if (!bodyEl) return;
    var indicator = bodyEl.querySelector('.thinking-activity');
    if (indicator) {
      var labelEl = indicator.querySelector('.thinking-activity-label');
      if (labelEl) labelEl.textContent = label || __i18n.thinking;
    }
  }

  function hideThinkingActivity(messageId) {
    var bodyEl = document.getElementById('body-' + messageId);
    if (!bodyEl) return;
    var indicator = bodyEl.querySelector('.thinking-activity');
    if (indicator) indicator.remove();
  }

  function appendDismissibleSystemMessage(message) {
    var infoEl = document.createElement('div');
    infoEl.className = 'system-message';

    var labelEl = document.createElement('span');
    labelEl.className = 'msg-label note';
    labelEl.textContent = __i18n.note;

    var bodyEl = document.createElement('span');
    bodyEl.className = 'msg-body';
    bodyEl.textContent = message;

    var dismissEl = document.createElement('button');
    var dismissLabel = __i18n.dismissNotification || 'Dismiss notification';
    dismissEl.type = 'button';
    dismissEl.className = 'system-message-dismiss';
    dismissEl.setAttribute('aria-label', dismissLabel);
    dismissEl.title = dismissLabel;
    dismissEl.textContent = '✕';
    dismissEl.addEventListener('click', function() {
      infoEl.remove();
    });

    infoEl.appendChild(labelEl);
    infoEl.appendChild(bodyEl);
    infoEl.appendChild(dismissEl);
    messagesEl.appendChild(infoEl);
    return infoEl;
  }

  function renderStatusStats() {
    if (!statusStatsEl) return;
    var statsHtml = '';
    if (runtimeVersion) {
      statsHtml += '<span class="stat-chip">TUI ' + __wvEscapeHtml(runtimeVersion) + '</span>';
    }
    if (sessionStats && sessionStats.cost) {
      statsHtml += '<span class="stat-chip cost">' + __wvEscapeHtml(sessionStats.cost) + '</span>';
    }
    if (sessionStats && sessionStats.cacheHitRate !== undefined) {
      var rate = parseFloat(sessionStats.cacheHitRate);
      var cacheClass = 'cache-neutral';
      if (rate > 80) cacheClass = 'cache-good';
      else if (rate >= 40) cacheClass = 'cache-warn';
      else if (rate > 0) cacheClass = 'cache-bad';
      statsHtml += '<span class="stat-chip ' + cacheClass + '">Cache: ' + sessionStats.cacheHitRate + '%</span>';
    }
    if (sessionStats && (sessionStats.totalInputTokens || sessionStats.totalOutputTokens)) {
      statsHtml += '<span class="stat-chip tokens">\\u2191' + Number(sessionStats.totalInputTokens || 0).toLocaleString() + ' \\u2193' + Number(sessionStats.totalOutputTokens || 0).toLocaleString() + '</span>';
    }
    statusStatsEl.innerHTML = statsHtml;
  }

  function renderContextUsage(available, usage) {
    if (!contextUsageGaugeEl || !contextUsageValueEl) return;
    if (!available || !usage) {
      var unavailableLabel = __i18n.contextUsageUnavailable || 'Context usage unavailable';
      contextUsageGaugeEl.classList.remove('warning', 'critical');
      contextUsageGaugeEl.classList.add('unavailable');
      contextUsageValueEl.setAttribute('stroke-dashoffset', '100');
      contextUsageGaugeEl.setAttribute('data-tooltip', unavailableLabel);
      contextUsageGaugeEl.setAttribute('aria-label', unavailableLabel);
      return;
    }

    var used = Math.max(0, Number(usage.estimated_input_tokens || 0));
    var max = Math.max(0, Number(usage.context_window_tokens || 0));
    var percent = Number(usage.used_percent);
    if (!Number.isFinite(percent)) percent = max > 0 ? (used / max) * 100 : 0;
    percent = Math.max(0, Math.min(100, percent));
    var threshold = Number(usage.auto_compact_threshold_percent);
    if (!Number.isFinite(threshold) || threshold <= 0) threshold = 90;
    threshold = Math.max(10, Math.min(100, threshold));
    var warningAt = Math.max(0, threshold - 10);

    contextUsageGaugeEl.classList.remove('unavailable', 'warning', 'critical');
    if (percent >= threshold) contextUsageGaugeEl.classList.add('critical');
    else if (percent >= warningAt) contextUsageGaugeEl.classList.add('warning');
    contextUsageValueEl.setAttribute('stroke-dashoffset', String(100 - percent));

    var contextLabel = __i18n.contextUsage || 'Context';
    var tooltip = contextLabel + ': '
      + used.toLocaleString(__i18n.locale || undefined) + ' / '
      + max.toLocaleString(__i18n.locale || undefined) + ' tokens ('
      + percent.toFixed(1) + '%)';
    contextUsageGaugeEl.setAttribute('data-tooltip', tooltip);
    contextUsageGaugeEl.setAttribute('aria-label', tooltip);
  }

  // ── Tell extension we're ready ──
  vscode.postMessage({ type: 'webviewReady' });

  // retainContextWhenHidden keeps this document alive while another provider
  // owns the Secondary Side Bar. Recheck the backend whenever it becomes
  // visible so a missed terminal event cannot leave Send/Stop stale.
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
      vscode.postMessage({ type: 'refreshTurnState' });
      vscode.postMessage({ type: 'refreshAgentRuns' });
      vscode.postMessage({ type: 'refreshContextUsage' });
    }
  });

  // ── Session controls dashboard ──
  (function(){
    var sessionControlsButton = document.getElementById('btn-session-controls');
    var sessionControlsPopover = document.getElementById('session-controls-popover');
    if (!sessionControlsButton || !sessionControlsPopover) return;
    var sessionControlsOpen = false;

    function closeAllDropdowns() {
      var menus = sessionControlsPopover.querySelectorAll('.dropdown-menu');
      for (var i = 0; i < menus.length; i++) { menus[i].classList.remove('open'); }
    }

    function positionSessionControlsPopover() {
      if (!sessionControlsOpen) return;
      var rect = sessionControlsButton.getBoundingClientRect();
      var viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      var viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      sessionControlsPopover.style.right = Math.max(8, viewportWidth - rect.right) + 'px';
      sessionControlsPopover.style.bottom = Math.max(8, viewportHeight - rect.top + 6) + 'px';
      sessionControlsPopover.style.maxHeight = Math.max(120, rect.top - 14) + 'px';
    }

    function setSessionControlsOpen(open) {
      sessionControlsOpen = !!open;
      if (sessionControlsOpen && window.__wvSidebar && window.__wvSidebar.closeFloatingPopovers) {
        window.__wvSidebar.closeFloatingPopovers();
      }
      sessionControlsButton.setAttribute('aria-expanded', sessionControlsOpen ? 'true' : 'false');
      sessionControlsPopover.classList.toggle('open', sessionControlsOpen);
      sessionControlsPopover.setAttribute('aria-hidden', sessionControlsOpen ? 'false' : 'true');
      if (sessionControlsOpen) positionSessionControlsPopover();
      else closeAllDropdowns();
    }

    function highlightCurrent(dropdown) {
      var currentVal = dropdown.parentElement.querySelector('.setting-value').textContent.trim();
      var items = dropdown.querySelectorAll('.dropdown-item');
      for (var i = 0; i < items.length; i++) {
        items[i].classList.toggle('selected', items[i].getAttribute('data-value') === currentVal);
      }
    }

    sessionControlsButton.addEventListener('click', function(e) {
      setSessionControlsOpen(!sessionControlsOpen);
      e.stopPropagation();
    });

    sessionControlsPopover.addEventListener('click', function(e) {
      var target = e.target;

      // Toggle dropdown on setting-value click
      if (target.classList.contains('setting-value')) {
        var dropdown = target.parentElement.querySelector('.dropdown-menu');
        if (!dropdown) return;
        var isOpen = dropdown.classList.contains('open');
        closeAllDropdowns();
        if (!isOpen) {
          highlightCurrent(dropdown);
          dropdown.classList.add('open');
        }
        e.stopPropagation();
        return;
      }

      // Select item from dropdown
      if (target.classList.contains('dropdown-item')) {
        var val = target.getAttribute('data-value');
        var dropdown = target.parentElement;
        var setting = dropdown.parentElement.getAttribute('data-setting');
        closeAllDropdowns();
        if (val && setting) {
          // Map setting to slash command
          if (setting === 'mode') {
            vscode.postMessage({ type: 'slashCommand', command: '/mode', args: val });
          } else if (setting === 'model') {
            vscode.postMessage({ type: 'slashCommand', command: '/model', args: val });
          } else if (setting === 'reasoning') {
            vscode.postMessage({ type: 'slashCommand', command: '/reasoning', args: val });
          }
        }
        e.stopPropagation();
        return;
      }

      if (target.id === 'btn-compact' || (target.closest && target.closest('#btn-compact'))) {
        setSessionControlsOpen(false);
        e.stopPropagation();
        return;
      }

      e.stopPropagation();
    });

    document.addEventListener('click', function() {
      if (sessionControlsOpen) setSessionControlsOpen(false);
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && sessionControlsOpen) setSessionControlsOpen(false);
    });
    window.addEventListener('resize', positionSessionControlsPopover);
    window.__wvSessionControls = {
      close: function() { setSessionControlsOpen(false); },
      reposition: positionSessionControlsPopover,
    };
  })();

  var configButton = document.getElementById('btn-config');
  if (configButton) {
    configButton.addEventListener('click', function(e) {
      vscode.postMessage({ type: 'openConfigPanel' });
      e.stopPropagation();
    });
  }

  // ── Main message handler ──
  window.addEventListener('message', function(event) {
    var msg = event.data;
    switch (msg.type) {
      case 'ready':
        window.__wvSidebar.closeTaskDetail();
        window.__wvSidebar.closeAgentDetail();
        var turnInProgress = !!msg.turnInProgress;
        window.__wvMessages.setStreaming(turnInProgress);
        setStreamingState(
          turnInProgress,
          turnInProgress
            ? __i18n.processing
            : '${tr.ready} (' + (msg.model || 'deepseek-v4-pro') + ')'
        );
        if (msg.mode) currentModeEl.textContent = msg.mode;
        if (msg.model) currentModelEl.textContent = msg.model;
        if (msg.reasoningEffort) currentReasoningEl.textContent = msg.reasoningEffort;
        runtimeVersion = msg.runtimeVersion || runtimeVersion || '';
        renderStatusStats();
        window.__wvSidebar.applyShowThreadList(!!msg.showThreadList);
        window.__wvMessages.applyShowAgentToolCards(!!msg.showAgentToolCards);
        window.__wvMessages.applyToolDetailSettings(!!msg.showToolDetails, !!msg.calmMode);
        break;

      case 'displaySettingsUpdated':
        if (Object.prototype.hasOwnProperty.call(msg, 'showAgentToolCards')) {
          window.__wvMessages.applyShowAgentToolCards(!!msg.showAgentToolCards);
        }
        if (Object.prototype.hasOwnProperty.call(msg, 'showToolDetails') || Object.prototype.hasOwnProperty.call(msg, 'calmMode')) {
          window.__wvMessages.applyToolDetailSettings(!!msg.showToolDetails, !!msg.calmMode);
        }
        break;

      case 'settingsUpdated':
        if (msg.mode) currentModeEl.textContent = msg.mode;
        if (msg.model) currentModelEl.textContent = msg.model;
        if (msg.reasoningEffort) currentReasoningEl.textContent = msg.reasoningEffort;
        break;

      case 'sessionList':
        window.__wvSidebar.setSessions(msg.sessions || []);
        window.__wvSidebar.setShowAllWorkspaces(!!msg.showAllWorkspaces);
        window.__wvSidebar.renderSessions();
        break;

      case 'threadList':
        window.__wvSidebar.setThreads(msg.threads || []);
        window.__wvSidebar.setShowAllWorkspaces(!!msg.showAllWorkspaces);
        window.__wvSidebar.renderThreads();
        break;

      case 'sessionLoaded':
        window.__wvSidebar.setActiveSessionId(msg.sessionId || null);
        window.__wvSidebar.renderSessions();
        break;

      case 'threadLoaded':
        renderContextUsage(false, null);
        window.__wvSidebar.setActiveThreadId(msg.threadId || msg.thread?.id || null);
        window.__wvSidebar.renderThreads();
        // Close any open detail overlay from the previous thread
        window.__wvSidebar.closeTaskDetail();
        window.__wvSidebar.closeAgentDetail();
        // Clear stale work/changes state from previous thread
        window.__wvSidebar.setWorkState({ goal: null, checklist: [], checklistCompletionPct: 0, strategy: [], cycleCount: 0, coherenceState: 'healthy', coherenceLabel: '' });
        window.__wvSidebar.setChangesState([]);
        window.__wvSidebar.renderWork();
        window.__wvSidebar.renderChanges();
        // Clear stale task/agent data from previous thread
        window.__wvSidebar.renderTasks([]);
        window.__wvSidebar.updateAgentRuns([]);
        break;

      case 'taskList':
        window.__wvSidebar.renderTasks(msg.tasks || []);
        break;

      case 'agentRunList':
        window.__wvSidebar.updateAgentRuns(msg.runs || []);
        break;

      case 'contextUsage':
        renderContextUsage(!!msg.available, msg.usage || null);
        break;

      case 'agentStopResult':
        // Every request represented by runIds has reached a terminal HTTP
        // result, whether cancellation succeeded or failed. Release all of
        // those optimistic "Stopping…" rows immediately; the refreshed run
        // list decides whether each row becomes inactive or offers Stop again.
        var attemptedAgentRunIds = msg.runIds || [];
        if (msg.all) window.__wvSidebar.finishAgentStop(null);
        else if (attemptedAgentRunIds.length > 0) window.__wvSidebar.finishAgentStop(attemptedAgentRunIds);
        else window.__wvSidebar.finishAgentStop(null);
        break;

      case 'workState':
        window.__wvSidebar.setWorkState({
          goal: msg.goal || null,
          checklist: msg.checklist || [],
          checklistCompletionPct: msg.checklistCompletionPct || 0,
          strategy: msg.strategy || [],
          cycleCount: msg.cycleCount || 0,
          coherenceState: msg.coherenceState || 'healthy',
          coherenceLabel: msg.coherenceLabel || '',
        });
        window.__wvSidebar.renderWork();
        break;

      case 'changesState':
        window.__wvSidebar.setChangesState(msg.changes || []);
        window.__wvSidebar.renderChanges();
        break;

      case 'apiCapabilities':
        apiCapabilities = Object.assign({}, apiCapabilities, msg.capabilities || {});
        window.__wvApiCapabilities = apiCapabilities;
        window.__wvInput.applyApiCapabilities();
        window.__wvSidebar.applyAgentStopCapabilities();
        window.__wvSidebar.renderWork();
        break;

      case 'skillCommands':
        window.__wvInput.setSkillCommands(msg.skills || []);
        break;

      case 'taskDetail':
        window.__wvSidebar.closeAgentDetail();
        window.__wvSidebar.showTaskDetail(msg.task);
        break;

      case 'agentDetail':
        window.__wvSidebar.closeTaskDetail();
        window.__wvSidebar.showAgentDetail(msg.run);
        break;

      case 'loadHistory':
        window.__wvSidebar.closeTaskDetail();
        window.__wvSidebar.closeAgentDetail();
        // Clear shared diff store when switching sessions so stale entries
        // from the previous session don't leak into the new one.
        _diffStore.clear();
        _diffIdCounter.value = 0;
        messagesEl.innerHTML = '';
        for (var i = 0; i < msg.messages.length; i++) {
          var m = msg.messages[i];
          var showRole = !msg.compactMode || !!m._realContent;
          window.__wvMessages.addMessage(m, showRole);
        }
        break;

      case 'addMessage':
        window.__wvMessages.addMessage(msg.message);
        if (msg.message.status === 'streaming') {
          window.__wvMessages.setStreaming(true);
          var st = window.__wvMessages.getStreamingTimeout();
          if (st) clearTimeout(st);
          window.__wvMessages.setStreamingTimeout(setTimeout(function() {
            if (window.__wvMessages.isStreaming()) {
              window.__wvMessages.setStreamingTimeout(null);
              vscode.postMessage({ type: 'refreshTurnState' });
            }
          }, 300000));
          showThinkingActivity(msg.message.id, __i18n.thinking);
          setStreamingState(true, __i18n.thinking);
        }
        break;

      case 'updateMessage': {
        var blockIdx = msg.blockIdx !== undefined ? msg.blockIdx : 0;
        var contentEl = document.getElementById('content-' + msg.messageId + '-' + blockIdx);
        if (!contentEl) {
          var bodyEl = document.getElementById('body-' + msg.messageId);
          if (bodyEl) {
            contentEl = document.createElement('div');
            contentEl.className = 'content streaming-indicator';
            contentEl.id = 'content-' + msg.messageId + '-' + blockIdx;
            contentEl.setAttribute('data-block-idx', String(blockIdx));
            var insertBefore = bodyEl.querySelector('[data-block-idx="' + (blockIdx + 1) + '"]');
            if (insertBefore) {
              bodyEl.insertBefore(contentEl, insertBefore);
            } else {
              bodyEl.appendChild(contentEl);
            }
          }
        }
        if (contentEl) {
          contentEl.textContent = msg.content || '';
          window.__wvMessages.smartScrollToBottom();
        }
        updateThinkingActivityLabel(msg.messageId, __i18n.streaming);
        setStreamingState(true, __i18n.streaming);
        break;
      }

      case 'updateThinking': {
        var blockIdx = msg.blockIdx !== undefined ? msg.blockIdx : 0;
        var thinkingEl = document.getElementById('thinking-' + msg.messageId + '-' + blockIdx);
        if (!thinkingEl) {
          var bodyEl = document.getElementById('body-' + msg.messageId);
          if (bodyEl) {
            var block = document.createElement('div');
            block.className = 'thinking-block';
            block.setAttribute('data-block-idx', String(blockIdx));
            block.innerHTML = '<div class="thinking-toggle">' + __wvEscapeHtml(__i18n.thinkingOpen) + '</div><div class="thinking-content open" id="thinking-' + msg.messageId + '-' + blockIdx + '"></div>';
            var insertBefore = bodyEl.querySelector('[data-block-idx="' + (blockIdx + 1) + '"]');
            if (insertBefore) {
              bodyEl.insertBefore(block, insertBefore);
            } else {
              bodyEl.appendChild(block);
            }
            thinkingEl = block.querySelector('.thinking-content');
          }
        }
        if (thinkingEl) {
          if (!thinkingEl.querySelector('.thinking-stream')) {
            thinkingEl.innerHTML = '<div class="thinking-stream"></div>';
          }
          var streamEl = thinkingEl.querySelector('.thinking-stream');
          if (streamEl) streamEl.textContent = msg.thinking || '';
          thinkingEl.classList.add('open');
          window.__wvMessages.smartScrollToBottom();
        }
        updateThinkingActivityLabel(msg.messageId, __i18n.thinking);
        setStreamingState(true, __i18n.thinking);
        break;
      }

      case 'addTextBlock': {
        var bodyEl = document.getElementById('body-' + msg.messageId);
        if (bodyEl) {
          var blockIdx = msg.blockIdx;
          var contentEl = document.createElement('div');
          contentEl.className = 'content streaming-indicator';
          contentEl.id = 'content-' + msg.messageId + '-' + blockIdx;
          contentEl.setAttribute('data-block-idx', String(blockIdx));
          var insertBefore = bodyEl.querySelector('[data-block-idx="' + (blockIdx + 1) + '"]');
          if (insertBefore) {
            bodyEl.insertBefore(contentEl, insertBefore);
          } else {
            bodyEl.appendChild(contentEl);
          }
          window.__wvMessages.smartScrollToBottom();
        }
        break;
      }

      case 'addThinkingBlock': {
        var bodyEl = document.getElementById('body-' + msg.messageId);
        if (bodyEl) {
          var blockIdx = msg.blockIdx;
          var block = document.createElement('div');
          block.className = 'thinking-block';
          block.setAttribute('data-block-idx', String(blockIdx));
          block.innerHTML = '<div class="thinking-toggle">' + __wvEscapeHtml(__i18n.thinkingOpen) + '</div><div class="thinking-content open" id="thinking-' + msg.messageId + '-' + blockIdx + '"></div>';
          var insertBefore = bodyEl.querySelector('[data-block-idx="' + (blockIdx + 1) + '"]');
          if (insertBefore) {
            bodyEl.insertBefore(block, insertBefore);
          } else {
            bodyEl.appendChild(block);
          }
          window.__wvMessages.smartScrollToBottom();
        }
        break;
      }

      case 'addSteerBlock': {
        var bodyEl = document.getElementById('body-' + msg.messageId);
        if (bodyEl) {
          var block = window.__wvMessages.renderSteerBlock(msg.content || '', msg.blockIdx);
          var insertBefore = bodyEl.querySelector('[data-block-idx="' + (msg.blockIdx + 1) + '"]');
          if (insertBefore) bodyEl.insertBefore(block, insertBefore);
          else bodyEl.appendChild(block);
          window.__wvMessages.smartScrollToBottom();
        }
        break;
      }

      case 'addSubagentTranscriptBlock': {
        var bodyEl = document.getElementById('body-' + msg.messageId);
        if (bodyEl) {
          var block = window.__wvMessages.renderSubagentTranscriptBlock(msg.entry, msg.blockIdx);
          var insertBefore = bodyEl.querySelector('[data-block-idx="' + (msg.blockIdx + 1) + '"]');
          if (insertBefore) bodyEl.insertBefore(block, insertBefore);
          else bodyEl.appendChild(block);
          window.__wvMessages.smartScrollToBottom();
        }
        break;
      }

      case 'updateSubagentTranscriptBlock':
        window.__wvMessages.updateSubagentTranscriptBlock(msg.entry);
        window.__wvMessages.smartScrollToBottom();
        break;

      case 'addToolCall': {
        var bodyEl = document.getElementById('body-' + msg.messageId);
        if (bodyEl) {
          var tcEl = document.createElement('div');
          tcEl.innerHTML = window.__wvMessages.renderToolCall(msg.messageId, msg.toolCall, msg.toolCallIdx);
          var child = tcEl.firstElementChild;
          if (msg.blockIdx !== undefined) {
            child.setAttribute('data-block-idx', String(msg.blockIdx));
            var insertBefore = bodyEl.querySelector('[data-block-idx="' + (msg.blockIdx + 1) + '"]');
            if (insertBefore) {
              bodyEl.insertBefore(child, insertBefore);
            } else {
              bodyEl.appendChild(child);
            }
          } else {
            var contentEl = bodyEl.querySelector('.content');
            if (contentEl) {
              bodyEl.insertBefore(child, contentEl);
            } else {
              bodyEl.appendChild(child);
            }
          }
          window.__wvMessages.smartScrollToBottom();
        }
        if (msg.toolCall && msg.toolCall.displayName) {
          updateThinkingActivityLabel(msg.messageId, msg.toolCall.displayName);
        }
        break;
      }

      case 'updateToolCall': {
        var tcEl = document.getElementById('tc-' + msg.messageId + '-' + msg.toolCallIdx);
        if (tcEl) {
          var isDelegateCard = tcEl.classList.contains('delegate-card');
          var statusSpan = tcEl.querySelector('.tool-status') || tcEl.querySelector('.delegate-status');
          if (statusSpan) {
            var statusIcon = '';
            var statusText = msg.status;
            if (msg.status === 'running') { statusIcon = '\\u27F3'; statusText = 'running...'; }
            else if (msg.status === 'complete') { statusIcon = '\\u2713'; statusText = isDelegateCard ? __i18n.agentStatusCompleted : 'completed'; }
            else if (msg.status === 'error') { statusIcon = '\\u2717'; statusText = isDelegateCard ? __i18n.agentStatusFailed : 'error'; }
            else if (msg.status === 'awaiting_approval') { statusIcon = '\\u26A0'; statusText = __i18n.approvalAwaiting; }
            statusSpan.textContent = statusIcon + ' ' + statusText;
          }
          if (isDelegateCard) {
            tcEl.classList.remove('delegate-running');
            tcEl.classList.remove('delegate-completed');
            tcEl.classList.remove('delegate-failed');
            if (msg.status === 'running') tcEl.classList.add('delegate-running');
            else if (msg.status === 'complete') tcEl.classList.add('delegate-completed');
            else if (msg.status === 'error') tcEl.classList.add('delegate-failed');
          } else {
            var toolStatusClasses = ['running', 'complete', 'error', 'awaiting_approval', 'pending', 'unknown'];
            for (var sci = 0; sci < toolStatusClasses.length; sci++) {
              tcEl.classList.remove('tool-call-' + toolStatusClasses[sci]);
            }
            tcEl.classList.add('tool-call-' + (msg.status || 'unknown'));
          }
          if (msg.output) {
            var outputEl = tcEl.querySelector('.tool-output');
            if (!outputEl) {
              outputEl = document.createElement('div');
              outputEl.className = 'tool-output';
              tcEl.appendChild(outputEl);
            }
            outputEl.textContent = msg.output;
          }
          window.__wvMessages.smartScrollToBottom();
        }
        break;
      }

      case 'fileChangeDetected': {
        var tcEl = document.getElementById('tc-' + msg.messageId + '-' + msg.toolCallIdx);
        if (tcEl && msg.fileChange) {
          var existingOutput = tcEl.querySelector('.tool-output');
          if (existingOutput) existingOutput.remove();
          var existingCard = tcEl.querySelector('.file-change-card');
          if (!existingCard) {
            var card = document.createElement('div');
            card.innerHTML = window.__wvMessages.renderFileChangeCard(msg.fileChange);
            var cardEl = card.firstElementChild;
            var approvalBar = tcEl.querySelector('.approval-bar');
            if (approvalBar) {
              tcEl.insertBefore(cardEl, approvalBar);
            } else {
              tcEl.appendChild(cardEl);
            }
          }
          window.__wvMessages.smartScrollToBottom();
        }
        break;
      }

      case 'approvalRequired': {
        var summaryText = __wvEscapeHtml(msg.summary || __i18n.approvalRequired);
        var rememberLabel = '<label class="approval-remember"><input type="checkbox" data-approval-id="' + msg.approvalId + '" class="remember-check" /> Remember for this tool</label>';
        if (msg.toolCallIdx !== undefined) {
          var tcEl = document.getElementById('tc-' + msg.messageId + '-' + msg.toolCallIdx);
          if (tcEl) {
            var nameSpan = tcEl.querySelector('.tool-name');
            if (nameSpan && msg.toolName) nameSpan.textContent = '\\uD83D\\uDD27 ' + msg.toolName;
            var statusSpan = tcEl.querySelector('.tool-status');
            if (statusSpan) statusSpan.textContent = '\\u26A0 ' + __i18n.approvalAwaiting;
            var existing = tcEl.querySelector('.approval-bar');
            if (!existing) {
              var bar = document.createElement('div');
              bar.className = 'approval-bar';
              bar.innerHTML = '<div class="approval-text">\\u26A0 ' + summaryText + '</div>' + rememberLabel + '<div class="approval-buttons"><button class="btn-allow" data-approval-id="' + msg.approvalId + '" data-decision="allow">' + __i18n.allow + '</button><button class="btn-deny" data-approval-id="' + msg.approvalId + '" data-decision="deny">' + __i18n.deny + '</button></div>';
              tcEl.appendChild(bar);
              window.__wvMessages.smartScrollToBottom();
            }
          }
        } else {
          var bodyEl = document.getElementById('body-' + msg.messageId);
          if (bodyEl) {
            var existing = bodyEl.querySelector('.approval-bar');
            if (!existing) {
              var bar = document.createElement('div');
              bar.className = 'approval-bar';
              bar.innerHTML = '<div class="approval-text">\\u26A0 ' + summaryText + '</div>' + rememberLabel + '<div class="approval-buttons"><button class="btn-allow" data-approval-id="' + msg.approvalId + '" data-decision="allow">' + __i18n.allow + '</button><button class="btn-deny" data-approval-id="' + msg.approvalId + '" data-decision="deny">' + __i18n.deny + '</button></div>';
              bodyEl.appendChild(bar);
              window.__wvMessages.smartScrollToBottom();
            }
          }
        }
        setStreamingState(true, __i18n.approvalAwaiting);
        break;
      }

      case 'approvalResolved':
        document.querySelectorAll('.approval-bar').forEach(function(bar) { bar.remove(); });
        if (msg.decision === 'allow') {
          document.querySelectorAll('.tool-status').forEach(function(span) {
            if (span.textContent && span.textContent.includes(__i18n.approvalAwaiting)) {
              span.textContent = '\\u27F3 running...';
            }
          });
        } else if (msg.decision === 'deny') {
          document.querySelectorAll('.tool-status').forEach(function(span) {
            if (span.textContent && span.textContent.includes(__i18n.approvalAwaiting)) {
              span.textContent = '\\u2717 denied';
            }
          });
        }
        setStreamingState(true, __i18n.streaming);
        break;

      case 'userInputRequired': {
        var inputId = msg.inputId;
        var questions = msg.questions || [];
        var questionsHtml = '';
        for (var qi = 0; qi < questions.length; qi++) {
          var q = questions[qi];
          questionsHtml += '<div class="user-input-question">';
          questionsHtml += '<div class="user-input-header">' + __wvEscapeHtml(q.header) + '</div>';
          questionsHtml += '<div class="user-input-text">' + __wvEscapeHtml(q.question) + '</div>';
          questionsHtml += '<div class="user-input-options">';
          for (var optIdx = 0; optIdx < (q.options || []).length; optIdx++) {
            var opt = q.options[optIdx];
            questionsHtml += '<button class="btn-user-input-option" data-input-id="' + inputId + '" data-question-id="' + q.id + '" data-option-idx="' + optIdx + '" data-option-label="' + __wvEscapeHtml(opt.label) + '">' + __wvEscapeHtml(opt.label) + ': ' + __wvEscapeHtml(opt.description || '') + '</button>';
          }
          questionsHtml += '</div></div>';
        }
        setStreamingState(true, __i18n.userInputAwaiting);
        var bodyEl = document.getElementById('body-' + msg.messageId);
        if (bodyEl) {
          var bar = document.createElement('div');
          bar.className = 'user-input-bar';
          bar.id = 'user-input-' + inputId;
          bar.innerHTML = '<div class="user-input-icon">\\u2753</div><div class="user-input-content">' + questionsHtml + '</div><div class="user-input-buttons"><button class="btn-user-input-cancel" data-input-id="' + inputId + '">' + __i18n.cancel + '</button></div>';
          bodyEl.appendChild(bar);
          window.__wvMessages.smartScrollToBottom();
        }
        break;
      }

      case 'userInputResolved':
        document.querySelectorAll('.user-input-bar').forEach(function(bar) { bar.remove(); });
        if (!msg.cancelled) {
          document.querySelectorAll('.tool-status').forEach(function(span) {
            if (span.textContent && span.textContent.includes(__i18n.userInputAwaiting)) {
              span.textContent = '\\u2713 submitted';
            }
          });
        } else {
          document.querySelectorAll('.tool-status').forEach(function(span) {
            if (span.textContent && span.textContent.includes(__i18n.userInputAwaiting)) {
              span.textContent = '\\u2717 cancelled';
            }
          });
        }
        setStreamingState(true, __i18n.streaming);
        break;

      case 'messageComplete': {
        var msgBodyEl = document.getElementById('body-' + msg.messageId);
        if (msgBodyEl) {
          msgBodyEl.querySelectorAll('.content.streaming-indicator').forEach(function(el) { el.classList.remove('streaming-indicator'); });
        }
        if (msg.usage) {
          var msgEl = document.getElementById('msg-' + msg.messageId);
          if (msgEl) {
            var usageEl = document.createElement('div');
            usageEl.className = 'usage-info';
            usageEl.textContent = '\\u2191' + Number(msg.usage.input_tokens || 0).toLocaleString('en-US') + ' \\u2193' + Number(msg.usage.output_tokens || 0).toLocaleString('en-US');
            msgEl.appendChild(usageEl);
          }
        }
        if (msg.blockHtmls && msgBodyEl) {
          for (var bhi = 0; bhi < msg.blockHtmls.length; bhi++) {
            var bh = msg.blockHtmls[bhi];
            var blockEl = msgBodyEl.querySelector('[data-block-idx="' + bh.blockIdx + '"]');
            if (blockEl) {
              var contentEl = blockEl.classList.contains('content') ? blockEl : blockEl.querySelector('.content');
              var thinkingEl = blockEl.classList.contains('thinking-block') ? blockEl.querySelector('.thinking-content') : null;
              if (contentEl) contentEl.innerHTML = bh.contentHtml;
              if (thinkingEl) thinkingEl.innerHTML = bh.contentHtml;
            }
          }
        } else {
          if (msg.contentHtml && msgBodyEl) {
            msgBodyEl.querySelectorAll('.content').forEach(function(el) { el.innerHTML = msg.contentHtml; });
          }
          if (msg.thinkingHtml && msgBodyEl) {
            msgBodyEl.querySelectorAll('.thinking-content').forEach(function(el) { el.innerHTML = msg.thinkingHtml; });
          }
        }
        window.__wvMessages.setStreaming(false);
        var st = window.__wvMessages.getStreamingTimeout();
        if (st) { clearTimeout(st); window.__wvMessages.setStreamingTimeout(null); }
        hideThinkingActivity(msg.messageId);
        setStreamingState(false, msg.error ? __i18n.error : __i18n.ready);
        break;
      }

      case 'turnStarted':
        window.__wvMessages.setStreaming(true);
        setStreamingState(true, __i18n.processing);
        break;

      case 'turnState':
        var turnStateRunning = !!msg.turnInProgress;
        window.__wvMessages.setStreaming(turnStateRunning);
        setStreamingState(
          turnStateRunning,
          turnStateRunning ? __i18n.processing : __i18n.ready
        );
        break;

      case 'turnInterrupted':
        window.__wvMessages.setStreaming(false);
        var st = window.__wvMessages.getStreamingTimeout();
        if (st) { clearTimeout(st); window.__wvMessages.setStreamingTimeout(null); }
        setStreamingState(false, __i18n.ready);
        document.querySelectorAll('.thinking-activity').forEach(function(el) { el.remove(); });
        document.querySelectorAll('.approval-bar').forEach(function(bar) { bar.remove(); });
        document.querySelectorAll('.user-input-bar').forEach(function(bar) { bar.remove(); });
        break;

      case 'sessionStats': {
        sessionStats = {
          cost: msg.cost,
          cacheHitRate: msg.cacheHitRate,
          totalInputTokens: msg.totalInputTokens,
          totalOutputTokens: msg.totalOutputTokens,
        };
        renderStatusStats();
        break;
      }

      case 'status':
        setStreamingState(window.__wvMessages.isStreaming(), msg.text);
        break;

      case 'setInputText':
        if (msg.text && inputEl) {
          inputEl.value = msg.text;
          inputEl.focus();
          inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
          window.__wvInput.centerInputTextVertically();
        }
        break;

      case 'attachmentsChanged':
        window.__wvInput.setCurrentAttachments(msg.attachments || []);
        window.__wvInput.renderAttachments();
        break;

      case 'clearChat':
        renderContextUsage(false, null);
        window.__wvSidebar.closeTaskDetail();
        window.__wvSidebar.closeAgentDetail();
        // Clear shared diff store when starting a new chat.
        _diffStore.clear();
        _diffIdCounter.value = 0;
        messagesEl.innerHTML = '';
        window.__wvMessages.setStreaming(false);
        var st = window.__wvMessages.getStreamingTimeout();
        if (st) { clearTimeout(st); window.__wvMessages.setStreamingTimeout(null); }
        setStreamingState(false, __i18n.ready);
        sessionStats = null;
        renderStatusStats();
        window.__wvMessages.renderWelcome();
        // Clear sidebar Work panel state so stale data from the previous
        // session doesn't persist into the new one.
        window.__wvSidebar.setWorkState({ goal: null, checklist: [], checklistCompletionPct: 0, strategy: [], cycleCount: 0, coherenceState: 'healthy', coherenceLabel: '' });
        window.__wvSidebar.setChangesState([]);
        window.__wvSidebar.renderWork();
        window.__wvSidebar.renderChanges();
        // Clear task/agent panels too
        window.__wvSidebar.renderTasks([]);
        window.__wvSidebar.updateAgentRuns([]);
        break;

      case 'openConfigPanel':
        vscode.postMessage({ type: 'openConfigPanel' });
        break;

      case 'error':
        setStreamingState(false, __i18n.error);
        var errEl = document.createElement('div');
        errEl.className = 'error-banner';
        errEl.innerHTML = '<span class="msg-label error">' + __wvEscapeHtml(__i18n.error) + '</span><span>' + __wvEscapeHtml(msg.message) + '</span>';
        messagesEl.appendChild(errEl);
        window.__wvMessages.setUserScrolledUp(false);
        messagesEl.scrollTop = messagesEl.scrollHeight;
        window.__wvMessages.setStreaming(false);
        var st = window.__wvMessages.getStreamingTimeout();
        if (st) { clearTimeout(st); window.__wvMessages.setStreamingTimeout(null); }
        break;

      case 'info': {
        appendDismissibleSystemMessage(msg.message);
        window.__wvMessages.smartScrollToBottom();
        break;
      }

      case 'loadLastUserMessage': {
        var userMsgs = messagesEl.querySelectorAll('.message.user .message-content');
        if (userMsgs.length > 0) {
          var lastMsg = userMsgs[userMsgs.length - 1];
          inputEl.value = lastMsg.textContent || '';
          inputEl.focus();
          inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
          window.__wvInput.centerInputTextVertically();
        } else {
          appendDismissibleSystemMessage(__i18n.noPreviousMessage);
          window.__wvMessages.smartScrollToBottom();
        }
        break;
      }
    }
  });
  })();`;
}
