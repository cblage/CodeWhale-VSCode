import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { SlashCommandHandler, type SlashCommandContext } from "./commands/slash-command-handler";
import {
  CodeWhaleApiClient,
  CodeWhaleEngine,
  AgentRunRecord,
  RuntimeApiCapabilities,
  RuntimeEvent,
  SkillsResponse,
  SessionMetadata,
  TaskRecord,
  ThreadContextUsageResponse,
  ThreadDetailResponse,
  ThreadRecord,
  TurnRecord,
  TurnItemRecord,
} from "./types";
import { formatError, getErrorMessage } from "./utils/error-handler";
import { getWebviewHtml } from "./webview/webview-html";
import { renderMarkdown } from "./utils/markdown";
import {
  ensureTerminalErrorContent,
  finalizeAssistantMessage,
} from "./utils/event-helpers";
import { calculateTurnCost, formatCostAmount } from "./utils/cost-calculator";
import {
  parseDiffStats,
  extractDiffFromOutput,
  extractDiffForTool,
  extractFilePathFromDiff,
  parseDiffToSides,
  stripTurnMeta,
  reconstructOldContent,
  reconstructOriginalContent,
  getDiffStateForIndex,
} from "./utils/diff-utils";
import { t, webviewTranslations } from "./i18n";
import { ConfigPanel } from "./config-panel";
import {
  SessionStateStore,
  type ChatMessage,
  type ContentBlock,
  type ToolCallInfo,
  type FileChangeInfo,
  type SubagentTranscriptEntry,
  type StrategyStep,
  type SessionCostSnapshot,
} from "./utils/session-state";
import {
  friendlyToolName,
  isFileChangeTool,
  extractFilePath,
  extractToolNameFromSummary,
  buildApprovalSummary,
} from "./utils/tool-utils";
import {
  buildExplicitSkillPrompt,
  buildSkillCommandCatalog,
  type SkillCommandDescriptor,
} from "./utils/skill-commands";
import { getRegisteredSlashCommandNames } from "./commands/slash-commands";
import {
  collectConversationAgentRefs,
  enrichAgentRunsFromState,
  extractSubagentTranscriptEntries,
  filterAgentRunsForConversation,
  type PersistedSubagentState,
} from "./utils/agent-runs";
import { isInternalRuntimeEventText } from "./utils/runtime-events";

/** Normalize file path for dedup comparison: backslashes to forward, strip trailing slashes. */
function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '');
}

// TUI-compatible artifact path resolution
function getHomeDirectory(): string {
  return os.homedir();
}

function defaultTasksDir(): string {
  const deepseekTasksDir = process.env.DEEPSEEK_TASKS_DIR;
  if (deepseekTasksDir && deepseekTasksDir.trim()) {
    return deepseekTasksDir;
  }
  const home = getHomeDirectory();
  const primary = path.join(home, ".codewhale", "tasks");
  try {
    if (fs.existsSync(primary) && fs.statSync(primary).isDirectory()) {
      return primary;
    }
  } catch {
    // ignore
  }
  const legacy = path.join(home, ".deepseek", "tasks");
  try {
    if (fs.existsSync(legacy) && fs.statSync(legacy).isDirectory()) {
      return legacy;
    }
  } catch {
    // ignore
  }
  return primary;
}

function resolveTaskArtifactPath(relativeOrAbsolute: string): string {
  if (path.isAbsolute(relativeOrAbsolute)) {
    return path.normalize(relativeOrAbsolute);
  }
  return path.normalize(path.join(defaultTasksDir(), relativeOrAbsolute));
}

function mergeThreadRecord(
  current: ThreadRecord,
  updated: Partial<ThreadRecord> | undefined,
  fallback: Partial<ThreadRecord> = {},
): ThreadRecord {
  return {
    ...current,
    ...fallback,
    ...(updated || {}),
  };
}

function getActiveTurn(detail: ThreadDetailResponse): TurnRecord | undefined {
  const latestTurn = (detail.thread?.latest_turn_id
    ? detail.turns.find((turn) => turn.id === detail.thread.latest_turn_id)
    : undefined) ?? detail.turns[detail.turns.length - 1];
  return latestTurn
    && (latestTurn.status === "queued" || latestTurn.status === "in_progress")
    ? latestTurn
    : undefined;
}

type TranscriptTarget =
  | { version: 1; kind: "empty" }
  | { version: 1; kind: "session"; id: string }
  | { version: 1; kind: "thread"; id: string };

type TranscriptSelectionResult = "loaded" | "not-found" | "failed" | "stale" | "cancelled";

interface TranscriptSelectionOptions {
  generation?: number;
  confirmSwitch?: boolean;
  persistTarget?: boolean;
  silent?: boolean;
  knownThread?: ThreadRecord;
  linkedSessionExists?: boolean;
}

export class ChatProvider implements vscode.WebviewViewProvider, SlashCommandContext {
  public static readonly viewType = "cblage.codewhale.chat";

  private view?: vscode.WebviewView;
  public readonly api: CodeWhaleApiClient;
  public readonly engine: CodeWhaleEngine;
  private sessionState = new SessionStateStore();
  private slashHandler: SlashCommandHandler;
  private initializationPromise: Promise<void> | null = null;
  private eventController: AbortController | null = null;
  private taskRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private skillCommandRefreshGeneration = 0;
  private skillCommandsByName = new Map<string, SkillCommandDescriptor>();
  private _disposables: vscode.Disposable[] = [];
  private currentAttachments: Array<{ kind: string; path: string; name: string }> = [];
  private showAllWorkspaces: boolean = false;
  private runtimeVersion: string | null = null;
  private contextUsage: ThreadContextUsageResponse | null = null;
  private contextUsageThreadId: string | null = null;
  private contextUsageRefreshGeneration = 0;
  private runtimeShowToolDetails = false;
  private runtimeCalmMode = true;
  private apiCapabilities: RuntimeApiCapabilities = {
    saveSession: false,
    threadUndo: false,
    threadPatchUndo: false,
    threadRetry: false,
    snapshotList: false,
    snapshotRestore: false,
    agentRunCancel: false,
    agentRunNudge: false,
  };
  // Guard to prevent concurrent autoSaveSession calls.  When multiple
  // turn.completed events fire in quick succession (e.g. SSE reconnection
  // replaying buffered events) and currentSessionId is null, each call
  // would create a new session on the server, producing duplicates.
  private autoSaveInProgress = false;
  private readonly deletedSessionIds = new Set<string>();
  private readonly retiredThreadIds = new Set<string>();
  private readonly textArtifactPreviewStore = new Map<string, { content: string; language?: string }>();
  private agentRunsRefreshGeneration = 0;
  private agentRunsRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private agentRunsRefreshGrace = 0;
  private cachedScopedAgentRuns: AgentRunRecord[] = [];
  private readonly unavailableAgentRunVersions = new Set<string>();
  private agentWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private agentWatchdogGeneration = 0;
  private agentWatchdogInFlight = false;
  private agentWatchdogThreadId: string | null = null;
  private agentWatchdogHadActiveRuns = false;
  private readonly agentWatchdogBatchAgentIds = new Set<string>();
  private readonly agentWatchdogDurableCompletionAgentIds = new Set<string>();
  private agentWatchdogCompletionPending = false;
  private agentWatchdogParkedForIdleParent = false;
  private lastMasterActivityAt = Date.now();
  private agentStateFilePath: string | null = null;
  private agentStateWatcher: fs.FSWatcher | null = null;
  private agentStateWatcherDirectory: string | null = null;
  private agentStateWatcherFileName: string | null = null;
  private agentStateRefreshDebounce: ReturnType<typeof setTimeout> | null = null;
  private readonly subagentTranscriptBlocks = new Map<string, {
    messageId: string;
    blockIdx: number;
    entry: SubagentTranscriptEntry;
  }>();
  private subagentTranscriptRevision = 0;
  private restoringSubagentTranscriptHistory = false;
  private readonly pendingSteerItemIds = new Set<string>();
  private transcriptSelectionGeneration = 0;
  private viewedSessionDisplay: { model: string; mode: string } | null = null;

