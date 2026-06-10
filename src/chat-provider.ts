import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { exec } from "child_process";
import {
  CodeWhaleApiClient,
  CodeWhaleEngine,
  RuntimeApiCapabilities,
  RuntimeEvent,
  ThreadRecord,
  TurnRecord,
  TurnItemRecord,
  TaskRecord,
  TaskSummary,
} from "./types";
import { getWebviewHtml } from "./webview-html";
import { renderMarkdown } from "./markdown";
import { t, webviewTranslations } from "./i18n";
import {
  SessionStateStore,
  type ChatMessage,
  type ContentBlock,
  type ToolCallInfo,
  type FileChangeInfo,
} from "./session-state";

const FRIENDLY_TOOL_NAMES: Record<string, string> = {
  write_file: "Write file",
  read_file: "Read file",
  apply_patch: "Apply patch",
  replace_text: "Replace text",
  exec_shell: "Run command",
  exec_shell_wait: "Run command (wait)",
  task_shell_wait: "Shell task",
  list_directory: "List directory",
  list_dir: "List directory",
  search_files: "Search files",
  file_search: "Search files",
  move_file: "Move file",
  copy_file: "Copy file",
  delete_file: "Delete file",
  create_directory: "Create directory",
  web_search: "Web search",
  fetch_url: "Fetch URL",
  web_run: "Browse web",
  run_tests: "Run tests",
  image_analyze: "Analyze image",
  code_execution: "Run Python code",
  js_execution: "Run JavaScript code",
  request_user_input: "Ask user",
  checklist_add: "Add checklist item",
  checklist_update: "Update checklist item",
  checklist_list: "List checklist",
  checklist_write: "Write checklist",
  validate_data: "Validate data",
  retrieve_tool_result: "Retrieve result",
};

const TOOL_APPROVAL_SUMMARIES: Record<string, (input: Record<string, unknown>) => string> = {
  write_file: (i) => {
    const p = (i.file_path || i.path || "") as string;
    return p ? `Write to ${shortPath(p)}` : "Write a file";
  },
  read_file: (i) => {
    const p = (i.file_path || i.path || "") as string;
    return p ? `Read ${shortPath(p)}` : "Read a file";
  },
  apply_patch: (i) => {
    const p = (i.file_path || i.path || "") as string;
    return p ? `Patch ${shortPath(p)}` : "Apply a patch";
  },
  replace_text: (i) => {
    const p = (i.file_path || i.path || "") as string;
    return p ? `Replace text in ${shortPath(p)}` : "Replace text in a file";
  },
  exec_shell: (i) => {
    const c = (i.command || "") as string;
    return c ? `Run: ${truncate(c, 60)}` : "Run a shell command";
  },
  exec_shell_wait: (i) => {
    const c = (i.command || "") as string;
    return c ? `Run: ${truncate(c, 60)}` : "Run a shell command";
  },
  delete_file: (i) => {
    const p = (i.file_path || i.path || "") as string;
    return p ? `Delete ${shortPath(p)}` : "Delete a file";
  },
  move_file: (i) => {
    const s = (i.source || "") as string;
    const d = (i.destination || "") as string;
    return s && d ? `Move ${shortPath(s)} → ${shortPath(d)}` : "Move a file";
  },
  copy_file: (i) => {
    const s = (i.source || "") as string;
    const d = (i.destination || "") as string;
    return s && d ? `Copy ${shortPath(s)} → ${shortPath(d)}` : "Copy a file";
  },
  create_directory: (i) => {
    const p = (i.path || "") as string;
    return p ? `Create directory ${shortPath(p)}` : "Create a directory";
  },
  web_search: () => "Search the web",
  fetch_url: (i) => {
    const u = (i.url || "") as string;
    return u ? `Fetch ${truncate(u, 50)}` : "Fetch a URL";
  },
  code_execution: () => "Execute Python code",
  js_execution: () => "Execute JavaScript code",
  run_tests: () => "Run tests",
};

const FILE_CHANGE_TOOLS = new Set([
  "write_file",
  "edit_file",
  "apply_patch",
  "replace_text",
  "delete_file",
  "move_file",
  "copy_file",
  "create_directory",
]);

function stripTurnMeta(text: string): string {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("<turn_meta>")) {
    const closePos = trimmed.indexOf("</turn_meta>");
    if (closePos !== -1) {
      return trimmed.slice(closePos + "</turn_meta>".length).trimStart();
    }
  }
  return trimmed;
}

function isFileChangeTool(toolName: string): boolean {
  return FILE_CHANGE_TOOLS.has(toolName) || FILE_CHANGE_TOOLS.has(toolName.toLowerCase());
}

function extractFilePath(_toolName: string, input: Record<string, unknown>): string {
  return (input.file_path || input.path || input.destination || input.source || "") as string;
}

function parseDiffStats(diff: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) added++;
    else if (line.startsWith("-") && !line.startsWith("---")) removed++;
  }
  return { added, removed };
}

function extractDiffFromOutput(output: string): string | undefined {
  const lines = output.split("\n");
  let diffStart = -1;
  // Search entire output for diff markers (not just first 10 lines)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Git diff header: "diff --git a/... b/..."
    if (line.startsWith("diff --git ")) { diffStart = i; break; }
    // Unified diff: "--- a/..." followed by "+++ b/..." within 2 lines
    if (line.startsWith("--- ") && i + 2 < lines.length && lines[i + 1].startsWith("+++ ")) { diffStart = i; break; }
    // Fallback: hunk header "@@ -..."
    if (line.startsWith("@@")) { diffStart = i; break; }
  }
  if (diffStart < 0) return undefined;

  // Find the end of the diff: stop at an empty line followed by a non-diff line
  // This prevents counting prose/summary bullet points as diff lines
  let diffEnd = lines.length;
  for (let i = diffStart + 1; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = i + 1 < lines.length ? lines[i + 1] : "";
    // Empty line followed by a line that doesn't look like diff content
    if (
      line.trim() === "" &&
      nextLine.trim() !== "" &&
      !nextLine.startsWith("+") &&
      !nextLine.startsWith("-") &&
      !nextLine.startsWith("@@") &&
      !nextLine.startsWith(" ") &&
      !nextLine.startsWith("diff ") &&
      !nextLine.startsWith("--- ") &&
      !nextLine.startsWith("+++ ") &&
      !nextLine.startsWith("index ") &&
      !nextLine.startsWith("\\")  // "\ No newline at end of file"
    ) {
      diffEnd = i + 1; // include the blank line
      break;
    }
  }
  return lines.slice(diffStart, diffEnd).join("\n");
}

