import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { SlashCommandHandler, type SlashCommandContext } from "./commands/slash-command-handler";
import {
  CodeWhaleApiClient,
  CodeWhaleEngine,
  RuntimeApiCapabilities,
  RuntimeEvent,
  ThreadRecord,
  TurnRecord,
  TurnItemRecord,
} from "./types";
import { formatError, getErrorMessage } from "./utils/error-handler";
import { getWebviewHtml } from "./webview/webview-html";
import { renderMarkdown } from "./utils/markdown";
import { finalizeAssistantMessage } from "./utils/event-helpers";
import { calculateTurnCost, formatCostAmount } from "./utils/cost-calculator";
import {
  parseDiffStats,
  extractDiffFromOutput,
  extractFilePathFromDiff,
  parseDiffToSides,
  stripTurnMeta,
} from "./utils/diff-utils";
import { t, webviewTranslations } from "./i18n";
import {
  SessionStateStore,
  type ChatMessage,
  type ContentBlock,
  type ToolCallInfo,
  type FileChangeInfo,
} from "./utils/session-state";
import {
  friendlyToolName,
  isFileChangeTool,
  extractFilePath,
  extractToolNameFromSummary,
  buildApprovalSummary,
} from "./utils/tool-utils";

/** Normalize file path for dedup comparison: backslashes to forward, strip trailing slashes. */
function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '');
}

export class ChatProvider implements vscode.WebviewViewProvider, SlashCommandContext {
  public static readonly viewType = "brotherwhale.chat";

  private view?: vscode.WebviewView;
  public readonly api: CodeWhaleApiClient;
  public readonly engine: CodeWhaleEngine;
  private sessionState = new SessionStateStore();
  private slashHandler: SlashCommandHandler;
  private eventController: AbortController | null = null;
  private taskRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private _disposables: vscode.Disposable[] = [];
  private currentAttachments: Array<{ kind: string; path: string; name: string }> = [];
  private showAllWorkspaces: boolean = false;
  private runtimeVersion: string | null = null;
  private apiCapabilities: RuntimeApiCapabilities = {
    saveSession: false,
    threadUndo: false,
    threadPatchUndo: false,
    threadRetry: false,
    snapshotList: false,
    snapshotRestore: false,
  };

  // Convenience accessors for session state
  public get currentThread(): ThreadRecord | null { return this.sessionState.data.currentThread; }
  public set currentThread(v: ThreadRecord | null) { this.sessionState.data.currentThread = v; }
  private get viewingSessionId(): string | null { return this.sessionState.data.viewingSessionId; }
  private set viewingSessionId(v: string | null) { this.sessionState.data.viewingSessionId = v; }
  public get messages(): ChatMessage[] { return this.sessionState.data.messages; }
  public set messages(v: ChatMessage[]) { this.sessionState.data.messages = v; }
  private get lastEventSeq(): number { return this.sessionState.data.lastEventSeq; }
  private set lastEventSeq(v: number) { this.sessionState.data.lastEventSeq = v; }
  private get currentTurnId(): string | null { return this.sessionState.data.currentTurnId; }
  private set currentTurnId(v: string | null) { this.sessionState.data.currentTurnId = v; }
  private get pendingApprovals(): Map<string, ToolCallInfo> { return this.sessionState.data.pendingApprovals; }
  private get pendingUserInputs() { return this.sessionState.data.pendingUserInputs; }
  private get activeItems() { return this.sessionState.data.activeItems; }
  private get currentTextBlockIdx(): number { return this.sessionState.data.currentTextBlockIdx; }
  private set currentTextBlockIdx(v: number) { this.sessionState.data.currentTextBlockIdx = v; }
  private get currentThinkingBlockIdx(): number { return this.sessionState.data.currentThinkingBlockIdx; }
  private set currentThinkingBlockIdx(v: number) { this.sessionState.data.currentThinkingBlockIdx = v; }
  private get cycleCount(): number { return this.sessionState.data.cycleCount; }
  private set cycleCount(v: number) { this.sessionState.data.cycleCount = v; }
  private get checklistItems() { return this.sessionState.data.checklistItems; }
  private set checklistItems(v: { id: string; content: string; status: string }[]) { this.sessionState.data.checklistItems = v; }
  private get checklistCompletionPct(): number { return this.sessionState.data.checklistCompletionPct; }
  private set checklistCompletionPct(v: number) { this.sessionState.data.checklistCompletionPct = v; }
  private get coherenceState(): string { return this.sessionState.data.coherenceState; }
  private set coherenceState(v: string) { this.sessionState.data.coherenceState = v; }
  private get coherenceLabel(): string { return this.sessionState.data.coherenceLabel; }
  private set coherenceLabel(v: string) { this.sessionState.data.coherenceLabel = v; }
  private get turnFileChanges(): FileChangeInfo[] { return this.sessionState.data.turnFileChanges; }
  private set turnFileChanges(v: FileChangeInfo[]) { this.sessionState.data.turnFileChanges = v; }
  public get sessionCostUsd(): number { return this.sessionState.data.stats.sessionCostUsd; }
  public set sessionCostUsd(v: number) { this.sessionState.data.stats.sessionCostUsd = v; }
  public get sessionCostCny(): number { return this.sessionState.data.stats.sessionCostCny; }
  public set sessionCostCny(v: number) { this.sessionState.data.stats.sessionCostCny = v; }
  public get lastCacheHitTokens(): number { return this.sessionState.data.stats.lastCacheHitTokens; }
  public set lastCacheHitTokens(v: number) { this.sessionState.data.stats.lastCacheHitTokens = v; }
  public get lastCacheMissTokens(): number { return this.sessionState.data.stats.lastCacheMissTokens; }
  public set lastCacheMissTokens(v: number) { this.sessionState.data.stats.lastCacheMissTokens = v; }
  public get lastInputTokens(): number { return this.sessionState.data.stats.lastInputTokens; }
  public set lastInputTokens(v: number) { this.sessionState.data.stats.lastInputTokens = v; }
  public get lastOutputTokens(): number { return this.sessionState.data.stats.lastOutputTokens; }
  public set lastOutputTokens(v: number) { this.sessionState.data.stats.lastOutputTokens = v; }
  public get totalInputTokens(): number { return this.sessionState.data.stats.totalInputTokens; }
  public set totalInputTokens(v: number) { this.sessionState.data.stats.totalInputTokens = v; }
  public get totalOutputTokens(): number { return this.sessionState.data.stats.totalOutputTokens; }
  public set totalOutputTokens(v: number) { this.sessionState.data.stats.totalOutputTokens = v; }

  constructor(
    private readonly extensionUri: vscode.Uri,
    engine: CodeWhaleEngine,
    api: CodeWhaleApiClient
  ) {
    this.engine = engine;
    this.api = api;
    this.api.bindEngine(engine);
    this.slashHandler = new SlashCommandHandler(this);
  }

  private debugLog(msg: string): void {
    try {
      const logDir = path.join(os.homedir(), ".codewhale-vscode-logs");
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
      fs.appendFileSync(path.join(logDir, "debug.log"), `${new Date().toISOString()} ${msg}\n`);
    } catch { /* ignore */ }
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext
  ): void {
    this.debugLog("resolveWebviewView called");
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    const html = getWebviewHtml(webviewView.webview, this.extensionUri, webviewTranslations(t()));
    this.debugLog("webview HTML set, length=" + html.length);
    webviewView.webview.html = html;

    webviewView.webview.onDidReceiveMessage(
      async (msg) => {
        try {
          this.debugLog(`onDidReceiveMessage: ${msg.type}`);
          await this.handleWebviewMessage(msg);
        } catch (err) {
          this.debugLog(`onDidReceiveMessage error: ${getErrorMessage(err)}`);
          this.postMessage({ type: "error", message: formatError("Internal error", err) });
        }
      },
      null,
      this._disposables
    );

    webviewView.onDidDispose(() => this.cleanup());

    this.initializeThread().catch((err) => {
      this.debugLog(`initializeThread FAILED: ${getErrorMessage(err)}`);
      this.postMessage({ type: "error", message: formatError("Initialization failed", err) });
      this.postMessage({ type: "status", text: "Failed to connect to engine" });
    });
  }

  // ── WebView messages ──

