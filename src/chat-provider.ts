import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { exec } from "child_process";
import {
  CodeWhaleApiClient,
  CodeWhaleEngine,
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

const FRIENDLY_TOOL_NAMES: Record<string, string> = {
  write_file: "Write file",
  read_file: "Read file",
  apply_patch: "Apply patch",
  replace_text: "Replace text",
  exec_shell: "Run command",
  exec_shell_wait: "Run command (wait)",
  list_directory: "List directory",
  search_files: "Search files",
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
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    if (lines[i].startsWith("@@") || lines[i].startsWith("---") || lines[i].startsWith("diff ")) {
      diffStart = i;
      break;
    }
  }
  if (diffStart >= 0) {
    return lines.slice(diffStart).join("\n");
  }
  return undefined;
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

function friendlyToolName(raw: string): string {
  if (FRIENDLY_TOOL_NAMES[raw]) return FRIENDLY_TOOL_NAMES[raw];
  if (raw.startsWith("mcp__")) return raw.slice(4).replace(/__/g, " / ");
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildApprovalSummary(toolName: string, input: Record<string, unknown>): string {
  const builder = TOOL_APPROVAL_SUMMARIES[toolName];
  if (builder) return builder(input);
  return friendlyToolName(toolName);
}

// ── UI model ──

interface ContentBlock {
  type: "text" | "thinking" | "tool_call";
  content?: string;
  contentHtml?: string;
  toolCallIdx?: number;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  thinking?: string;
  contentHtml?: string;
  thinkingHtml?: string;
  toolCalls?: ToolCallInfo[];
  blocks?: ContentBlock[];
  status: "streaming" | "complete" | "error";
  timestamp: number;
}

interface ToolCallInfo {
  name: string;
  displayName?: string;
  input: Record<string, unknown>;
  output?: string;
  status: "pending" | "running" | "complete" | "error" | "awaiting_approval";
  approvalId?: string;
  approvalSummary?: string;
  itemId?: string;
  fileChange?: FileChangeInfo;
}

interface FileChangeInfo {
  filePath: string;
  changeType: "created" | "modified" | "deleted";
  addedLines: number;
  removedLines: number;
  diff?: string;
  oldContent?: string;
  newContent?: string;
}

// ── Provider ──

export class ChatProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "codewhale.chat";

  private view?: vscode.WebviewView;
  private api: CodeWhaleApiClient;
  private engine: CodeWhaleEngine;
  private currentThread: ThreadRecord | null = null;
  private messages: ChatMessage[] = [];
  private eventController: AbortController | null = null;
  private lastEventSeq: number = 0;
  private currentTurnId: string | null = null;
  private pendingApprovals: Map<string, ToolCallInfo> = new Map();
  private pendingUserInputs: Map<string, {
    questions: Array<{ header: string; id: string; question: string; options: Array<{ label: string; description: string }> }>;
    answers: Array<{ id: string; label: string; value: string }>;
    answeredQuestions: Set<string>;
  }> = new Map();
  /** Active agent items for the current turn, keyed by item_id */
  private activeItems: Map<string, { kind: string; msgId: string; toolCallName?: string; toolCallIdx?: number; blockIdx?: number }> =
    new Map();
  private currentTextBlockIdx: number = -1;
  private currentThinkingBlockIdx: number = -1;
  private cycleCount: number = 0;
  private checklistItems: { id: string; content: string; status: string }[] = [];
  private checklistCompletionPct: number = 0;
  private coherenceState: string = "healthy";
  private coherenceLabel: string = "";
  private taskRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private _disposables: vscode.Disposable[] = [];
  private sessionCostUsd: number = 0;
  private sessionCostCny: number = 0;
  private lastCacheHitTokens: number = 0;
  private lastCacheMissTokens: number = 0;
  private lastInputTokens: number = 0;
  private lastOutputTokens: number = 0;
  private totalInputTokens: number = 0;
  private totalOutputTokens: number = 0;
  private turnFileChanges: FileChangeInfo[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    engine: CodeWhaleEngine,
    api: CodeWhaleApiClient
  ) {
    this.engine = engine;
    this.api = api;
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

    webviewView.webview.html = getWebviewHtml(webviewView.webview, this.extensionUri, webviewTranslations(t()));
    this.debugLog("webview HTML set");

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
      case "loadThread":
        await this.loadThread(msg.threadId as string);
        break;
      case "webviewReady":
        try {
          await this.engine.ensureRunning();
          this.api.setBaseUrl(this.engine.baseUrl);
          this.api.setToken(this.engine.token);
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
          this.api.setBaseUrl(this.engine.baseUrl);
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
    }
  }

  private async syncWebviewState(): Promise<void> {
    this.refreshThreadList();
    this.refreshTaskList();
    this.refreshWorkPanel();

    if (this.currentThread?.id) {
      this.subscribeToEvents();
      await this.loadHistory(this.currentThread.id);
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
    });
  }

  // ── Initialization ──

  private async initializeThread(): Promise<void> {
    this.debugLog("initializeThread START");
    try {
      this.debugLog("calling engine.ensureRunning()...");
      await this.engine.ensureRunning();
      this.debugLog(`engine running on ${this.engine.baseUrl}`);
      this.api.setBaseUrl(this.engine.baseUrl);
      this.api.setToken(this.engine.token);

      this.debugLog("calling listThreads...");
      const threads = await this.api.listThreads({ limit: 20 });
      this.debugLog(`listThreads returned ${threads.length} threads`);
      const threadSummaries = await this.api.listThreadsSummary({ limit: 50 });
      this.postMessage({ type: "threadList", threads: threadSummaries });

      const threadWithContent = threads.find(t => t.latest_turn_id !== null);
      
      if (threadWithContent) {
        this.currentThread = threadWithContent;
        this.subscribeToEvents();
        await this.loadHistory();
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
        reasoningEffort: this.getCurrentReasoningEffort()
      });
    } catch (err) {
      this.debugLog(`initializeThread ERROR: ${(err as Error).message}\n${(err as Error).stack}`);
      this.postMessage({
        type: "error",
        message: `Failed to initialize: ${(err as Error).message}`,
      });
      this.postMessage({ type: "ready", model: this.getCurrentModel(), mode: this.getCurrentMode(), reasoningEffort: this.getCurrentReasoningEffort() });
    }
  }

  private async loadHistory(threadId?: string): Promise<void> {
    const id = threadId ?? this.currentThread?.id;
    if (!id) return;
    try {
      const detail = await this.api.getThreadDetail(id);
      this.messages = [];

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

        const turnItems = detail.items.filter((it) => it.turn_id === turn.id);

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
    } catch (err) {
      this.postMessage({
        type: "error",
        message: `Failed to load history: ${(err as Error).message}`,
      });
    }
  }

  private async loadThread(threadId: string): Promise<void> {
    this.cleanup();
    this.messages = [];
    this.lastEventSeq = 0;
    this.currentTurnId = null;
    this.activeItems.clear();
    this.currentTextBlockIdx = -1;
    this.currentThinkingBlockIdx = -1;
    this.cycleCount = 0;
    this.checklistItems = [];
    this.checklistCompletionPct = 0;
    this.coherenceState = "healthy";
    this.coherenceLabel = "";
    this.turnFileChanges = [];
    this.resetSessionStats();

    try {
      this.currentThread = await this.api.getThread(threadId);
      this.subscribeToEvents();
      await this.loadHistory(threadId);
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

  private async handleSendMessage(text: string): Promise<void> {
    if (!text.trim()) return;

    try {
      await this.engine.ensureRunning();
      this.api.setBaseUrl(this.engine.baseUrl);
      this.api.setToken(this.engine.token);

      if (!this.currentThread) {
        const cfg = vscode.workspace.getConfiguration("codewhale");
        const model = cfg.get<string>("defaultModel", "deepseek-v4-pro");
        const mode = cfg.get<string>("defaultMode", "agent");
        const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const autoApprove = cfg.get<boolean>("autoApprove", false);
        this.currentThread = await this.api.createThread({
          model,
          mode,
          workspace,
          auto_approve: autoApprove,
          trust_mode: mode === "yolo",
        });
        this.subscribeToEvents();
        this.refreshThreadList();
      }

      this.activeItems.clear();
      this.currentTextBlockIdx = -1;
      this.currentThinkingBlockIdx = -1;
      this.turnFileChanges = [];

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text,
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
        const cfg = vscode.workspace.getConfiguration("codewhale");
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
        this.refreshThreadList();
      }

      const cfg = vscode.workspace.getConfiguration("codewhale");
      const reasoningEffort = cfg.get<string>("reasoningEffort", "auto");
      const mode = cfg.get<string>("defaultMode", "agent");
      const model = this.getCurrentModel();
      const autoApprove = cfg.get<boolean>("autoApprove", false);
      const result = await this.api.startTurn(this.currentThread.id, text, {
        mode,
        model,
        reasoning_effort: reasoningEffort,
        auto_approve: autoApprove,
        trust_mode: mode === "yolo",
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
    this.currentThread = null;
    this.messages = [];
    this.lastEventSeq = 0;
    this.currentTurnId = null;
    this.activeItems.clear();
    this.currentTextBlockIdx = -1;
    this.currentThinkingBlockIdx = -1;
    this.cycleCount = 0;
    this.checklistItems = [];
    this.checklistCompletionPct = 0;
    this.coherenceState = "healthy";
    this.coherenceLabel = "";
    this.turnFileChanges = [];
    this.resetSessionStats();
    this.postMessage({ type: "clearChat" });
  }

  /** Refresh the thread list shown in the sidebar */
  private async refreshThreadList(): Promise<void> {
    try {
      const threads = await this.api.listThreadsSummary({ limit: 50 });
      this.postMessage({ type: "threadList", threads });
    } catch (err) {
      setTimeout(async () => {
        try {
          const threads = await this.api.listThreadsSummary({ limit: 50 });
          this.postMessage({ type: "threadList", threads });
        } catch { /* silent */ }
      }, 2000);
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
    const cfg = vscode.workspace.getConfiguration("codewhale");
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
      fileChanges: this.turnFileChanges.map(fc => ({
        filePath: fc.filePath,
        changeType: fc.changeType,
        addedLines: fc.addedLines,
        removedLines: fc.removedLines,
        diff: fc.diff,
      })),
    });
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
        await this.engine.ensureRunning();
        this.api.setBaseUrl(this.engine.baseUrl);
        this.api.setToken(this.engine.token);

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
    const cfg = vscode.workspace.getConfiguration("codewhale");
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
          await cfg.update("defaultMode", actualMode, vscode.ConfigurationTarget.Global);
          if (this.currentThread) {
            try {
              await this.api.updateThread(this.currentThread.id, {
                mode: actualMode,
                trust_mode: actualMode === "yolo",
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
        vscode.commands.executeCommand("workbench.action.openSettings", "codewhale");
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
            this.refreshThreadList();
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
        const cfg2 = vscode.workspace.getConfiguration("codewhale");
        const currency2 = cfg2.get<string>("costCurrency", "usd");
        const costStr2 = currency2 === "cny"
          ? formatCostAmount(this.sessionCostCny, "cny")
          : formatCostAmount(this.sessionCostUsd, "usd");
        const cacheTotal = this.lastCacheHitTokens + this.lastCacheMissTokens;
        const cacheRate = cacheTotal > 0 ? (this.lastCacheHitTokens / cacheTotal * 100).toFixed(1) : "N/A";
        this.postMessage({ type: "info", message: `Token Usage (session):\n  Total input: ${this.totalInputTokens.toLocaleString()}\n  Total output: ${this.totalOutputTokens.toLocaleString()}\n  Last turn input: ${this.lastInputTokens.toLocaleString()}\n  Last turn output: ${this.lastOutputTokens.toLocaleString()}\n  Cache hit rate (last): ${cacheRate}%\n  Cache hit: ${this.lastCacheHitTokens.toLocaleString()} | miss: ${this.lastCacheMissTokens.toLocaleString()}\n  Estimated cost: ${costStr2}` });
        break;
      }
      case "/cost": {
        const cfg3 = vscode.workspace.getConfiguration("codewhale");
        const currency3 = cfg3.get<string>("costCurrency", "usd");
        const costStr3 = currency3 === "cny"
          ? formatCostAmount(this.sessionCostCny, "cny")
          : formatCostAmount(this.sessionCostUsd, "usd");
        const cacheTotal2 = this.lastCacheHitTokens + this.lastCacheMissTokens;
        const cacheRate2 = cacheTotal2 > 0 ? (this.lastCacheHitTokens / cacheTotal2 * 100).toFixed(1) : "N/A";
        this.postMessage({ type: "info", message: `Session Cost (approximate):\n  Total: ${costStr3}\n  Tokens: ↥${this.totalInputTokens.toLocaleString()} ↧${this.totalOutputTokens.toLocaleString()}\n  Cache hit rate: ${cacheRate2}% (hit: ${this.lastCacheHitTokens.toLocaleString()}, miss: ${this.lastCacheMissTokens.toLocaleString()})\n  Model: ${this.getCurrentModel()}` });
        break;
      }
      case "/status": {
        const running = this.engine.isRunning;
        this.postMessage({ type: "info", message: `Engine: ${running ? "Running" : "Stopped"}\nPort: ${this.engine.port}\nThread: ${this.currentThread ? this.currentThread.id.slice(0, 12) + "..." : "None"}\nMode: ${cfg.get<string>("defaultMode", "agent")}\nModel: ${cfg.get<string>("defaultModel", "deepseek-v4-pro")}` });
        break;
      }
      case "/home": {
        this.postMessage({ type: "info", message: `Dashboard:\n- Threads: see sidebar\n- Mode: ${cfg.get<string>("defaultMode", "agent")}\n- Model: ${cfg.get<string>("defaultModel", "deepseek-v4-pro")}\n- Reasoning: ${cfg.get<string>("reasoningEffort", "auto")}` });
        break;
      }
      case "/workspace": {
        const ws = args.trim() || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "N/A";
        this.postMessage({ type: "info", message: `Workspace: ${ws}` });
        break;
      }
      case "/task": {
        const taskSub = args.trim().split(/\s+/)[0]?.toLowerCase() || "";
        const taskRest = args.trim().slice(taskSub.length).trim();
        try {
          await this.engine.ensureRunning();
          this.api.setBaseUrl(this.engine.baseUrl);
          if (taskSub === "add" && taskRest) {
            const cfg = vscode.workspace.getConfiguration("codewhale");
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
              await this.api.updateThread(this.currentThread.id, { auto_approve: true });
            } catch { /* non-critical */ }
          }
          this.postMessage({ type: "info", message: "Trust mode enabled (auto-approve)" });
        } else if (sub === "off") {
          await cfg.update("autoApprove", false, vscode.ConfigurationTarget.Global);
          if (this.currentThread) {
            try {
              await this.api.updateThread(this.currentThread.id, { auto_approve: false });
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
        vscode.commands.executeCommand("workbench.action.openSettings", "codewhale");
        this.postMessage({ type: "info", message: "Use the VSCode settings to configure CodeWhale. Open settings with /config." });
        break;
      }
      case "/mcp": {
        vscode.commands.executeCommand("workbench.action.openSettings", "codewhale");
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
/init - Open settings for initialization
/mcp - Open MCP settings
/provider - Show provider info
/links - Show CodeWhale links
/feedback - Send feedback
/exit - Close sidebar

Commands with limited support in GUI:
/task, /jobs, /note, /memory, /undo, /retry, /share,
/goal, /skills, /skill, /network, /queue, /stash,
/hooks, /subagents, /agent, /attach, /anchor, /sessions,
/load, /cycles, /cycle, /recall, /relay, /lsp, /review,
/restore, /rlm, /change, /cache, /profile, /translate,
/system, /edit, /diff, /logout, /tokens, /cost, /home

Use the TUI for full command support.` });
        break;
      }
      case "/theme":
        notAvailable();
        break;
      case "/undo": {
        if (!this.currentThread) {
          this.postMessage({ type: "info", message: "No active thread to undo." });
          break;
        }
        try {
          const detail = await this.api.getThreadDetail(this.currentThread.id);
          const turns = detail.turns || [];
          if (turns.length === 0) {
            this.postMessage({ type: "info", message: "No turns to undo." });
            break;
          }
          const lastTurn = turns[turns.length - 1];
          this.postMessage({ type: "info", message: `Last turn: ${lastTurn.input_summary || lastTurn.id.slice(0, 8)}\nUndo is not directly supported via the API. Use /clear to start fresh, or create a new thread.` });
        } catch (err) {
          this.postMessage({ type: "error", message: `Failed to get thread info: ${(err as Error).message}` });
        }
        break;
      }
      case "/retry":
        this.postMessage({ type: "info", message: "Retry is not directly supported in GUI. Please send your message again." });
        break;
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
      case "/skills":
      case "/skill":
        notAvailable();
        break;
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
        this.postMessage({ type: "info", message: "File attachments are not yet supported in GUI. Use the TUI for /attach support." });
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
      case "/sessions":
        this.postMessage({ type: "info", message: "Use the sidebar thread list to manage sessions." });
        break;
      case "/load":
        this.postMessage({ type: "info", message: "Use the sidebar thread list to load sessions." });
        break;
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
      case "/jobs":
        this.postMessage({ type: "info", message: "Background jobs are managed by the TUI runtime. The GUI does not expose a job queue. Use the TUI for /jobs support." });
        break;
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

  private async handleOpenDiff(filePath: string, diff?: string): Promise<void> {
    try {
      const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspace) return;

      const absPath = path.isAbsolute(filePath) ? filePath : path.join(workspace, filePath);
      const currentUri = vscode.Uri.file(absPath);

      if (diff) {
        const oldContent = this.reconstructOldContent(absPath, diff);
        const oldUri = vscode.Uri.parse(`codewhale-diff:${absPath}?old`);
        const provider = new (class implements vscode.TextDocumentContentProvider {
          private content = oldContent;
          onDidChange?: vscode.Event<vscode.Uri>;
          provideTextDocumentContent(): string { return this.content; }
        })();
        const disposable = vscode.workspace.registerTextDocumentContentProvider("codewhale-diff", provider);
        const title = `${path.basename(filePath)} (Diff)`;
        await vscode.commands.executeCommand("vscode.diff", oldUri, currentUri, title);
        setTimeout(() => disposable.dispose(), 30000);
      } else {
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

  private reconstructOldContent(absPath: string, diff: string): string {
    try {
      let current = "";
      try { current = fs.readFileSync(absPath, "utf-8"); } catch { current = ""; }
      const lines = current.split("\n");
      const result: string[] = [];
      let lineIdx = 0;

      const hunkRegex = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
      const hunks: { oldStart: number; oldCount: number; newStart: number; newCount: number; lines: string[] }[] = [];
      let currentHunk: typeof hunks[0] | null = null;

      for (const line of diff.split("\n")) {
        const hunkMatch = line.match(hunkRegex);
        if (hunkMatch) {
          currentHunk = {
            oldStart: parseInt(hunkMatch[1]),
            oldCount: parseInt(hunkMatch[2] || "1"),
            newStart: parseInt(hunkMatch[3]),
            newCount: parseInt(hunkMatch[4] || "1"),
            lines: [],
          };
          hunks.push(currentHunk);
        } else if (currentHunk) {
          currentHunk.lines.push(line);
        }
      }

      if (hunks.length === 0) return current;

      for (const hunk of hunks) {
        while (lineIdx < hunk.newStart - 1 && lineIdx < lines.length) {
          result.push(lines[lineIdx]);
          lineIdx++;
        }
        for (const hLine of hunk.lines) {
          if (hLine.startsWith("+")) {
            // skip added lines
          } else if (hLine.startsWith("-")) {
            result.push(hLine.slice(1));
          } else if (hLine.startsWith(" ")) {
            result.push(hLine.slice(1));
            lineIdx++;
          }
        }
        while (lineIdx < lines.length) {
          const nextHunk = hunks[hunks.indexOf(hunk) + 1];
          if (nextHunk && lineIdx >= nextHunk.newStart - 1) break;
          result.push(lines[lineIdx]);
          lineIdx++;
        }
      }
      while (lineIdx < lines.length) {
        result.push(lines[lineIdx]);
        lineIdx++;
      }
      return result.join("\n");
    } catch {
      return "";
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
        this.refreshThreadList();
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
              };
              if (tc) {
                tc.fileChange = fc;
              }
              this.turnFileChanges.push(fc);
              this.postMessage({
                type: "fileChangeDetected",
                messageId: lastMsg.id,
                toolCallIdx: tcIdx ?? -1,
                fileChange: fc,
              });
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
    const cfg = vscode.workspace.getConfiguration("codewhale");
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

  private resetSessionStats(): void {
    this.sessionCostUsd = 0;
    this.sessionCostCny = 0;
    this.lastCacheHitTokens = 0;
    this.lastCacheMissTokens = 0;
    this.lastInputTokens = 0;
    this.lastOutputTokens = 0;
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
  }

  private getCurrentModel(): string {
    const cfg = vscode.workspace.getConfiguration("codewhale");
    return cfg.get<string>("defaultModel", "deepseek-v4-pro");
  }

  private getCurrentMode(): string {
    const cfg = vscode.workspace.getConfiguration("codewhale");
    return cfg.get<string>("defaultMode", "agent");
  }

  private getCurrentReasoningEffort(): string {
    const cfg = vscode.workspace.getConfiguration("codewhale");
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