function shortPath(p: string): string {
  const parts = p.replace(/\\/g, "/").split("/");
  return parts.length > 3 ? "…/" + parts.slice(-3).join("/") : p;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function extractToolNameFromSummary(summary: string): string {
  const idx = summary.indexOf(":");
  if (idx > 0) return summary.slice(0, idx).trim();
  const spaceIdx = summary.indexOf(" ");
  if (spaceIdx > 0) return summary.slice(0, spaceIdx).trim();
  return summary.trim();
}

function extractFilePathFromDiff(diff: string): string {
  for (const line of diff.split("\n")) {
    const m = line.match(/^\+\+\+ b\/(.+)$/);
    if (m) return m[1];
  }
  for (const line of diff.split("\n")) {
    const m = line.match(/^--- a\/(.+)$/);
    if (m) return m[1];
  }
  return "";
}

export function parseDiffToSides(diff: string): { oldContent: string; newContent: string } {
  const oldLines: string[] = [];
  const newLines: string[] = [];
  const hunkRegex = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
  let inHunk = false;

  for (const line of diff.split("\n")) {
    if (hunkRegex.test(line)) {
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (line.startsWith("---") || line.startsWith("+++") || line.startsWith("diff ") || line.startsWith("index ")) {
      continue;
    }
    if (line.startsWith("+")) {
      newLines.push(line.slice(1));
    } else if (line.startsWith("-")) {
      oldLines.push(line.slice(1));
    } else if (line.startsWith(" ")) {
      oldLines.push(line.slice(1));
      newLines.push(line.slice(1));
    } else if (line.startsWith("\\")) {
      continue;
    } else {
      oldLines.push(line);
      newLines.push(line);
    }
  }

  if (oldLines.length === 0 && newLines.length === 0) {
    return { oldContent: "", newContent: "" };
  }
  return { oldContent: oldLines.join("\n"), newContent: newLines.join("\n") };
}

function friendlyToolName(raw: string): string {
  if (FRIENDLY_TOOL_NAMES[raw]) return FRIENDLY_TOOL_NAMES[raw];
  if (raw.startsWith("mcp__")) return raw.slice(5).replace(/__/g, " / ");
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildApprovalSummary(toolName: string, input: Record<string, unknown>): string {
  const builder = TOOL_APPROVAL_SUMMARIES[toolName];
  if (builder) return builder(input);
  return friendlyToolName(toolName);
}

// ── UI model (interfaces imported from session-state.ts) ──

// ── Provider ──

/**
 * Find the index range of the last user/assistant exchange in a list of
 * messages. Pure function so it can be unit-tested without a vscode mock.
 *
 * Rules:
 *  - Returns `null` if the conversation has fewer than 2 messages, or if
 *    no user message is present, or if the only user message is the very
 *    first message (nothing to keep before it).
 *  - Otherwise returns `{ start, end }` such that `messages.slice(start, end)`
 *    is the last exchange that should be dropped on undo, and
 *    `messages.slice(0, start)` is the part that should be kept.
 */
export interface ConversationMessageLite {
  role: string;
  content?: string;
}

export function lastTurnRange(
  messages: ConversationMessageLite[]
): { start: number; end: number } | null {
  const n = messages.length;
  if (n < 2) return null;
  let userIdx = -1;
  for (let i = n - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      userIdx = i;
      break;
    }
  }
  if (userIdx < 0) return null;
  return { start: userIdx, end: n };
}

export class ChatProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "brotherwhale.chat";

  private view?: vscode.WebviewView;
  private api: CodeWhaleApiClient;
  private engine: CodeWhaleEngine;
  private sessionState = new SessionStateStore();
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
  private get currentThread(): ThreadRecord | null { return this.sessionState.data.currentThread; }
  private set currentThread(v: ThreadRecord | null) { this.sessionState.data.currentThread = v; }
  private get viewingSessionId(): string | null { return this.sessionState.data.viewingSessionId; }
  private set viewingSessionId(v: string | null) { this.sessionState.data.viewingSessionId = v; }
  private get messages(): ChatMessage[] { return this.sessionState.data.messages; }
  private set messages(v: ChatMessage[]) { this.sessionState.data.messages = v; }
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
  private get sessionCostUsd(): number { return this.sessionState.data.stats.sessionCostUsd; }
  private set sessionCostUsd(v: number) { this.sessionState.data.stats.sessionCostUsd = v; }
  private get sessionCostCny(): number { return this.sessionState.data.stats.sessionCostCny; }
  private set sessionCostCny(v: number) { this.sessionState.data.stats.sessionCostCny = v; }
  private get lastCacheHitTokens(): number { return this.sessionState.data.stats.lastCacheHitTokens; }
  private set lastCacheHitTokens(v: number) { this.sessionState.data.stats.lastCacheHitTokens = v; }
  private get lastCacheMissTokens(): number { return this.sessionState.data.stats.lastCacheMissTokens; }
  private set lastCacheMissTokens(v: number) { this.sessionState.data.stats.lastCacheMissTokens = v; }
  private get lastInputTokens(): number { return this.sessionState.data.stats.lastInputTokens; }
  private set lastInputTokens(v: number) { this.sessionState.data.stats.lastInputTokens = v; }
  private get lastOutputTokens(): number { return this.sessionState.data.stats.lastOutputTokens; }
  private set lastOutputTokens(v: number) { this.sessionState.data.stats.lastOutputTokens = v; }
  private get totalInputTokens(): number { return this.sessionState.data.stats.totalInputTokens; }
  private set totalInputTokens(v: number) { this.sessionState.data.stats.totalInputTokens = v; }
  private get totalOutputTokens(): number { return this.sessionState.data.stats.totalOutputTokens; }
  private set totalOutputTokens(v: number) { this.sessionState.data.stats.totalOutputTokens = v; }

  constructor(
    private readonly extensionUri: vscode.Uri,
    engine: CodeWhaleEngine,
    api: CodeWhaleApiClient
  ) {
    this.engine = engine;
    this.api = api;
    this.api.bindEngine(engine);
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
          this.debugLog(`onDidReceiveMessage error: ${(err as Error).message}`);
          this.postMessage({ type: "error", message: `Internal error: ${(err as Error).message}` });
        }
      },
      null,
      this._disposables
    );

    webviewView.onDidDispose(() => this.cleanup());

    this.initializeThread().catch((err) => {
      this.debugLog(`initializeThread FAILED: ${(err as Error).message}`);
      this.postMessage({ type: "error", message: `Initialization failed: ${(err as Error).message}` });
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
            message: `Failed to initialize: ${(err as Error).message}`,
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
      this.debugLog(`initializeThread ERROR: ${(err as Error).message}\n${(err as Error).stack}`);
      this.postMessage({
        type: "error",
        message: `Failed to initialize: ${(err as Error).message}`,
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
            this.turnFileChanges.push(tc.fileChange);
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
        message: `Failed to load history: ${(err as Error).message}`,
      });
      return this.lastEventSeq;
    }
  }

  private async loadSessionMessages(sessionId: string): Promise<void> {
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
                displayName: FRIENDLY_TOOL_NAMES[block.name] || block.name,
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
      const errorMsg = (err as Error).message;
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
          message: `Failed to load session: ${errorMsg}`,
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
        message: `Failed to load thread: ${(err as Error).message}`,
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

  private async handleAttachFile(): Promise<void> {
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
        message: `Failed to attach file: ${(err as Error).message}`,
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
        message: `Failed to send message: ${(err as Error).message}`,
      });
    }
  }

  private async handleNewThread(): Promise<void> {
    this.cleanup();
    this.sessionState.reset();
    this.postMessage({ type: "clearChat" });
  }

  /** Refresh the session list shown in the sidebar */
  private async refreshSessionList(): Promise<void> {
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
  private async refreshTaskList(): Promise<void> {
    try {
      const result = await this.api.listTasks({ limit: 50 });
      this.postMessage({ type: "taskList", tasks: result.tasks });
    } catch {
      // best-effort
    }
  }

  /** Push the current work state to the webview Work panel */
  private refreshWorkPanel(): void {
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
      capabilities: this.getWebviewCapabilities(),
      fileChanges: this.turnFileChanges.map(fc => ({
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

  private async handleInterrupt(): Promise<void> {
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
  private async handleUndoLastTurn(): Promise<void> {
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
        this.postMessage({ type: "error", message: `Failed to resume session: ${(err as Error).message}` });
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
      const msg = (err as Error).message || String(err);
      if (msg.includes("exceeds") || msg.includes("No user turn")) {
        this.postMessage({ type: "info", message: t().undoNoTurns });
      } else {
        this.postMessage({ type: "error", message: `Undo failed: ${msg}` });
      }
    }
  }

  /**
   * Retry the last turn via the server-side undo + re-send API.
   * This creates a new thread with the last turn removed and immediately
   * starts a new turn with the original user message, matching TUI's
   * `retry` behavior.
   */
  private async handleRetryLastTurn(): Promise<void> {
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
        this.postMessage({ type: "error", message: `Failed to resume session: ${(err as Error).message}` });
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
      const msg = (err as Error).message || String(err);
      if (msg.includes("exceeds") || msg.includes("No user") || msg.includes("no user text")) {
        this.postMessage({ type: "info", message: t().retryNoTurns });
      } else {
        this.postMessage({ type: "error", message: `Retry failed: ${msg}` });
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
        message: t().revertFailure(filePath, (err as Error).message),
      });
    }
  }

  private async handleCompact(): Promise<void> {
    if (this.currentThread) {
      try {
        await this.api.compactThread(this.currentThread.id);
        this.postMessage({ type: "info", message: "Context compacted" });
      } catch (err) {
        this.postMessage({
          type: "error",
          message: `Compact failed: ${(err as Error).message}`,
        });
      }
    }
  }

  private async handleSlashCommand(command: string, args: string): Promise<void> {
    const cfg = vscode.workspace.getConfiguration("brotherwhale");
    const notAvailable = () => {
      const tr = t();
      this.postMessage({ type: "info", message: tr.commandNotAvailableInGui });
    };
    
    switch (command) {
      case "/mode": {
        const mode = args.trim().toLowerCase();
        if (["agent", "plan", "yolo", "1", "2", "3"].includes(mode)) {
          const modeMap: Record<string, string> = { "1": "agent", "2": "plan", "3": "yolo" };
          const actualMode = modeMap[mode] || mode;
          const isYolo = actualMode === "yolo";
          await cfg.update("defaultMode", actualMode, vscode.ConfigurationTarget.Global);
          if (this.currentThread) {
            try {
              await this.api.updateThread(this.currentThread.id, {
                mode: actualMode,
                trust_mode: isYolo,
                auto_approve: isYolo || cfg.get<boolean>("autoApprove", false),
              });
            } catch { /* non-critical */ }
          }
          this.postMessage({ type: "settingsUpdated", mode: actualMode, model: cfg.get<string>("defaultModel", "deepseek-v4-pro"), reasoningEffort: cfg.get<string>("reasoningEffort", "auto") });
          this.postMessage({ type: "info", message: `Mode changed to ${actualMode}` });
        } else {
          this.postMessage({ type: "info", message: `Current mode: ${cfg.get<string>("defaultMode", "agent")}\nUsage: /mode [agent|plan|yolo|1|2|3]` });
        }
        break;
      }
      case "/model": {
        const model = args.trim();
        if (model) {
          await cfg.update("defaultModel", model, vscode.ConfigurationTarget.Global);
          this.postMessage({ type: "settingsUpdated", mode: cfg.get<string>("defaultMode", "agent"), model, reasoningEffort: cfg.get<string>("reasoningEffort", "auto") });
          this.postMessage({ type: "info", message: `Model changed to ${model}` });
        } else {
          this.postMessage({ type: "info", message: `Current model: ${cfg.get<string>("defaultModel", "deepseek-v4-pro")}` });
        }
        break;
      }
      case "/models": {
        this.postMessage({ type: "info", message: "Available models:\n- deepseek-v4-pro\n- deepseek-v4-flash\n- deepseek-chat (alias for deepseek-v4-flash)\n- deepseek-reasoner (alias for deepseek-v4-flash)" });
        break;
      }
      case "/reasoning": {
        const effort = args.trim().toLowerCase();
        if (["auto", "off", "low", "medium", "high", "max"].includes(effort)) {
          await cfg.update("reasoningEffort", effort, vscode.ConfigurationTarget.Global);
          this.postMessage({ type: "settingsUpdated", mode: cfg.get<string>("defaultMode", "agent"), model: cfg.get<string>("defaultModel", "deepseek-v4-pro"), reasoningEffort: effort });
          this.postMessage({ type: "info", message: `Reasoning effort changed to ${effort}` });
        } else {
          this.postMessage({ type: "info", message: `Current reasoning effort: ${cfg.get<string>("reasoningEffort", "auto")}\nUsage: /reasoning [auto|off|low|medium|high|max]` });
        }
        break;
      }
      case "/config": {
        vscode.commands.executeCommand("workbench.action.openSettings", "brotherwhale");
        break;
      }
      case "/settings": {
        this.postMessage({ type: "info", message: `Current settings:\n- Mode: ${cfg.get<string>("defaultMode", "agent")}\n- Model: ${cfg.get<string>("defaultModel", "deepseek-v4-pro")}\n- Reasoning Effort: ${cfg.get<string>("reasoningEffort", "auto")}\n- Engine Path: ${cfg.get<string>("enginePath", "codewhale")}\n- Auto Start Engine: ${cfg.get<boolean>("autoStartEngine", true)}` });
        break;
      }
      case "/interrupt": {
        await this.handleInterrupt();
        break;
      }
      case "/clear": {
        this.messages = [];
        this.postMessage({ type: "clearChat" });
        break;
      }
      case "/compact": {
        await this.handleCompact();
        break;
      }
      case "/exit": {
        vscode.commands.executeCommand("workbench.action.closeSidebar");
        break;
      }
      case "/rename": {
        const title = args.trim();
        if (title && this.currentThread) {
          try {
            await this.api.updateThread(this.currentThread.id, { title });
            this.postMessage({ type: "info", message: `Thread renamed to: ${title}` });
            this.refreshSessionList();
          } catch (err) {
            this.postMessage({ type: "error", message: `Failed to rename: ${(err as Error).message}` });
          }
        } else if (!this.currentThread) {
          this.postMessage({ type: "error", message: "No active thread to rename" });
        } else {
          this.postMessage({ type: "error", message: "Usage: /rename <new title>" });
        }
        break;
      }
      case "/save": {
        if (this.currentThread) {
          try {
            const detail = await this.api.getThreadDetail(this.currentThread.id);
            const content = JSON.stringify(detail, null, 2);
            const doc = await vscode.workspace.openTextDocument({ content, language: "json" });
            vscode.window.showTextDocument(doc);
            this.postMessage({ type: "info", message: "Conversation opened for saving" });
          } catch (err) {
            this.postMessage({ type: "error", message: `Failed to save: ${(err as Error).message}` });
          }
        } else {
          this.postMessage({ type: "error", message: "No active thread to save" });
        }
        break;
      }
      case "/export": {
        if (this.currentThread) {
          try {
            const detail = await this.api.getThreadDetail(this.currentThread.id);
            const content = JSON.stringify(detail, null, 2);
            const doc = await vscode.workspace.openTextDocument({ content, language: "json" });
            vscode.window.showTextDocument(doc);
            this.postMessage({ type: "info", message: "Conversation exported" });
          } catch (err) {
            this.postMessage({ type: "error", message: `Failed to export: ${(err as Error).message}` });
          }
        } else {
          this.postMessage({ type: "error", message: "No active thread to export" });
        }
        break;
      }
      case "/context": {
        if (this.currentThread) {
          this.postMessage({ type: "info", message: `Thread: ${this.currentThread.id.slice(0, 12)}...\nMessages: ${this.messages.length}\nMode: ${cfg.get<string>("defaultMode", "agent")}\nModel: ${cfg.get<string>("defaultModel", "deepseek-v4-pro")}` });
        } else {
          this.postMessage({ type: "info", message: "No active thread" });
        }
        break;
      }
      case "/tokens": {
        const tokenArg = args.trim().toLowerCase();
        
        if (tokenArg === "history" || tokenArg === "all" || tokenArg === "today" || tokenArg.startsWith("since ")) {
          try {
            await this.api.ensureReady();

            let since: string | undefined;
            let until: string | undefined;
            
            if (tokenArg === "today") {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              since = today.toISOString();
            } else if (tokenArg.startsWith("since ")) {
              const dateStr = tokenArg.slice(6).trim();
              try {
                const date = new Date(dateStr);
                since = date.toISOString();
              } catch {
                this.postMessage({ type: "error", message: `Invalid date format: ${dateStr}\nUsage: /tokens since YYYY-MM-DD` });
                break;
              }
            }
            
            const usage = await this.api.getUsage({ since, until, group_by: "day" });
            const totals = usage.totals;
            const cacheRate = totals.cached_tokens > 0 
              ? ((totals.cached_tokens / (totals.input_tokens + totals.cached_tokens)) * 100).toFixed(1) 
              : "0";
            
            const timeRange = usage.since && usage.until 
              ? `${new Date(usage.since).toLocaleDateString()} - ${new Date(usage.until).toLocaleDateString()}`
              : "All time";
            
            this.postMessage({ 
              type: "info", 
              message: `Token Usage (history - ${timeRange}):
  Total input: ${totals.input_tokens.toLocaleString()}
  Total output: ${totals.output_tokens.toLocaleString()}
  Cached tokens: ${totals.cached_tokens.toLocaleString()} (${cacheRate}% cache rate)
  Reasoning tokens: ${totals.reasoning_tokens.toLocaleString()}
  Total turns: ${totals.turns.toLocaleString()}
  Estimated cost: $${totals.cost_usd.toFixed(2)}
  
Usage: /tokens [history|today|since <date>]` 
            });
          } catch (err) {
            this.postMessage({ type: "error", message: `Failed to get usage history: ${(err as Error).message}` });
          }
        } else {
          const cfg2 = vscode.workspace.getConfiguration("brotherwhale");
          const currency2 = cfg2.get<string>("costCurrency", "usd");
          const costStr2 = currency2 === "cny"
            ? formatCostAmount(this.sessionCostCny, "cny")
            : formatCostAmount(this.sessionCostUsd, "usd");
          const cacheTotal = this.lastCacheHitTokens + this.lastCacheMissTokens;
          const cacheRate = cacheTotal > 0 ? (this.lastCacheHitTokens / cacheTotal * 100).toFixed(1) : "N/A";
          this.postMessage({ type: "info", message: `Token Usage (session):\n  Total input: ${this.totalInputTokens.toLocaleString()}\n  Total output: ${this.totalOutputTokens.toLocaleString()}\n  Last turn input: ${this.lastInputTokens.toLocaleString()}\n  Last turn output: ${this.lastOutputTokens.toLocaleString()}\n  Cache hit rate (last): ${cacheRate}%\n  Cache hit: ${this.lastCacheHitTokens.toLocaleString()} | miss: ${this.lastCacheMissTokens.toLocaleString()}\n  Estimated cost: ${costStr2}\n\nUsage: /tokens [history|today|since <date>] for historical data` });
        }
        break;
      }
      case "/cost": {
        const costArg = args.trim().toLowerCase();
        
        if (costArg === "history" || costArg === "all" || costArg === "today" || costArg.startsWith("since ")) {
          try {
            await this.api.ensureReady();

            let since: string | undefined;
            let until: string | undefined;
            
            if (costArg === "today") {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              since = today.toISOString();
            } else if (costArg.startsWith("since ")) {
              const dateStr = costArg.slice(6).trim();
              try {
                const date = new Date(dateStr);
                since = date.toISOString();
              } catch {
                this.postMessage({ type: "error", message: `Invalid date format: ${dateStr}\nUsage: /cost since YYYY-MM-DD` });
                break;
              }
            }
            
            const usage = await this.api.getUsage({ since, until, group_by: "day" });
            const totals = usage.totals;
            const cacheRate = totals.cached_tokens > 0 
              ? ((totals.cached_tokens / (totals.input_tokens + totals.cached_tokens)) * 100).toFixed(1) 
              : "0";
            
            const timeRange = usage.since && usage.until 
              ? `${new Date(usage.since).toLocaleDateString()} - ${new Date(usage.until).toLocaleDateString()}`
              : "All time";
            
            const cfg3 = vscode.workspace.getConfiguration("brotherwhale");
            const currency3 = cfg3.get<string>("costCurrency", "usd");
            const costDisplay = currency3 === "cny" 
              ? `¥${(totals.cost_usd * 7.2).toFixed(2)} (≈ $${totals.cost_usd.toFixed(2)})`
              : `$${totals.cost_usd.toFixed(2)}`;
            
            this.postMessage({ 
              type: "info", 
              message: `Cost Summary (history - ${timeRange}):
  Total cost: ${costDisplay}
  Tokens: ↥${totals.input_tokens.toLocaleString()} ↧${totals.output_tokens.toLocaleString()}
  Cache hit rate: ${cacheRate}% (${totals.cached_tokens.toLocaleString()} cached)
  Reasoning tokens: ${totals.reasoning_tokens.toLocaleString()}
  Total turns: ${totals.turns.toLocaleString()}
  
Usage: /cost [history|today|since <date>]` 
            });
          } catch (err) {
            this.postMessage({ type: "error", message: `Failed to get cost history: ${(err as Error).message}` });
          }
        } else {
          const cfg3 = vscode.workspace.getConfiguration("brotherwhale");
          const currency3 = cfg3.get<string>("costCurrency", "usd");
          const costStr3 = currency3 === "cny"
            ? formatCostAmount(this.sessionCostCny, "cny")
            : formatCostAmount(this.sessionCostUsd, "usd");
          const cacheTotal2 = this.lastCacheHitTokens + this.lastCacheMissTokens;
          const cacheRate2 = cacheTotal2 > 0 ? (this.lastCacheHitTokens / cacheTotal2 * 100).toFixed(1) : "N/A";
          this.postMessage({ type: "info", message: `Session Cost (approximate):\n  Total: ${costStr3}\n  Tokens: ↥${this.totalInputTokens.toLocaleString()} ↧${this.totalOutputTokens.toLocaleString()}\n  Cache hit rate: ${cacheRate2}% (hit: ${this.lastCacheHitTokens.toLocaleString()}, miss: ${this.lastCacheMissTokens.toLocaleString()})\n  Model: ${this.getCurrentModel()}\n\nUsage: /cost [history|today|since <date>] for historical data` });
        }
        break;
      }
      case "/status": {
        try {
          await this.api.ensureReady();

          const runtimeInfo = await this.api.getRuntimeInfo();
          const running = this.engine.isRunning;
          const authInfo = runtimeInfo.auth_required ? "✓ (token required)" : "✗ (no auth)";
          
          this.postMessage({ 
            type: "info", 
            message: `Runtime Status:
  Engine: ${running ? "Running ✓" : "Stopped ✗"}
  Host: ${runtimeInfo.bind_host}:${runtimeInfo.port}
  Version: ${runtimeInfo.version}
  Auth: ${authInfo}
  Thread: ${this.currentThread ? this.currentThread.id.slice(0, 12) + "..." : "None"}
  Mode: ${cfg.get<string>("defaultMode", "agent")}
  Model: ${cfg.get<string>("defaultModel", "deepseek-v4-pro")}` 
          });
        } catch (err) {
          const running = this.engine.isRunning;
          this.postMessage({ 
            type: "info", 
            message: `Engine: ${running ? "Running" : "Stopped"}\nPort: ${this.engine.port}\nThread: ${this.currentThread ? this.currentThread.id.slice(0, 12) + "..." : "None"}\nMode: ${cfg.get<string>("defaultMode", "agent")}\nModel: ${cfg.get<string>("defaultModel", "deepseek-v4-pro")}\n(Runtime info unavailable: ${(err as Error).message})` 
          });
        }
        break;
      }
      case "/home": {
        this.postMessage({ type: "info", message: `Dashboard:\n- Threads: see sidebar\n- Mode: ${cfg.get<string>("defaultMode", "agent")}\n- Model: ${cfg.get<string>("defaultModel", "deepseek-v4-pro")}\n- Reasoning: ${cfg.get<string>("reasoningEffort", "auto")}` });
        break;
      }
      case "/workspace": {
        try {
          await this.api.ensureReady();

          const status = await this.api.getWorkspaceStatus();
          const wsPath = status.workspace;
          const gitInfo = status.git_repo
            ? `\n  Git repo: ✓
  Branch: ${status.branch || "N/A"}
  Staged: ${status.staged} files
  Unstaged: ${status.unstaged} files
  Untracked: ${status.untracked} files
  Ahead/Behind: ${status.ahead ?? 0}/${status.behind ?? 0}`
            : "\n  Git repo: ✗ (not a git repository)";
          
          this.postMessage({ 
            type: "info", 
            message: `Workspace: ${wsPath}${gitInfo}\n\nUsage: /workspace [path] to change workspace (not implemented in GUI)` 
          });
        } catch (err) {
          const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "N/A";
          this.postMessage({ type: "info", message: `Workspace: ${ws}\n(Git status unavailable: ${(err as Error).message})` });
        }
        break;
      }
      case "/task": {
        const taskSub = args.trim().split(/\s+/)[0]?.toLowerCase() || "";
        const taskRest = args.trim().slice(taskSub.length).trim();
        try {
          await this.api.ensureReady();
          if (taskSub === "add" && taskRest) {
            const cfg = vscode.workspace.getConfiguration("brotherwhale");
            const task = await this.api.createTask({
              prompt: taskRest,
              model: cfg.get<string>("defaultModel", "deepseek-v4-pro"),
              mode: cfg.get<string>("defaultMode", "agent"),
              workspace: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
              auto_approve: cfg.get<boolean>("autoApprove", false),
            });
            this.postMessage({ type: "info", message: `Task created: ${task.id.slice(0, 8)} — "${taskRest.slice(0, 60)}" [${task.status}]` });
            await this.refreshTaskList();
          } else if (taskSub === "show" && taskRest) {
            const task = await this.api.getTask(taskRest);
            this.postMessage({ type: "taskDetail", task });
          } else if (taskSub === "cancel" && taskRest) {
            await this.api.cancelTask(taskRest);
            this.postMessage({ type: "info", message: `Task ${taskRest.slice(0, 8)} cancelled.` });
            await this.refreshTaskList();
          } else {
            const result = await this.api.listTasks({ limit: 20 });
            const tasks = result.tasks;
            if (tasks && tasks.length > 0) {
              const lines = tasks.map((t: TaskSummary) => {
                const statusIcon = t.status === "completed" ? "✓" : t.status === "running" ? "⟳" : t.status === "failed" ? "✗" : t.status === "queued" ? "⏳" : "·";
                return `${statusIcon} ${t.id.slice(0, 8)}: ${t.prompt_summary.slice(0, 40)} [${t.status}]`;
              });
              this.postMessage({ type: "info", message: `Tasks (${tasks.length}):\n${lines.join("\n")}\n\nUsage: /task add <prompt> | /task show <id> | /task cancel <id>` });
            } else {
              this.postMessage({ type: "info", message: "No tasks.\n\nUsage: /task add <prompt> | /task list | /task show <id> | /task cancel <id>" });
            }
          }
        } catch (err) {
          this.postMessage({ type: "info", message: `Task error: ${(err as Error).message}\n\nUsage: /task add <prompt> | /task list | /task show <id> | /task cancel <id>` });
        }
        break;
      }
      case "/trust": {
        const sub = args.trim().toLowerCase();
        if (sub === "on") {
          await cfg.update("autoApprove", true, vscode.ConfigurationTarget.Global);
          if (this.currentThread) {
            try {
              await this.api.updateThread(this.currentThread.id, { auto_approve: true, trust_mode: true });
            } catch { /* non-critical */ }
          }
          this.postMessage({ type: "info", message: "Trust mode enabled (auto-approve)" });
        } else if (sub === "off") {
          const isYolo = cfg.get<string>("defaultMode", "agent") === "yolo";
          await cfg.update("autoApprove", false, vscode.ConfigurationTarget.Global);
          if (this.currentThread) {
            try {
              await this.api.updateThread(this.currentThread.id, { auto_approve: isYolo, trust_mode: isYolo });
            } catch { /* non-critical */ }
          }
          this.postMessage({ type: "info", message: "Trust mode disabled" });
        } else {
          this.postMessage({ type: "info", message: `Usage: /trust [on|off]\nAuto-approve is currently: ${cfg.get<boolean>("autoApprove", false) ? "on" : "off"}` });
        }
        break;
      }
      case "/verbose": {
        const sub = args.trim().toLowerCase();
        if (sub === "on") {
          await cfg.update("verbose", true, vscode.ConfigurationTarget.Global);
          this.postMessage({ type: "info", message: "Verbose mode enabled" });
        } else if (sub === "off") {
          await cfg.update("verbose", false, vscode.ConfigurationTarget.Global);
          this.postMessage({ type: "info", message: "Verbose mode disabled" });
        } else {
          this.postMessage({ type: "info", message: `Usage: /verbose [on|off]\nVerbose is currently: ${cfg.get<boolean>("verbose", false) ? "on" : "off"}` });
        }
        break;
      }
      case "/init": {
        vscode.commands.executeCommand("workbench.action.openSettings", "brotherwhale");
        this.postMessage({ type: "info", message: "Use the VSCode settings to configure CodeWhale. Open settings with /config." });
        break;
      }
      case "/mcp": {
        vscode.commands.executeCommand("workbench.action.openSettings", "brotherwhale");
        this.postMessage({ type: "info", message: "MCP server configuration is available in VSCode settings." });
        break;
      }
      case "/provider": {
        this.postMessage({ type: "info", message: "Provider is configured via DEEPSEEK_API_KEY environment variable. Use /config to open settings." });
        break;
      }
      case "/links": {
        this.postMessage({ type: "info", message: "DeepSeek Links:\n- API: https://api.deepseek.com\n- Docs: https://api-docs.deepseek.com\n- Status: https://status.deepseek.com" });
        break;
      }
      case "/feedback": {
        vscode.commands.executeCommand("workbench.action.openIssueReporter");
        this.postMessage({ type: "info", message: "Opening issue reporter for feedback." });
        break;
      }
      case "/help": {
        this.postMessage({ type: "info", message: `Available commands:
/mode [agent|plan|yolo|1|2|3] - Switch mode
/model [name] - Switch model
/models - List available models
/reasoning [auto|off|low|medium|high|max] - Set reasoning effort
/config - Open VSCode settings
/settings - Show current settings
/clear - Clear chat
/compact - Compact context
/interrupt - Interrupt current turn (use when stuck)
/rename <title> - Rename thread
/save - Save conversation
/export - Export conversation
/context - Show context info
/status - Show engine status
/workspace [path] - Show/set workspace
/trust [on|off] - Toggle trust mode
/verbose [on|off] - Toggle verbose mode
/skills - List all available skills with status
/skill <name> [on|off] - Enable or disable a skill
/init - Open settings for initialization
/mcp - Open MCP settings
/provider - Show provider info
/links - Show CodeWhale links
/feedback - Send feedback
/exit - Close sidebar

Commands with limited support in GUI:
/task, /jobs, /note, /memory, /undo, /retry, /share,
/goal, /network, /queue, /stash, /hooks, /subagents,
/agent, /attach, /anchor, /sessions, /load, /cycles,
/cycle, /recall, /relay, /lsp, /review, /restore, /rlm,
/change, /cache, /profile, /translate, /system, /edit,
/diff, /logout, /tokens, /cost, /home

Use the TUI for full command support.` });
        break;
      }
      case "/theme":
        notAvailable();
        break;
      case "/undo": {
        await this.handleUndoLastTurn();
        break;
      }
      case "/retry": {
        await this.handleRetryLastTurn();
        break;
      }
      case "/share":
        notAvailable();
        break;
      case "/goal": {
        try {
          const goalArg = args.trim();
          if (goalArg === "clear" || goalArg === "reset" || goalArg === "done") {
            await cfg.update("goalObjective", undefined, vscode.ConfigurationTarget.Global);
            await cfg.update("goalTokenBudget", undefined, vscode.ConfigurationTarget.Global);
            this.postMessage({ type: "info", message: "Goal cleared." });
          } else if (goalArg) {
            const pipeIdx = goalArg.indexOf("|");
            let objective = goalArg;
            let budget: number | undefined;
            if (pipeIdx >= 0) {
              objective = goalArg.slice(0, pipeIdx).trim();
              const budgetStr = goalArg.slice(pipeIdx + 1).trim();
              const budgetMatch = budgetStr.match(/budget:\s*(\d+)/i);
              if (budgetMatch) budget = parseInt(budgetMatch[1], 10);
            }
            await cfg.update("goalObjective", objective, vscode.ConfigurationTarget.Global);
            if (budget) await cfg.update("goalTokenBudget", budget, vscode.ConfigurationTarget.Global);
            const budgetStr = budget ? ` (budget: ${budget} tokens)` : "";
            this.postMessage({ type: "info", message: `Goal set: "${objective}"${budgetStr} — tracking progress.` });
          } else {
            const currentGoal = cfg.get<string | undefined>("goalObjective");
            if (currentGoal) {
              const currentBudget = cfg.get<number | undefined>("goalTokenBudget");
              const budgetStr = currentBudget ? ` (budget: ${currentBudget} tokens)` : "";
              this.postMessage({ type: "info", message: `Current goal: "${currentGoal}"${budgetStr}` });
            } else {
              this.postMessage({ type: "info", message: "No goal set.\nUsage: /goal <objective> [| budget: <tokens>]\n/goal clear — clear current goal" });
            }
          }
          this.refreshWorkPanel();
        } catch (err) {
          this.postMessage({ type: "error", message: `Goal error: ${(err as Error).message}` });
        }
        break;
      }
      case "/skills": {
        try {
          await this.api.ensureReady();
          const result = await this.api.listSkills();
          const skills = result.skills;
          if (skills && skills.length > 0) {
            const userSkills = skills.filter(s => !s.is_bundled);
            const bundledSkills = skills.filter(s => s.is_bundled);

            let output = `Available skills (${skills.length}):\n─────────────────────────────\n`;

            if (userSkills.length > 0) {
              output += `Your skills (${userSkills.length}):\n`;
              for (const s of userSkills) {
                const statusIcon = s.enabled ? "✓" : "○";
                output += `  ${statusIcon} /${s.name} - ${s.description || "(no description)"}\n`;
              }
              if (bundledSkills.length > 0) output += "\n";
            }

            if (bundledSkills.length > 0) {
              output += `Built-in skills (${bundledSkills.length}):\n`;
              if (userSkills.length > 0) {
                const names = bundledSkills.map(s => `/${s.name}`).join(", ");
                output += `  ${names}\n`;
                output += `  (run /skills <name> for details on a built-in)\n`;
              } else {
                for (const s of bundledSkills) {
                  const statusIcon = s.enabled ? "✓" : "○";
                  output += `  ${statusIcon} /${s.name} - ${s.description || "(no description)"}\n`;
                }
              }
            }

            const warnings = result.warnings && result.warnings.length > 0 
              ? `\nWarnings:\n${result.warnings.map(w => `  - ${w}`).join("\n")}\n` 
              : "";

            const dirInfo = result.directories && result.directories.length > 1
              ? `Skills directories:\n${result.directories.map(d => `  - ${d}`).join("\n")}`
              : `Skills directory: ${result.directory}`;

            this.postMessage({ 
              type: "info", 
              message: `${output}\nUse /skill <name> [on|off] to enable/disable\n${dirInfo}${warnings}` 
            });
          } else {
            const dirInfo = result.directories && result.directories.length > 1
              ? `Skills directories:\n${result.directories.map(d => `  - ${d}`).join("\n")}`
              : `Skills directory: ${result.directory}`;
            this.postMessage({ 
              type: "info", 
              message: `No skills found.\n${dirInfo}\n\nSkills are auto-triggered when enabled and task matches.\nCreate skills in ~/.codewhale/skills/<name>/SKILL.md` 
            });
          }
        } catch (err) {
          this.postMessage({ type: "error", message: `Failed to list skills: ${(err as Error).message}` });
        }
        break;
      }
      case "/skill": {
        const parts = args.trim().split(/\s+/);
        const skillName = parts[0];
        const action = parts[1]?.toLowerCase() || "";
        
        if (!skillName) {
          this.postMessage({ type: "error", message: "Usage: /skill <name> [on|off]" });
          break;
        }
        
        try {
          await this.api.ensureReady();

          if (action === "on" || action === "enable" || action === "") {
            const result = await this.api.setSkillEnabled(skillName, true);
            this.postMessage({ type: "info", message: `Skill '${result.name}' enabled. It will auto-trigger when task matches.` });
          } else if (action === "off" || action === "disable") {
            const result = await this.api.setSkillEnabled(skillName, false);
            this.postMessage({ type: "info", message: `Skill '${result.name}' disabled.` });
          } else {
            this.postMessage({ type: "error", message: `Unknown action: ${action}\nUsage: /skill <name> [on|off]` });
          }
        } catch (err) {
          const errorMsg = (err as Error).message;
          if (errorMsg.includes("not found")) {
            this.postMessage({ type: "error", message: `Skill '${skillName}' not found. Use /skills to list available skills.` });
          } else {
            this.postMessage({ type: "error", message: `Failed to toggle skill: ${errorMsg}` });
          }
        }
        break;
      }
      case "/network":
        notAvailable();
        break;
      case "/queue":
      case "/stash":
        notAvailable();
        break;
      case "/hooks":
        notAvailable();
        break;
      case "/subagents":
      case "/agent":
        notAvailable();
        break;
      case "/attach":
        await this.handleAttachFile();
        break;
      case "/anchor": {
        const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!ws) {
          this.postMessage({ type: "info", message: "No workspace open. Anchors require an open workspace." });
          break;
        }
        const anchorDir = path.join(ws, ".deepseek");
        const anchorPath = path.join(anchorDir, "anchors.md");
        const anchorArg = args.trim();
        const anchorSub = anchorArg.split(/\s+/)[0]?.toLowerCase();
        const anchorRest = anchorArg.slice(anchorSub.length).trim();

        if (!anchorArg || anchorSub === "help") {
          this.postMessage({ type: "info", message: `Usage: /anchor <text> | /anchor list | /anchor remove <n>\nAnchors are auto-injected after compaction.\nAnchors path: ${anchorPath}` });
          break;
        }

        try {
          if (!fs.existsSync(anchorDir)) fs.mkdirSync(anchorDir, { recursive: true });
        } catch (err) {
          this.postMessage({ type: "error", message: `Failed to create .deepseek directory: ${(err as Error).message}` });
          break;
        }

        try {
          if (anchorSub === "list") {
            if (!fs.existsSync(anchorPath)) {
              this.postMessage({ type: "info", message: "No anchors set." });
            } else {
              const content = fs.readFileSync(anchorPath, "utf-8");
              const lines = content.split("\n").filter(l => l.trim().length > 0);
              if (lines.length === 0) {
                this.postMessage({ type: "info", message: "No anchors set." });
              } else {
                this.postMessage({ type: "info", message: `Anchors (${lines.length}):\n${lines.map((l, i) => `${i + 1}. ${l.replace(/^[-*]\s*/, "")}`).join("\n")}` });
              }
            }
          } else if (anchorSub === "remove" || anchorSub === "rm" || anchorSub === "delete") {
            const idx = parseInt(anchorRest, 10);
            if (isNaN(idx) || idx < 1) {
              this.postMessage({ type: "error", message: "Usage: /anchor remove <n>" });
              break;
            }
            if (!fs.existsSync(anchorPath)) {
              this.postMessage({ type: "error", message: "No anchors file." });
              break;
            }
            const content = fs.readFileSync(anchorPath, "utf-8");
            const lines = content.split("\n").filter(l => l.trim().length > 0);
            if (idx > lines.length) {
              this.postMessage({ type: "error", message: `Anchor ${idx} not found. Only ${lines.length} anchors.` });
              break;
            }
            lines.splice(idx - 1, 1);
            fs.writeFileSync(anchorPath, lines.join("\n") + "\n");
            this.postMessage({ type: "info", message: `Removed anchor ${idx}.` });
          } else {
            const text = anchorArg;
            const entry = `- ${text}\n`;
            fs.appendFileSync(anchorPath, entry);
            this.postMessage({ type: "info", message: `Anchor added: ${text}` });
          }
        } catch (err) {
          this.postMessage({ type: "error", message: `Anchor error: ${(err as Error).message}` });
        }
        break;
      }
      case "/sessions": {
        try {
          await this.api.ensureReady();

          const searchArg = args.trim();
          const searchMatch = searchArg.match(/^search\s+(.+)$/i);
          const searchQuery = searchMatch ? searchMatch[1].trim() : undefined;
          
          const result = await this.api.listSessions({ limit: 20, search: searchQuery });
          const sessions = result.sessions;
          
          if (sessions && sessions.length > 0) {
            const lines = sessions.map((s) => {
              const date = new Date(s.updated_at).toLocaleDateString();
              const tokens = s.total_tokens > 0 ? ` (${s.total_tokens.toLocaleString()} tokens)` : "";
              const mode = s.mode || "agent";
              const costUsd = s.cost?.session_cost_usd ?? 0;
              const cost = costUsd > 0 ? ` $${costUsd.toFixed(2)}` : "";
              const shortId = s.id.slice(0, 8);
              return `${shortId}: "${s.title.slice(0, 40)}" [${mode}] ${date}${tokens}${cost}`;
            });
            
            const searchHint = searchQuery ? ` matching "${searchQuery}"` : "";
            this.postMessage({ 
              type: "info", 
              message: `Saved sessions${searchHint} (${sessions.length}):\n${lines.join("\n")}\n\nUsage: /load <session-id> to resume a session\nYou can use short ID (e.g., /load ${sessions[0]?.id.slice(0, 8)})\n/sessions search <query> to filter` 
            });
          } else {
            const searchHint = searchQuery ? ` matching "${searchQuery}"` : "";
            this.postMessage({ 
              type: "info", 
              message: `No saved sessions found${searchHint}.\n\nGUI no longer auto-creates session records.\nUsage: /sessions [search <query>]` 
            });
          }
        } catch (err) {
          this.postMessage({ type: "error", message: `Failed to list sessions: ${(err as Error).message}` });
        }
        break;
      }
      case "/load": {
        const sessionIdInput = args.trim();

        if (!sessionIdInput) {
          this.postMessage({ type: "error", message: "Usage: /load <session-id>\nUse /sessions to find session IDs.\nYou can use short ID (e.g., first 8 characters)." });
          break;
        }

        try {
          await this.api.ensureReady();

          let sessionId = sessionIdInput;

          if (sessionIdInput.length < 36) {
            const sessionsResult = await this.api.listSessions({ limit: 100 });
            const sessions = sessionsResult.sessions || [];

            const matches = sessions.filter(s => s.id.startsWith(sessionIdInput));

            if (matches.length === 0) {
              this.postMessage({
                type: "error",
                message: `No session matches '${sessionIdInput}'.\nUse /sessions to list available sessions.`
              });
              break;
            } else if (matches.length === 1) {
              sessionId = matches[0].id;
            } else {
              const matchLines = matches.map((s, idx) => {
                const date = new Date(s.updated_at).toLocaleDateString();
                return `${idx + 1}. ${s.id}: "${s.title.slice(0, 40)}" (${date})`;
              });

              this.postMessage({
                type: "info",
                message: `Multiple sessions match '${sessionIdInput}' (${matches.length}):\n${matchLines.join("\n")}\n\nUse /load <full-id> to select specific session.`
              });
              break;
            }
          }

          await this.loadSessionMessages(sessionId);
        } catch (err) {
          const errorMsg = (err as Error).message;
          if (errorMsg.includes("not found")) {
            this.postMessage({ type: "error", message: `Session '${sessionIdInput}' not found. Use /sessions to list available sessions.` });
          } else {
            this.postMessage({ type: "error", message: `Failed to load session: ${errorMsg}` });
          }
        }
        break;
      }
      case "/cycles":
      case "/cycle":
      case "/recall":
        notAvailable();
        break;
      case "/relay":
        notAvailable();
        break;
      case "/lsp":
        notAvailable();
        break;
      case "/review":
        notAvailable();
        break;
      case "/restore":
        notAvailable();
        break;
      case "/rlm":
        notAvailable();
        break;
      case "/change": {
        this.postMessage({ type: "info", message: "Changelog: See the extension's CHANGELOG or visit the repository." });
        break;
      }
      case "/cache": {
        if (this.currentThread) {
          try {
            const detail = await this.api.getThreadDetail(this.currentThread.id);
            const turns = detail.turns || [];
            const recentTurns = turns.slice(-10);
            let cacheInfo = "Cache telemetry (last 10 turns):\n";
            for (const turn of recentTurns) {
              const usage = turn.usage;
              if (usage) {
                const hit = usage.prompt_cache_hit_tokens ?? 0;
                const miss = usage.prompt_cache_miss_tokens ?? 0;
                const total = hit + miss;
                const ratio = total > 0 ? Math.round((hit / total) * 100) : 0;
                cacheInfo += `  Turn ${turn.id.slice(0, 8)}: cache hit ${hit}, miss ${miss} (${ratio}% hit rate)\n`;
              }
            }
            if (cacheInfo.trim().endsWith("turns):")) {
              cacheInfo += "  (no cache data available)";
            }
            this.postMessage({ type: "info", message: cacheInfo });
          } catch (err) {
            this.postMessage({ type: "error", message: `Failed to get cache info: ${(err as Error).message}` });
          }
        } else {
          this.postMessage({ type: "info", message: "No active thread for cache info." });
        }
        break;
      }
      case "/profile": {
        const profileArg = args.trim();
        if (!profileArg) {
          const currentProfile = cfg.get<string | undefined>("configProfile");
          this.postMessage({ type: "info", message: `Current profile: ${currentProfile || "(default)"}\nUsage: /profile <name>\nProfiles are defined in ~/.deepseek/config.toml under [profiles] sections.` });
        } else {
          await cfg.update("configProfile", profileArg, vscode.ConfigurationTarget.Global);
          this.postMessage({ type: "info", message: `Profile switched to '${profileArg}'. Restart the engine for full effect.` });
        }
        break;
      }
      case "/translate": {
        const current = cfg.get<boolean>("translationEnabled", false);
        await cfg.update("translationEnabled", !current, vscode.ConfigurationTarget.Global);
        this.postMessage({ type: "info", message: `Translation ${!current ? "enabled" : "disabled"}` });
        break;
      }
      case "/system": {
        if (this.currentThread) {
          try {
            const detail = await this.api.getThreadDetail(this.currentThread.id);
            const sysPrompt = detail.thread.system_prompt || "(no system prompt)";
            const display = sysPrompt.length > 500
              ? sysPrompt.slice(0, 500) + `...\n\n(truncated, ${sysPrompt.length} chars total)`
              : sysPrompt;
            this.postMessage({ type: "info", message: `System Prompt (${cfg.get<string>("defaultMode", "agent")} mode):\n─────────────────────────────\n${display}` });
          } catch (err) {
            this.postMessage({ type: "error", message: `Failed to get system prompt: ${(err as Error).message}` });
          }
        } else {
          this.postMessage({ type: "info", message: "(no system prompt)" });
        }
        break;
      }
      case "/edit":
        this.postMessage({ type: "loadLastUserMessage" });
        break;
      case "/diff": {
        const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!ws) {
          this.postMessage({ type: "info", message: "No workspace open" });
          break;
        }
        try {
          const execAsync = (cmd: string, opts: { cwd: string; encoding: string }) =>
            new Promise<string>((resolve, reject) => {
              exec(cmd, { ...opts, timeout: 10000 }, (err, stdout) => {
                if (err) reject(err);
                else resolve(stdout as string);
              });
            });
          const statOutput = await execAsync("git diff --stat", { cwd: ws, encoding: "utf-8" });
          const nameOutput = await execAsync("git diff --name-only", { cwd: ws, encoding: "utf-8" });
          if (nameOutput.trim().length === 0) {
            this.postMessage({ type: "info", message: "No changes since session start" });
          } else {
            const files = nameOutput.trim().split("\n");
            this.postMessage({ type: "info", message: `Changed files (${files.length}):\n${files.map((f: string) => `- ${f}`).join("\n")}\n\n${statOutput.trim()}` });
          }
        } catch (err) {
          this.postMessage({ type: "info", message: `Git diff unavailable: ${(err as Error).message}` });
        }
        break;
      }
      case "/statusline":
        notAvailable();
        break;
      case "/jobs": {
        const jobsArg = args.trim().toLowerCase();
        const jobsParts = jobsArg.split(/\s+/);
        const jobsSub = jobsParts[0] || "list";
        const jobsId = jobsParts[1] || "";
        
        try {
          await this.api.ensureReady();

          if (jobsSub === "list" || jobsSub === "") {
            const automations = await this.api.listAutomations();
            
            if (automations && automations.length > 0) {
              const lines = automations.map((a) => {
                const statusIcon = a.status === "active" ? "✓" : "○";
                const nextRun = a.next_run_at 
                  ? `Next: ${new Date(a.next_run_at).toLocaleString()}`
                  : "No scheduled run";
                const lastRun = a.last_run_at 
                  ? `Last: ${new Date(a.last_run_at).toLocaleString()}`
                  : "Never run";
                return `${statusIcon} ${a.id.slice(0, 8)}: "${a.name}" [${a.status}] ${nextRun} | ${lastRun}`;
              });
              
              this.postMessage({ 
                type: "info", 
                message: `Automations (${automations.length}):\n${lines.join("\n")}\n\nUsage: /jobs show <id> | /jobs run <id> | /jobs pause <id> | /jobs resume <id> | /jobs history <id>` 
              });
            } else {
              this.postMessage({ 
                type: "info", 
                message: `No automations found.\n\nAutomations are scheduled tasks that run automatically.\nCreate via TUI or use the automations API.\nUsage: /jobs list` 
              });
            }
          } else if (jobsSub === "show" && jobsId) {
            const automation = await this.api.getAutomation(jobsId);
            const nextRun = automation.next_run_at 
              ? new Date(automation.next_run_at).toLocaleString()
              : "Not scheduled";
            const lastRun = automation.last_run_at 
              ? new Date(automation.last_run_at).toLocaleString()
              : "Never";
            
            this.postMessage({ 
              type: "info", 
              message: `Automation: ${automation.name}
  ID: ${automation.id}
  Status: ${automation.status}
  Schedule: ${automation.rrule}
  Next run: ${nextRun}
  Last run: ${lastRun}
  Prompt: ${automation.prompt.slice(0, 200)}${automation.prompt.length > 200 ? "..." : ""}
  Workspaces: ${automation.cwds.length > 0 ? automation.cwds.join(", ") : "N/A"}
  
Usage: /jobs run ${automation.id.slice(0, 8)} | /jobs pause ${automation.id.slice(0, 8)} | /jobs history ${automation.id.slice(0, 8)}` 
            });
          } else if (jobsSub === "run" && jobsId) {
            const automation = await this.api.runAutomation(jobsId);
            this.postMessage({ 
              type: "info", 
              message: `Automation triggered: ${automation.name} (${automation.id.slice(0, 8)})\nStatus: ${automation.status}\nThe automation will execute according to its schedule.` 
            });
          } else if (jobsSub === "pause" && jobsId) {
            const automation = await this.api.pauseAutomation(jobsId);
            this.postMessage({ 
              type: "info", 
              message: `Automation paused: ${automation.name} (${automation.id.slice(0, 8)})\nStatus: ${automation.status}\nUse /jobs resume ${automation.id.slice(0, 8)} to resume.` 
            });
          } else if (jobsSub === "resume" && jobsId) {
            const automation = await this.api.resumeAutomation(jobsId);
            this.postMessage({ 
              type: "info", 
              message: `Automation resumed: ${automation.name} (${automation.id.slice(0, 8)})\nStatus: ${automation.status}\nNext run: ${automation.next_run_at ? new Date(automation.next_run_at).toLocaleString() : "Not scheduled"}` 
            });
          } else if (jobsSub === "history" && jobsId) {
            const runs = await this.api.listAutomationRuns(jobsId, { limit: 10 });
            
            if (runs && runs.length > 0) {
              const lines = runs.map((r) => {
                const statusIcon = r.status === "completed" ? "✓" : 
                                   r.status === "running" ? "⏳" : 
                                   r.status === "failed" ? "✗" : "○";
                const scheduled = new Date(r.scheduled_for).toLocaleString();
                const started = r.started_at ? new Date(r.started_at).toLocaleString() : "N/A";
                const ended = r.ended_at ? new Date(r.ended_at).toLocaleString() : "N/A";
                const error = r.error ? ` Error: ${r.error.slice(0, 50)}` : "";
                return `${statusIcon} ${r.id.slice(0, 8)}: ${scheduled} → ${started} → ${ended} [${r.status}]${error}`;
              });
              
              this.postMessage({ 
                type: "info", 
                message: `Automation runs (${runs.length}):\n${lines.join("\n")}\n\nUsage: /jobs history <id>` 
              });
            } else {
              this.postMessage({ 
                type: "info", 
                message: `No run history found for automation ${jobsId}.\n\nThe automation may not have executed yet.` 
              });
            }
          } else {
            this.postMessage({ type: "error", message: `Usage: /jobs list | /jobs show <id> | /jobs run <id> | /jobs pause <id> | /jobs resume <id> | /jobs history <id>` });
          }
        } catch (err) {
          const errorMsg = (err as Error).message;
          if (errorMsg.includes("not found")) {
            this.postMessage({ type: "error", message: `Automation '${jobsId}' not found. Use /jobs list to see available automations.` });
          } else {
            this.postMessage({ type: "error", message: `Failed to manage automations: ${errorMsg}` });
          }
        }
        break;
      }
      case "/logout":
        this.postMessage({ type: "info", message: "To change API key, update the DEEPSEEK_API_KEY environment variable and restart VSCode." });
        break;
      case "/note": {
        const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!ws) {
          this.postMessage({ type: "info", message: "No workspace open. Notes require an open workspace." });
          break;
        }
        const notesDir = path.join(ws, ".deepseek");
        const notesPath = path.join(notesDir, "notes.md");
        const noteArg = args.trim();
        const sub = noteArg.split(/\s+/)[0]?.toLowerCase();
        const rest = noteArg.slice(sub.length).trim();

        if (!noteArg || sub === "help") {
          this.postMessage({ type: "info", message: `Usage: /note <text> | /note add <text> | /note list | /note show <n> | /note remove <n> | /note clear | /note path\nNotes path: ${notesPath}` });
          break;
        }

        try {
          if (!fs.existsSync(notesDir)) fs.mkdirSync(notesDir, { recursive: true });
        } catch (err) {
          this.postMessage({ type: "error", message: `Failed to create .deepseek directory: ${(err as Error).message}` });
          break;
        }

        try {
          if (sub === "path") {
            this.postMessage({ type: "info", message: `Notes path: ${notesPath}` });
          } else if (sub === "list") {
            if (!fs.existsSync(notesPath)) {
              this.postMessage({ type: "info", message: "No notes yet." });
            } else {
              const content = fs.readFileSync(notesPath, "utf-8");
              const lines = content.split("\n").filter(l => l.trim().length > 0);
              if (lines.length === 0) {
                this.postMessage({ type: "info", message: "No notes yet." });
              } else {
                this.postMessage({ type: "info", message: `Notes (${lines.length}):\n${lines.map((l, i) => `${i + 1}. ${l.replace(/^[-*]\s*/, "")}`).join("\n")}` });
              }
            }
          } else if (sub === "clear") {
            if (fs.existsSync(notesPath)) {
              fs.writeFileSync(notesPath, "");
              this.postMessage({ type: "info", message: "Notes cleared." });
            } else {
              this.postMessage({ type: "info", message: "No notes to clear." });
            }
          } else if (sub === "remove" || sub === "rm" || sub === "delete") {
            const idx = parseInt(rest, 10);
            if (isNaN(idx) || idx < 1) {
              this.postMessage({ type: "error", message: "Usage: /note remove <n>" });
              break;
            }
            if (!fs.existsSync(notesPath)) {
              this.postMessage({ type: "error", message: "No notes file." });
              break;
            }
            const content = fs.readFileSync(notesPath, "utf-8");
            const lines = content.split("\n").filter(l => l.trim().length > 0);
            if (idx > lines.length) {
              this.postMessage({ type: "error", message: `Note ${idx} not found. Only ${lines.length} notes.` });
              break;
            }
            lines.splice(idx - 1, 1);
            fs.writeFileSync(notesPath, lines.join("\n") + "\n");
            this.postMessage({ type: "info", message: `Removed note ${idx}.` });
          } else {
            const text = sub === "add" ? rest : noteArg;
            if (!text) {
              this.postMessage({ type: "error", message: "Note content cannot be empty" });
              break;
            }
            const timestamp = new Date().toISOString().slice(0, 16);
            const entry = `- [${timestamp}] ${text}\n`;
            fs.appendFileSync(notesPath, entry);
            this.postMessage({ type: "info", message: `Note added: ${text}` });
          }
        } catch (err) {
          this.postMessage({ type: "error", message: `Note error: ${(err as Error).message}` });
        }
        break;
      }
      case "/memory": {
        const memoryDir = path.join(os.homedir(), ".deepseek");
        const memoryPath = path.join(memoryDir, "memory.md");
        const memArg = args.trim().toLowerCase();

        if (memArg === "help") {
          this.postMessage({ type: "info", message: `Usage: /memory [show|path|clear|edit]\nCurrent path: ${memoryPath}` });
          break;
        }

        if (memArg === "path") {
          this.postMessage({ type: "info", message: `Memory path: ${memoryPath}` });
          break;
        }

        try {
          if (memArg === "clear") {
            if (fs.existsSync(memoryPath)) {
              fs.writeFileSync(memoryPath, "(empty)\n");
              this.postMessage({ type: "info", message: "Memory cleared." });
            } else {
              this.postMessage({ type: "info", message: "No memory file to clear." });
            }
            break;
          }

          if (memArg === "edit") {
            try {
              const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(memoryPath));
              vscode.window.showTextDocument(doc);
              this.postMessage({ type: "info", message: `Opening memory file: ${memoryPath}` });
            } catch {
              this.postMessage({ type: "info", message: `Memory file not found. Create it at: ${memoryPath}` });
            }
            break;
          }

          if (!fs.existsSync(memoryPath)) {
            this.postMessage({ type: "info", message: `Memory file not found.\nPath: ${memoryPath}\nCreate it to start using memory, or use /memory edit to open it.` });
          } else {
            const content = fs.readFileSync(memoryPath, "utf-8").trim();
            if (!content || content === "(empty)") {
              this.postMessage({ type: "info", message: `Memory path: ${memoryPath}\n(empty — add content to the file or use /memory edit)` });
            } else {
              const display = content.length > 500
                ? content.slice(0, 500) + `...\n(truncated, ${content.length} chars total)`
                : content;
              this.postMessage({ type: "info", message: `Memory path: ${memoryPath}\n─────────────────────────────\n${display}` });
            }
          }
        } catch (err) {
          this.postMessage({ type: "error", message: `Memory error: ${(err as Error).message}` });
        }
        break;
      }
      default:
        this.postMessage({ type: "error", message: `Unknown command: ${command}. Type /help for available commands.` });
    }
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
        message: `Approval failed: ${(err as Error).message}`,
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

  private async showUserInputDialog(
    _inputId: string,
    _questions: Array<{ header: string; id: string; question: string; options: Array<{ label: string; description: string }> }>
  ): Promise<void> {
  }

  private async handleUserInputSelect(
    inputId: string,
    questionId: string,
    optionIdx: number,
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
        const errorMsg = (err as Error).message;
        this.postMessage({
          type: "error",
          message: `Failed to submit user input: ${errorMsg}. Use /interrupt to clear the stuck turn.`,
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
      this.postMessage({ type: "error", message: `Failed to open diff: ${(err as Error).message}` });
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
      this.postMessage({ type: "error", message: `Failed to open file: ${(err as Error).message}` });
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
          lastMsg.status = "complete";
          let contentHtml: string | undefined;
          let thinkingHtml: string | undefined;
          if (lastMsg.content) {
            try { contentHtml = renderMarkdown(lastMsg.content); } catch { contentHtml = lastMsg.content; }
          }
          if (lastMsg.thinking) {
            try { thinkingHtml = renderMarkdown(lastMsg.thinking); } catch { thinkingHtml = lastMsg.thinking; }
          }
          const blockHtmls: { blockIdx: number; contentHtml: string }[] = [];
          if (lastMsg.blocks) {
            for (let i = 0; i < lastMsg.blocks.length; i++) {
              const b = lastMsg.blocks[i];
              if ((b.type === "text" || b.type === "thinking") && b.content) {
                try { b.contentHtml = renderMarkdown(b.content); } catch { b.contentHtml = b.content; }
                blockHtmls.push({ blockIdx: i, contentHtml: b.contentHtml });
              }
            }
          }
          this.postMessage({
            type: "messageComplete",
            messageId: lastMsg.id,
            usage: pl.turn?.usage,
            contentHtml,
            thinkingHtml,
            blockHtmls,
          });
        }
        this.refreshSessionList();
        this.stopPeriodicTaskRefresh();
        this.refreshTaskList();
        this.refreshWorkPanel();
        break;
      }

      case "turn.failed": {
        const pl = event.payload as { turn?: TurnRecord };
        this.currentTurnId = null;
        const lastMsg = this.messages[this.messages.length - 1];
        if (lastMsg?.role === "assistant") {
          lastMsg.status = "error";
          let contentHtml: string | undefined;
          let thinkingHtml: string | undefined;
          if (lastMsg.content) {
            try { contentHtml = renderMarkdown(lastMsg.content); } catch { contentHtml = lastMsg.content; }
          }
          if (lastMsg.thinking) {
            try { thinkingHtml = renderMarkdown(lastMsg.thinking); } catch { thinkingHtml = lastMsg.thinking; }
          }
          const blockHtmls: { blockIdx: number; contentHtml: string }[] = [];
          if (lastMsg.blocks) {
            for (let i = 0; i < lastMsg.blocks.length; i++) {
              const b = lastMsg.blocks[i];
              if ((b.type === "text" || b.type === "thinking") && b.content) {
                try { b.contentHtml = renderMarkdown(b.content); } catch { b.contentHtml = b.content; }
                blockHtmls.push({ blockIdx: i, contentHtml: b.contentHtml });
              }
            }
          }
          this.postMessage({
            type: "messageComplete",
            messageId: lastMsg.id,
            error: true,
            contentHtml,
            thinkingHtml,
            blockHtmls,
          });
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
      this.debugLog(`handleRuntimeEvent error on ${event.event}: ${(err as Error).message}`);
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
              this.turnFileChanges.push(fc);
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

  private getCurrentModel(): string {
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
  private postMessage(msg: Record<string, unknown>): void {
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

interface CostEstimate {
  usd: number;
  cny: number;
}

interface ModelPricing {
  inputCacheHitPerMillion: number;
  inputCacheMissPerMillion: number;
  outputPerMillion: number;
  inputCacheHitPerMillionCny: number;
  inputCacheMissPerMillionCny: number;
  outputPerMillionCny: number;
}

function getModelPricing(model: string): ModelPricing | null {
  const lower = model.toLowerCase();
  if (!lower.includes("deepseek")) return null;
  const discountEnd = new Date("2026-05-31T15:59:00Z").getTime();
  const now = Date.now();
  if (lower.includes("v4-pro") || lower.includes("v4pro")) {
    if (now <= discountEnd) {
      return {
        inputCacheHitPerMillion: 0.003625, inputCacheMissPerMillion: 0.435, outputPerMillion: 0.87,
        inputCacheHitPerMillionCny: 0.025, inputCacheMissPerMillionCny: 3.0, outputPerMillionCny: 6.0,
      };
    }
    return {
      inputCacheHitPerMillion: 0.0145, inputCacheMissPerMillion: 1.74, outputPerMillion: 3.48,
      inputCacheHitPerMillionCny: 0.1, inputCacheMissPerMillionCny: 12.0, outputPerMillionCny: 24.0,
    };
  }
  return {
    inputCacheHitPerMillion: 0.0028, inputCacheMissPerMillion: 0.14, outputPerMillion: 0.28,
    inputCacheHitPerMillionCny: 0.02, inputCacheMissPerMillionCny: 1.0, outputPerMillionCny: 2.0,
  };
}

function calculateTurnCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheHitTokens?: number,
  cacheMissTokens?: number,
  reasoningTokens?: number,
): CostEstimate | null {
  const pricing = getModelPricing(model);
  if (!pricing) return null;
  const hit = cacheHitTokens ?? 0;
  const miss = cacheMissTokens ?? Math.max(0, inputTokens - hit);
  const uncategorized = Math.max(0, inputTokens - hit - miss);
  const effectiveMiss = miss + uncategorized;
  const effectiveOutput = outputTokens + (reasoningTokens ?? 0);
  const hitCost = (hit / 1_000_000) * pricing.inputCacheHitPerMillion;
  const missCost = (effectiveMiss / 1_000_000) * pricing.inputCacheMissPerMillion;
  const outputCost = (effectiveOutput / 1_000_000) * pricing.outputPerMillion;
  const hitCostCny = (hit / 1_000_000) * pricing.inputCacheHitPerMillionCny;
  const missCostCny = (effectiveMiss / 1_000_000) * pricing.inputCacheMissPerMillionCny;
  const outputCostCny = (effectiveOutput / 1_000_000) * pricing.outputPerMillionCny;
  return {
    usd: hitCost + missCost + outputCost,
    cny: hitCostCny + missCostCny + outputCostCny,
  };
}

function formatCostAmount(cost: number, currency: "usd" | "cny"): string {
  const symbol = currency === "usd" ? "$" : "¥";
  if (cost < 0.0001) return `<${symbol}0.0001`;
  if (cost < 0.01) return `${symbol}${cost.toFixed(4)}`;
  return `${symbol}${cost.toFixed(2)}`;
}