  private async handleWebviewMessage(msg: Record<string, unknown>): Promise<void> {
    switch (msg.type as string) {
      case "debugUiProbe":
        this.debugLog(`debugUiProbe: ${JSON.stringify(msg.payload ?? {})}`);
        break;
      case "sendMessage":
        await this.handleSendMessage(msg.text as string);
        break;
      case "slashCommand":
        await this.handleSlashCommand(
          msg.command as string,
          msg.args as string
        );
        break;
      case "newThread":
        await this.handleNewThread();
        break;
      case "interrupt":
        await this.handleInterrupt();
        break;
      case "compact":
        await this.handleCompact();
        break;
      case "approvalDecision":
        await this.handleApprovalDecision(
          msg.approvalId as string,
          msg.decision as "allow" | "deny",
          !!msg.remember
        );
        break;
      case "userInputSelect":
        await this.handleUserInputSelect(
          msg.inputId as string,
          msg.questionId as string,
          msg.optionIdx as number,
          msg.optionLabel as string
        );
        break;
      case "userInputCancel":
        await this.handleUserInputCancel(msg.inputId as string);
        break;
      case "loadSession":
        await this.loadSessionMessages(msg.sessionId as string);
        break;
      case "loadThread":
        await this.loadThread(msg.threadId as string);
        break;
      case "toggleAllWorkspaces":
        this.showAllWorkspaces = !this.showAllWorkspaces;
        await this.refreshSessionList();
        await this.refreshThreadList();
        break;
      case "webviewReady":
        try {
          await this.api.ensureReady();
          await this.syncWebviewState();
        } catch (err) {
          this.postMessage({
            type: "error",
            message: formatError("Failed to initialize", err),
          });
        }
        break;
      case "refreshSidebar":
        if (this.engine.isRunning) {
          this.api.syncFromEngine();
          this.refreshSessionList();
          this.refreshThreadList();
          this.refreshTaskList();
          this.refreshWorkPanel();
        }
        break;
      case "openDiff":
        this.handleOpenDiff(msg.filePath as string, msg.diff as string | undefined);
        break;
      case "openFile":
        this.handleOpenFile(msg.filePath as string);
        break;
      case "attachFile":
        await this.handleAttachFile();
        break;
      case "removeAttachment":
        this.handleRemoveAttachment(msg.index as number);
        break;
      case "undoLastTurn":
        await this.handleUndoLastTurn();
        break;
      case "retryLastTurn":
        await this.handleRetryLastTurn();
        break;
      case "revertFileChange":
        await this.handleRevertFileChange(
          msg.filePath as string,
          msg.changeType as string,
          msg.diff as string | undefined
        );
        break;
    }
  }

  private async syncWebviewState(): Promise<void> {
    await this.refreshRuntimeVersion();
    await this.refreshApiCapabilities();
    this.refreshSessionList();
    this.refreshThreadList();
    this.refreshTaskList();
    this.refreshWorkPanel();

    if (this.currentThread?.id) {
      await this.loadHistory(this.currentThread.id);
      this.subscribeToEvents();
    } else if (this.messages.length > 0) {
      this.postMessage({ type: "loadHistory", messages: this.messages });
    } else {
      this.postMessage({ type: "clearChat" });
    }

    this.postMessage({
      type: "ready",
      model: this.getCurrentModel(),
      mode: this.getCurrentMode(),
      reasoningEffort: this.getCurrentReasoningEffort(),
      runtimeVersion: this.runtimeVersion,
    });
  }

  // ── Initialization ──

  private async initializeThread(): Promise<void> {
    this.debugLog("initializeThread START");
    try {
      this.debugLog("calling api.ensureReady()...");
      await this.api.ensureReady();
      this.debugLog(`engine running on ${this.engine.baseUrl}`);
      await this.refreshRuntimeVersion();
      await this.refreshApiCapabilities();

      this.debugLog("calling listThreads...");
      const threads = await this.api.listThreads({ limit: 20 });
      this.debugLog(`listThreads returned ${threads.length} threads`);
      await this.refreshSessionList();

      const threadWithContent = threads.find(t => t.latest_turn_id !== null);
      
      if (threadWithContent) {
        this.currentThread = threadWithContent;
        await this.loadHistory();
        this.subscribeToEvents();
      } else if (threads.length > 0) {
        this.currentThread = threads[0];
        this.postMessage({ type: "clearChat" });
        this.postMessage({ 
          type: "status", 
          text: "Ready - Start a new conversation" 
        });
      } else {
        this.postMessage({ type: "clearChat" });
        this.postMessage({ type: "status", text: "Ready - No threads yet" });
      }

      this.debugLog("initializeThread SUCCESS, posting ready");
      this.postMessage({ 
        type: "ready", 
        model: this.getCurrentModel(),
        mode: this.getCurrentMode(),
        reasoningEffort: this.getCurrentReasoningEffort(),
        runtimeVersion: this.runtimeVersion,
      });
    } catch (err) {
      this.debugLog(`initializeThread ERROR: ${getErrorMessage(err)}\n${(err as Error).stack}`);
      this.postMessage({
        type: "error",
        message: formatError("Failed to initialize", err),
      });
      this.postMessage({
        type: "ready",
        model: this.getCurrentModel(),
        mode: this.getCurrentMode(),
        reasoningEffort: this.getCurrentReasoningEffort(),
        runtimeVersion: this.runtimeVersion,
      });
    }
  }

  private async loadHistory(threadId?: string): Promise<number> {
    const id = threadId ?? this.currentThread?.id;
    if (!id) return 0;
    try {
      const detail = await this.api.getThreadDetail(id);
      this.messages = [];
      this.turnFileChanges = [];
      this.lastEventSeq = detail.latest_seq ?? 0;
      const itemById = new Map(detail.items.map((item) => [item.id, item]));

      for (const turn of detail.turns) {
        // user message from turn input
        const userMsg: ChatMessage = {
          id: `user-${turn.id}`,
          role: "user",
          content: turn.input_summary.slice(0, 280),
          status: "complete",
          timestamp: new Date(turn.created_at).getTime(),
        };
        this.messages.push(userMsg);

        // collect assistant content from items
        let content = "";
        let thinking = "";
        const toolCalls: ToolCallInfo[] = [];
        const blocks: ContentBlock[] = [];
        let currentTextBlock: ContentBlock | undefined;
        let currentThinkingBlock: ContentBlock | undefined;

        const turnItems = (turn.item_ids || [])
          .map((itemId) => itemById.get(itemId))
          .filter((item): item is TurnItemRecord => !!item);

        for (const item of turnItems) {
          switch (item.kind) {
            case "agent_message": {
              const text = item.detail || item.summary;
              if (!text) break;
              if (currentTextBlock) {
                currentTextBlock.content = (currentTextBlock.content || "") + text;
              } else {
                currentTextBlock = { type: "text", content: text };
                blocks.push(currentTextBlock);
              }
              content += text;
              break;
            }
            case "agent_reasoning": {
              const th = item.detail || item.summary;
              if (!th) break;
              if (currentThinkingBlock) {
                currentThinkingBlock.content = (currentThinkingBlock.content || "") + th;
              } else {
                currentThinkingBlock = { type: "thinking", content: th };
                blocks.push(currentThinkingBlock);
              }
              thinking += th;
              break;
            }
            case "tool_call": {
              currentTextBlock = undefined;
              currentThinkingBlock = undefined;
              const tcIdx = toolCalls.length;
              const rawName = extractToolNameFromSummary(item.summary || "");
              const tc: ToolCallInfo = {
                name: rawName,
                input: (item.metadata as Record<string, unknown>) || {},
                output: item.detail || undefined,
                status: item.status === "completed" ? "complete" : "error",
              };
              if (isFileChangeTool(tc.name) && tc.input) {
                const filePath = extractFilePath(tc.name, tc.input);
                if (filePath) {
                  const output = tc.output || "";
                  const diff = extractDiffFromOutput(output);
                  const stats = diff ? parseDiffStats(diff) : { added: 0, removed: 0 };
                  const changeType: "created" | "modified" | "deleted" =
                    tc.name === "delete_file" ? "deleted" :
                    tc.name === "write_file" && !diff ? "created" : "modified";
                  tc.fileChange = {
                    filePath,
                    changeType,
                    addedLines: stats.added,
                    removedLines: stats.removed,
                    diff,
                    toolName: tc.name,
                  };
                }
              }
              toolCalls.push(tc);
              blocks.push({ type: "tool_call", toolCallIdx: tcIdx });
              break;
            }
            case "file_change": {
              currentTextBlock = undefined;
              currentThinkingBlock = undefined;
              const tcIdx2 = toolCalls.length;
              const fcOutput = item.detail || "";
              const fcDiff = extractDiffFromOutput(fcOutput);
              const fcStats = fcDiff ? parseDiffStats(fcDiff) : { added: 0, removed: 0 };
              const fcMeta = (item.metadata as Record<string, unknown>) || {};
              const fcToolName = extractToolNameFromSummary(item.summary || "");
              let fcFilePath = fcDiff ? extractFilePathFromDiff(fcDiff) : "";
              if (!fcFilePath && fcMeta.file_path) fcFilePath = fcMeta.file_path as string;
              if (!fcFilePath && fcMeta.path) fcFilePath = fcMeta.path as string;
              const fcChangeType = (fcMeta.change_type as "created" | "modified" | "deleted") ||
                (fcToolName === "delete_file" ? "deleted" :
                 fcToolName === "write_file" && !fcDiff ? "created" : "modified");
              const fcTc: ToolCallInfo = {
                name: fcToolName || "file_change",
                displayName: friendlyToolName(fcToolName || "file_change"),
                input: fcMeta,
                output: fcOutput,
                status: item.status === "completed" ? "complete" : "error",
                fileChange: fcFilePath ? {
                  filePath: fcFilePath,
                  changeType: fcChangeType,
                  addedLines: fcStats.added,
                  removedLines: fcStats.removed,
                  diff: fcDiff,
                  toolName: fcToolName || "file_change",
                } : undefined,
              };
              toolCalls.push(fcTc);
              blocks.push({ type: "tool_call", toolCallIdx: tcIdx2 });
              break;
            }
          }
        }

        for (const b of blocks) {
          if ((b.type === "text" || b.type === "thinking") && b.content) {
            try { b.contentHtml = renderMarkdown(b.content); } catch { b.contentHtml = b.content; }
          }
        }

        const assistantMsg: ChatMessage = {
          id: `assistant-${turn.id}`,
          role: "assistant",
          content: content || turn.input_summary.slice(0, 100),
          thinking: thinking || undefined,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          blocks: blocks.length > 0 ? blocks : undefined,
          status: turn.status === "completed" ? "complete" : "error",
          timestamp: new Date(turn.ended_at || turn.created_at).getTime(),
        };
        this.messages.push(assistantMsg);

        for (const tc of toolCalls) {
          if (tc.fileChange) {
            const normPath = normalizePath(tc.fileChange.filePath);
            if (!this.turnFileChanges.some(existing => normalizePath(existing.filePath) === normPath)) {
              this.turnFileChanges.push(tc.fileChange);
            }
          }
        }
      }

      if (this.turnFileChanges.length > 0) {
        this.refreshWorkPanel();
      }

      for (const turn of detail.turns) {
        if (turn.usage) {
          const u = turn.usage;
          this.totalInputTokens += u.input_tokens;
          this.totalOutputTokens += u.output_tokens;
          this.lastCacheHitTokens = u.prompt_cache_hit_tokens ?? 0;
          this.lastCacheMissTokens = u.prompt_cache_miss_tokens ?? Math.max(0, u.input_tokens - (u.prompt_cache_hit_tokens ?? 0));
          this.lastInputTokens = u.input_tokens;
          this.lastOutputTokens = u.output_tokens;
          const model = this.currentThread?.model || this.getCurrentModel();
          const cost = calculateTurnCost(
            model, u.input_tokens, u.output_tokens,
            u.prompt_cache_hit_tokens, u.prompt_cache_miss_tokens, u.reasoning_tokens,
          );
          if (cost) {
            this.sessionCostUsd += cost.usd;
            this.sessionCostCny += cost.cny;
          }
        }
      }
      this.sendSessionStats();

      this.postMessage({ type: "loadHistory", messages: this.messages });
      this.postMessage({ type: "status", text: `Loaded ${this.messages.length / 2} turns` });
      return this.lastEventSeq;
    } catch (err) {
      this.postMessage({
        type: "error",
        message: formatError("Failed to load history", err),
      });
      return this.lastEventSeq;
    }
  }