  // Convenience accessors for session state
  public get currentThread(): ThreadRecord | null { return this.sessionState.data.currentThread; }
  public set currentThread(v: ThreadRecord | null) { this.sessionState.data.currentThread = v; }
  private get viewingSessionId(): string | null { return this.sessionState.data.viewingSessionId; }
  private set viewingSessionId(v: string | null) { this.sessionState.data.viewingSessionId = v; }
  private get currentSessionId(): string | null { return this.sessionState.data.currentSessionId; }
  private set currentSessionId(v: string | null) { this.sessionState.data.currentSessionId = v; }
  private get pendingSessionCost(): SessionCostSnapshot | null { return this.sessionState.data.pendingSessionCost; }
  private set pendingSessionCost(v: SessionCostSnapshot | null) { this.sessionState.data.pendingSessionCost = v; }
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
  private get strategySteps(): StrategyStep[] { return this.sessionState.data.strategySteps; }
  private set strategySteps(v: StrategyStep[]) { this.sessionState.data.strategySteps = v; }
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
  public get displayedCostHighWaterUsd(): number { return this.sessionState.data.stats.displayedCostHighWaterUsd; }
  public set displayedCostHighWaterUsd(v: number) { this.sessionState.data.stats.displayedCostHighWaterUsd = v; }
  public get displayedCostHighWaterCny(): number { return this.sessionState.data.stats.displayedCostHighWaterCny; }
  public set displayedCostHighWaterCny(v: number) { this.sessionState.data.stats.displayedCostHighWaterCny = v; }
  public get totalTokens(): number { return this.sessionState.data.stats.totalTokens; }
  public set totalTokens(v: number) { this.sessionState.data.stats.totalTokens = v; }
  public get cumulativeTurnSecs(): number { return this.sessionState.data.stats.cumulativeTurnSecs; }
  public set cumulativeTurnSecs(v: number) { this.sessionState.data.stats.cumulativeTurnSecs = v; }
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
    api: CodeWhaleApiClient,
    private readonly workspaceState?: vscode.Memento,
  ) {
    this.engine = engine;
    this.api = api;
    this.api.bindEngine(engine);
    this.slashHandler = new SlashCommandHandler(this);
  }

  private get transcriptTargetKey(): string {
    const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "no-workspace";
    return `cblage.codewhale.transcriptTarget.v1:${encodeURIComponent(workspace)}`;
  }

  private readTranscriptTarget(): TranscriptTarget | null {
    const value = this.workspaceState?.get<unknown>(this.transcriptTargetKey);
    if (!value || typeof value !== "object") return null;
    const target = value as Partial<TranscriptTarget> & { id?: unknown };
    if (target.version !== 1) return null;
    if (target.kind === "empty") return { version: 1, kind: "empty" };
    if (
      (target.kind === "session" || target.kind === "thread")
      && typeof target.id === "string"
      && target.id.length > 0
    ) {
      return { version: 1, kind: target.kind, id: target.id };
    }
    return null;
  }

  private async persistTranscriptTarget(target: TranscriptTarget): Promise<void> {
    if (!this.workspaceState) return;
    try {
      await this.workspaceState.update(this.transcriptTargetKey, target);
    } catch (err) {
      this.debugLog(`Failed to persist transcript target: ${getErrorMessage(err)}`);
    }
  }

  private async clearPersistedTranscriptTarget(): Promise<void> {
    if (!this.workspaceState) return;
    try {
      await this.workspaceState.update(this.transcriptTargetKey, undefined);
    } catch (err) {
      this.debugLog(`Failed to clear transcript target: ${getErrorMessage(err)}`);
    }
  }

  private beginTranscriptSelection(): number {
    this.transcriptSelectionGeneration += 1;
    return this.transcriptSelectionGeneration;
  }

  private isCurrentTranscriptSelection(generation: number): boolean {
    return generation === this.transcriptSelectionGeneration;
  }

  private static isNotFoundError(err: unknown): boolean {
    const message = getErrorMessage(err).toLowerCase();
    return message.includes("404") || message.includes("not found");
  }

  private getDisplayedModel(): string {
    return this.viewedSessionDisplay?.model
      || this.currentThread?.model
      || this.getCurrentModel();
  }

  private getDisplayedMode(): string {
    return this.viewedSessionDisplay?.mode
      || this.currentThread?.mode
      || this.getCurrentMode();
  }

  public notifyDisplaySettingsChanged(): void {
    const config = vscode.workspace.getConfiguration("cblage.codewhale");
    this.postMessage({
      type: "displaySettingsUpdated",
      showAgentToolCards: config.get<boolean>("showAgentToolCards", false),
      showToolDetails: this.runtimeShowToolDetails,
      calmMode: this.runtimeCalmMode,
    });
  }

  private async refreshRuntimeDisplaySettings(notifyWebview = false): Promise<void> {
    try {
      const config = await this.api.getConfig();
      this.runtimeShowToolDetails = config.show_tool_details === true;
      this.runtimeCalmMode = config.calm_mode === true;
      if (notifyWebview) {
        this.postMessage({
          type: "displaySettingsUpdated",
          showToolDetails: this.runtimeShowToolDetails,
          calmMode: this.runtimeCalmMode,
        });
      }
    } catch (err) {
      // Keep the safe compact defaults (or last known values) if the runtime
      // config endpoint is temporarily unavailable during startup/reconnect.
      this.debugLog(`refreshRuntimeDisplaySettings failed: ${getErrorMessage(err)}`);
    }
  }

  public notifyAgentWatchdogSettingsChanged(): void {
    this.stopAgentWatchdog(false);
    this.lastMasterActivityAt = Date.now();
    this.reconcileAgentWatchdog();
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

    webviewView.onDidDispose(() => {
      // Ignore a late disposal callback from an older view instance. A newly
      // resolved view may already own the live SSE subscription.
      if (this.view !== webviewView) return;
      this.view = undefined;
      this.cleanup({ preserveAgentWatchdog: true });
    });

    this.initializationPromise = this.initializeThread().catch((err) => {
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
          msg.args as string,
          msg.text as string | undefined,
        );
        break;
      case "newThread":
        await this.handleNewThread();
        break;
      case "interrupt":
        await this.handleInterrupt();
        break;
      case "steer":
        await this.handleSteer(msg.text as string);
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
          // resolveWebviewView also restores the current thread. Serialize the
          // fresh document's state sync behind that work so an early idle
          // `ready` cannot flash over a running turn before restoration wins.
          if (this.initializationPromise) {
            await this.initializationPromise;
          }
          await this.api.ensureReady();
          await this.syncWebviewState();
        } catch (err) {
          this.postMessage({
            type: "error",
            message: formatError("Failed to initialize", err),
          });
        }
        break;
      case "refreshTurnState":
        await this.refreshTurnState();
        break;
      case "refreshContextUsage":
        await this.refreshContextUsage();
        break;
      case "refreshSidebar":
        if (this.engine.isRunning) {
          this.api.syncFromEngine();
          this.refreshSessionList();
          this.refreshThreadList();
          this.refreshTaskList();
          this.refreshWorkPanel();
          this.refreshAgentRuns();
        }
        break;
      case "openDiff":
        this.handleOpenDiff(msg.filePath as string, msg.diff as string | undefined, msg.useCumulative as boolean, msg.diffIndex as number | undefined);
        break;
      case "openFile":
        this.handleOpenFile(msg.filePath as string);
        break;
      case "openExternal":
        await this.handleOpenExternal(msg.url as string);
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
      case "deleteSession":
        await this.handleDeleteSession(msg.sessionId as string, msg.sessionTitle as string);
        break;
      case "searchSessions":
        await this.handleSearchSessions(msg.query as string);
        break;
      case "openConfigPanel":
        ConfigPanel.createOrShow(
          this.extensionUri,
          this.api,
          () => this.refreshRuntimeDisplaySettings(true),
        );
        break;
      case "showAgentSessions":
        this.handleShowAgentSessions(msg.runId as string);
        break;
      case "refreshAgentRuns":
        this.refreshAgentRuns();
        break;
      case "stopAgent":
        await this.handleStopAgent(msg.runId as string);
        break;
      case "stopAllAgents":
        await this.handleStopAllAgents();
        break;
      case "showTaskDetail":
        this.handleShowTaskDetail(msg.taskId as string);
        break;
    }
  }

  private async syncWebviewState(): Promise<void> {
    await this.refreshRuntimeVersion();
    await this.refreshApiCapabilities();
    await this.refreshRuntimeDisplaySettings();
    try {
      await this.refreshSkillCommands();
    } catch {
      // Skills are optional. Keep the last good command menu and allow the
      // rest of the chat UI to initialize.
    }
    this.refreshSessionList();
    this.refreshThreadList();
    this.refreshTaskList();
    this.refreshWorkPanel();

    // initializeThread (or an explicit selection) already owns the canonical
    // transcript snapshot. A newly-created webview should replay that snapshot
    // instead of fetching history again and racing a different source into the
    // DOM after startup.
    if (this.messages.length > 0) {
      this.postMessage({
        type: "loadHistory",
        messages: this.messages,
        compactMode: !!this.viewingSessionId,
      });
    } else {
      this.postMessage({ type: "clearChat" });
    }
    if (this.currentThread?.id) this.subscribeToEvents();
    void this.refreshContextUsage();
    // Transcript blocks must be replayed after history paints; otherwise the
    // loadHistory DOM reset can erase a concurrently posted child update.
    this.refreshAgentRuns();

    const cfg = vscode.workspace.getConfiguration("cblage.codewhale");
    this.postMessage({
      type: "ready",
      model: this.getDisplayedModel(),
      mode: this.getDisplayedMode(),
      reasoningEffort: this.getCurrentReasoningEffort(),
      runtimeVersion: this.runtimeVersion,
      showThreadList: cfg.get<boolean>("showThreadList", false),
      showAgentToolCards: cfg.get<boolean>("showAgentToolCards", false),
      showToolDetails: this.runtimeShowToolDetails,
      calmMode: this.runtimeCalmMode,
      turnInProgress: !!this.currentTurnId,
    });
  }

  private async refreshTurnState(): Promise<void> {
    if (!this.currentThread?.id) {
      this.currentTurnId = null;
      this.postMessage({ type: "turnState", turnInProgress: false, turnId: null });
      return;
    }

    try {
      const detail = await this.api.getThreadDetail(this.currentThread.id);
      this.currentThread = mergeThreadRecord(this.currentThread, detail.thread);
      const activeTurn = getActiveTurn(detail);
      this.currentTurnId = activeTurn?.id ?? null;
      if (activeTurn) {
        this.startPeriodicTaskRefresh();
        if (!this.eventController) this.subscribeToEvents();
      } else {
        this.stopPeriodicTaskRefresh();
      }
      this.postMessage({
        type: "turnState",
        turnInProgress: !!activeTurn,
        turnId: activeTurn?.id ?? null,
      });
    } catch (err) {
      this.debugLog(`refreshTurnState failed: ${getErrorMessage(err)}`);
    }
  }

  private clearContextUsage(): void {
    this.contextUsageRefreshGeneration += 1;
    this.contextUsage = null;
    this.contextUsageThreadId = null;
    this.postMessage({ type: "contextUsage", available: false });
  }

  private postContextUsage(usage: ThreadContextUsageResponse): void {
    this.contextUsage = usage;
    this.contextUsageThreadId = usage.thread_id;
    this.postMessage({ type: "contextUsage", available: true, usage });
  }

  private async refreshContextUsage(): Promise<void> {
    const threadId = this.currentThread?.id;
    if (!threadId) {
      this.clearContextUsage();
      return;
    }

    const generation = ++this.contextUsageRefreshGeneration;
    try {
      const usage = await this.api.getThreadContext(threadId);
      if (
        generation !== this.contextUsageRefreshGeneration
        || this.currentThread?.id !== threadId
      ) {
        return;
      }
      this.postContextUsage(usage);
    } catch (err) {
      if (
        generation !== this.contextUsageRefreshGeneration
        || this.currentThread?.id !== threadId
      ) {
        return;
      }
      const message = getErrorMessage(err);
      if (message.includes("404") || message.includes("405")) {
        this.clearContextUsage();
        return;
      }
      // Preserve the last good reading across transient host failures. A stale
      // estimate is more useful than flashing the donut empty during reconnect.
      if (!this.contextUsage || this.contextUsageThreadId !== threadId) {
        this.clearContextUsage();
      }
      this.debugLog(`refreshContextUsage failed: ${message}`);
    }
  }

  public async refreshSkillCommands(): Promise<SkillsResponse> {
    const generation = ++this.skillCommandRefreshGeneration;
    try {
      await this.api.ensureReady();
      const result = await this.api.listSkills();
      if (generation === this.skillCommandRefreshGeneration) {
        const catalog = buildSkillCommandCatalog(
          result.skills || [],
          getRegisteredSlashCommandNames(),
        );
        this.skillCommandsByName = new Map(
          catalog.map((skill) => [skill.command.toLowerCase(), skill]),
        );
        this.postMessage({
          type: "skillCommands",
          skills: catalog
            .filter((skill) => skill.enabled)
            .map((skill) => ({
              name: skill.skillName,
              description: skill.description,
            })),
        });
      }
      return result;
    } catch (err) {
      this.debugLog("refreshSkillCommands failed: " + getErrorMessage(err));
      throw err;
    }
  }

  public async tryInvokeSkillCommand(
    command: string,
    args: string,
    rawText: string,
  ): Promise<boolean> {
    const key = command.toLowerCase();
    const previouslyKnown = this.skillCommandsByName.get(key);
    let result: SkillsResponse;
    try {
      // Refresh immediately so a recent /skill toggle, install, deletion, or
      // workspace change cannot execute from a stale autocomplete entry.
      result = await this.refreshSkillCommands();
    } catch (err) {
      this.postMessage({
        type: "error",
        message: formatError("Failed to refresh skills", err),
      });
      return true;
    }

    const currentCatalog = buildSkillCommandCatalog(
      result.skills || [],
      getRegisteredSlashCommandNames(),
    );
    const skill = currentCatalog.find(
      (entry) => entry.command.toLowerCase() === key,
    );

    if (!skill) {
      if (previouslyKnown) {
        this.postMessage({
          type: "error",
          message: "Skill '" + previouslyKnown.skillName
            + "' is no longer available. Run /skills to refresh the catalog.",
        });
        return true;
      }
      return false;
    }

    if (!skill.enabled) {
      this.postMessage({
        type: "error",
        message: "Skill '" + skill.skillName
          + "' is disabled. Enable it with /skill " + skill.skillName + " on.",
      });
      return true;
    }

    const visibleText = rawText.trim()
      || skill.command + (args ? " " + args : "");
    await this.handleSendMessage(
      visibleText,
      buildExplicitSkillPrompt(skill.skillName, visibleText),
    );
    return true;
  }

  // ── Initialization ──

  private postReadyState(): void {
    const cfg = vscode.workspace.getConfiguration("cblage.codewhale");
    this.postMessage({
      type: "ready",
      model: this.getDisplayedModel(),
      mode: this.getDisplayedMode(),
      reasoningEffort: this.getCurrentReasoningEffort(),
      runtimeVersion: this.runtimeVersion,
      showThreadList: cfg.get<boolean>("showThreadList", false),
      showAgentToolCards: cfg.get<boolean>("showAgentToolCards", false),
      showToolDetails: this.runtimeShowToolDetails,
      calmMode: this.runtimeCalmMode,
      turnInProgress: !!this.currentTurnId,
    });
  }

  private showEmptyTranscript(status: string): void {
    this.cleanup();
    this.sessionState.reset();
    this.viewedSessionDisplay = null;
    this.postMessage({ type: "clearChat" });
    this.postMessage({ type: "status", text: status });
  }

  private static compareFallbackThreads(a: ThreadRecord, b: ThreadRecord): number {
    const aHasContent = a.latest_turn_id ? 1 : 0;
    const bHasContent = b.latest_turn_id ? 1 : 0;
    if (aHasContent !== bHasContent) return bHasContent - aHasContent;
    const aTime = Date.parse(a.updated_at || a.created_at || "") || 0;
    const bTime = Date.parse(b.updated_at || b.created_at || "") || 0;
    if (aTime !== bTime) return bTime - aTime;
    return a.id.localeCompare(b.id);
  }

  private async initializeThread(): Promise<void> {
    const generation = this.beginTranscriptSelection();
    this.debugLog("initializeThread START");
    try {
      this.debugLog("calling api.ensureReady()...");
      await this.api.ensureReady();
      if (!this.isCurrentTranscriptSelection(generation)) return;
      this.debugLog(`engine running on ${this.engine.baseUrl}`);
      await this.refreshRuntimeVersion();
      if (!this.isCurrentTranscriptSelection(generation)) return;
      await this.refreshApiCapabilities();
      if (!this.isCurrentTranscriptSelection(generation)) return;

      const persistedTarget = this.readTranscriptTarget();
      if (persistedTarget?.kind === "empty") {
        this.showEmptyTranscript("Ready - Start a new conversation");
        this.postReadyState();
        return;
      }
      if (persistedTarget?.kind === "session" || persistedTarget?.kind === "thread") {
        const restored = persistedTarget.kind === "session"
          ? await this.loadSessionMessages(persistedTarget.id, {
            generation,
            confirmSwitch: false,
            persistTarget: false,
            silent: true,
          })
          : await this.loadThread(persistedTarget.id, {
            generation,
            confirmSwitch: false,
            persistTarget: false,
            silent: true,
          });
        if (!this.isCurrentTranscriptSelection(generation) || restored === "stale") return;
        if (restored === "loaded") {
          this.postReadyState();
          return;
        }
        if (restored === "failed") {
          // A network/runtime failure is not proof that the selected target no
          // longer exists. Keep it persisted so the next reload retries the
          // same transcript instead of silently switching conversations.
          this.postMessage({
            type: "error",
            message: "The selected transcript is temporarily unavailable. Its selection was preserved for the next reload.",
          });
          this.postReadyState();
          return;
        }
        // Only a confirmed 404/not-found invalidates the durable selection.
        await this.clearPersistedTranscriptTarget();
        if (!this.isCurrentTranscriptSelection(generation)) return;
      }

      this.debugLog("calling listThreads...");
      const allThreads = await this.api.listThreads({ limit: 100 });
      if (!this.isCurrentTranscriptSelection(generation)) return;
      this.debugLog(`listThreads returned ${allThreads.length} threads`);
      const savedSessions = await this.refreshSessionList(500);
      if (!this.isCurrentTranscriptSelection(generation)) return;

      // Filter threads to the current workspace. The runtime thread store is
      // global (not scoped by workspace), so listThreads may return stale
      // threads from a previously-opened project.
      const currentWorkspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const workspaceThreads = currentWorkspace
        ? allThreads.filter(t => t.workspace === currentWorkspace)
        : allThreads;

      // Sessions and runtime threads are separate stores. A deleted session
      // can leave behind a completed thread whose turns still reconstruct the
      // old chat. Fail open if the session index could not be read, but when
      // it is authoritative skip completed dangling threads. A genuinely
      // active orphan remains eligible so closing the sidebar cannot hide
      // background work that is still running.
      const savedSessionIds = savedSessions
        ? new Set(savedSessions.map((session) => session.id))
        : null;
      const threads: ThreadRecord[] = [];
      for (const thread of workspaceThreads) {
        const linkedSessionId = thread.session_id;
        if (!savedSessionIds || !linkedSessionId || savedSessionIds.has(linkedSessionId)) {
          threads.push(thread);
          continue;
        }
        try {
          const detail = await this.api.getThreadDetail(thread.id);
          if (!this.isCurrentTranscriptSelection(generation)) return;
          if (getActiveTurn(detail)) {
            threads.push(thread);
            this.debugLog(
              `Restoring active orphan thread ${thread.id}; linked session ${linkedSessionId} is missing`,
            );
          } else {
            this.debugLog(
              `Skipping completed orphan thread ${thread.id}; linked session ${linkedSessionId} was deleted`,
            );
          }
        } catch {
          // The thread cannot be verified as active and its linked session is
          // gone, so do not resurrect it from stale persisted turns.
          this.debugLog(
            `Skipping unverifiable orphan thread ${thread.id}; linked session ${linkedSessionId} is missing`,
          );
        }
      }

      const fallbackThreads = [...threads].sort(ChatProvider.compareFallbackThreads);
      if (fallbackThreads.length > 0) {
        const restored = await this.loadThread(fallbackThreads[0].id, {
          generation,
          confirmSwitch: false,
          persistTarget: true,
          silent: true,
          knownThread: fallbackThreads[0],
          linkedSessionExists: !fallbackThreads[0].session_id
            || savedSessionIds === null
            || savedSessionIds.has(fallbackThreads[0].session_id),
        });
        if (!this.isCurrentTranscriptSelection(generation) || restored === "stale") return;
        if (restored === "failed") {
          this.postMessage({
            type: "error",
            message: "Failed to restore the most recent transcript.",
          });
        }
      } else {
        this.showEmptyTranscript("Ready - No threads yet");
        await this.persistTranscriptTarget({ version: 1, kind: "empty" });
        if (!this.isCurrentTranscriptSelection(generation)) return;
      }

      this.debugLog("initializeThread SUCCESS, posting ready");
      this.postReadyState();
    } catch (err) {
      if (!this.isCurrentTranscriptSelection(generation)) return;
      this.debugLog(`initializeThread ERROR: ${getErrorMessage(err)}\n${(err as Error).stack}`);
      this.postMessage({
        type: "error",
        message: formatError("Failed to initialize", err),
      });
      this.postReadyState();
    }
  }

  private async loadHistory(
    threadId?: string,
    selectionGeneration?: number,
    throwOnError = false,
  ): Promise<number> {
    const id = threadId ?? this.currentThread?.id;
    if (!id) return 0;
    try {
      const detail = await this.api.getThreadDetail(id);
      if (
        selectionGeneration !== undefined
        && !this.isCurrentTranscriptSelection(selectionGeneration)
      ) return this.lastEventSeq;
      this.messages = [];
      this.subagentTranscriptBlocks.clear();
      this.subagentTranscriptRevision = 0;
      this.pendingSteerItemIds.clear();
      this.turnFileChanges = [];
      this.activeItems.clear();
      this.currentTextBlockIdx = -1;
      this.currentThinkingBlockIdx = -1;
      this.lastEventSeq = detail.latest_seq ?? 0;
      const itemById = new Map(detail.items.map((item) => [item.id, item]));
      const activeTurn = getActiveTurn(detail);

      // The webview may have been destroyed while the engine kept running.
      // Reconcile from the thread detail instead of trusting the webview's
      // ephemeral streaming flag or a stale extension-side turn id.
      this.currentTurnId = activeTurn?.id ?? null;

      const historyToolStatus = (status: TurnItemRecord["status"]): ToolCallInfo["status"] => {
        if (status === "completed") return "complete";
        if (status === "queued") return "pending";
        if (status === "in_progress") return "running";
        return "error";
      };

      for (const turn of detail.turns) {
        const turnIsActive = activeTurn?.id === turn.id;
        const assistantMessageId = `assistant-${turn.id}`;
        const userTexts: string[] = [];
        let content = "";
        let thinking = "";
        const toolCalls: ToolCallInfo[] = [];
        const toolCallIdToIndex = new Map<string, number>();
        const blocks: ContentBlock[] = [];
        let currentTextBlock: ContentBlock | undefined;
        let currentThinkingBlock: ContentBlock | undefined;
        let initialUserMessageSeen = false;
        let suppressInputSummary = false;

        const applyToolResult = (toolUseId: string, output: string, isError: boolean): void => {
          const tcIdx = toolCallIdToIndex.get(toolUseId);
          const tc = tcIdx !== undefined ? toolCalls[tcIdx] : undefined;
          if (!tc) return;
          tc.output = output;
          tc.status = isError ? "error" : "complete";
        };

        const turnItems = (turn.item_ids || [])
          .map((itemId) => itemById.get(itemId))
          .filter((item): item is TurnItemRecord => !!item);

        for (const item of turnItems) {
          switch (item.kind) {
            case "user_message": {
              const text = item.detail || item.summary;
              const isOpeningUserMessage = !initialUserMessageSeen;
              initialUserMessageSeen = true;

              // The runtime persists internal coordination events with a
              // user role so the model can consume them. They are transport,
              // not user input, and must not become an opening bubble or a
              // steer when reconstructing the visible transcript.
              if (text && isInternalRuntimeEventText(text)) {
                if (isOpeningUserMessage) suppressInputSummary = true;
                break;
              }

              const visibleText = text ? stripTurnMeta(text).trim() : "";
              if (!visibleText) break;
              if (isOpeningUserMessage) {
                userTexts.push(visibleText);
              } else {
                // Runtime steers are durable user_message items inside the
                // active turn. Keep them at their exact item position rather
                // than merging them into the opening prompt.
                currentTextBlock = undefined;
                currentThinkingBlock = undefined;
                blocks.push({
                  type: "steer",
                  content: visibleText,
                  sourceId: item.id,
                });
              }
              break;
            }
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
              if (turnIsActive && (item.status === "queued" || item.status === "in_progress")) {
                const blockIdx = currentTextBlock ? blocks.indexOf(currentTextBlock) : -1;
                this.currentTextBlockIdx = blockIdx;
                this.activeItems.set(item.id, {
                  kind: item.kind,
                  msgId: assistantMessageId,
                  blockIdx,
                });
              }
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
              if (turnIsActive && (item.status === "queued" || item.status === "in_progress")) {
                const blockIdx = currentThinkingBlock ? blocks.indexOf(currentThinkingBlock) : -1;
                this.currentThinkingBlockIdx = blockIdx;
                this.activeItems.set(item.id, {
                  kind: item.kind,
                  msgId: assistantMessageId,
                  blockIdx,
                });
              }
              break;
            }
            case "tool_call": {
              currentTextBlock = undefined;
              currentThinkingBlock = undefined;
              const metadata = (item.metadata as Record<string, unknown>) || {};
              const toolResultFor = typeof metadata.tool_result_for === "string"
                ? metadata.tool_result_for
                : undefined;
              if (toolResultFor) {
                applyToolResult(
                  toolResultFor,
                  item.detail || item.summary || "",
                  !!metadata.is_error,
                );
                break;
              }
              const tcIdx = toolCalls.length;
              const rawName = extractToolNameFromSummary(item.summary || "");
              const tc: ToolCallInfo = {
                name: rawName,
                input: metadata,
                output: item.detail || undefined,
                status: historyToolStatus(item.status),
                itemId: typeof metadata.tool_use_id === "string" ? metadata.tool_use_id : item.id,
              };
              if (tc.itemId) {
                toolCallIdToIndex.set(tc.itemId, tcIdx);
              }
              if (isFileChangeTool(tc.name) && tc.input) {
                const filePath = extractFilePath(tc.name, tc.input);
                if (filePath) {
                  const output = tc.output || "";
                  const diff = extractDiffForTool(tc.name, tc.input as Record<string, unknown> | undefined, output);
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
              const toolBlockIdx = blocks.length;
              blocks.push({ type: "tool_call", toolCallIdx: tcIdx });
              if (turnIsActive && (item.status === "queued" || item.status === "in_progress")) {
                const activeItem = {
                  kind: item.kind,
                  msgId: assistantMessageId,
                  toolCallName: tc.name,
                  toolCallIdx: tcIdx,
                  blockIdx: toolBlockIdx,
                };
                this.activeItems.set(item.id, activeItem);
                if (tc.itemId && tc.itemId !== item.id) {
                  this.activeItems.set(tc.itemId, activeItem);
                }
              }
              break;
            }
            case "file_change": {
              currentTextBlock = undefined;
              currentThinkingBlock = undefined;
              const tcIdx2 = toolCalls.length;
              const fcOutput = item.detail || "";
              const fcMeta = (item.metadata as Record<string, unknown>) || {};
              const fcToolName = extractToolNameFromSummary(item.summary || "");
              const fcDiff = extractDiffForTool(fcToolName, fcMeta as Record<string, unknown> | undefined, fcOutput);
              const fcStats = fcDiff ? parseDiffStats(fcDiff) : { added: 0, removed: 0 };
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
                status: historyToolStatus(item.status),
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
              const fileBlockIdx = blocks.length;
              blocks.push({ type: "tool_call", toolCallIdx: tcIdx2 });
              if (turnIsActive && (item.status === "queued" || item.status === "in_progress")) {
                this.activeItems.set(item.id, {
                  kind: item.kind,
                  msgId: assistantMessageId,
                  toolCallName: fcTc.name,
                  toolCallIdx: tcIdx2,
                  blockIdx: fileBlockIdx,
                });
              }
              break;
            }
          }
        }

        const inputSummary = suppressInputSummary
          || isInternalRuntimeEventText(turn.input_summary)
          ? ""
          : stripTurnMeta(turn.input_summary).trim();
        const userContent = stripTurnMeta(userTexts.join("\n")).trim()
          || inputSummary;
        if (userContent) {
          this.messages.push({
            id: `user-${turn.id}`,
            role: "user",
            content: userContent.slice(0, 280),
            status: "complete",
            timestamp: new Date(turn.created_at).getTime(),
          });
        }

        for (const b of blocks) {
          if ((b.type === "text" || b.type === "thinking") && b.content) {
            try { b.contentHtml = renderMarkdown(b.content); } catch { b.contentHtml = b.content; }
          }
        }

        const turnFailed = turn.status === "failed"
          || turn.status === "interrupted"
          || turn.status === "canceled";
        const assistantMsg: ChatMessage = {
          id: assistantMessageId,
          role: "assistant",
          content: content || (turnIsActive ? "" : inputSummary.slice(0, 100)),
          thinking: thinking || undefined,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          blocks: blocks.length > 0 ? blocks : undefined,
          status: turnIsActive ? "streaming" : (turnFailed ? "error" : "complete"),
          timestamp: new Date(turn.ended_at || turn.created_at).getTime(),
        };
        this.messages.push(assistantMsg);

        for (const tc of toolCalls) {
          if (tc.fileChange) {
            const normPath = normalizePath(tc.fileChange.filePath);
            const existingIdx = this.turnFileChanges.findIndex(existing => normalizePath(existing.filePath) === normPath);
            if (existingIdx >= 0) {
              // Merge with existing change for cumulative stats
              const existing = this.turnFileChanges[existingIdx];
              const existingDiffs = existing.diffs ?? (existing.diff ? [existing.diff] : []);
              const newDiffs = tc.fileChange.diff ? [...existingDiffs, tc.fileChange.diff] : existingDiffs;
              this.turnFileChanges[existingIdx] = {
                ...tc.fileChange,
                addedLines: existing.addedLines + tc.fileChange.addedLines,
                removedLines: existing.removedLines + tc.fileChange.removedLines,
                changeType: tc.fileChange.changeType === "created" ? "created" :
                           tc.fileChange.changeType === "deleted" && existing.changeType !== "created" ? "deleted" :
                           existing.changeType,
                diff: tc.fileChange.diff ?? existing.diff,
                diffs: newDiffs,
                toolName: tc.fileChange.toolName ?? existing.toolName,
              };
            } else {
              this.turnFileChanges.push({
                ...tc.fileChange,
                diffs: tc.fileChange.diff ? [tc.fileChange.diff] : [],
              });
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
          this.totalTokens += u.input_tokens + u.output_tokens;
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
            this.displayedCostHighWaterUsd = Math.max(this.displayedCostHighWaterUsd, this.sessionCostUsd);
            this.displayedCostHighWaterCny = Math.max(this.displayedCostHighWaterCny, this.sessionCostCny);
          }
        }
      }
      this.sendSessionStats();

      // Hydrate persisted child transcripts into the reconstructed message
      // tree before the single history paint. Replaying them afterward would
      // append every completed child below the master's final answer.
      this.restoringSubagentTranscriptHistory = true;
      try {
        await this.refreshAgentRuns();
      } finally {
        this.restoringSubagentTranscriptHistory = false;
      }
      if (
        selectionGeneration !== undefined
        && !this.isCurrentTranscriptSelection(selectionGeneration)
      ) return this.lastEventSeq;
      this.postMessage({ type: "loadHistory", messages: this.messages });
      if (activeTurn) {
        this.startPeriodicTaskRefresh();
        this.postMessage({ type: "turnStarted", turnId: activeTurn.id });
      } else {
        this.stopPeriodicTaskRefresh();
      }
      this.postMessage({ type: "status", text: `Loaded ${this.messages.length / 2} turns` });
      return this.lastEventSeq;
    } catch (err) {
      if (
        selectionGeneration !== undefined
        && !this.isCurrentTranscriptSelection(selectionGeneration)
      ) return this.lastEventSeq;
      if (throwOnError) throw err;
      this.postMessage({
        type: "error",
        message: formatError("Failed to load history", err),
      });
      return this.lastEventSeq;
    }
  }

  public async loadSessionMessages(
    sessionId: string,
    options: TranscriptSelectionOptions = {},
  ): Promise<TranscriptSelectionResult> {
    const generation = options.generation ?? this.beginTranscriptSelection();
    if (options.confirmSwitch !== false) {
      const confirmed = await this.confirmSwitchWhenActive();
      if (!this.isCurrentTranscriptSelection(generation)) return "stale";
      if (!confirmed) return "cancelled";
    }
    try {
      const session = await this.api.getSession(sessionId);
      if (!this.isCurrentTranscriptSelection(generation)) return "stale";
      const title = session.metadata.title || "Session";

      this.cleanup();
      this.sessionState.reset();
      this.viewingSessionId = sessionId;

      // Tell the webview which model/mode this session uses so the status
      // bar reflects the loaded session (not the user's global default).
      // We deliberately do NOT update the global VSCode config — that would
      // permanently change defaultModel/defaultMode and cause every new
      // conversation to inherit the session's mode, even after the user
      // moves on to a different task (e.g. a plan-mode session would lock
      // the extension into plan mode forever).
      const sessionModel = session.metadata.model;
      const sessionMode = session.metadata.mode || "agent";
      const cfg = vscode.workspace.getConfiguration("cblage.codewhale");
      const currentModel = cfg.get<string>("defaultModel", "deepseek-v4-pro");
      this.viewedSessionDisplay = {
        model: sessionModel || currentModel,
        mode: sessionMode,
      };

      // Stash the session's persisted cost so it can be restored after
      // resumeSessionThread + loadThread (which zero stats because seeded
      // turns have no usage data). Mirrors TUI's apply_loaded_session.
      const cost = session.metadata.cost;
      if (cost) {
        this.pendingSessionCost = {
          sessionCostUsd: cost.session_cost_usd || 0,
          sessionCostCny: cost.session_cost_cny || 0,
          subagentCostUsd: cost.subagent_cost_usd || 0,
          subagentCostCny: cost.subagent_cost_cny || 0,
          displayedCostHighWaterUsd: cost.displayed_cost_high_water_usd || 0,
          displayedCostHighWaterCny: cost.displayed_cost_high_water_cny || 0,
          totalTokens: session.metadata.total_tokens || 0,
          cumulativeTurnSecs: session.metadata.cumulative_turn_secs || 0,
        };
      }

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
    const getToolResultText = (block: {
      content?: string;
      content_blocks?: Array<{ type: string; text?: string }>;
    }): string => {
      if (typeof block.content === "string") {
        return block.content;
      }
      if (Array.isArray(block.content_blocks)) {
        return block.content_blocks
          .map((part) => part.text || "")
          .filter((text) => text.length > 0)
          .join("\n");
      }
      return "";
    };
    const updateFileChangeCard = (toolCall: ToolCallInfo): void => {
      if (!isFileChangeTool(toolCall.name) || !toolCall.input) return;
      const filePath = extractFilePath(toolCall.name, toolCall.input);
      if (!filePath) return;
      const output = toolCall.output || "";
      const diff = extractDiffForTool(toolCall.name, toolCall.input as Record<string, unknown> | undefined, output);
      const stats = diff ? parseDiffStats(diff) : { added: 0, removed: 0 };
      const changeType: "created" | "modified" | "deleted" =
        toolCall.name === "delete_file" ? "deleted" :
        toolCall.name === "write_file" && !diff ? "created" : "modified";
      toolCall.fileChange = {
        filePath,
        changeType,
        addedLines: stats.added,
        removedLines: stats.removed,
        diff,
        toolName: toolCall.name,
      };
    };

    let i = 0;
    while (i < rawMessages.length) {
      const msg = rawMessages[i];

      if (msg.role === "user" && msg.content.every((b) => b.type === "tool_result")) {
        for (const block of msg.content) {
          if (block.type === "tool_result" && block.tool_use_id) {
            const idx = globalToolIdMap.get(block.tool_use_id);
            if (idx !== undefined && globalToolCalls[idx]) {
              const outputText = getToolResultText(block);
              globalToolCalls[idx].output = outputText;
              globalToolCalls[idx].status = block.is_error ? "error" : "complete";
              updateFileChangeCard(globalToolCalls[idx]);
            }
          }
        }
        i++;
        continue;
      }

      if (msg.role === "user") {
        const textBlocks: string[] = [];
        while (i < rawMessages.length && rawMessages[i].role === "user") {
          const userMessage = rawMessages[i];
          const containsInternalRuntimeEvent = (userMessage.content || []).some(
            (block) => block.type === "text"
              && !!block.text
              && isInternalRuntimeEventText(block.text),
          );
          if (containsInternalRuntimeEvent) {
            // Drop the whole persisted transport message. This also removes
            // a sibling/adjacent turn_meta text block instead of leaving it
            // behind as an empty or raw USER card.
            i++;
            continue;
          }
          for (const block of userMessage.content || []) {
            if (block.type === "text" && block.text) {
              const visibleText = stripTurnMeta(block.text).trim();
              if (visibleText) textBlocks.push(visibleText);
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
              const toolCall: ToolCallInfo = {
                name: block.name,
                displayName: friendlyToolName(block.name),
                input: block.input || {},
                status: "pending",
                itemId: block.id,
              };
              updateFileChangeCard(toolCall);
              globalToolCalls.push(toolCall);
              blocks.push({ type: "tool_call", toolCallIdx: idx });
              turnToolCallIndices.push(idx);
            } else if (block.type === "tool_result" && block.tool_use_id) {
              const idx = globalToolIdMap.get(block.tool_use_id);
              if (idx !== undefined && globalToolCalls[idx]) {
                const outputText = getToolResultText(block);
                globalToolCalls[idx].output = outputText;
                globalToolCalls[idx].status = block.is_error ? "error" : "complete";
                updateFileChangeCard(globalToolCalls[idx]);
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
                const outputText = getToolResultText(block);
                globalToolCalls[idx].output = outputText;
                globalToolCalls[idx].status = block.is_error ? "error" : "complete";
                updateFileChangeCard(globalToolCalls[idx]);
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

    // Collect file changes from reconstructed tool calls so the sidebar
    // Changes panel reflects the loaded session (mirrors loadHistory).
    for (const tc of globalToolCalls) {
      if (tc.fileChange) {
        const normPath = normalizePath(tc.fileChange.filePath);
        const existingIdx = this.turnFileChanges.findIndex(existing => normalizePath(existing.filePath) === normPath);
        if (existingIdx >= 0) {
          // Merge with existing change for cumulative stats
          const existing = this.turnFileChanges[existingIdx];
          const existingDiffs = existing.diffs ?? (existing.diff ? [existing.diff] : []);
          const newDiffs = tc.fileChange.diff ? [...existingDiffs, tc.fileChange.diff] : existingDiffs;
          this.turnFileChanges[existingIdx] = {
            ...tc.fileChange,
            addedLines: existing.addedLines + tc.fileChange.addedLines,
            removedLines: existing.removedLines + tc.fileChange.removedLines,
            changeType: tc.fileChange.changeType === "created" ? "created" :
                       tc.fileChange.changeType === "deleted" && existing.changeType !== "created" ? "deleted" :
                       existing.changeType,
            diff: tc.fileChange.diff ?? existing.diff,
            diffs: newDiffs,
            toolName: tc.fileChange.toolName ?? existing.toolName,
          };
        } else {
          this.turnFileChanges.push({
            ...tc.fileChange,
            diffs: tc.fileChange.diff ? [tc.fileChange.diff] : [],
          });
        }
      }
    }
    this.refreshChangesPanel();

    // ── Restore Work state from tool calls (checklist + strategy) ──
    // When viewing a saved session, the SSE event stream is not replaying,
    // so checklist / strategy must be reconstructed from the tool call inputs.
    // The tool output is just a text confirmation; the real data is in tc.input.
    let workRestored = false;
    for (let ti = globalToolCalls.length - 1; ti >= 0; ti--) {
      const tc = globalToolCalls[ti];
      if (!tc.input || Object.keys(tc.input).length === 0) continue;
      // Restore checklist from the last checklist_write (full state replacement)
      if (!workRestored && tc.name === "checklist_write") {
        const todos = tc.input.todos;
        if (Array.isArray(todos)) {
          const items = (todos as Array<Record<string, unknown>>).map((t, idx) => ({
            id: String(idx + 1),
            content: (t.content || "") as string,
            status: (t.status || "pending") as string,
          }));
          if (items.length > 0) {
            this.checklistItems = items;
            const done = items.filter(it => it.status === "completed").length;
            this.checklistCompletionPct = Math.round((done / items.length) * 100);
            workRestored = true;
          }
        }
      }
      // Restore strategy from the last update_plan
      if (tc.name === "update_plan") {
        const plan = tc.input.plan;
        if (Array.isArray(plan)) {
          this.strategySteps = (plan as Array<Record<string, unknown>>)
            .filter(s => typeof s.step === "string")
            .map(s => ({
              text: (s.step as string),
              status: (s.status || "pending") as string,
            }));
        }
      }
    }
    this.refreshWorkPanel();

    const msgCount = this.messages.length;
    const costUsd = session.metadata.cost?.session_cost_usd ?? 0;
    const costStr = costUsd > 0 ? ` | $${costUsd.toFixed(2)}` : "";
    const modelStr = session.metadata.model ? ` | ${session.metadata.model}` : "";

    // Saved sessions have no per-message timestamps. Restore completed child
    // cards at their durable parent-agent boundary, sorted by each child's
    // last checkpoint update, before painting the history once.
    this.restoringSubagentTranscriptHistory = true;
    try {
      await this.refreshAgentRuns();
    } finally {
      this.restoringSubagentTranscriptHistory = false;
    }
    if (!this.isCurrentTranscriptSelection(generation)) return "stale";
    if (options.persistTarget !== false) {
      await this.persistTranscriptTarget({ version: 1, kind: "session", id: sessionId });
      if (!this.isCurrentTranscriptSelection(generation)) return "stale";
    }
    this.postMessage({
      type: "settingsUpdated",
      model: sessionModel || currentModel,
      mode: sessionMode,
      reasoningEffort: cfg.get<string>("reasoningEffort", "auto"),
    });
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
    return "loaded";
    } catch (err) {
      if (!this.isCurrentTranscriptSelection(generation)) return "stale";
      const errorMsg = getErrorMessage(err);
      this.debugLog(`loadSessionMessages error: ${errorMsg}`);

      const result: TranscriptSelectionResult = ChatProvider.isNotFoundError(err)
        ? "not-found"
        : "failed";

      // A late reconstruction failure must not leave half of a saved session
      // painted as though it loaded successfully. The durable target remains
      // untouched on transient failure and will be retried next reload.
      this.cleanup();
      this.sessionState.reset();
      this.viewedSessionDisplay = null;

      if (options.silent) return result;

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
      this.postMessage({ type: "clearChat" });
      return result;
    }
  }

  private async loadThread(
    threadId: string,
    options: TranscriptSelectionOptions = {},
  ): Promise<TranscriptSelectionResult> {
    const generation = options.generation ?? this.beginTranscriptSelection();
    let selectionApplied = false;
    if (options.confirmSwitch !== false) {
      const confirmed = await this.confirmSwitchWhenActive();
      if (!this.isCurrentTranscriptSelection(generation)) return "stale";
      if (!confirmed) return "cancelled";
    }

    try {
      const selectedThread = options.knownThread ?? await this.api.getThread(threadId);
      if (!this.isCurrentTranscriptSelection(generation)) return "stale";
      if (selectedThread.archived === true) return "not-found";

      this.cleanup();
      this.sessionState.reset();
      selectionApplied = true;
      this.currentThread = selectedThread;
      this.viewedSessionDisplay = null;
      this.currentSessionId = options.linkedSessionExists === false
        ? null
        : this.currentThread.session_id ?? null;

      // If the thread's workspace doesn't match the current workspace,
      // update it so the engine operates on the current workspace's files
      // and events flow correctly through the current engine.
      const currentWorkspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (currentWorkspace && this.currentThread.workspace !== currentWorkspace) {
        const oldWorkspace = this.currentThread.workspace;
        try {
          const updatedThread = await this.api.updateThread(threadId, {
            workspace: currentWorkspace,
          });
          if (!this.isCurrentTranscriptSelection(generation)) return "stale";
          this.currentThread = mergeThreadRecord(this.currentThread, updatedThread, {
            workspace: currentWorkspace,
          });
          this.postMessage({
            type: "info",
            message: `Thread workspace updated: ${oldWorkspace} → ${currentWorkspace}`,
          });
        } catch {
          if (!this.isCurrentTranscriptSelection(generation)) return "stale";
          // Non-critical: the turn may still work with the old workspace
          this.postMessage({
            type: "info",
            message: `Thread workspace (${oldWorkspace}) differs from current (${currentWorkspace}). Continuing may redirect output to the original workspace.`,
          });
        }
      }

      await this.loadHistory(threadId, generation, true);
      if (!this.isCurrentTranscriptSelection(generation)) return "stale";
      if (options.persistTarget !== false) {
        await this.persistTranscriptTarget({ version: 1, kind: "thread", id: threadId });
        if (!this.isCurrentTranscriptSelection(generation)) return "stale";
      }
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
      // Refresh sidebar task/agent lists for the new thread
      await Promise.all([this.refreshTaskList(), this.refreshAgentRuns()]);
      if (!this.isCurrentTranscriptSelection(generation)) return "stale";
      // Push current work/changes state for this thread
      this.refreshWorkPanel();
      return "loaded";
    } catch (err) {
      if (!this.isCurrentTranscriptSelection(generation)) return "stale";
      const result: TranscriptSelectionResult = ChatProvider.isNotFoundError(err)
        ? "not-found"
        : "failed";
      if (selectionApplied) {
        this.cleanup();
        this.sessionState.reset();
        this.viewedSessionDisplay = null;
      }
      if (!options.silent) {
        if (selectionApplied) this.postMessage({ type: "clearChat" });
        this.postMessage({
          type: "error",
          message: formatError("Failed to load thread", err),
        });
      }
      return result;
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

  private async handleSendMessage(
    displayText: string,
    backendText: string = displayText,
  ): Promise<void> {
    if (!displayText.trim() && this.currentAttachments.length === 0) return;

    const attachments = [...this.currentAttachments];
    this.currentAttachments = [];
    this.postMessage({ type: "attachmentsChanged", attachments: [] });

    let visibleText = displayText;
    let turnText = backendText;
    if (attachments.length > 0) {
      const attachmentLines = attachments.map((a) => {
        if (a.kind === "file") {
          return `@${a.path}`;
        }
        return `[Attached ${a.kind}: ${a.path}]`;
      });
      const appendAttachments = (base: string): string => base.trim()
        ? base.trimEnd() + "\n" + attachmentLines.join("\n")
        : attachmentLines.join("\n");
      visibleText = appendAttachments(visibleText);
      turnText = appendAttachments(turnText);
    }

    try {
      await this.api.ensureReady();

      if (this.viewingSessionId) {
        const generation = this.beginTranscriptSelection();
        const sessionId = this.viewingSessionId;
        const sessionCost = this.pendingSessionCost;
        // Don't pass model/mode — let the backend use the session's persisted
        // values (runtime_api.rs:911-918 unwraps to session.metadata.model/mode).
        // Passing cfg defaults would override the session's original model/mode,
        // busting the prefix cache because the system prompt and tool catalog
        // change with the model/mode.
        const result = await this.api.resumeSessionThread(sessionId);
        if (!this.isCurrentTranscriptSelection(generation)) return;
        try {
          await this.api.updateThread(result.thread_id, {
            title: `Resumed: ${result.summary.slice(0, 50)}`,
          });
          if (!this.isCurrentTranscriptSelection(generation)) return;
        } catch {
          if (!this.isCurrentTranscriptSelection(generation)) return;
          // Title updates are non-critical to the transcript transition.
        }

        this.viewingSessionId = null;
        const loaded = await this.loadThread(result.thread_id, {
          generation,
          confirmSwitch: false,
        });
        if (loaded !== "loaded" || !this.isCurrentTranscriptSelection(generation)) return;
        // Restore cost from the original session's metadata. loadThread →
        // loadHistory iterates the NEW thread's seeded turns, which have
        // usage: None, so stats are zeroed. Restore the persisted cost here
        // (mirrors TUI's apply_loaded_session, ui.rs:9399-9413).
        if (sessionCost) {
          this.sessionCostUsd = sessionCost.sessionCostUsd;
          this.sessionCostCny = sessionCost.sessionCostCny;
          this.displayedCostHighWaterUsd = sessionCost.displayedCostHighWaterUsd;
          this.displayedCostHighWaterCny = sessionCost.displayedCostHighWaterCny;
          this.totalTokens = sessionCost.totalTokens;
          this.cumulativeTurnSecs = sessionCost.cumulativeTurnSecs;
          this.pendingSessionCost = null;
          this.sendSessionStats();
        }
        // Preserve the original session ID so subsequent auto-saves update
        // the same session in-place (mirrors TUI's /load behavior). This is
        // safe because seed_thread_from_messages now stores the full original
        // messages (with tool_use/tool_result blocks) on the thread record
        // via seeded_messages, and ensure_engine_loaded uses those directly
        // for SyncSession — so the engine's session preserves the exact
        // prefix. Auto-save (PUT /v1/sessions) snapshots the engine's live
        // state, which includes the full tool blocks, so the original
        // session's messages stay cache-friendly for future resumes.
        this.currentSessionId = sessionId;
        this.refreshSessionList();
      }

      if (!this.currentThread) {
        const generation = this.beginTranscriptSelection();
        const cfg = vscode.workspace.getConfiguration("cblage.codewhale");
        const model = cfg.get<string>("defaultModel", "deepseek-v4-pro");
        const mode = cfg.get<string>("defaultMode", "agent");
        const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const isYolo = mode === "yolo";
        const autoApprove = isYolo || cfg.get<boolean>("autoApprove", false);
        const createdThread = await this.api.createThread({
          model,
          mode,
          workspace,
          auto_approve: autoApprove,
          trust_mode: isYolo,
        });
        if (!this.isCurrentTranscriptSelection(generation)) return;
        this.currentThread = createdThread;
        this.viewedSessionDisplay = null;
        await this.persistTranscriptTarget({
          version: 1,
          kind: "thread",
          id: createdThread.id,
        });
        if (!this.isCurrentTranscriptSelection(generation)) return;
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
        content: visibleText,
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
        const replacementGeneration = this.beginTranscriptSelection();
        const cfg = vscode.workspace.getConfiguration("cblage.codewhale");
        const mode = cfg.get<string>("defaultMode", "agent");
        const autoApprove = cfg.get<boolean>("autoApprove", false);
        const replacementThread = await this.api.createThread({
          model: this.getCurrentModel(),
          mode,
          workspace: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
          auto_approve: autoApprove,
          trust_mode: mode === "yolo",
        });
        if (!this.isCurrentTranscriptSelection(replacementGeneration)) return;
        this.currentThread = replacementThread;
        this.viewedSessionDisplay = null;
        await this.persistTranscriptTarget({
          version: 1,
          kind: "thread",
          id: replacementThread.id,
        });
        if (!this.isCurrentTranscriptSelection(replacementGeneration)) return;
        this.subscribeToEvents();
        this.refreshSessionList();
      }

      // Ensure thread workspace matches current workspace before starting turn
      const currentWorkspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (currentWorkspace && this.currentThread.workspace !== currentWorkspace) {
        try {
          const updatedThread = await this.api.updateThread(this.currentThread.id, {
            workspace: currentWorkspace,
          });
          this.currentThread = mergeThreadRecord(this.currentThread, updatedThread, {
            workspace: currentWorkspace,
          });
        } catch { /* non-critical */ }
      }

      const cfg = vscode.workspace.getConfiguration("cblage.codewhale");
      const reasoningEffort = cfg.get<string>("reasoningEffort", "auto");
      const mode = this.currentThread.mode;
      const model = this.currentThread.model;
      // Use the thread's persisted auto_approve / trust_mode instead of the
      // config defaults.  When the user approves with "remember", the TUI
      // flips thread.auto_approve to true (remember_thread_auto_approve) and
      // the GUI mirrors that in handleApprovalDecision.  Sending the config
      // value (typically false) here would override the thread's persisted
      // state on every new turn, causing "remember" to silently revert and
      // re-prompting for approvals the user already granted — which then
      // surface as "Request cancelled while awaiting approval" when the turn
      // is interrupted.
      const result = await this.api.startTurn(this.currentThread.id, turnText, {
        mode,
        model,
        reasoning_effort: reasoningEffort,
        auto_approve: this.currentThread.auto_approve,
        trust_mode: this.currentThread.trust_mode,
        ...(turnText !== visibleText
          ? { input_summary: visibleText.trim().slice(0, 280) }
          : {}),
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
    const generation = this.beginTranscriptSelection();
    this.cleanup();
    this.sessionState.reset();
    this.viewedSessionDisplay = null;
    await this.persistTranscriptTarget({ version: 1, kind: "empty" });
    if (!this.isCurrentTranscriptSelection(generation)) return;
    this.postMessage({ type: "clearChat" });
    // Clear stale sidebar data
    this.postMessage({ type: "taskList", tasks: [] });
    this.postMessage({ type: "agentRunList", runs: [] });
  }

  /** Auto-save the current thread as a session after each completed turn.
   *  Same thread → same session (via PUT with session_id), mirroring TUI's
   *  build_session_snapshot → SessionSnapshot persistence flow. */
  private async autoSaveSession(): Promise<void> {
    // Prevent concurrent saves.  When multiple turn.completed events fire
    // in quick succession (e.g. SSE reconnection replay) and
    // currentSessionId is still null, each concurrent call would create a
    // new session on the server, producing duplicates.
    if (this.autoSaveInProgress) {
      this.debugLog("[autoSaveSession] Save already in progress, skipping");
      return;
    }
      const thread = this.currentThread;
    if (!thread) {
      this.debugLog("[autoSaveSession] No current thread, skipping");
      return;
    }
    if (!this.apiCapabilities.saveSession) {
      this.debugLog("[autoSaveSession] saveSession capability not available, skipping");
      return;
    }
    this.autoSaveInProgress = true;
    const savingSessionId = this.currentSessionId;
    try {
      if (
        this.retiredThreadIds.has(thread.id)
        || (savingSessionId && this.deletedSessionIds.has(savingSessionId))
      ) {
        this.debugLog(`[autoSaveSession] Thread ${thread.id} was retired; skipping`);
        return;
      }
      this.debugLog(`[autoSaveSession] Saving thread ${thread.id} with sessionId=${savingSessionId}`);
      const result = await this.api.saveCurrentSession(thread.id, savingSessionId ?? undefined);
      if (
        this.retiredThreadIds.has(thread.id)
        || this.deletedSessionIds.has(result.session_id)
        || (savingSessionId && this.deletedSessionIds.has(savingSessionId))
      ) {
        // Deletion may race an already in-flight save. Remove the late
        // snapshot instead of allowing the deleted conversation to reappear.
        try { await this.api.deleteSession(result.session_id); } catch { /* best effort */ }
        this.debugLog(`[autoSaveSession] Removed late save ${result.session_id} for retired thread ${thread.id}`);
        return;
      }
      this.currentSessionId = result.session_id;
      this.debugLog(`[autoSaveSession] Saved successfully, sessionId=${result.session_id}`);
    } catch (err) {
      this.debugLog(`[autoSaveSession] Failed: ${err instanceof Error ? err.message : String(err)}`);
      // Auto-save is best-effort; don't disrupt the UI on failure.
    } finally {
      this.autoSaveInProgress = false;
    }
  }

  /** Refresh the session list shown in the sidebar */
  public async refreshSessionList(limit = 100): Promise<SessionMetadata[] | null> {
    const fetchAndSend = async (): Promise<SessionMetadata[]> => {
      const result = await this.api.listSessions({ limit });
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
      return deduped;
    };
    try {
      return await fetchAndSend();
    } catch (err) {
      setTimeout(async () => {
        try { await fetchAndSend(); } catch { /* silent */ }
      }, 2000);
      return null;
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

  /** Delete a session with confirmation dialog */
  private async handleDeleteSession(sessionId: string, sessionTitle: string): Promise<void> {
    const confirmMsg = t().deleteSessionConfirmMessage.replace("{title}", sessionTitle || sessionId.slice(0, 8));
    const confirm = await vscode.window.showWarningMessage(
      t().deleteSessionConfirmTitle,
      { modal: true },
      confirmMsg,
    );
    if (confirm !== confirmMsg) return;
    try {
      let linkedThreads: ThreadRecord[] = [];
      try {
        linkedThreads = (await this.api.listThreads({ limit: 500, include_archived: true }))
          .filter((thread) => thread.session_id === sessionId);
      } catch {
        // The currently loaded thread is still enough to retire the visible
        // conversation when the broader thread index is unavailable.
      }
      if (
        this.currentThread?.session_id === sessionId
        && !linkedThreads.some((thread) => thread.id === this.currentThread?.id)
      ) {
        linkedThreads.push(this.currentThread);
      }

      const deletingCurrent = this.viewingSessionId === sessionId
        || this.currentSessionId === sessionId
        || linkedThreads.some((thread) => thread.id === this.currentThread?.id);

      this.deletedSessionIds.add(sessionId);
      for (const thread of linkedThreads) this.retiredThreadIds.add(thread.id);
      try {
        await this.api.deleteSession(sessionId);
      } catch (err) {
        this.deletedSessionIds.delete(sessionId);
        for (const thread of linkedThreads) this.retiredThreadIds.delete(thread.id);
        throw err;
      }

      // Retire every resumed/runtime copy linked to this snapshot. There is
      // no thread DELETE route, and archived threads are excluded from normal
      // startup/listing without erasing their lower-level audit records.
      await Promise.allSettled(linkedThreads.map(async (thread) => {
        try {
          const detail = await this.api.getThreadDetail(thread.id);
          const activeTurn = getActiveTurn(detail);
          if (activeTurn) await this.api.interruptTurn(thread.id, activeTurn.id);
        } catch { /* already inactive or unavailable */ }
        await this.api.updateThread(thread.id, { archived: true });
      }));

      if (deletingCurrent) {
        await this.handleNewThread();
        this.postMessage({ type: "status", text: "Ready" });
      }
      await this.refreshSessionList();
      await this.refreshThreadList();
      vscode.window.setStatusBarMessage(t().deleteSessionSuccess, 3000);
    } catch (err) {
      vscode.window.showErrorMessage(`${t().deleteSessionFailed}: ${getErrorMessage(err)}`);
    }
  }

  /** Search sessions by query and update the sidebar */
  private async handleSearchSessions(query: string): Promise<void> {
    try {
      const result = await this.api.listSessions({ limit: 100, search: query || undefined });
      let sessions = result.sessions || [];
      const currentWorkspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!this.showAllWorkspaces && currentWorkspace) {
        sessions = sessions.filter(s => s.workspace === currentWorkspace);
      }
      this.postMessage({ type: "sessionList", sessions, showAllWorkspaces: this.showAllWorkspaces });
    } catch {
      // best-effort
    }
  }

  /** Refresh the task list shown in the sidebar, scoped to the current workspace */
  public async refreshTaskList(): Promise<void> {
    try {
      const result = await this.api.listTasks({ limit: 50 });
      const tasks = result.tasks;
      this.postMessage({ type: "taskList", tasks });
    } catch {
      // best-effort
    }
  }

  private isAgentRunActive(run: AgentRunRecord): boolean {
    return run.runtime_available !== false && run.completed_at_ms == null && [
      "queued", "starting", "running", "in_progress", "waiting_for_user",
      "model_wait", "running_tool", "working", "pending",
    ].includes(String(run.status || "").toLowerCase());
  }

  private isAgentRunWatchdogTarget(run: AgentRunRecord): boolean {
    if (run.runtime_available === false) return false;
    if (this.isAgentRunActive(run)) return true;
    return String(run.status || "").toLowerCase() === "waiting_for_user"
      && run.recommended_action?.action === "inspect_or_replace";
  }

  private getAgentWatchdogSettings(): { enabled: boolean; intervalMs: number } {
    const config = vscode.workspace.getConfiguration("cblage.codewhale");
    const rawSeconds = config.get<number>("agentWakeIntervalSeconds", 30);
    const seconds = Math.min(
      3600,
      Math.max(10, Number.isFinite(rawSeconds) ? Math.round(rawSeconds) : 30),
    );
    return {
      enabled: config.get<boolean>("autoWakeMasterForAgents", true),
      intervalMs: seconds * 1000,
    };
  }

  private clearAgentWatchdogTimer(): void {
    if (this.agentWatchdogTimer) {
      clearTimeout(this.agentWatchdogTimer);
      this.agentWatchdogTimer = null;
    }
  }

  private stopAgentWatchdog(resetState = true): void {
    this.clearAgentWatchdogTimer();
    this.agentWatchdogGeneration++;
    if (resetState) {
      this.agentWatchdogThreadId = null;
      this.agentWatchdogHadActiveRuns = false;
      this.agentWatchdogBatchAgentIds.clear();
      this.agentWatchdogDurableCompletionAgentIds.clear();
      this.agentWatchdogCompletionPending = false;
      this.agentWatchdogParkedForIdleParent = false;
      this.lastMasterActivityAt = Date.now();
    }
  }

  private scheduleAgentWatchdog(delayMs: number): void {
    if (this.agentWatchdogTimer || this.agentWatchdogInFlight) return;
    const generation = this.agentWatchdogGeneration;
    this.agentWatchdogTimer = setTimeout(() => {
      this.agentWatchdogTimer = null;
      if (generation !== this.agentWatchdogGeneration) return;
      void this.runAgentWatchdog(generation);
    }, Math.max(0, delayMs));
  }

  private reconcileAgentWatchdog(): void {
    const settings = this.getAgentWatchdogSettings();
    const threadId = this.currentThread?.id || null;
    const watchdogTargets = this.cachedScopedAgentRuns.filter((run) =>
      this.isAgentRunWatchdogTarget(run)
    );
    const activeRuns = this.cachedScopedAgentRuns.filter((run) => this.isAgentRunActive(run));
    const hasWatchdogTargets = watchdogTargets.length > 0;
    const threadChanged = this.agentWatchdogThreadId !== threadId;

    if (threadChanged) {
      this.clearAgentWatchdogTimer();
      this.agentWatchdogThreadId = threadId;
      this.agentWatchdogHadActiveRuns = false;
      this.agentWatchdogBatchAgentIds.clear();
      this.agentWatchdogDurableCompletionAgentIds.clear();
      this.agentWatchdogCompletionPending = false;
      this.agentWatchdogParkedForIdleParent = false;
    }

    const canRun = settings.enabled
      && this.apiCapabilities.agentRunNudge
      && !!threadId;

    if (!canRun) {
      this.clearAgentWatchdogTimer();
      this.agentWatchdogHadActiveRuns = false;
      this.agentWatchdogBatchAgentIds.clear();
      this.agentWatchdogDurableCompletionAgentIds.clear();
      this.agentWatchdogCompletionPending = false;
      this.agentWatchdogParkedForIdleParent = false;
      return;
    }

    if (activeRuns.length > 0) {
      const startingBatch = !this.agentWatchdogHadActiveRuns;
      this.agentWatchdogHadActiveRuns = true;
      for (const run of activeRuns) {
        const workerId = run.spec?.worker_id || run.spec?.run_id;
        if (workerId) this.agentWatchdogBatchAgentIds.add(workerId);
      }
      if (startingBatch) {
        this.agentWatchdogCompletionPending = false;
        this.lastMasterActivityAt = Date.now();
      }
    } else if (this.agentWatchdogHadActiveRuns) {
      // Preserve the completed batch until the core emits activity for its
      // durable SubAgentHandoff follow-up turn. The extension deliberately
      // does not synthesize a user turn or POST ids without completion data.
      this.agentWatchdogHadActiveRuns = false;
      this.agentWatchdogCompletionPending = this.agentWatchdogBatchAgentIds.size > 0
        && !this.isAgentWatchdogBatchDurablyHandedOff();
      this.clearAgentWatchdogTimer();
      if (this.agentWatchdogCompletionPending) {
        this.debugLog(
          `[agent-watchdog] observed completed batch of `
          + `${this.agentWatchdogBatchAgentIds.size} agent(s); awaiting durable handoff turn`,
        );
      } else if (this.agentWatchdogBatchAgentIds.size > 0) {
        this.clearAgentWatchdogCompletedBatch("handoff turn already observed");
      }
    }

    if (!hasWatchdogTargets || this.agentWatchdogCompletionPending) {
      this.clearAgentWatchdogTimer();
      return;
    }

    // A legacy core returns 409 when the parent is idle. Park after that
    // explicit receipt so reconcile/refresh cannot hot-loop against it. New
    // cores accept the same nudge and create a durable internal watchdog turn.
    if (this.agentWatchdogParkedForIdleParent) {
      this.clearAgentWatchdogTimer();
      return;
    }

    if (this.agentWatchdogInFlight || this.agentWatchdogTimer) return;
    const elapsed = Math.max(0, Date.now() - this.lastMasterActivityAt);
    this.scheduleAgentWatchdog(Math.max(0, settings.intervalMs - elapsed));
  }

  private noteMasterActivity(): void {
    this.lastMasterActivityAt = Date.now();
    this.agentWatchdogParkedForIdleParent = false;
    if (!this.agentWatchdogHadActiveRuns) return;
    this.clearAgentWatchdogTimer();
    this.reconcileAgentWatchdog();
  }

  private isAgentWatchdogBatchDurablyHandedOff(): boolean {
    return this.agentWatchdogBatchAgentIds.size > 0
      && [...this.agentWatchdogBatchAgentIds].every((agentId) =>
        this.agentWatchdogDurableCompletionAgentIds.has(agentId)
      );
  }

  private clearAgentWatchdogCompletedBatch(reason: string): void {
    this.debugLog(
      `[agent-watchdog] ${reason}; acknowledged completed batch of `
      + `${this.agentWatchdogBatchAgentIds.size} agent(s)`,
    );
    this.agentWatchdogCompletionPending = false;
    this.agentWatchdogBatchAgentIds.clear();
    this.agentWatchdogDurableCompletionAgentIds.clear();
  }

  private noteAgentWatchdogDurableCompletion(agentIds: unknown): void {
    if (!Array.isArray(agentIds)) return;
    for (const agentId of agentIds) {
      if (typeof agentId === "string" && agentId.length > 0) {
        this.agentWatchdogDurableCompletionAgentIds.add(agentId);
      }
    }
    if (this.agentWatchdogCompletionPending && this.isAgentWatchdogBatchDurablyHandedOff()) {
      this.clearAgentWatchdogCompletedBatch("durable handoff turn observed");
    }
  }

  private scopedAgentRunsForWatchdog(runs: AgentRunRecord[]): AgentRunRecord[] {
    const refs = collectConversationAgentRefs(this.messages);
    // Once a conversation has been scoped, retain those durable ids while
    // the webview is hidden and its live transcript is temporarily paused.
    for (const cached of this.cachedScopedAgentRuns) {
      if (cached.spec?.worker_id) refs.ids.add(cached.spec.worker_id);
      if (cached.spec?.run_id) refs.ids.add(cached.spec.run_id);
    }
    return this.preserveAgentPresentationFields(
      filterAgentRunsForConversation(runs, refs),
    );
  }

  private async runAgentWatchdog(generation: number): Promise<void> {
    if (this.agentWatchdogInFlight || generation !== this.agentWatchdogGeneration) return;
    const threadId = this.currentThread?.id;
    const settings = this.getAgentWatchdogSettings();
    if (!threadId || !settings.enabled || !this.apiCapabilities.agentRunNudge) {
      this.reconcileAgentWatchdog();
      return;
    }
    if (this.pendingApprovals.size > 0 || this.pendingUserInputs.size > 0) {
      this.lastMasterActivityAt = Date.now();
      this.reconcileAgentWatchdog();
      return;
    }

    this.agentWatchdogInFlight = true;
    try {
      await this.api.ensureReady();
      const [detail, receiptResult] = await Promise.all([
        this.api.getThreadDetail(threadId),
        this.api.listAgentRuns(),
      ]);
      if (
        generation !== this.agentWatchdogGeneration
        || this.currentThread?.id !== threadId
      ) return;

      const activeTurn = getActiveTurn(detail);
      const scopedRuns = this.scopedAgentRunsForWatchdog(receiptResult.runs || []);
      this.cachedScopedAgentRuns = scopedRuns;
      const agentIds = [...new Set(
        scopedRuns
          .filter((run) => this.isAgentRunWatchdogTarget(run))
          .map((run) => run.spec?.worker_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      )].sort();

      if (agentIds.length === 0) return;
      if (
        this.pendingApprovals.size > 0
        || this.pendingUserInputs.size > 0
        || this.currentThread?.id !== threadId
      ) return;
      if (activeTurn) this.currentTurnId = activeTurn.id;
      const result = await this.api.nudgeAgentRuns(threadId, agentIds);
      // On an idle parent, modern cores create a durable internal watchdog
      // turn. Use the authoritative id returned by the endpoint so its normal
      // item/completion stream is tracked exactly like a user-started turn.
      this.currentTurnId = result.turn_id;
      this.debugLog(
        `[agent-watchdog] ${result.coalesced ? "coalesced" : "accepted"} `
        + `${agentIds.length} agent(s) on turn ${result.turn_id}`,
      );
      this.lastMasterActivityAt = Date.now();
    } catch (err) {
      // A turn can finish between the detail read and nudge POST. Park that
      // race just like an already-idle parent instead of retrying forever.
      if (this.isIdleAgentWatchdogError(err)) {
        this.agentWatchdogParkedForIdleParent = true;
      }
      // Never fabricate a user turn or surface repetitive sticky errors from
      // the watchdog. Modern cores own durable idle-turn creation.
      this.debugLog(`[agent-watchdog] nudge skipped: ${getErrorMessage(err)}`);
      if (!this.agentWatchdogParkedForIdleParent) {
        this.lastMasterActivityAt = Date.now();
      }
    } finally {
      this.agentWatchdogInFlight = false;
      this.reconcileAgentWatchdog();
    }
  }

  private agentRunUiId(run: AgentRunRecord): string | null {
    return run.spec?.run_id || run.spec?.worker_id || null;
  }

  private agentRunVersionKey(run: AgentRunRecord): string | null {
    const workerId = run.spec?.worker_id || run.spec?.run_id;
    if (!workerId) return null;
    return `${workerId}:${run.updated_at_ms ?? "unknown"}`;
  }

  private isInactiveOwnerCancellationError(err: unknown): boolean {
    return /\bthread\b[\s\S]*\bis not active\b/i.test(getErrorMessage(err));
  }

  private isIdleAgentWatchdogError(err: unknown): boolean {
    const message = getErrorMessage(err);
    return this.isInactiveOwnerCancellationError(err)
      || /\bno active turn on thread\b/i.test(message);
  }

  private markAgentRunUnavailable(run: AgentRunRecord): void {
    const versionKey = this.agentRunVersionKey(run);
    if (!versionKey) return;
    this.unavailableAgentRunVersions.add(versionKey);
    this.cachedScopedAgentRuns = this.cachedScopedAgentRuns.map((candidate) =>
      this.agentRunVersionKey(candidate) === versionKey
        ? { ...candidate, runtime_available: false }
        : candidate
    );
    this.postMessage({ type: "agentRunList", runs: this.cachedScopedAgentRuns });
    this.reconcileAgentWatchdog();
  }

  private async refreshAgentRunsBeforeCancellation(): Promise<void> {
    try {
      const result = await this.api.listAgentRuns();
      const refs = collectConversationAgentRefs(this.messages);
      for (const cached of this.cachedScopedAgentRuns) {
        if (cached.spec?.worker_id) refs.ids.add(cached.spec.worker_id);
        if (cached.spec?.run_id) refs.ids.add(cached.spec.run_id);
      }
      this.cachedScopedAgentRuns = this.preserveAgentPresentationFields(
        filterAgentRunsForConversation(result.runs || [], refs),
      );
      this.postMessage({ type: "agentRunList", runs: this.cachedScopedAgentRuns });
    } catch (err) {
      this.debugLog(`[agent-stop] receipt preflight skipped: ${getErrorMessage(err)}`);
    }
  }

  private withAgentStopTimeout<T>(
    operation: Promise<T>,
    label: string,
    timeoutMs = 5000,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`${label} timed out after ${timeoutMs / 1000}s`));
      }, timeoutMs);
      operation.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  private reportAgentAlreadyInactive(runIds: string[], all = false): void {
    this.postAgentStopResult(runIds, [], undefined, all);
    this.postMessage({
      type: "info",
      message: runIds.length === 1
        ? "That agent is already inactive."
        : runIds.length > 1
          ? "Those agents are already inactive."
          : "There are no active agents in this conversation.",
    });
  }

  private postAgentStopResult(
    runIds: string[],
    failedRunIds: string[],
    error?: string,
    all = false,
  ): void {
    this.postMessage({
      type: "agentStopResult",
      runIds,
      failedRunIds,
      ...(error ? { error } : {}),
      ...(all ? { all: true } : {}),
    });
  }

  private reportAgentStopFailure(runIds: string[], message: string, all = false): void {
    this.postAgentStopResult(runIds, runIds, message, all);
    this.postMessage({ type: "error", message });
  }

  private async handleStopAgent(runId: string): Promise<void> {
    const requestedRunId = typeof runId === "string" ? runId.trim() : "";
    if (!requestedRunId) {
      this.reportAgentStopFailure([], "Cannot stop agent: the agent id is missing.");
      return;
    }
    if (!this.apiCapabilities.agentRunCancel) {
      this.reportAgentStopFailure(
        [requestedRunId],
        "Cannot stop agent: this CodeWhale runtime does not support agent cancellation.",
      );
      return;
    }
    const threadId = this.currentThread?.id;
    if (!threadId) {
      this.reportAgentStopFailure(
        [requestedRunId],
        "Cannot stop agent: there is no active conversation.",
      );
      return;
    }

    try {
      await this.withAgentStopTimeout(
        this.refreshAgentRunsBeforeCancellation(),
        "Agent status refresh",
      );
    } catch (err) {
      this.debugLog(`[agent-stop] preflight timed out: ${getErrorMessage(err)}`);
    }

    const run = this.cachedScopedAgentRuns.find((candidate) => {
      const uiId = this.agentRunUiId(candidate);
      return uiId === requestedRunId || candidate.spec?.worker_id === requestedRunId;
    });
    if (!run) {
      this.reportAgentStopFailure(
        [requestedRunId],
        "Cannot stop agent: it does not belong to the current conversation.",
      );
      return;
    }
    if (!this.isAgentRunActive(run)) {
      this.reportAgentAlreadyInactive([requestedRunId]);
      this.requestAgentRunsRefresh(2);
      return;
    }
    const workerId = run.spec?.worker_id;
    if (!workerId) {
      this.reportAgentStopFailure(
        [requestedRunId],
        "Cannot stop agent: its runtime worker id is missing.",
      );
      return;
    }

    try {
      await this.withAgentStopTimeout(
        this.api.cancelAgentRun(threadId, workerId),
        "Agent cancellation request",
      );
      this.postAgentStopResult([requestedRunId], []);
    } catch (err) {
      if (this.isInactiveOwnerCancellationError(err)) {
        this.markAgentRunUnavailable(run);
        this.postAgentStopResult([requestedRunId], []);
        this.postMessage({
          type: "info",
          message: "That agent is no longer running because its previous runtime ended.",
        });
        return;
      }
      const message = formatError(`Failed to stop agent ${requestedRunId}`, err);
      this.reportAgentStopFailure([requestedRunId], message);
    } finally {
      this.requestAgentRunsRefresh(6);
    }
  }

  private async handleStopAllAgents(): Promise<void> {
    try {
      await this.withAgentStopTimeout(
        this.refreshAgentRunsBeforeCancellation(),
        "Agent status refresh",
      );
    } catch (err) {
      this.debugLog(`[agent-stop-all] preflight timed out: ${getErrorMessage(err)}`);
    }
    const activeRuns = this.cachedScopedAgentRuns.filter((run) => this.isAgentRunActive(run));
    const attempted = new Map<string, { runId: string; workerId: string; run: AgentRunRecord }>();
    for (const run of activeRuns) {
      const runId = this.agentRunUiId(run);
      const workerId = run.spec?.worker_id;
      if (runId && workerId && !attempted.has(workerId)) {
        attempted.set(workerId, { runId, workerId, run });
      }
    }
    const targets = [...attempted.values()];
    const runIds = targets.map((target) => target.runId);

    if (!this.apiCapabilities.agentRunCancel) {
      this.reportAgentStopFailure(
        runIds,
        "Cannot stop agents: this CodeWhale runtime does not support agent cancellation.",
        true,
      );
      return;
    }
    const threadId = this.currentThread?.id;
    if (!threadId) {
      this.reportAgentStopFailure(runIds, "Cannot stop agents: there is no active conversation.", true);
      return;
    }
    if (targets.length === 0) {
      this.reportAgentAlreadyInactive([], true);
      this.requestAgentRunsRefresh(2);
      return;
    }

    const results = await Promise.allSettled(
      targets.map((target) => this.withAgentStopTimeout(
        this.api.cancelAgentRun(threadId, target.workerId),
        `Cancellation request for ${target.runId}`,
      )),
    );
    const failedRunIds: string[] = [];
    const failureDetails: string[] = [];
    const staleRunIds: string[] = [];
    results.forEach((result, index) => {
      if (result.status === "fulfilled") return;
      const target = targets[index];
      if (this.isInactiveOwnerCancellationError(result.reason)) {
        staleRunIds.push(target.runId);
        this.markAgentRunUnavailable(target.run);
        return;
      }
      failedRunIds.push(target.runId);
      failureDetails.push(`${target.runId}: ${getErrorMessage(result.reason)}`);
    });

    const error = failedRunIds.length > 0
      ? `Failed to stop ${failedRunIds.length} of ${targets.length} agents: ${failureDetails.join("; ")}`
      : undefined;
    this.postAgentStopResult(runIds, failedRunIds, error, true);
    if (error) this.postMessage({ type: "error", message: error });
    if (staleRunIds.length > 0) {
      this.postMessage({
        type: "info",
        message: staleRunIds.length === 1
          ? "One agent was already stopped when its previous runtime ended."
          : `${staleRunIds.length} agents were already stopped when their previous runtime ended.`,
      });
    }
    this.requestAgentRunsRefresh(6);
  }

  private preserveAgentPresentationFields(runs: AgentRunRecord[]): AgentRunRecord[] {
    const cachedById = new Map<string, AgentRunRecord>();
    for (const cached of this.cachedScopedAgentRuns) {
      const id = cached.spec?.run_id || cached.spec?.worker_id;
      if (id) cachedById.set(id, cached);
    }
    return runs.map((run) => {
      const id = run.spec?.run_id || run.spec?.worker_id;
      const cached = id ? cachedById.get(id) : undefined;
      const merged = cached ? {
        ...run,
        nickname: run.nickname || cached.nickname || null,
        // `latest_output` is a durable checkpoint/result projection. Never
        // let it mask a newer receipt lifecycle message. This matters for
        // agents that emit only thinking/tool traffic until their final text.
        latest_output: run.latest_output
          || (!run.latest_message ? cached.latest_output : null)
          || null,
        persisted_result: run.persisted_result ?? cached.persisted_result ?? null,
      } : run;
      const versionKey = this.agentRunVersionKey(merged);
      return versionKey && this.unavailableAgentRunVersions.has(versionKey)
        ? { ...merged, runtime_available: false }
        : merged;
    });
  }

  private stopAgentRunsRefreshTimer(): void {
    if (this.agentRunsRefreshTimer) {
      clearTimeout(this.agentRunsRefreshTimer);
      this.agentRunsRefreshTimer = null;
    }
  }

  private scheduleAgentRunsRefresh(delayMs = 1000): void {
    this.stopAgentRunsRefreshTimer();
    this.agentRunsRefreshTimer = setTimeout(() => {
      this.agentRunsRefreshTimer = null;
      void this.refreshAgentRuns();
    }, delayMs);
  }

  private requestAgentRunsRefresh(graceRefreshes = 4): void {
    this.agentRunsRefreshGrace = Math.max(this.agentRunsRefreshGrace, graceRefreshes);
    void this.refreshAgentRuns();
  }

  private stopAgentStateWatcher(): void {
    if (this.agentStateRefreshDebounce) {
      clearTimeout(this.agentStateRefreshDebounce);
      this.agentStateRefreshDebounce = null;
    }
    this.agentStateWatcher?.close();
    this.agentStateWatcher = null;
    this.agentStateWatcherDirectory = null;
    this.agentStateWatcherFileName = null;
  }

  private ensureAgentStateWatcher(filePath: string): void {
    const directory = path.dirname(filePath);
    const fileName = path.basename(filePath);
    if (
      this.agentStateWatcher
      && this.agentStateWatcherDirectory === directory
      && this.agentStateWatcherFileName === fileName
    ) return;

    this.stopAgentStateWatcher();
    try {
      const watcher = fs.watch(directory, { persistent: false }, (_eventType, changedFile) => {
        if (changedFile && String(changedFile) !== fileName) return;
        if (this.agentStateRefreshDebounce) clearTimeout(this.agentStateRefreshDebounce);
        this.agentStateRefreshDebounce = setTimeout(() => {
          this.agentStateRefreshDebounce = null;
          void this.refreshSubagentTranscriptFromState(this.agentRunsRefreshGeneration);
        }, 80);
      });
      watcher.on("error", () => {
        if (this.agentStateWatcher === watcher) this.stopAgentStateWatcher();
      });
      this.agentStateWatcher = watcher;
      this.agentStateWatcherDirectory = directory;
      this.agentStateWatcherFileName = fileName;
    } catch {
      // The active-agent polling fallback below also covers missing watcher
      // support and directories that are being created concurrently.
    }
  }

  private findSubagentTranscriptBlock(sourceId: string): {
    messageId: string;
    blockIdx: number;
    entry: SubagentTranscriptEntry;
  } | undefined {
    const cached = this.subagentTranscriptBlocks.get(sourceId);
    if (cached) return cached;
    for (const message of this.messages) {
      for (let blockIdx = 0; blockIdx < (message.blocks?.length || 0); blockIdx++) {
        const block = message.blocks![blockIdx];
        if (
          block.type !== "subagent_transcript"
          || !block.subagent
          || !(
            (block.subagent.source_id || block.subagent.id) === sourceId
            || block.subagent.segments?.some((segment) => segment.source_id === sourceId)
          )
        ) continue;
        const location = { messageId: message.id, blockIdx, entry: block.subagent };
        this.registerSubagentTranscriptLocation(location);
        return location;
      }
    }
    return undefined;
  }

  private registerSubagentTranscriptLocation(location: {
    messageId: string;
    blockIdx: number;
    entry: SubagentTranscriptEntry;
  }): void {
    const sourceIds = location.entry.segments?.map((segment) => segment.source_id)
      || [location.entry.source_id || location.entry.id];
    for (const sourceId of sourceIds) this.subagentTranscriptBlocks.set(sourceId, location);
  }

  private findTailSubagentTranscriptBlock(agentId: string): {
    messageId: string;
    blockIdx: number;
    entry: SubagentTranscriptEntry;
  } | undefined {
    const message = this.messages[this.messages.length - 1];
    const blocks = message?.blocks || [];
    const blockIdx = blocks.length - 1;
    const block = blockIdx >= 0 ? blocks[blockIdx] : undefined;
    if (block?.type !== "subagent_transcript" || block.subagent?.agent_id !== agentId) return undefined;
    const sourceId = block.subagent.source_id || block.subagent.id;
    const existing = this.subagentTranscriptBlocks.get(sourceId);
    if (existing && existing.messageId === message.id && existing.blockIdx === blockIdx) return existing;
    const location = { messageId: message.id, blockIdx, entry: block.subagent };
    this.registerSubagentTranscriptLocation(location);
    return location;
  }

  private updateSubagentTranscriptLocation(
    location: { messageId: string; blockIdx: number; entry: SubagentTranscriptEntry },
    entry: SubagentTranscriptEntry,
  ): boolean {
    const message = this.messages.find((candidate) => candidate.id === location.messageId);
    const block = message?.blocks?.[location.blockIdx];
    if (!block || block.type !== "subagent_transcript") return false;
    block.subagent = entry;
    location.entry = entry;
    this.registerSubagentTranscriptLocation(location);
    this.postMessage({
      type: "updateSubagentTranscriptBlock",
      messageId: location.messageId,
      blockIdx: location.blockIdx,
      entry,
    });
    return true;
  }

  private isSubagentTranscriptBlockAtTail(location: { messageId: string; blockIdx: number }): boolean {
    const messageIndex = this.messages.findIndex((message) => message.id === location.messageId);
    if (messageIndex < 0 || messageIndex !== this.messages.length - 1) return false;
    const blocks = this.messages[messageIndex].blocks || [];
    return location.blockIdx === blocks.length - 1;
  }

  private appendSubagentTranscriptEntry(entry: SubagentTranscriptEntry, sourceId: string): boolean {
    let target: ChatMessage | undefined;
    for (let index = this.messages.length - 1; index >= 0; index--) {
      if (this.messages[index].role === "assistant") {
        target = this.messages[index];
        break;
      }
    }
    if (!target) return false;

    target.blocks = target.blocks || [];
    const blockIdx = target.blocks.length;
    target.blocks.push({ type: "subagent_transcript", subagent: entry });
    const location = { messageId: target.id, blockIdx, entry };
    this.subagentTranscriptBlocks.set(sourceId, location);
    this.registerSubagentTranscriptLocation(location);

    // A child response arrived between root-agent chunks. Force the next
    // root delta into a new block below this card so the visible transcript
    // preserves actual arrival order.
    if (this.messages[this.messages.length - 1]?.id === target.id) {
      this.currentTextBlockIdx = -1;
      this.currentThinkingBlockIdx = -1;
    }
    this.postMessage({
      type: "addSubagentTranscriptBlock",
      messageId: target.id,
      blockIdx,
      entry,
    });
    return true;
  }

  private renderSubagentTranscriptEntry(entry: SubagentTranscriptEntry): SubagentTranscriptEntry {
    const rendered = { ...entry };
    try { rendered.contentHtml = renderMarkdown(rendered.content); } catch { rendered.contentHtml = rendered.content; }
    return rendered;
  }

  private isAgentTranscriptTool(name: string): boolean {
    return ["agent", "agent_open", "agent_spawn", "agent_close", "agent_cancel"]
      .includes(name);
  }

  /**
   * Find the deterministic restore anchor for historical child output. Saved
   * sessions do not retain per-message timestamps, so the last parent agent
   * tool call is the strongest durable boundary: child transcripts belong
   * after that control traffic and before the master's later final prose.
   */
  private findRestoredSubagentTranscriptAnchor(): {
    message: ChatMessage;
    blockIdx: number;
  } | null {
    let agentToolAnchor: { message: ChatMessage; blockIdx: number } | null = null;

    for (const message of this.messages) {
      if (message.role !== "assistant") continue;
      const blocks = message.blocks || [];
      for (let blockIdx = 0; blockIdx < blocks.length; blockIdx++) {
        const block = blocks[blockIdx];
        if (block.type !== "tool_call" || block.toolCallIdx === undefined) continue;
        const toolCall = message.toolCalls?.[block.toolCallIdx];
        if (toolCall && this.isAgentTranscriptTool(toolCall.name)) {
          agentToolAnchor = { message, blockIdx: blockIdx + 1 };
        }
      }
    }
    if (agentToolAnchor) return agentToolAnchor;

    // Legacy/future session shapes may omit the agent tool card. Keep restored
    // child output ahead of the final master answer instead of appending below
    // it, even when only the root prose survived persistence.
    for (let messageIndex = this.messages.length - 1; messageIndex >= 0; messageIndex--) {
      const message = this.messages[messageIndex];
      if (message.role !== "assistant") continue;
      if (!message.blocks || message.blocks.length === 0) {
        if (message.content) {
          const contentBlock: ContentBlock = { type: "text", content: message.content };
          try { contentBlock.contentHtml = renderMarkdown(message.content); } catch { /* plain-text fallback */ }
          message.blocks = [contentBlock];
        } else {
          message.blocks = [];
        }
      }
      const firstTextBlock = message.blocks.findIndex((block) => block.type === "text");
      return { message, blockIdx: firstTextBlock >= 0 ? firstTextBlock : message.blocks.length };
    }
    return null;
  }

  /** Restore one aggregate card per child, ordered by that child's last
   * durable transcript update. This path runs before the restored history is
   * painted; live updates continue to use arrival-order append semantics. */
  private restoreSubagentTranscriptEntries(entries: SubagentTranscriptEntry[]): void {
    const byAgent = new Map<string, SubagentTranscriptEntry[]>();
    for (const entry of entries) {
      const grouped = byAgent.get(entry.agent_id) || [];
      grouped.push(entry);
      byAgent.set(entry.agent_id, grouped);
    }

    const restored = [...byAgent.values()].map((agentEntries) => {
      const ordered = [...agentEntries].sort((a, b) =>
        a.message_index - b.message_index
        || a.block_index - b.block_index
        || a.id.localeCompare(b.id)
      );
      const first = ordered[0];
      const latest = ordered[ordered.length - 1];
      const segments = ordered.map((entry) => ({
        source_id: entry.source_id || entry.id,
        content: entry.content,
      }));
      const lastUpdateAtMs = Math.max(
        ...ordered.map((entry) =>
          entry.last_update_at_ms
          ?? entry.checkpoint_created_at_ms
          ?? 0
        ),
      );
      return this.renderSubagentTranscriptEntry({
        ...latest,
        id: first.id,
        source_id: first.source_id || first.id,
        segments,
        content: segments.map((segment) => segment.content).join("\n\n"),
        last_update_at_ms: lastUpdateAtMs || null,
      });
    }).sort((a, b) =>
      (a.last_update_at_ms || 0) - (b.last_update_at_ms || 0)
      || a.agent_id.localeCompare(b.agent_id)
      || a.id.localeCompare(b.id)
    );

    const anchor = this.findRestoredSubagentTranscriptAnchor();
    if (!anchor) return;
    anchor.message.blocks = anchor.message.blocks || [];
    let blockIdx = Math.min(anchor.blockIdx, anchor.message.blocks.length);
    for (const entry of restored) {
      anchor.message.blocks.splice(blockIdx, 0, {
        type: "subagent_transcript",
        subagent: entry,
      });
      const location = { messageId: anchor.message.id, blockIdx, entry };
      this.registerSubagentTranscriptLocation(location);
      blockIdx++;
    }
  }

  private applySubagentTranscriptEntries(entries: SubagentTranscriptEntry[]): void {
    const sorted = [...entries].sort((a, b) =>
      (a.last_update_at_ms || a.checkpoint_created_at_ms || 0)
        - (b.last_update_at_ms || b.checkpoint_created_at_ms || 0)
      || a.agent_id.localeCompare(b.agent_id)
      || a.message_index - b.message_index
      || a.block_index - b.block_index
      || a.id.localeCompare(b.id)
    );

    if (this.restoringSubagentTranscriptHistory && sorted.length > 0) {
      this.restoreSubagentTranscriptEntries(sorted);
      return;
    }

    for (const rawEntry of sorted) {
      const sourceId = rawEntry.source_id || rawEntry.id;
      const entry = this.renderSubagentTranscriptEntry({
        ...rawEntry,
        source_id: sourceId,
        segments: [{ source_id: sourceId, content: rawEntry.content }],
      });
      const existing = this.findSubagentTranscriptBlock(sourceId);
      if (existing) {
        const segments = existing.entry.segments?.map((segment) => ({ ...segment }))
          || [{
            source_id: existing.entry.source_id || sourceId,
            content: existing.entry.content,
          }];
        const segmentIndex = segments.findIndex((segment) => segment.source_id === sourceId);
        const contentChanged = segmentIndex < 0 || segments[segmentIndex].content !== entry.content;
        const metadataChanged = existing.entry.nickname !== entry.nickname
          || existing.entry.status !== entry.status
          || existing.entry.completed_at_ms !== entry.completed_at_ms
          || existing.entry.runtime_available !== entry.runtime_available
          || existing.entry.agent_type !== entry.agent_type
          || existing.entry.profile !== entry.profile
          || existing.entry.model !== entry.model
          || existing.entry.session_name !== entry.session_name;
        if (!contentChanged && !metadataChanged) continue;

        // Only mutate transcript text while its card is still the visible
        // tail. Once root/another-child output follows it, preserve that old
        // card and append a new revision so history is never rewritten.
        if (contentChanged && !this.isSubagentTranscriptBlockAtTail(existing)) {
          const revision = {
            ...entry,
            id: `${sourceId}:revision:${++this.subagentTranscriptRevision}`,
          };
          this.appendSubagentTranscriptEntry(revision, sourceId);
          continue;
        }

        if (segmentIndex >= 0) segments[segmentIndex].content = entry.content;
        else segments.push({ source_id: sourceId, content: entry.content });
        const updatedEntry = this.renderSubagentTranscriptEntry({
          ...entry,
          id: existing.entry.id,
          source_id: existing.entry.source_id || sourceId,
          segments,
          content: segments.map((segment) => segment.content).join("\n\n"),
        });
        this.updateSubagentTranscriptLocation(existing, updatedEntry);
        continue;
      }

      // Consecutive output from the same child belongs to the current tail
      // card. Once root/another-child output follows, findTail returns no
      // match and a fresh card is appended instead.
      const tail = this.findTailSubagentTranscriptBlock(entry.agent_id);
      if (tail) {
        const segments = tail.entry.segments?.map((segment) => ({ ...segment }))
          || [{
            source_id: tail.entry.source_id || tail.entry.id,
            content: tail.entry.content,
          }];
        segments.push({ source_id: sourceId, content: entry.content });
        const updatedEntry = this.renderSubagentTranscriptEntry({
          ...entry,
          id: tail.entry.id,
          source_id: tail.entry.source_id || sourceId,
          segments,
          content: segments.map((segment) => segment.content).join("\n\n"),
        });
        this.updateSubagentTranscriptLocation(tail, updatedEntry);
        continue;
      }

      this.appendSubagentTranscriptEntry(entry, sourceId);
    }
  }

  private async refreshSubagentTranscriptFromState(generation: number): Promise<void> {
    if (this.cachedScopedAgentRuns.length === 0) return;
    const state = await this.readPersistedSubagentState(this.cachedScopedAgentRuns[0]?.spec?.workspace);
    if (!state || generation !== this.agentRunsRefreshGeneration) return;
    if (this.agentStateFilePath) this.ensureAgentStateWatcher(this.agentStateFilePath);
    const enrichedRuns = enrichAgentRunsFromState(this.cachedScopedAgentRuns, state, false);
    this.cachedScopedAgentRuns = enrichedRuns;
    this.postMessage({ type: "agentRunList", runs: enrichedRuns });
    this.applySubagentTranscriptEntries(extractSubagentTranscriptEntries(enrichedRuns, state));
  }

  /** Refresh agent receipts and keep the live, interleaved transcript feed running. */
  public async refreshAgentRuns(): Promise<void> {
    this.stopAgentRunsRefreshTimer();
    const generation = ++this.agentRunsRefreshGeneration;
    let shouldContinue = false;
    try {
      const result = await this.api.listAgentRuns();
      if (generation !== this.agentRunsRefreshGeneration) return;
      const refs = collectConversationAgentRefs(this.messages);
      const scopedRuns = this.preserveAgentPresentationFields(
        filterAgentRunsForConversation(result.runs || [], refs),
      );
      this.cachedScopedAgentRuns = scopedRuns;
      if (scopedRuns.length === 0) {
        this.postMessage({ type: "agentRunList", runs: [] });
        if (this.agentRunsRefreshGrace > 0) {
          this.agentRunsRefreshGrace--;
          shouldContinue = true;
        }
        return;
      }

      const state = await this.readPersistedSubagentState(scopedRuns[0]?.spec?.workspace);
      if (generation !== this.agentRunsRefreshGeneration) return;
      let displayRuns = scopedRuns;
      if (state) {
        if (this.agentStateFilePath) this.ensureAgentStateWatcher(this.agentStateFilePath);
        displayRuns = enrichAgentRunsFromState(scopedRuns, state, false);
        this.applySubagentTranscriptEntries(extractSubagentTranscriptEntries(displayRuns, state));
      }
      this.cachedScopedAgentRuns = displayRuns;
      // Post exactly one presentation-complete list per refresh. This avoids
      // alternating between raw session-name fallbacks and real nicknames.
      this.postMessage({ type: "agentRunList", runs: displayRuns });

      if (scopedRuns.some((run) => this.isAgentRunActive(run))) {
        this.agentRunsRefreshGrace = Math.max(this.agentRunsRefreshGrace, 3);
        shouldContinue = true;
      } else if (this.agentRunsRefreshGrace > 0) {
        this.agentRunsRefreshGrace--;
        shouldContinue = true;
      }
    } catch {
      // Best-effort: endpoint may not exist on older runtimes. Retry only
      // during an explicit spawn/completion grace window.
      if (this.agentRunsRefreshGrace > 0) {
        this.agentRunsRefreshGrace--;
        shouldContinue = true;
      }
    } finally {
      if (generation !== this.agentRunsRefreshGeneration) return;
      this.reconcileAgentWatchdog();
      if (shouldContinue) {
        this.scheduleAgentRunsRefresh(1000);
      } else if (!this.cachedScopedAgentRuns.some((run) => this.isAgentRunActive(run))) {
        this.stopAgentStateWatcher();
      }
    }
  }

  /** Open session panel showing a specific task's detail */
  private async handleShowTaskDetail(taskId: string): Promise<void> {
    try {
      const task = await this.api.getTask(taskId);
      const enrichedTask = await this.enrichTaskDetail(task);
      this.postMessage({ type: "taskDetail", task: enrichedTask });
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to load task: ${(err as Error).message}`);
    }
  }

  /** Show an agent run detail inside the main webview when a run id is known. */
  private async handleShowAgentSessions(runId: string): Promise<void> {
    if (!runId) {
      return;
    }
    try {
      const run = await this.api.getAgentRun(runId);
      const state = await this.readPersistedSubagentState(run.spec?.workspace);
      const [enrichedRun] = enrichAgentRunsFromState([run], state, true);
      this.postMessage({ type: "agentDetail", run: enrichedRun });
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to load agent run: ${(err as Error).message}`);
    }
  }

  private async readPersistedSubagentState(workspaceHint?: string): Promise<PersistedSubagentState | null> {
    const roots = [
      workspaceHint,
      this.currentThread?.workspace,
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    ].filter((value, index, values): value is string =>
      typeof value === "string" && value.length > 0 && values.indexOf(value) === index
    );

    for (const root of roots) {
      const candidates = [
        path.join(root, ".codewhale", "state", "subagents.v1.json"),
        path.join(root, ".deepseek", "state", "subagents.v1.json"),
      ];
      for (const filePath of candidates) {
        try {
          const raw = await fs.promises.readFile(filePath, "utf8");
          const parsed = JSON.parse(raw) as PersistedSubagentState;
          if (parsed && Array.isArray(parsed.agents)) {
            this.agentStateFilePath = filePath;
            return parsed;
          }
        } catch {
          // The runtime atomically replaces this file. Missing or mid-write
          // snapshots are expected and must not break the agent inspector.
        }
      }
    }
    return null;
  }

  private normalizeOptionalPath(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value : null;
  }

  private cacheTextArtifactPreview(filePath: string | null, content: string, language?: string): void {
    if (!filePath || !content) {
      return;
    }
    this.textArtifactPreviewStore.set(filePath, { content, language });
    if (path.isAbsolute(filePath)) {
      this.textArtifactPreviewStore.set(path.normalize(filePath), { content, language });
    }
  }

  private async readTaskTextArtifact(
    filePath: string | null,
    maxBytes = 256 * 1024,
  ): Promise<{ content: string; truncated: boolean } | null> {
    if (!filePath) {
      return null;
    }

    try {
      const absPath = resolveTaskArtifactPath(filePath);
      const buffer = await fs.promises.readFile(absPath);

      // Skip binary-ish content and keep the GUI focused on textual artifacts.
      if (buffer.includes(0)) {
        return null;
      }

      const truncated = buffer.length > maxBytes;
      const slice = truncated ? buffer.subarray(0, maxBytes) : buffer;
      return {
        content: slice.toString("utf8"),
        truncated,
      };
    } catch {
      return null;
    }
  }

  private async enrichTaskDetail(task: TaskRecord): Promise<TaskRecord> {
    const resultDetailPath = this.normalizeOptionalPath((task as TaskRecord & Record<string, unknown>).result_detail_path);
    const resultDetail = await this.readTaskTextArtifact(resultDetailPath);
    if (resultDetailPath && resultDetail?.content) {
      this.cacheTextArtifactPreview(resultDetailPath, resultDetail.content, "markdown");
    }

    return {
      ...task,
      result_detail_path: resultDetailPath,
      result_detail_content: resultDetail?.content ?? null,
      result_detail_truncated: resultDetail?.truncated ?? false,
      tool_calls: (task.tool_calls || []).map((toolCall) => ({
        ...toolCall,
        detail_path: this.normalizeOptionalPath(toolCall.detail_path),
        patch_ref: this.normalizeOptionalPath(toolCall.patch_ref),
      })),
      timeline: (task.timeline || []).map((entry) => ({
        ...entry,
        detail_path: this.normalizeOptionalPath(entry.detail_path),
      })),
      gates: ((task as TaskRecord & Record<string, unknown>).gates as TaskRecord["gates"] | undefined)?.map((gate) => ({
        ...gate,
        log_path: this.normalizeOptionalPath(gate.log_path),
      })) || [],
      attempts: ((task as TaskRecord & Record<string, unknown>).attempts as TaskRecord["attempts"] | undefined)?.map((attempt) => ({
        ...attempt,
        patch_path: this.normalizeOptionalPath(attempt.patch_path),
      })) || [],
      artifacts: ((task as TaskRecord & Record<string, unknown>).artifacts as TaskRecord["artifacts"] | undefined)?.map((artifact) => ({
        ...artifact,
        path: this.normalizeOptionalPath(artifact.path) || artifact.path,
      })) || [],
      github_events: ((task as TaskRecord & Record<string, unknown>).github_events as TaskRecord["github_events"] | undefined) || [],
    };
  }

  /** Push the current work state to the webview Work panel */
  public refreshWorkPanel(): void {
    const cfg = vscode.workspace.getConfiguration("cblage.codewhale");
    const goal = cfg.get<string | undefined>("goalObjective") || null;
    this.postMessage({
      type: "workState",
      goal,
      checklist: this.checklistItems,
      checklistCompletionPct: this.checklistCompletionPct,
      strategy: this.strategySteps,
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
    stopAgents: boolean;
  } {
    return {
      saveSession: this.apiCapabilities.saveSession,
      undoLastTurn: this.apiCapabilities.threadPatchUndo,
      retryLastTurn: this.apiCapabilities.threadRetry,
      revertFileChange:
        this.apiCapabilities.snapshotList && this.apiCapabilities.snapshotRestore,
      stopAgents: this.apiCapabilities.agentRunCancel,
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
        agentRunCancel: false,
        agentRunNudge: false,
      };
    }
    this.postApiCapabilities();
    this.reconcileAgentWatchdog();
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
        // Clear pending approvals immediately so the UI doesn't leave
        // approval bars visible while waiting for the turn.completed
        // event (which may be delayed or missed if the SSE stream
        // reconnects).  The turn.completed handler also clears these,
        // but this ensures the UI is responsive right away.
        this.pendingApprovals.clear();
        this.postMessage({ type: "turnInterrupted" });
      } catch {
        // ignore
      }
    }
  }

  /** Send user guidance to the currently active master turn.
   *  This deliberately targets only currentThread/currentTurnId; subagent
   *  run ids are managed by separate controls and are never considered here.
   */
  public async handleSteer(text: string): Promise<void> {
    const prompt = (text || "").trim();
    if (!prompt) return;

    const threadId = this.currentThread?.id;
    if (!threadId) {
      this.postMessage({ type: "error", message: "Cannot steer: there is no active conversation." });
      return;
    }

    try {
      await this.api.ensureReady();

      // The webview can become active a fraction before startTurn's HTTP
      // response records currentTurnId. Reconcile once rather than treating
      // the text as a new turn or accidentally routing it to a subagent.
      if (!this.currentTurnId) await this.refreshTurnState();
      const turnId = this.currentThread?.id === threadId ? this.currentTurnId : null;
      if (!turnId) {
        this.postMessage({ type: "error", message: "Cannot steer: the master turn is no longer active." });
        return;
      }

      await this.api.steerTurn(threadId, turnId, prompt);
      this.postMessage({ type: "status", text: "Steer sent" });
    } catch (err) {
      this.postMessage({
        type: "error",
        message: formatError("Failed to steer active turn", err),
      });
    }
  }

  /** Show confirmation dialog if a turn is currently in progress.
   *  Returns true if it's safe to proceed (no active turn or user confirmed). */
  private async confirmSwitchWhenActive(): Promise<boolean> {
    if (!this.currentTurnId) return true;

    const confirm = await vscode.window.showWarningMessage(
      t().switchSessionActiveTurnTitle,
      { modal: true },
      t().switchSessionActiveTurnButton,
    );
    if (confirm !== t().switchSessionActiveTurnButton) return false;

    // Interrupt the current turn before switching
    if (this.currentThread && this.currentTurnId) {
      try {
        await this.api.interruptTurn(this.currentThread.id, this.currentTurnId);
      } catch {
        // ignore
      }
      this.currentTurnId = null;
      this.pendingApprovals.clear();
      this.postMessage({ type: "turnInterrupted" });
    }
    return true;
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
        // Stash cost before resume — loadThread will zero stats.
        const session = await this.api.getSession(sessionId);
        const cost = session.metadata.cost;
        if (cost) {
          this.pendingSessionCost = {
            sessionCostUsd: cost.session_cost_usd || 0,
            sessionCostCny: cost.session_cost_cny || 0,
            subagentCostUsd: cost.subagent_cost_usd || 0,
            subagentCostCny: cost.subagent_cost_cny || 0,
            displayedCostHighWaterUsd: cost.displayed_cost_high_water_usd || 0,
            displayedCostHighWaterCny: cost.displayed_cost_high_water_cny || 0,
            totalTokens: session.metadata.total_tokens || 0,
            cumulativeTurnSecs: session.metadata.cumulative_turn_secs || 0,
          };
        }
        const result = await this.api.resumeSessionThread(sessionId);
        this.viewingSessionId = null;
        await this.loadThread(result.thread_id);
        // Restore cost and preserve original session ID for auto-save.
        if (this.pendingSessionCost) {
          this.sessionCostUsd = this.pendingSessionCost.sessionCostUsd;
          this.sessionCostCny = this.pendingSessionCost.sessionCostCny;
          this.displayedCostHighWaterUsd = this.pendingSessionCost.displayedCostHighWaterUsd;
          this.displayedCostHighWaterCny = this.pendingSessionCost.displayedCostHighWaterCny;
          this.totalTokens = this.pendingSessionCost.totalTokens;
          this.cumulativeTurnSecs = this.pendingSessionCost.cumulativeTurnSecs;
          this.pendingSessionCost = null;
          this.sendSessionStats();
        }
        this.currentSessionId = sessionId;
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
        this.postMessage({
          type: "setInputText",
          text: stripTurnMeta(result.original_user_text),
        });
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
        // Stash cost before resume — loadThread will zero stats.
        const session = await this.api.getSession(sessionId);
        const cost = session.metadata.cost;
        if (cost) {
          this.pendingSessionCost = {
            sessionCostUsd: cost.session_cost_usd || 0,
            sessionCostCny: cost.session_cost_cny || 0,
            subagentCostUsd: cost.subagent_cost_usd || 0,
            subagentCostCny: cost.subagent_cost_cny || 0,
            displayedCostHighWaterUsd: cost.displayed_cost_high_water_usd || 0,
            displayedCostHighWaterCny: cost.displayed_cost_high_water_cny || 0,
            totalTokens: session.metadata.total_tokens || 0,
            cumulativeTurnSecs: session.metadata.cumulative_turn_secs || 0,
          };
        }
        const result = await this.api.resumeSessionThread(sessionId);
        this.viewingSessionId = null;
        await this.loadThread(result.thread_id);
        // Restore cost and preserve original session ID for auto-save.
        if (this.pendingSessionCost) {
          this.sessionCostUsd = this.pendingSessionCost.sessionCostUsd;
          this.sessionCostCny = this.pendingSessionCost.sessionCostCny;
          this.displayedCostHighWaterUsd = this.pendingSessionCost.displayedCostHighWaterUsd;
          this.displayedCostHighWaterCny = this.pendingSessionCost.displayedCostHighWaterCny;
          this.totalTokens = this.pendingSessionCost.totalTokens;
          this.cumulativeTurnSecs = this.pendingSessionCost.cumulativeTurnSecs;
          this.pendingSessionCost = null;
          this.sendSessionStats();
        }
        this.currentSessionId = sessionId;
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
        void this.refreshContextUsage();
      } catch (err) {
        this.postMessage({
          type: "error",
          message: formatError("Compact failed", err),
        });
      }
    }
  }

  private async handleSlashCommand(
    command: string,
    args: string,
    rawText?: string,
  ): Promise<void> {
    await this.slashHandler.handle(command, args, rawText);
  }

  private async handleApprovalDecision(
    approvalId: string,
    decision: "allow" | "deny",
    remember = false
  ): Promise<void> {
    try {
      await this.api.decideApproval(approvalId, decision, remember);
      // When the user checks "remember" and allows, the TUI flips
      // thread.auto_approve to true (see runtime_threads.rs
      // remember_thread_auto_approve).  Update our local cache immediately
      // so subsequent approval.required events are correctly filtered out
      // — otherwise the stale cache causes the GUI to show approval
      // dialogs for tools the TUI has already auto-approved server-side,
      // leading to a frozen UI (no approval.decided event arrives for
      // auto-approved calls, so the dialog never clears).
      if (remember && decision === "allow" && this.currentThread) {
        this.currentThread = { ...this.currentThread, auto_approve: true };
      }
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
    this.diffProviderDisposable = vscode.workspace.registerTextDocumentContentProvider("cblage-codewhale-diff", provider);
  }

  private async handleOpenDiff(filePath: string, diff?: string, useCumulative?: boolean, diffIndex?: number): Promise<void> {
    try {
      const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspace) return;

      const absPath = path.isAbsolute(filePath) ? filePath : path.join(workspace, filePath);

      // Look up the full diffs array from turnFileChanges for multi-edit files
      const normPath = normalizePath(filePath);
      const existing = this.turnFileChanges.find(fc => normalizePath(fc.filePath) === normPath);
      const diffs = existing?.diffs;
      // Use cumulative mode only when explicitly requested (changes sidebar)
      const useCumulativeMode = useCumulative && diffs && diffs.length > 0;

      if (useCumulativeMode || diff) {
        this.ensureDiffProvider();

        let oldContent: string;
        let newContent: string;

        if (useCumulativeMode) {
          // Cumulative mode (changes sidebar): read current file, reverse-apply all diffs
          try {
            const currentUri = vscode.Uri.file(absPath);
            const doc = await vscode.workspace.openTextDocument(currentUri);
            newContent = doc.getText();
          } catch (err) {
            const parsed = parseDiffToSides(diffs![0]);
            newContent = parsed.newContent;
          }

          const reconstructed = reconstructOriginalContent(diffs!, newContent);
          if (reconstructed !== null) {
            oldContent = reconstructed;
          } else {
            const fallbackDiff = diff || diffs![diffs!.length - 1];
            const singleReconstructed = reconstructOldContent(newContent, fallbackDiff);
            oldContent = singleReconstructed !== null ? singleReconstructed : parseDiffToSides(fallbackDiff).oldContent;
          }
        } else if (diffs && diffs.length > 0 && diffIndex !== undefined && diffIndex >= 0) {
          // Single diff with precise indexing: reconstruct full-file old/new for this specific change
          try {
            const currentUri = vscode.Uri.file(absPath);
            const doc = await vscode.workspace.openTextDocument(currentUri);
            const state = getDiffStateForIndex(diffs, doc.getText(), diffIndex);
            if (state) {
              oldContent = state.oldContent;
              newContent = state.newContent;
            } else {
              // Reconstruction failed, fall back to parsing diff
              const parsed = parseDiffToSides(diff!);
              oldContent = parsed.oldContent;
              newContent = parsed.newContent;
            }
          } catch (err) {
            const parsed = parseDiffToSides(diff!);
            oldContent = parsed.oldContent;
            newContent = parsed.newContent;
          }
        } else {
          // Single diff without indexing (only one modification): read file, reverse-apply
          try {
            const currentUri = vscode.Uri.file(absPath);
            const doc = await vscode.workspace.openTextDocument(currentUri);
            newContent = doc.getText();
            const reconstructed = reconstructOldContent(newContent, diff!);
            oldContent = reconstructed !== null ? reconstructed : parseDiffToSides(diff!).oldContent;
          } catch (err) {
            const parsed = parseDiffToSides(diff!);
            oldContent = parsed.oldContent;
            newContent = parsed.newContent;
          }
        }

        const diffId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const oldUri = vscode.Uri.parse(`cblage-codewhale-diff:${absPath}?old&id=${diffId}`);
        const newUri = vscode.Uri.parse(`cblage-codewhale-diff:${absPath}?new&id=${diffId}`);

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
      // Try task artifact path first, then fallback to workspace relative
      const absPath = resolveTaskArtifactPath(filePath);
      const normalizedAbsPath = path.normalize(absPath);
      const preview = this.textArtifactPreviewStore.get(filePath) || this.textArtifactPreviewStore.get(normalizedAbsPath);

      if (!fs.existsSync(normalizedAbsPath)) {
        if (preview) {
          const doc = await vscode.workspace.openTextDocument({
            content: preview.content,
            language: preview.language || "plaintext",
          });
          await vscode.window.showTextDocument(doc);
          return;
        }
        void vscode.window.showWarningMessage(`Artifact file is no longer available: ${filePath}`);
        return;
      }

      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(normalizedAbsPath));
      await vscode.window.showTextDocument(doc);
    } catch (err) {
      this.postMessage({ type: "error", message: formatError("Failed to open file", err) });
    }
  }

  private async handleOpenExternal(url: string): Promise<void> {
    try {
      if (!url) {
        return;
      }
      await vscode.env.openExternal(vscode.Uri.parse(url));
    } catch (err) {
      this.postMessage({ type: "error", message: formatError("Failed to open link", err) });
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

    // Core persists a real SubAgentHandoff turn before dispatching a child
    // completion. Record its exact ids before stale-turn filtering so either
    // legal ordering is deterministic: the receipt refresh may observe
    // active->zero before or after this durable turn.started marker.
    if (event.event === "turn.started") {
      const payload = event.payload as {
        source?: unknown;
        internal?: unknown;
        agent_ids?: unknown;
      };
      if (payload.source === "subagent_completion" && payload.internal === true) {
        this.noteAgentWatchdogDurableCompletion(payload.agent_ids);
      }
    }

    // Drop stale events from a previous turn. SSE is ordered within a single
    // connection, but a delayed turn.completed for turn A can arrive after
    // turn B has started (e.g. across reconnects or buffered chunks). Without
    // this guard the stale turn.completed would clobber currentTurnId (set to
    // null) so every subsequent item event for turn B gets dropped by the old
    // `currentTurnId` truthiness check — the root cause of "agent responds
    // with the previous message" in multi-turn chats.
    //
    // We intentionally do NOT require currentTurnId to be set before routing
    // item events: the backend (runtime_threads.rs::start_turn) emits the
    // first item events before the HTTP response carrying the turn id reaches
    // us. Routing by lastMsg instead of currentTurnId means those early
    // deltas are appended to the new assistant message instead of being
    // dropped on the floor.
    const isAgentLifecycleEvent = event.event === "agent.spawned"
      || event.event === "agent.progress"
      || event.event === "agent.completed";
    if (!isAgentLifecycleEvent && event.turn_id && this.currentTurnId && event.turn_id !== this.currentTurnId) {
      this.debugLog(
        `[handleRuntimeEvent] dropping stale event seq=${event.seq} ` +
        `type=${event.event} turn=${event.turn_id} (current=${this.currentTurnId})`
      );
      return;
    }

    if (
      !isAgentLifecycleEvent
      && event.event !== "turn.nudged"
      && event.event !== "context.updated"
    ) {
      this.noteMasterActivity();
    }

    if (event.item_id) {
      this.handleItemEvent(event);
    }

    try {
    switch (event.event) {
      case "context.updated": {
        if (this.currentThread?.id && event.thread_id !== this.currentThread.id) break;
        const usage = event.payload as unknown as ThreadContextUsageResponse;
        if (
          typeof usage.estimated_input_tokens === "number"
          && typeof usage.context_window_tokens === "number"
          && typeof usage.used_percent === "number"
        ) {
          this.postContextUsage(usage);
        }
        break;
      }

      case "turn.steered":
        if (event.item_id) this.pendingSteerItemIds.add(event.item_id);
        break;

      case "agent.spawned":
      case "agent.progress":
      case "agent.completed": {
        // These events carry lifecycle summaries, not the full child text.
        // They trigger immediate receipt/state reads while the filesystem
        // watcher remains authoritative for background checkpoint content.
        this.requestAgentRunsRefresh(event.event === "agent.completed" ? 4 : 6);
        break;
      }

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
        this.pendingSteerItemIds.clear();
        if (pl.turn?.usage) {
          const u = pl.turn.usage;
          this.lastInputTokens = u.input_tokens;
          this.lastOutputTokens = u.output_tokens;
          this.lastCacheHitTokens = u.prompt_cache_hit_tokens ?? 0;
          this.lastCacheMissTokens = u.prompt_cache_miss_tokens ?? Math.max(0, u.input_tokens - (u.prompt_cache_hit_tokens ?? 0));
          this.totalInputTokens += u.input_tokens;
          this.totalOutputTokens += u.output_tokens;
          this.totalTokens += u.input_tokens + u.output_tokens;
          const model = this.getCurrentModel();
          const cost = calculateTurnCost(
            model, u.input_tokens, u.output_tokens,
            u.prompt_cache_hit_tokens, u.prompt_cache_miss_tokens, u.reasoning_tokens,
          );
          if (cost) {
            this.sessionCostUsd += cost.usd;
            this.sessionCostCny += cost.cny;
            // Maintain monotonic high-water mark so the displayed cost
            // never decreases across turns (mirrors TUI #244).
            this.displayedCostHighWaterUsd = Math.max(this.displayedCostHighWaterUsd, this.sessionCostUsd);
            this.displayedCostHighWaterCny = Math.max(this.displayedCostHighWaterCny, this.sessionCostCny);
          }
          this.sendSessionStats();
        }

        // TUI emits turn.completed for ALL terminal turn states
        // (completed / interrupted / failed) — it never emits
        // "turn.failed" or "turn.interrupted" (see runtime_threads.rs:3492).
        // Determine the effective status from the turn record.
        const turnStatus = pl.turn?.status || "completed";
        const isTerminalError = turnStatus === "failed" || turnStatus === "interrupted";

        // Safety net: finalize any toolCalls still "running" or
        // "awaiting_approval".  If their item.completed/item.failed/
        // item.interrupted events were missed (or never sent because the
        // turn was interrupted mid-execution), the toolCall would stay
        // "running" forever and the UI would freeze on "⟳ running...".
        // This mirrors the TUI's own cleanup in runtime_threads.rs:3395.
        const lastMsg = this.messages[this.messages.length - 1];
        if (lastMsg?.toolCalls) {
          for (let i = 0; i < lastMsg.toolCalls.length; i++) {
            const tc = lastMsg.toolCalls[i];
            if (tc.status === "running" || tc.status === "awaiting_approval") {
              tc.status = isTerminalError ? "error" : "complete";
              tc.approvalId = undefined;
              if (isTerminalError && !tc.output) {
                tc.output = turnStatus === "interrupted"
                  ? "Interrupted"
                  : (pl.turn?.error || "Turn failed");
              }
              this.postMessage({
                type: "updateToolCall",
                messageId: lastMsg.id,
                toolCallIdx: i,
                toolName: tc.name,
                status: tc.status,
                output: tc.output,
              });
            }
          }
        }
        // Clear pending approvals and active items for this turn.
        this.pendingApprovals.clear();
        this.activeItems.clear();

        if (lastMsg?.role === "assistant") {
          if (isTerminalError) {
            const errorUpdate = ensureTerminalErrorContent(lastMsg, pl.turn?.error);
            if (errorUpdate) {
              this.postMessage({
                type: "updateMessage",
                messageId: lastMsg.id,
                ...errorUpdate,
              });
            }
          }
          const payload = finalizeAssistantMessage(
            lastMsg,
            isTerminalError ? "error" : "complete",
            { usage: pl.turn?.usage },
          );
          this.postMessage(payload);
        }
        // Auto-save session after each completed turn (mirrors TUI's
        // build_session_snapshot → SessionSnapshot). Same thread always
        // saves to the same session via PUT with session_id.
        this.autoSaveSession();
        this.refreshSessionList();
        this.stopPeriodicTaskRefresh();
        this.refreshTaskList();
        this.refreshWorkPanel();
        this.requestAgentRunsRefresh(3);
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

        // Safety net: if the tool call is already complete, the TUI has
        // already auto-approved and finished it.  Showing an approval
        // dialog now would freeze the UI (no approval.decided will arrive).
        if (tc && tc.status === "complete") {
          break;
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
        // Mirror the optimistic auto_approve update when the TUI reports
        // a remember=true allow decision (covers the case where the
        // decision was made via a different code path, e.g. TUI UI).
        if (pl.remember && pl.decision === "allow" && this.currentThread) {
          this.currentThread = { ...this.currentThread, auto_approve: true };
        }
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

      case "sandbox.denied": {
        // Informational: TUI denied a tool call due to sandbox policy
        // (see runtime_threads.rs:3274).  The engine subsequently calls
        // deny_tool_call which produces item.completed/item.failed —
        // here we just surface the denial reason to the user so they
        // understand why the tool was rejected.
        const pl = event.payload as {
          tool_id?: string;
          tool_name?: string;
          reason?: string;
        };
        const toolName = pl.tool_name || "unknown";
        const reason = pl.reason || "sandbox policy";
        this.postMessage({
          type: "status",
          text: `${toolName} denied by sandbox: ${reason}`,
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

  private appendSteerBlock(
    message: ChatMessage,
    rawContent: string,
    sourceId: string,
  ): void {
    const content = stripTurnMeta(rawContent).trim() || rawContent.trim();
    if (!content) return;

    message.blocks = message.blocks || [];
    if (message.blocks.some((block) =>
      block.type === "steer" && block.sourceId === sourceId
    )) return;

    // Match the TUI's flush_active_cell behavior: output already visible
    // stays above the steer, and the next master delta starts a fresh text or
    // thinking block below it.
    this.currentTextBlockIdx = -1;
    this.currentThinkingBlockIdx = -1;
    const blockIdx = message.blocks.length;
    message.blocks.push({ type: "steer", content, sourceId });
    this.postMessage({
      type: "addSteerBlock",
      messageId: message.id,
      blockIdx,
      content,
    });
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
          if (["agent", "agent_open", "agent_spawn", "agent_close", "agent_cancel"].includes(rawToolName)) {
            this.requestAgentRunsRefresh(6);
          }
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

        if (kind === "user_message" && this.pendingSteerItemIds.delete(itemId)) {
          this.appendSteerBlock(
            lastMsg,
            pl.item?.detail || pl.item?.summary || "",
            itemId,
          );
        } else if (kind === "tool_call" || kind === "file_change" || kind === "command_execution") {
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
            diff = extractDiffForTool(toolName, tc?.input as Record<string, unknown> | undefined, output);
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
              const existingIdx = this.turnFileChanges.findIndex(existing => normalizePath(existing.filePath) === normPath);
              // Set diffIndex on fc before merging (index in the diffs array this diff will occupy)
              if (fc.diff) {
                const prevDiffs = existingIdx >= 0
                  ? (this.turnFileChanges[existingIdx].diffs ?? (this.turnFileChanges[existingIdx].diff ? [this.turnFileChanges[existingIdx].diff] : []))
                  : [];
                fc.diffIndex = prevDiffs.length;
              }
              if (existingIdx >= 0) {
                // Merge with existing change for cumulative stats
                const existing = this.turnFileChanges[existingIdx];
                const existingDiffs = existing.diffs ?? (existing.diff ? [existing.diff] : []);
                const newDiffs = fc.diff ? [...existingDiffs, fc.diff] : existingDiffs;
                this.turnFileChanges[existingIdx] = {
                  ...fc,
                  addedLines: existing.addedLines + fc.addedLines,
                  removedLines: existing.removedLines + fc.removedLines,
                  changeType: fc.changeType === "created" ? "created" :
                             fc.changeType === "deleted" && existing.changeType !== "created" ? "deleted" :
                             existing.changeType,
                  diff: fc.diff ?? existing.diff,
                  diffs: newDiffs,
                  toolName: fc.toolName ?? existing.toolName,
                };
              } else {
                this.turnFileChanges.push({
                  ...fc,
                  diffs: fc.diff ? [fc.diff] : [],
                });
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
            "agent", "agent_open", "agent_spawn", "agent_close", "agent_cancel",
            "todo_write", "todo_add", "todo_update",
            "checklist_write", "checklist_add", "checklist_update",
            "task_shell_start", "exec_shell",
          ].includes(toolName)) {
            this.refreshTaskList();
            if (["agent", "agent_open", "agent_spawn", "agent_close", "agent_cancel"].includes(toolName)) {
              this.requestAgentRunsRefresh(6);
            } else {
              this.refreshAgentRuns();
            }
          }
        }
        break;
      }

      case "item.failed": {
        // TUI emits item.failed (not item.completed) when a tool execution
        // fails (e.g. edit_file search-not-found, non-unique match, stale
        // prior read).  Without this handler the toolCall status stays
        // "running" forever and the UI freezes on "⟳ running...".
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

          if (tc) {
            tc.status = "error";
            tc.output = pl.item?.detail || pl.item?.summary;
            this.postMessage({
              type: "updateToolCall",
              messageId: lastMsg.id,
              toolCallIdx: tcIdx!,
              toolName: tc.name,
              status: "error",
              output: tc.output,
            });
          }
        } else if (kind === "error") {
          const errorUpdate = ensureTerminalErrorContent(
            lastMsg,
            pl.item?.detail || pl.item?.summary,
          );
          if (errorUpdate) {
            this.postMessage({
              type: "updateMessage",
              messageId: lastMsg.id,
              ...errorUpdate,
            });
          }
        }
        break;
      }

      case "item.interrupted": {
        // TUI emits item.interrupted when a turn is interrupted (user
        // clicks stop, or a new turn supersedes the current one) for all
        // in-progress items (see runtime_threads.rs:3412,3437).  Without
        // this handler the toolCall status stays "running" forever.
        const pl = event.payload as {
          item?: {
            kind?: string;
            id?: string;
            summary?: string;
            detail?: string;
            status?: string;
          };
        };
        const kind = pl.item?.kind;
        const active = this.activeItems.get(itemId);
        this.activeItems.delete(itemId);

        if (kind === "tool_call" || kind === "file_change" || kind === "command_execution") {
          const tcIdx = active?.toolCallIdx;
          const tc = tcIdx !== undefined ? lastMsg.toolCalls?.[tcIdx] : undefined;

          if (tc) {
            tc.status = "error";
            tc.approvalId = undefined;
            tc.output = pl.item?.detail || pl.item?.summary || "Interrupted";
            this.postMessage({
              type: "updateToolCall",
              messageId: lastMsg.id,
              toolCallIdx: tcIdx!,
              toolName: tc.name,
              status: "error",
              output: tc.output,
            });
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
    const cfg = vscode.workspace.getConfiguration("cblage.codewhale");
    const currency = cfg.get<string>("costCurrency", "usd");
    // Use the monotonic high-water mark for display so the cost never
    // decreases across turns or session restarts (mirrors TUI #244).
    const costDisplay = currency === "cny"
      ? formatCostAmount(this.displayedCostHighWaterCny, "cny")
      : formatCostAmount(this.displayedCostHighWaterUsd, "usd");
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
    const cfg = vscode.workspace.getConfiguration("cblage.codewhale");
    return cfg.get<string>("defaultModel", "deepseek-v4-pro");
  }

  public getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  public setCurrentSessionId(id: string | null): void {
    this.currentSessionId = id;
  }

  public async saveCurrentSession(threadId: string, sessionId?: string): Promise<{ session_id: string }> {
    return this.api.saveCurrentSession(threadId, sessionId);
  }

  private getCurrentMode(): string {
    const cfg = vscode.workspace.getConfiguration("cblage.codewhale");
    return cfg.get<string>("defaultMode", "agent");
  }

  private getCurrentReasoningEffort(): string {
    const cfg = vscode.workspace.getConfiguration("cblage.codewhale");
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
            } else if (b.type === "subagent_transcript" && b.subagent && typeof b.subagent === "object") {
              const entry = b.subagent as Record<string, unknown>;
              if (typeof entry.content === "string" && entry.content) {
                try { entry.contentHtml = renderMarkdown(entry.content); } catch { entry.contentHtml = entry.content; }
              }
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
                } else if (b.type === "subagent_transcript" && b.subagent && typeof b.subagent === "object") {
                  const entry = b.subagent as Record<string, unknown>;
                  if (typeof entry.content === "string" && entry.content) {
                    try { entry.contentHtml = renderMarkdown(entry.content); } catch { entry.contentHtml = entry.content; }
                  }
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

  private cleanup(options: { preserveAgentWatchdog?: boolean } = {}): void {
    this.agentRunsRefreshGeneration++;
    this.stopAgentRunsRefreshTimer();
    this.stopAgentStateWatcher();
    this.agentRunsRefreshGrace = 0;
    if (!options.preserveAgentWatchdog) {
      this.stopAgentWatchdog();
      this.cachedScopedAgentRuns = [];
      this.agentStateFilePath = null;
    }
    this.subagentTranscriptBlocks.clear();
    this.subagentTranscriptRevision = 0;
    this.restoringSubagentTranscriptHistory = false;
    this.pendingSteerItemIds.clear();
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
