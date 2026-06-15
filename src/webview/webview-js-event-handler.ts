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
  var _diffStore = window.__wvDiffStore;

  var apiCapabilities = window.__wvApiCapabilities || {};
  var runtimeVersion = '';
  var sessionStats = null;

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

  // ── Tell extension we're ready ──
  vscode.postMessage({ type: 'webviewReady' });

  // ── Main message handler ──
  window.addEventListener('message', function(event) {
    var msg = event.data;
    switch (msg.type) {
      case 'ready':
        window.__wvSidebar.closeTaskDetail();
        statusTextEl.textContent = '${tr.ready} (' + (msg.model || 'deepseek-v4-pro') + ')';
        if (msg.mode) currentModeEl.textContent = msg.mode;
        if (msg.model) currentModelEl.textContent = msg.model;
        if (msg.reasoningEffort) currentReasoningEl.textContent = msg.reasoningEffort;
        runtimeVersion = msg.runtimeVersion || runtimeVersion || '';
        renderStatusStats();
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
        window.__wvSidebar.setActiveThreadId(msg.threadId || msg.thread?.id || null);
        window.__wvSidebar.renderThreads();
        break;

      case 'taskList':
        window.__wvSidebar.renderTasks(msg.tasks || []);
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
        window.__wvSidebar.renderWork();
        break;

      case 'taskDetail':
        window.__wvSidebar.showTaskDetail(msg.task);
        break;

      case 'loadHistory':
        window.__wvSidebar.closeTaskDetail();
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
              window.__wvMessages.setStreaming(false);
              statusTextEl.textContent = __i18n.readyTimedOut;
            }
          }, 300000));
          statusTextEl.textContent = __i18n.thinking;
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
        statusTextEl.textContent = __i18n.streaming;
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
        statusTextEl.textContent = __i18n.thinking;
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
        break;
      }

      case 'updateToolCall': {
        var tcEl = document.getElementById('tc-' + msg.messageId + '-' + msg.toolCallIdx);
        if (tcEl) {
          var statusSpan = tcEl.querySelector('.tool-status');
          if (statusSpan) {
            var statusIcon = '';
            var statusText = msg.status;
            if (msg.status === 'running') { statusIcon = '\\u27F3'; statusText = 'running...'; }
            else if (msg.status === 'complete') { statusIcon = '\\u2713'; statusText = 'completed'; }
            else if (msg.status === 'error') { statusIcon = '\\u2717'; statusText = 'error'; }
            else if (msg.status === 'awaiting_approval') { statusIcon = '\\u26A0'; statusText = __i18n.approvalAwaiting; }
            statusSpan.textContent = statusIcon + ' ' + statusText;
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
        statusTextEl.textContent = __i18n.approvalAwaiting;
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
        statusTextEl.textContent = __i18n.streaming;
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
        if (statusTextEl) statusTextEl.textContent = __i18n.userInputAwaiting;
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
        statusTextEl.textContent = __i18n.streaming;
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
            usageEl.textContent = '\\u2191' + (msg.usage.input_tokens || 0) + ' \\u2193' + (msg.usage.output_tokens || 0);
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
        statusTextEl.textContent = msg.error ? __i18n.error : __i18n.ready;
        break;
      }

      case 'turnStarted':
        statusTextEl.textContent = __i18n.processing;
        break;

      case 'turnInterrupted':
        window.__wvMessages.setStreaming(false);
        var st = window.__wvMessages.getStreamingTimeout();
        if (st) { clearTimeout(st); window.__wvMessages.setStreamingTimeout(null); }
        statusTextEl.textContent = __i18n.ready;
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
        statusTextEl.textContent = msg.text;
        break;

      case 'setInputText':
        if (msg.text && inputEl) {
          inputEl.value = msg.text;
          inputEl.focus();
          inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
        }
        break;

      case 'attachmentsChanged':
        window.__wvInput.setCurrentAttachments(msg.attachments || []);
        window.__wvInput.renderAttachments();
        break;

      case 'clearChat':
        window.__wvSidebar.closeTaskDetail();
        messagesEl.innerHTML = '';
        window.__wvMessages.setStreaming(false);
        var st = window.__wvMessages.getStreamingTimeout();
        if (st) { clearTimeout(st); window.__wvMessages.setStreamingTimeout(null); }
        statusTextEl.textContent = __i18n.ready;
        sessionStats = null;
        renderStatusStats();
        window.__wvMessages.renderWelcome();
        break;

      case 'error':
        statusTextEl.textContent = __i18n.error;
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
        var infoEl = document.createElement('div');
        infoEl.className = 'system-message';
        infoEl.innerHTML = '<span class="msg-label note">' + __wvEscapeHtml(__i18n.note) + '</span><span class="msg-body">' + __wvEscapeHtml(msg.message) + '</span>';
        messagesEl.appendChild(infoEl);
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
        } else {
          var infoEl = document.createElement('div');
          infoEl.className = 'system-message';
          infoEl.innerHTML = '<span class="msg-label note">' + __wvEscapeHtml(__i18n.note) + '</span><span class="msg-body">' + __wvEscapeHtml(__i18n.noPreviousMessage) + '</span>';
          messagesEl.appendChild(infoEl);
          window.__wvMessages.smartScrollToBottom();
        }
        break;
      }
    }
  });
  })();`;
}