  public async loadSessionMessages(sessionId: string): Promise<void> {
    try {
      const session = await this.api.getSession(sessionId);
      const title = session.metadata.title || "Session";

      this.cleanup();
      this.sessionState.reset();
      this.viewingSessionId = sessionId;

      const rawMessages = session.messages as Array<{
        role: string;
        content: Array<{
          type: string;
          text?: string;
          thinking?: string;
          id?: string;
          name?: string;
          input?: Record<string, unknown>;
          tool_use_id?: string;
          content?: string;
          content_blocks?: Array<{ type: string; text?: string }>;
          is_error?: boolean;
        }>;
      }>;

    const globalToolCalls: ToolCallInfo[] = [];
    const globalToolIdMap: Map<string, number> = new Map();

    let i = 0;
    while (i < rawMessages.length) {
      const msg = rawMessages[i];

      if (msg.role === "user" && msg.content.every((b) => b.type === "tool_result")) {
        for (const block of msg.content) {
          if (block.type === "tool_result" && block.tool_use_id) {
            const idx = globalToolIdMap.get(block.tool_use_id);
            if (idx !== undefined && globalToolCalls[idx]) {
              const outputText = typeof block.content === "string" ? block.content : "";
              globalToolCalls[idx].output = outputText;
              globalToolCalls[idx].status = block.is_error ? "error" : "complete";
            }
          }
        }
        i++;
        continue;
      }

      if (msg.role === "user") {
        const textBlocks: string[] = [];
        while (i < rawMessages.length && rawMessages[i].role === "user") {
          for (const block of rawMessages[i].content || []) {
            if (block.type === "text" && block.text) {
              textBlocks.push(block.text);
            }
          }
          i++;
        }

        const combined = stripTurnMeta(textBlocks.join("\n"));
        if (!combined.trim()) continue;

        this.messages.push({
          id: `user-turn-${this.messages.length}`,
          role: "user",
          content: combined,
          status: "complete" as const,
          timestamp: Date.now(),
          _realContent: true,
        } as ChatMessage & { _realContent: boolean });
      } else {
        const blocks: ContentBlock[] = [];
        const turnToolCallIndices: number[] = [];

        while (i < rawMessages.length && rawMessages[i].role !== "user") {
          for (const block of rawMessages[i].content || []) {
            if (block.type === "text" && block.text) {
              blocks.push({ type: "text", content: block.text });
            } else if (block.type === "thinking" && (block.thinking || block.text)) {
              blocks.push({ type: "thinking", content: block.thinking || block.text || "" });
            } else if ((block.type === "tool_use" || block.type === "server_tool_use") && block.id && block.name) {
              const idx = globalToolCalls.length;
              globalToolIdMap.set(block.id, idx);
              globalToolCalls.push({
                name: block.name,
                displayName: friendlyToolName(block.name),
                input: block.input || {},
                status: "pending",
                itemId: block.id,
              });
              blocks.push({ type: "tool_call", toolCallIdx: idx });
              turnToolCallIndices.push(idx);
            } else if (block.type === "tool_result" && block.tool_use_id) {
              const idx = globalToolIdMap.get(block.tool_use_id);
              if (idx !== undefined && globalToolCalls[idx]) {
                const outputText = typeof block.content === "string" ? block.content : "";
                globalToolCalls[idx].output = outputText;
                globalToolCalls[idx].status = block.is_error ? "error" : "complete";
              }
            }
          }
          i++;
        }

        while (i < rawMessages.length && rawMessages[i].role === "user"
          && rawMessages[i].content.every((b) => b.type === "tool_result")) {
          for (const block of rawMessages[i].content) {
            if (block.type === "tool_result" && block.tool_use_id) {
              const idx = globalToolIdMap.get(block.tool_use_id);
              if (idx !== undefined && globalToolCalls[idx]) {
                const outputText = typeof block.content === "string" ? block.content : "";
                globalToolCalls[idx].output = outputText;
                globalToolCalls[idx].status = block.is_error ? "error" : "complete";
              }
            }
          }
          i++;
        }

        const finalText = blocks
          .filter((b) => b.type === "text")
          .map((b) => b.content || "")
          .join("\n")
          .trim();
        const hasThinking = blocks.some((b) => b.type === "thinking");

        const turnToolCalls = turnToolCallIndices.length > 0
          ? turnToolCallIndices.map((idx) => globalToolCalls[idx])
          : undefined;

        if (!finalText && !hasThinking && !turnToolCalls) continue;

        if (turnToolCallIndices.length > 0) {
          const globalToLocal = new Map<number, number>();
          turnToolCallIndices.forEach((gIdx, lIdx) => globalToLocal.set(gIdx, lIdx));
          for (const b of blocks) {
            if (b.type === "tool_call" && b.toolCallIdx !== undefined) {
              b.toolCallIdx = globalToLocal.get(b.toolCallIdx) ?? b.toolCallIdx;
            }
          }
        }

        this.messages.push({
          id: `assistant-turn-${this.messages.length}`,
          role: "assistant",
          content: finalText,
          toolCalls: turnToolCalls,
          blocks: blocks.length > 0 ? blocks : undefined,
          status: "complete" as const,
          timestamp: Date.now(),
          _realContent: true,
        } as ChatMessage & { _realContent: boolean });
      }
    }

    const msgCount = this.messages.length;
    const costUsd = session.metadata.cost?.session_cost_usd ?? 0;
    const costStr = costUsd > 0 ? ` | $${costUsd.toFixed(2)}` : "";
    const modelStr = session.metadata.model ? ` | ${session.metadata.model}` : "";

    this.postMessage({ type: "loadHistory", messages: this.messages, compactMode: true });
    this.postMessage({
      type: "status",
      text: `Viewing: ${title.slice(0, 50)}${msgCount ? ` (${msgCount} msgs${costStr}${modelStr})` : ""}`
    });
    this.postMessage({
      type: "info",
      message: `Viewing session: ${title.slice(0, 80)}\n${msgCount} messages | ${session.metadata.total_tokens.toLocaleString()} tokens${costStr}${modelStr}\n\nStart typing to resume this session and continue the conversation.`
    });
    this.postMessage({ type: "sessionLoaded", sessionId: session.metadata.id });
    } catch (err) {
      const errorMsg = getErrorMessage(err);
      this.debugLog(`loadSessionMessages error: ${errorMsg}`);

      // Provide user-friendly error messages for common errors
      if (errorMsg.includes("404") || errorMsg.includes("not found")) {
        this.postMessage({
          type: "error",
          message: `Session not found. This session may have been deleted or is from a different workspace.\n\nSession ID: ${sessionId.slice(0, 8)}...`,
        });
        // Refresh session list to show current state
        this.refreshSessionList();
      } else if (errorMsg.includes("500") || errorMsg.includes("internal")) {
        this.postMessage({
          type: "error",
          message: `Server error while loading session. Please try again later.`,
        });
      } else {
        this.postMessage({
          type: "error",
          message: formatError("Failed to load session", err),
        });
      }

      // Reset state on error
      this.cleanup();
      this.postMessage({ type: "clearChat" });
    }
  }

  private async loadThread(threadId: string): Promise<void> {
    this.cleanup();
    this.sessionState.reset();

    try {
      this.currentThread = await this.api.getThread(threadId);

      // If the thread's workspace doesn't match the current workspace,
      // update it so the engine operates on the current workspace's files
      // and events flow correctly through the current engine.
      const currentWorkspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (currentWorkspace && this.currentThread.workspace !== currentWorkspace) {
        const oldWorkspace = this.currentThread.workspace;
        try {
          this.currentThread = await this.api.updateThread(threadId, {
            workspace: currentWorkspace,
          });
          this.postMessage({
            type: "info",
            message: `Thread workspace updated: ${oldWorkspace} → ${currentWorkspace}`,
          });
        } catch {
          // Non-critical: the turn may still work with the old workspace
          this.postMessage({
            type: "info",
            message: `Thread workspace (${oldWorkspace}) differs from current (${currentWorkspace}). Continuing may redirect output to the original workspace.`,
          });
        }
      }

      await this.loadHistory(threadId);
      this.subscribeToEvents();
      this.postMessage({
        type: "threadLoaded",
        thread: this.currentThread,
        messages: this.messages,
      });
      this.postMessage({
        type: "status",
        text: `Thread ${threadId.slice(0, 12)}: ${this.messages.length} messages`,
      });
    } catch (err) {
      this.postMessage({
        type: "error",
        message: formatError("Failed to load thread", err),
      });
    }
  }

  // ── User actions ──

  private static readonly MEDIA_EXTENSIONS: Record<string, string> = {
    ".png": "image", ".jpg": "image", ".jpeg": "image",
    ".gif": "image", ".webp": "image", ".bmp": "image",
    ".tif": "image", ".tiff": "image", ".ppm": "image",
    ".mp4": "video", ".mov": "video", ".m4v": "video",
    ".webm": "video", ".avi": "video", ".mkv": "video",
  };

  public async handleAttachFile(): Promise<void> {
    try {
      const uris = await vscode.window.showOpenDialog({
        canSelectMany: true,
        canSelectFiles: true,
        canSelectFolders: false,
        openLabel: t().attachFiles,
        title: t().attachFiles,
      });
      if (!uris || uris.length === 0) return;

      for (const uri of uris) {
        const ext = path.extname(uri.fsPath).toLowerCase();
        const kind = ChatProvider.MEDIA_EXTENSIONS[ext];
        if (kind) {
          this.currentAttachments.push({
            kind,
            path: uri.fsPath,
            name: path.basename(uri.fsPath),
          });
        } else {
          this.currentAttachments.push({
            kind: "file",
            path: uri.fsPath,
            name: path.basename(uri.fsPath),
          });
        }
      }

      this.postMessage({
        type: "attachmentsChanged",
        attachments: this.currentAttachments,
      });
    } catch (err) {
      this.postMessage({
        type: "error",
        message: formatError("Failed to attach file", err),
      });
    }
  }

  private handleRemoveAttachment(index: number): void {
    if (index >= 0 && index < this.currentAttachments.length) {
      this.currentAttachments.splice(index, 1);
      this.postMessage({
        type: "attachmentsChanged",
        attachments: this.currentAttachments,
      });
    }
  }

  private async handleSendMessage(text: string): Promise<void> {
    if (!text.trim() && this.currentAttachments.length === 0) return;

    const attachments = [...this.currentAttachments];
    this.currentAttachments = [];
    this.postMessage({ type: "attachmentsChanged", attachments: [] });

    let fullText = text;
    if (attachments.length > 0) {
      const attachmentLines = attachments.map((a) => {
        if (a.kind === "file") {
          return `@${a.path}`;
        }
        return `[Attached ${a.kind}: ${a.path}]`;
      });
      if (fullText.trim()) {
        fullText = fullText.trimEnd() + "\n" + attachmentLines.join("\n");
      } else {
        fullText = attachmentLines.join("\n");
      }
    }

    try {
      await this.api.ensureReady();

      if (this.viewingSessionId) {
        const sessionId = this.viewingSessionId;
        const cfg = vscode.workspace.getConfiguration("brotherwhale");
        const result = await this.api.resumeSessionThread(sessionId, {
          model: cfg.get<string>("defaultModel", "deepseek-v4-pro"),
          mode: cfg.get<string>("defaultMode", "agent"),
        });
        try {
          await this.api.updateThread(result.thread_id, {
            title: `Resumed: ${result.summary.slice(0, 50)}`,
          });
        } catch { /* non-critical */ }

        this.viewingSessionId = null;
        await this.loadThread(result.thread_id);
        this.refreshSessionList();
      }

      if (!this.currentThread) {
        const cfg = vscode.workspace.getConfiguration("brotherwhale");
        const model = cfg.get<string>("defaultModel", "deepseek-v4-pro");
        const mode = cfg.get<string>("defaultMode", "agent");
        const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const isYolo = mode === "yolo";
        const autoApprove = isYolo || cfg.get<boolean>("autoApprove", false);
        this.currentThread = await this.api.createThread({
          model,
          mode,
          workspace,
          auto_approve: autoApprove,
          trust_mode: isYolo,
        });
        this.subscribeToEvents();
        this.refreshSessionList();
      }

      this.activeItems.clear();
      this.currentTextBlockIdx = -1;
      this.currentThinkingBlockIdx = -1;
      this.turnFileChanges = [];

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: fullText,
        status: "complete",
        timestamp: Date.now(),
      };
      this.messages.push(userMsg);
      this.postMessage({ type: "addMessage", message: userMsg });

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: "",
        status: "streaming",
        timestamp: Date.now(),
        toolCalls: [],
        blocks: [],
      };
      this.messages.push(assistantMsg);
      this.postMessage({ type: "addMessage", message: assistantMsg });

      // Verify current thread is still valid (may have been deleted)
      let threadOk = true;
      try { await this.api.getThread(this.currentThread.id); } catch { threadOk = false; }
      if (!threadOk) {
        const cfg = vscode.workspace.getConfiguration("brotherwhale");
        const mode = cfg.get<string>("defaultMode", "agent");
        const autoApprove = cfg.get<boolean>("autoApprove", false);
        this.currentThread = await this.api.createThread({
          model: this.getCurrentModel(),
          mode,
          workspace: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
          auto_approve: autoApprove,
          trust_mode: mode === "yolo",
        });
        this.subscribeToEvents();
        this.refreshSessionList();
      }

      // Ensure thread workspace matches current workspace before starting turn
      const currentWorkspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (currentWorkspace && this.currentThread.workspace !== currentWorkspace) {
        try {
          this.currentThread = await this.api.updateThread(this.currentThread.id, {
            workspace: currentWorkspace,
          });
        } catch { /* non-critical */ }
      }

      const cfg = vscode.workspace.getConfiguration("brotherwhale");
      const reasoningEffort = cfg.get<string>("reasoningEffort", "auto");
      const mode = cfg.get<string>("defaultMode", "agent");
      const model = this.getCurrentModel();
      const isYolo = mode === "yolo";
      const autoApprove = isYolo || cfg.get<boolean>("autoApprove", false);
      const result = await this.api.startTurn(this.currentThread.id, fullText, {
        mode,
        model,
        reasoning_effort: reasoningEffort,
        auto_approve: autoApprove,
        trust_mode: isYolo,
      });
      this.currentTurnId = result.turn.id;
      this.postMessage({ type: "turnStarted", turnId: result.turn.id });
    } catch (err) {
      this.postMessage({
        type: "error",
        message: formatError("Failed to send message", err),
      });
    }
  }

  private async handleNewThread(): Promise<void> {
    this.cleanup();
    this.sessionState.reset();
    this.postMessage({ type: "clearChat" });
  }

  /** Refresh the session list shown in the sidebar */
  public async refreshSessionList(): Promise<void> {
    const fetchAndSend = async () => {
      const result = await this.api.listSessions({ limit: 100 });
      let sessions = result.sessions || [];
      const currentWorkspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!this.showAllWorkspaces && currentWorkspace) {
        sessions = sessions.filter(s => s.workspace === currentWorkspace);
      }
      // Defensive: the backend can return the same session id multiple times
      // (e.g. when both TUI auto-save and an explicit /save fire for the same
      // thread). When duplicates collide, keep the record with the most recent
      // updated_at so the sidebar shows the latest snapshot, not a stale one.
      const latestById = new Map<string, typeof sessions[number]>();
      for (const s of sessions) {
        if (!s || !s.id) continue;
        const prev = latestById.get(s.id);
        if (!prev || (s.updated_at && (!prev.updated_at || s.updated_at > prev.updated_at))) {
          latestById.set(s.id, s);
        }
      }
      const deduped = Array.from(latestById.values());
      this.postMessage({ type: "sessionList", sessions: deduped, showAllWorkspaces: this.showAllWorkspaces });
    };
    try {
      await fetchAndSend();
    } catch (err) {
      setTimeout(async () => {
        try { await fetchAndSend(); } catch { /* silent */ }
      }, 2000);
    }
  }

  /** Refresh the thread list shown in the sidebar (legacy threads) */
  private async refreshThreadList(): Promise<void> {
    try {
      const threads = await this.api.listThreadsSummary({ limit: 100 });
      this.postMessage({ type: "threadList", threads, showAllWorkspaces: this.showAllWorkspaces });
    } catch {
      // best-effort, silent fail
    }
  }

  /** Refresh the task list shown in the sidebar */
  public async refreshTaskList(): Promise<void> {
    try {
      const result = await this.api.listTasks({ limit: 50 });
      this.postMessage({ type: "taskList", tasks: result.tasks });
    } catch {
      // best-effort
    }
  }

  /** Push the current work state to the webview Work panel */
  public refreshWorkPanel(): void {
    const cfg = vscode.workspace.getConfiguration("brotherwhale");
    const goal = cfg.get<string | undefined>("goalObjective") || null;
    this.postMessage({
      type: "workState",
      goal,
      checklist: this.checklistItems,
      checklistCompletionPct: this.checklistCompletionPct,
      strategy: [],
      cycleCount: this.cycleCount,
      coherenceState: this.coherenceState,
      coherenceLabel: this.coherenceLabel,
    });
    this.refreshChangesPanel();
  }

  /** Push file changes to the webview Changes panel */
  private refreshChangesPanel(): void {
    this.postMessage({
      type: "changesState",
      changes: this.turnFileChanges.map(fc => ({
        filePath: fc.filePath,
        changeType: fc.changeType,
        addedLines: fc.addedLines,
        removedLines: fc.removedLines,
        diff: fc.diff,
        toolName: fc.toolName,
      })),
    });
  }

  private getWebviewCapabilities(): {
    saveSession: boolean;
    undoLastTurn: boolean;
    retryLastTurn: boolean;
    revertFileChange: boolean;
  } {
    return {
      saveSession: this.apiCapabilities.saveSession,
      undoLastTurn: this.apiCapabilities.threadPatchUndo,
      retryLastTurn: this.apiCapabilities.threadRetry,
      revertFileChange:
        this.apiCapabilities.snapshotList && this.apiCapabilities.snapshotRestore,
    };
  }

  private postApiCapabilities(): void {
    this.postMessage({
      type: "apiCapabilities",
      capabilities: this.getWebviewCapabilities(),
    });
  }

  private async refreshApiCapabilities(): Promise<void> {
    try {
      this.apiCapabilities = await this.api.probeRuntimeCapabilities();
    } catch {
      this.apiCapabilities = {
        saveSession: false,
        threadUndo: false,
        threadPatchUndo: false,
        threadRetry: false,
        snapshotList: false,
        snapshotRestore: false,
      };
    }
    this.postApiCapabilities();
  }

  private async refreshRuntimeVersion(): Promise<void> {
    try {
      const info = await this.api.getRuntimeInfo();
      this.runtimeVersion = info.version || null;
    } catch {
      this.runtimeVersion = null;
    }
  }

  private startPeriodicTaskRefresh(): void {
    this.stopPeriodicTaskRefresh();
    this.taskRefreshTimer = setInterval(() => {
      this.refreshTaskList();
    }, 2500);
  }

  private stopPeriodicTaskRefresh(): void {
    if (this.taskRefreshTimer) {
      clearInterval(this.taskRefreshTimer);
      this.taskRefreshTimer = null;
    }
  }

  public async handleInterrupt(): Promise<void> {
    if (this.currentThread) {
      try {
        await this.api.ensureReady();

        if (this.currentTurnId) {
          try {
            await this.api.interruptTurn(this.currentThread.id, this.currentTurnId);
          } catch {
            // ignore - turn may already be completed
          }
        }

        this.currentTurnId = null;
        this.postMessage({ type: "turnInterrupted" });
      } catch {
        // ignore
      }
    }
  }

  /**
   * Undo the last turn, fully aligned with TUI's `/undo` command:
   * 1. Try snapshot-based file rollback (patch_undo)
   * 2. Remove the last conversation turn (fork_at_user_message)
   * 3. Save the updated session
   */
  public async handleUndoLastTurn(): Promise<void> {
    if (!this.apiCapabilities.threadPatchUndo) {
      this.postMessage({ type: "info", message: t().undoNotSupported });
      return;
    }

    // If viewing a session (not a live thread), resume it first.
    if (this.viewingSessionId && !this.currentThread) {
      try {
        await this.api.ensureReady();
        const sessionId = this.viewingSessionId;
        const result = await this.api.resumeSessionThread(sessionId);
        this.viewingSessionId = null;
        await this.loadThread(result.thread_id);
        this.refreshSessionList();
      } catch (err) {
        this.postMessage({ type: "error", message: formatError("Failed to resume session", err) });
        return;
      }
    }

    if (!this.currentThread) {
      this.postMessage({ type: "info", message: t().undoNoTurns });
      return;
    }

    try {
      await this.api.ensureReady();

      // Use patch-undo endpoint: tries snapshot file rollback first,
      // then removes the last conversation turn — same as TUI's `/undo`.
      const result = await this.api.patchUndoThreadTurn(this.currentThread.id);

      // Show file rollback info if files were restored.
      if (result.patch_result.files_restored && result.patch_result.summary) {
        this.postMessage({ type: "info", message: result.patch_result.summary });
      }

      // Switch to the new forked thread.
      this.currentThread = result.thread;
      this.messages = [];
      this.turnFileChanges = [];
      this.currentTurnId = null;
      this.activeItems.clear();
      this.currentTextBlockIdx = -1;
      this.currentThinkingBlockIdx = -1;
      this.lastEventSeq = 0;

      // Load the forked thread's history.
      await this.loadThread(result.thread.id);

      // Put the user's message back in the input box so they can edit & re-send.
      if (result.original_user_text) {
        this.postMessage({ type: "setInputText", text: result.original_user_text });
      }

      this.postMessage({
        type: "info",
        message: t().undoSuccess(result.thread.id),
      });
      this.refreshWorkPanel();
      this.refreshSessionList();
      this.postMessage({ type: "historyUpdated" });
    } catch (err) {
      const msg = getErrorMessage(err);
      if (msg.includes("exceeds") || msg.includes("No user turn")) {
        this.postMessage({ type: "info", message: t().undoNoTurns });
      } else {
        this.postMessage({ type: "error", message: formatError("Undo failed", err) });
      }
    }
  }

  /**
   * Retry the last turn via the server-side undo + re-send API.
   * This creates a new thread with the last turn removed and immediately
   * starts a new turn with the original user message, matching TUI's
   * `retry` behavior.
   */
  public async handleRetryLastTurn(): Promise<void> {
    if (!this.apiCapabilities.threadRetry) {
      this.postMessage({ type: "info", message: t().retryNotSupported });
      return;
    }

    // If viewing a session (not a live thread), resume it first.
    if (this.viewingSessionId && !this.currentThread) {
      try {
        await this.api.ensureReady();
        const sessionId = this.viewingSessionId;
        const result = await this.api.resumeSessionThread(sessionId);
        this.viewingSessionId = null;
        await this.loadThread(result.thread_id);
        this.refreshSessionList();
      } catch (err) {
        this.postMessage({ type: "error", message: formatError("Failed to resume session", err) });
        return;
      }
    }

    if (!this.currentThread) {
      this.postMessage({ type: "info", message: t().retryNoTurns });
      return;
    }

    try {
      await this.api.ensureReady();

      const result = await this.api.retryThreadTurn(this.currentThread.id);

      // Switch to the new forked thread and subscribe to its events.
      this.currentThread = result.thread;
      this.messages = [];
      this.turnFileChanges = [];
      this.currentTurnId = result.turn.id;
      this.activeItems.clear();
      this.currentTextBlockIdx = -1;
      this.currentThinkingBlockIdx = -1;
      this.lastEventSeq = 0;

      // Load the forked thread's history.
      await this.loadThread(result.thread.id);

      this.postMessage({
        type: "info",
        message: t().retrySuccess(result.thread.id),
      });
      this.refreshWorkPanel();
      this.refreshSessionList();
      this.postMessage({ type: "historyUpdated" });
    } catch (err) {
      const msg = getErrorMessage(err);
      if (msg.includes("exceeds") || msg.includes("No user") || msg.includes("no user text")) {
        this.postMessage({ type: "info", message: t().retryNoTurns });
      } else {
        this.postMessage({ type: "error", message: formatError("Retry failed", err) });
      }
    }
  }

  /**
   * Revert a file change by restoring the most recent pre-turn snapshot
   * via the server-side SnapshotRepo API. This matches TUI's `patch_undo`
   * behavior — using git-based snapshots instead of client-side diff
   * reconstruction, which is more reliable and supports multiple undos.
   */
  private async handleRevertFileChange(
    filePath: string,
    _changeType: string,
    _diff: string | undefined
  ): Promise<void> {
    if (
      !this.apiCapabilities.snapshotList ||
      !this.apiCapabilities.snapshotRestore
    ) {
      this.postMessage({ type: "info", message: t().revertNotSupported });
      return;
    }

    try {
      await this.api.ensureReady();

      // Find the most recent pre-turn snapshot.
      const snapshots = await this.api.listSnapshots({ limit: 20 });
      const preTurn = snapshots.find((s) => s.label.startsWith("pre-turn:"));

      if (!preTurn) {
        this.postMessage({ type: "info", message: t().revertNotAvailable });
        return;
      }

      // Restore the snapshot on the server side.
      await this.api.restoreSnapshot(preTurn.id);

      // Remove the change from the in-memory turn record.
      this.turnFileChanges = this.turnFileChanges.filter(
        (fc) => fc.filePath !== filePath
      );
      this.refreshWorkPanel();

      this.postMessage({ type: "info", message: t().revertSuccess(filePath) });
    } catch (err) {
      this.postMessage({
        type: "error",
        message: t().revertFailure(filePath, getErrorMessage(err)),
      });
    }
  }

  public async handleCompact(): Promise<void> {
    if (this.currentThread) {
      try {
        await this.api.compactThread(this.currentThread.id);
        this.postMessage({ type: "info", message: "Context compacted" });
      } catch (err) {
        this.postMessage({
          type: "error",
          message: formatError("Compact failed", err),
        });
      }
    }
  }

  private async handleSlashCommand(command: string, args: string): Promise<void> {
    await this.slashHandler.handle(command, args);
  }

  private async handleApprovalDecision(
    approvalId: string,
    decision: "allow" | "deny",
    remember = false
  ): Promise<void> {
    try {
      await this.api.decideApproval(approvalId, decision, remember);
      const tc = this.pendingApprovals.get(approvalId);
      if (tc) {
        tc.status = decision === "allow" ? "running" : "error";
        tc.approvalId = undefined;
      }
      this.pendingApprovals.delete(approvalId);
      this.postMessage({ type: "approvalResolved", approvalId, decision });
    } catch (err) {
      this.postMessage({
        type: "error",
        message: formatError("Approval failed", err),
      });
    }
  }

  private showApprovalDialog(
    _approvalId: string,
    _toolName: string,
    _summary: string
  ): void {
    this.view?.show?.(true);
  }

  private async handleUserInputSelect(
    inputId: string,
    questionId: string,
    _optionIdx: number,
    optionLabel: string
  ): Promise<void> {
    const pending = this.pendingUserInputs.get(inputId);
    if (!pending) return;

    pending.answers.push({
      id: questionId,
      label: optionLabel,
      value: optionLabel,
    });
    pending.answeredQuestions.add(questionId);

    const allAnswered = pending.questions.every(q => pending.answeredQuestions.has(q.id));
    if (allAnswered) {
      try {
        await this.api.submitUserInput(this.currentThread!.id, inputId, pending.answers);
        this.pendingUserInputs.delete(inputId);
        this.postMessage({
          type: "userInputResolved",
          inputId,
          cancelled: false,
          answers: pending.answers,
        });
      } catch (err) {
        this.postMessage({
          type: "error",
          message: `${formatError("Failed to submit user input", err)}. Use /interrupt to clear the stuck turn.`,
        });
        this.pendingUserInputs.delete(inputId);
      }
    }
  }

  private async handleUserInputCancel(inputId: string): Promise<void> {
    try {
      await this.api.submitUserInput(this.currentThread!.id, inputId, []);
    } catch {
      // ignore cancellation errors
    }
    this.pendingUserInputs.delete(inputId);
    this.postMessage({
      type: "userInputResolved",
      inputId,
      cancelled: true,
    });
    this.postMessage({
      type: "info",
      message: "User input cancelled. The turn will be interrupted. Use /interrupt if needed.",
    });
  }

  private diffContentStore = new Map<string, string>();
  private diffProviderDisposable: vscode.Disposable | null = null;

  private ensureDiffProvider(): void {
    if (this.diffProviderDisposable) return;

    const store = this.diffContentStore;
    const provider: vscode.TextDocumentContentProvider = {
      onDidChange: undefined,
      provideTextDocumentContent(uri: vscode.Uri): string {
        return store.get(uri.toString()) || "";
      },
    };
    this.diffProviderDisposable = vscode.workspace.registerTextDocumentContentProvider("brotherwhale-diff", provider);
  }

  private async handleOpenDiff(filePath: string, diff?: string): Promise<void> {
    try {
      const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspace) return;

      const absPath = path.isAbsolute(filePath) ? filePath : path.join(workspace, filePath);

      if (diff) {
        this.ensureDiffProvider();

        const { oldContent, newContent } = parseDiffToSides(diff);
        const diffId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const oldUri = vscode.Uri.parse(`brotherwhale-diff:${absPath}?old&id=${diffId}`);
        const newUri = vscode.Uri.parse(`brotherwhale-diff:${absPath}?new&id=${diffId}`);

        this.diffContentStore.set(oldUri.toString(), oldContent);
        this.diffContentStore.set(newUri.toString(), newContent);

        const title = `${path.basename(filePath)} (Diff)`;
        await vscode.commands.executeCommand("vscode.diff", oldUri, newUri, title);
      } else {
        const currentUri = vscode.Uri.file(absPath);
        const doc = await vscode.workspace.openTextDocument(currentUri);
        await vscode.window.showTextDocument(doc);
      }
    } catch (err) {
      this.postMessage({ type: "error", message: formatError("Failed to open diff", err) });
    }
  }

  private async handleOpenFile(filePath: string): Promise<void> {
    try {
      const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspace) return;
      const absPath = path.isAbsolute(filePath) ? filePath : path.join(workspace, filePath);
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(absPath));
      await vscode.window.showTextDocument(doc);
    } catch (err) {
      this.postMessage({ type: "error", message: formatError("Failed to open file", err) });
    }
  }

  // ── SSE event stream ──

  private subscribeToEvents(): void {
    if (!this.currentThread) return;
    this.eventController?.abort();

    this.eventController = this.api.streamEvents(
      this.currentThread.id,
      this.lastEventSeq,
      (event: RuntimeEvent) => this.handleRuntimeEvent(event),
      (err: Error) => {
        this.postMessage({ type: "error", message: `Event stream error: ${err.message}` });
      }
    );
  }

  private handleRuntimeEvent(event: RuntimeEvent): void {
    this.lastEventSeq = event.seq;

    if (event.item_id && this.currentTurnId) {
      this.handleItemEvent(event);
    }

    try {
    switch (event.event) {
      case "turn.lifecycle": {
        const pl = event.payload as { status?: string };
        if (pl.status === "completed") break;
        if (pl.status === "running" || pl.status === "in_progress") {
          this.startPeriodicTaskRefresh();
        }
        this.postMessage({ type: "status", text: `Turn: ${pl.status || "unknown"}` });
        break;
      }

      case "turn.completed": {
        const pl = event.payload as { turn?: TurnRecord };
        this.currentTurnId = null;
        if (pl.turn?.usage) {
          const u = pl.turn.usage;
          this.lastInputTokens = u.input_tokens;
          this.lastOutputTokens = u.output_tokens;
          this.lastCacheHitTokens = u.prompt_cache_hit_tokens ?? 0;
          this.lastCacheMissTokens = u.prompt_cache_miss_tokens ?? Math.max(0, u.input_tokens - (u.prompt_cache_hit_tokens ?? 0));
          this.totalInputTokens += u.input_tokens;
          this.totalOutputTokens += u.output_tokens;
          const model = this.getCurrentModel();
          const cost = calculateTurnCost(
            model, u.input_tokens, u.output_tokens,
            u.prompt_cache_hit_tokens, u.prompt_cache_miss_tokens, u.reasoning_tokens,
          );
          if (cost) {
            this.sessionCostUsd += cost.usd;
            this.sessionCostCny += cost.cny;
          }
          this.sendSessionStats();
        }
        const lastMsg = this.messages[this.messages.length - 1];
        if (lastMsg?.role === "assistant") {
          const payload = finalizeAssistantMessage(lastMsg, "complete", { usage: pl.turn?.usage });
          this.postMessage(payload);
        }
        this.refreshSessionList();
        this.stopPeriodicTaskRefresh();
        this.refreshTaskList();
        this.refreshWorkPanel();
        break;
      }

      case "turn.failed": {
        this.currentTurnId = null;
        const lastMsg = this.messages[this.messages.length - 1];
        if (lastMsg?.role === "assistant") {
          const payload = finalizeAssistantMessage(lastMsg, "error");
          this.postMessage(payload);
        }
        this.stopPeriodicTaskRefresh();
        break;
      }

      case "cycle.advanced": {
        const pl = event.payload as { from?: number; to?: number; cycle?: number };
        this.cycleCount = pl.to ?? pl.cycle ?? 0;
        this.refreshWorkPanel();
        break;
      }

      case "coherence.state": {
        const pl = event.payload as { state?: string; label?: string; description?: string };
        this.coherenceState = pl.state || "healthy";
        this.coherenceLabel = pl.label || pl.description || "";
        this.refreshWorkPanel();
        break;
      }

      case "approval.required": {
        const pl = event.payload as Record<string, unknown>;
        const request = pl.request as Record<string, unknown> | undefined;
        const approvalId = (request?.approval_id as string) || (pl.approval_id as string) || (pl.id as string);
        const callId = (request?.call_id as string) || (pl.call_id as string) || (pl.id as string);
        const toolName = (request?.tool_name as string) || (pl.tool_name as string) || "unknown";
        const toolInput = (request || pl) as Record<string, unknown>;
        if (!approvalId) break;

        // In YOLO/auto-approve mode, the TUI runtime auto-approves after
        // emitting this event (see runtime_threads.rs:2748-2761).  Mirror
        // the TUI UI behaviour (ui.rs:2427) and skip the approval dialog
        // entirely so the user isn't shown a confusing confirmation that
        // has already been decided server-side.
        const thread = this.currentThread;
        if (thread?.auto_approve || thread?.trust_mode) {
          break;
        }

        const lastMsg = this.messages[this.messages.length - 1];
        let tc: ToolCallInfo | undefined;
        let tcIdx: number | undefined;
        if (callId) {
          const active = this.activeItems.get(callId);
          if (active?.toolCallIdx !== undefined) {
            tcIdx = active.toolCallIdx;
            tc = lastMsg?.toolCalls?.[tcIdx];
          }
        }
        if (!tc && lastMsg?.toolCalls) {
          tc = lastMsg.toolCalls.find((t) => t.status === "running");
          if (tc) tcIdx = lastMsg.toolCalls.indexOf(tc);
        }

        const actualInput = tc?.input || toolInput;
        const summary = buildApprovalSummary(toolName, actualInput);

        if (tc) {
          tc.status = "awaiting_approval";
          tc.approvalId = approvalId;
          tc.displayName = friendlyToolName(toolName);
          tc.approvalSummary = summary;
          this.pendingApprovals.set(approvalId, tc);
        }
        this.postMessage({
          type: "approvalRequired",
          messageId: lastMsg?.id,
          toolCallIdx: tcIdx,
          approvalId,
          toolName: friendlyToolName(toolName),
          summary,
        });

        this.showApprovalDialog(approvalId, toolName, summary);
        break;
      }

      case "approval.decided": {
        const pl = event.payload as {
          approval_id?: string;
          decision?: string;
          remember?: boolean;
        };
        const approvalId = pl.approval_id;
        if (!approvalId) break;
        const tc = this.pendingApprovals.get(approvalId);
        if (tc) {
          tc.status = pl.decision === "allow" ? "running" : "error";
          tc.approvalId = undefined;
        }
        this.pendingApprovals.delete(approvalId);
        this.postMessage({
          type: "approvalResolved",
          approvalId,
          decision: pl.decision || "deny",
        });
        break;
      }

      case "approval.timeout": {
        const pl = event.payload as {
          approval_id?: string;
          timeout_secs?: number;
        };
        const approvalId = pl.approval_id;
        if (!approvalId) break;
        const tc = this.pendingApprovals.get(approvalId);
        if (tc) {
          tc.status = "error";
          tc.approvalId = undefined;
        }
        this.pendingApprovals.delete(approvalId);
        this.postMessage({
          type: "approvalResolved",
          approvalId,
          decision: "deny",
        });
        this.postMessage({
          type: "error",
          message: `Approval timed out after ${pl.timeout_secs || 30}s — tool call was denied automatically`,
        });
        break;
      }

      case "user_input.required": {
        const pl = event.payload as {
          id?: string;
          request?: {
            questions?: Array<{
              header: string;
              id: string;
              question: string;
              options: Array<{ label: string; description: string }>;
            }>;
          };
        };
        const inputId = pl.id;
        const questions = pl.request?.questions;
        if (!inputId || !questions) break;

        const lastMsg = this.messages[this.messages.length - 1];
        let messageId: string | undefined;
        if (event.item_id) {
          const active = this.activeItems.get(event.item_id);
          if (active) {
            messageId = active.msgId;
          }
        }
        if (!messageId) {
          messageId = lastMsg?.id;
        }

        this.pendingUserInputs.set(inputId, { questions, answers: [], answeredQuestions: new Set() });
        this.postMessage({
          type: "userInputRequired",
          messageId,
          inputId,
          questions,
        });
        break;
      }
    }
    } catch (err) {
      this.debugLog(`handleRuntimeEvent error on ${event.event}: ${getErrorMessage(err)}`);
    }
  }

  private handleItemEvent(event: RuntimeEvent): void {
    const itemId = event.item_id!;
    const lastMsg = this.messages[this.messages.length - 1];
    if (!lastMsg || lastMsg.role !== "assistant") return;

    switch (event.event) {
      case "item.started": {
        const pl = event.payload as {
          item?: { kind?: string; id?: string; summary?: string; detail?: string };
          tool?: { id?: string; name?: string; input?: Record<string, unknown> };
        };
        const kind = pl.item?.kind;
        if (!kind || !itemId) break;

        this.activeItems.set(itemId, { kind, msgId: lastMsg.id });

        if (kind === "tool_call" || kind === "file_change" || kind === "command_execution") {
          this.currentTextBlockIdx = -1;
          this.currentThinkingBlockIdx = -1;

          const rawToolName = pl.tool?.name || "";
          const tc: ToolCallInfo = {
            name: rawToolName || pl.item?.summary || "unknown",
            input: pl.tool?.input || {},
            status: "running",
            itemId,
          };
          lastMsg.toolCalls = lastMsg.toolCalls || [];
          lastMsg.blocks = lastMsg.blocks || [];
          const tcIdx = lastMsg.toolCalls.length;
          lastMsg.toolCalls.push(tc);
          const blockIdx = lastMsg.blocks.length;
          lastMsg.blocks.push({ type: "tool_call", toolCallIdx: tcIdx });
          const entry = {
            kind,
            msgId: lastMsg.id,
            toolCallName: rawToolName || tc.name,
            toolCallIdx: tcIdx,
            blockIdx,
          };
          this.activeItems.set(itemId, entry);
          if (pl.tool?.id) {
            this.activeItems.set(pl.tool.id, entry);
          }
          this.postMessage({
            type: "addToolCall",
            messageId: lastMsg.id,
            toolCallIdx: tcIdx,
            blockIdx,
            toolCall: tc,
          });
        }
        this.postMessage({ type: "status", text: `${kind} started` });
        break;
      }

      case "item.delta": {
        const pl = event.payload as { delta?: string; kind?: string };
        const delta = pl.delta || "";
        const kind = pl.kind;

        if (kind === "agent_message") {
          lastMsg.blocks = lastMsg.blocks || [];
          if (this.currentTextBlockIdx < 0) {
            this.currentTextBlockIdx = lastMsg.blocks.length;
            lastMsg.blocks.push({ type: "text", content: "" });
            this.postMessage({
              type: "addTextBlock",
              messageId: lastMsg.id,
              blockIdx: this.currentTextBlockIdx,
            });
          }
          const textBlock = lastMsg.blocks[this.currentTextBlockIdx];
          textBlock.content = (textBlock.content || "") + delta;
          lastMsg.content += delta;
          this.postMessage({
            type: "updateMessage",
            messageId: lastMsg.id,
            content: textBlock.content,
            blockIdx: this.currentTextBlockIdx,
          });
        } else if (kind === "agent_reasoning") {
          if (!delta) break;
          lastMsg.blocks = lastMsg.blocks || [];
          if (this.currentThinkingBlockIdx < 0) {
            this.currentThinkingBlockIdx = lastMsg.blocks.length;
            lastMsg.blocks.push({ type: "thinking", content: "" });
            this.postMessage({
              type: "addThinkingBlock",
              messageId: lastMsg.id,
              blockIdx: this.currentThinkingBlockIdx,
            });
          }
          const thinkingBlock = lastMsg.blocks[this.currentThinkingBlockIdx];
          thinkingBlock.content = (thinkingBlock.content || "") + delta;
          lastMsg.thinking = (lastMsg.thinking || "") + delta;
          this.postMessage({
            type: "updateThinking",
            messageId: lastMsg.id,
            thinking: thinkingBlock.content,
            blockIdx: this.currentThinkingBlockIdx,
          });
        }
        break;
      }

      case "item.completed": {
        const pl = event.payload as {
          item?: {
            kind?: string;
            id?: string;
            summary?: string;
            detail?: string;
            status?: string;
            metadata?: Record<string, unknown>;
          };
        };
        const kind = pl.item?.kind;
        const active = this.activeItems.get(itemId);
        this.activeItems.delete(itemId);

        if (kind === "tool_call" || kind === "file_change" || kind === "command_execution") {
          const tcIdx = active?.toolCallIdx;
          const tc = tcIdx !== undefined ? lastMsg.toolCalls?.[tcIdx] : undefined;
          const toolName = active?.toolCallName || extractToolNameFromSummary(pl.item?.summary || "");

          if (tc) {
            tc.status = "complete";
            tc.output = pl.item?.detail || pl.item?.summary;
            this.postMessage({
              type: "updateToolCall",
              messageId: lastMsg.id,
              toolCallIdx: tcIdx!,
              toolName: tc.name,
              status: "complete",
              output: tc.output,
            });
          }

          if (isFileChangeTool(toolName)) {
            let filePath = "";
            let diff: string | undefined;
            if (tc?.input) {
              filePath = extractFilePath(toolName, tc.input);
            }
            const output = pl.item?.detail || tc?.output || "";
            diff = extractDiffFromOutput(output);
            if (!filePath && diff) {
              filePath = extractFilePathFromDiff(diff);
            }
            if (!filePath && pl.item?.metadata) {
              const meta = pl.item.metadata;
              filePath = (meta.file_path || meta.path || "") as string;
            }
            if (filePath) {
              const stats = diff ? parseDiffStats(diff) : { added: 0, removed: 0 };
              const changeType: "created" | "modified" | "deleted" =
                toolName === "delete_file" ? "deleted" :
                toolName === "write_file" && !diff ? "created" : "modified";
              const fc: FileChangeInfo = {
                filePath,
                changeType,
                addedLines: stats.added,
                removedLines: stats.removed,
                diff,
                toolName,
              };
              if (tc) {
                tc.fileChange = fc;
              }
              const normPath = normalizePath(fc.filePath);
              if (!this.turnFileChanges.some(existing => normalizePath(existing.filePath) === normPath)) {
                this.turnFileChanges.push(fc);
              }
              if (tcIdx !== undefined) {
                this.postMessage({
                  type: "fileChangeDetected",
                  messageId: lastMsg.id,
                  toolCallIdx: tcIdx,
                  fileChange: fc,
                });
              }
              this.refreshWorkPanel();
            }
          }
          if (pl.item?.metadata?.task_updates) {
            const checklist = (pl.item.metadata.task_updates as Record<string, unknown>).checklist;
            if (checklist && typeof checklist === "object") {
              const cl = checklist as Record<string, unknown>;
              if (Array.isArray(cl.items)) {
                this.checklistItems = cl.items as { id: string; content: string; status: string }[];
              }
              if (typeof cl.completion_pct === "number") {
                this.checklistCompletionPct = cl.completion_pct;
              }
              this.refreshWorkPanel();
            }
          }
          if ([
            "agent_open", "agent_spawn", "agent_close", "agent_cancel",
            "todo_write", "todo_add", "todo_update",
            "checklist_write", "checklist_add", "checklist_update",
            "task_shell_start", "exec_shell",
          ].includes(toolName)) {
            this.refreshTaskList();
          }
        }
        break;
      }
    }
  }

  // ── Command handlers (called from extension.ts) ──

  handleNewThreadCommand(): void {
    this.handleNewThread();
  }

  handleCompactCommand(): void {
    this.handleCompact();
  }

  // ── Helpers ──

  private sendSessionStats(): void {
    const totalCacheHit = this.lastCacheHitTokens;
    const totalCacheMiss = this.lastCacheMissTokens;
    const total = totalCacheHit + totalCacheMiss;
    const cacheHitRate = total > 0 ? (totalCacheHit / total * 100) : 0;
    const cfg = vscode.workspace.getConfiguration("brotherwhale");
    const currency = cfg.get<string>("costCurrency", "usd");
    const costDisplay = currency === "cny"
      ? formatCostAmount(this.sessionCostCny, "cny")
      : formatCostAmount(this.sessionCostUsd, "usd");
    this.postMessage({
      type: "sessionStats",
      cost: costDisplay,
      cacheHitRate: cacheHitRate.toFixed(1),
      cacheHitTokens: totalCacheHit,
      cacheMissTokens: totalCacheMiss,
      totalInputTokens: this.totalInputTokens,
      totalOutputTokens: this.totalOutputTokens,
      lastInputTokens: this.lastInputTokens,
      lastOutputTokens: this.lastOutputTokens,
    });
  }

  public getCurrentModel(): string {
    const cfg = vscode.workspace.getConfiguration("brotherwhale");
    return cfg.get<string>("defaultModel", "deepseek-v4-pro");
  }

  private getCurrentMode(): string {
    const cfg = vscode.workspace.getConfiguration("brotherwhale");
    return cfg.get<string>("defaultMode", "agent");
  }

  private getCurrentReasoningEffort(): string {
    const cfg = vscode.workspace.getConfiguration("brotherwhale");
    return cfg.get<string>("reasoningEffort", "auto");
  }

  /** Post a message to the webview, pre-rendering markdown fields */
  public postMessage(msg: Record<string, unknown>): void {
    // Pre-render markdown content for the webview
    switch (msg.type) {
      case "addMessage": {
        const m = msg.message as Record<string, unknown>;
        if (m && typeof m.content === "string") {
          try { m.contentHtml = renderMarkdown(m.content); } catch { m.contentHtml = m.content; }
        }
        if (m && typeof m.thinking === "string" && m.thinking) {
          try { m.thinkingHtml = renderMarkdown(m.thinking); } catch { m.thinkingHtml = m.thinking; }
        }
        if (m && Array.isArray(m.blocks)) {
          for (const b of m.blocks as Record<string, unknown>[]) {
            if ((b.type === "text" || b.type === "thinking") && typeof b.content === "string" && b.content) {
              try { b.contentHtml = renderMarkdown(b.content as string); } catch { b.contentHtml = b.content; }
            }
          }
        }
        break;
      }
      case "updateMessage":
        break;
      case "updateThinking":
        break;
      case "loadHistory":
      case "threadLoaded":
        if (Array.isArray(msg.messages)) {
          for (const m of msg.messages as Record<string, unknown>[]) {
            if (m && typeof m.content === "string") {
              try { m.contentHtml = renderMarkdown(m.content); } catch { m.contentHtml = m.content; }
            }
            if (m && typeof m.thinking === "string" && m.thinking) {
              try { m.thinkingHtml = renderMarkdown(m.thinking); } catch { m.thinkingHtml = m.thinking; }
            }
            if (m && Array.isArray(m.blocks)) {
              for (const b of m.blocks as Record<string, unknown>[]) {
                if ((b.type === "text" || b.type === "thinking") && typeof b.content === "string" && b.content) {
                  try { b.contentHtml = renderMarkdown(b.content as string); } catch { b.contentHtml = b.content; }
                }
              }
            }
          }
        }
        break;
    }
    this.debugLog(`postMessage: ${String(msg.type)}`);
    this.view?.webview.postMessage(msg);
  }

  private cleanup(): void {
    this.eventController?.abort();
    this.eventController = null;
    this.diffContentStore.clear();
    this.diffProviderDisposable?.dispose();
    this.diffProviderDisposable = null;
  }

  dispose(): void {
    this.cleanup();
    for (const d of this._disposables) {
      d.dispose();
    }
  }
}
