/**
 * Slash command handler extracted from ChatProvider.
 *
 * This module handles all `/command` processing, keeping the 1100+ line
 * switch statement out of the main ChatProvider class.
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { exec } from "child_process";
import { t } from "./i18n";
import { formatCostAmount } from "./cost-calculator";
import type { CodeWhaleApiClient, CodeWhaleEngine, ThreadRecord, TaskSummary } from "./types";
import type { SessionStateStore } from "./session-state";

// ── Context interface for dependency injection ──

export interface SlashCommandContext {
  readonly api: CodeWhaleApiClient;
  readonly engine: CodeWhaleEngine;
  readonly currentThread: ThreadRecord | null;
  readonly messages: Array<{ role: string; content?: string }>;
  readonly sessionCostUsd: number;
  readonly sessionCostCny: number;
  readonly lastCacheHitTokens: number;
  readonly lastCacheMissTokens: number;
  readonly lastInputTokens: number;
  readonly lastOutputTokens: number;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;

  postMessage(msg: Record<string, unknown>): void;
  getCurrentModel(): string;
  refreshSessionList(): void;
  refreshTaskList(): Promise<void>;
  refreshWorkPanel(): void;
  loadSessionMessages(sessionId: string): Promise<void>;
  handleInterrupt(): Promise<void>;
  handleCompact(): Promise<void>;
  handleUndoLastTurn(): Promise<void>;
  handleRetryLastTurn(): Promise<void>;
  handleAttachFile(): Promise<void>;
}

// ── Handler class ──

export class SlashCommandHandler {
  constructor(private ctx: SlashCommandContext) {}

  async handle(command: string, args: string): Promise<void> {
    const cfg = vscode.workspace.getConfiguration("brotherwhale");
    const notAvailable = () => {
      const tr = t();
      this.ctx.postMessage({ type: "info", message: tr.commandNotAvailableInGui });
    };

    switch (command) {
      case "/mode": {
        const mode = args.trim().toLowerCase();
        if (["agent", "plan", "yolo", "1", "2", "3"].includes(mode)) {
          const modeMap: Record<string, string> = { "1": "agent", "2": "plan", "3": "yolo" };
          const actualMode = modeMap[mode] || mode;
          const isYolo = actualMode === "yolo";
          await cfg.update("defaultMode", actualMode, vscode.ConfigurationTarget.Global);
          if (this.ctx.currentThread) {
            try {
              await this.ctx.api.updateThread(this.ctx.currentThread.id, {
                mode: actualMode,
                trust_mode: isYolo,
                auto_approve: isYolo || cfg.get<boolean>("autoApprove", false),
              });
            } catch { /* non-critical */ }
          }
          this.ctx.postMessage({ type: "settingsUpdated", mode: actualMode, model: cfg.get<string>("defaultModel", "deepseek-v4-pro"), reasoningEffort: cfg.get<string>("reasoningEffort", "auto") });
          this.ctx.postMessage({ type: "info", message: `Mode changed to ${actualMode}` });
        } else {
          this.ctx.postMessage({ type: "info", message: `Current mode: ${cfg.get<string>("defaultMode", "agent")}\nUsage: /mode [agent|plan|yolo|1|2|3]` });
        }
        break;
      }
      case "/model": {
        const model = args.trim();
        if (model) {
          await cfg.update("defaultModel", model, vscode.ConfigurationTarget.Global);
          this.ctx.postMessage({ type: "settingsUpdated", mode: cfg.get<string>("defaultMode", "agent"), model, reasoningEffort: cfg.get<string>("reasoningEffort", "auto") });
          this.ctx.postMessage({ type: "info", message: `Model changed to ${model}` });
        } else {
          this.ctx.postMessage({ type: "info", message: `Current model: ${cfg.get<string>("defaultModel", "deepseek-v4-pro")}` });
        }
        break;
      }
      case "/models": {
        this.ctx.postMessage({ type: "info", message: "Available models:\n- deepseek-v4-pro\n- deepseek-v4-flash\n- deepseek-chat (alias for deepseek-v4-flash)\n- deepseek-reasoner (alias for deepseek-v4-flash)" });
        break;
      }
      case "/reasoning": {
        const effort = args.trim().toLowerCase();
        if (["auto", "off", "low", "medium", "high", "max"].includes(effort)) {
          await cfg.update("reasoningEffort", effort, vscode.ConfigurationTarget.Global);
          this.ctx.postMessage({ type: "settingsUpdated", mode: cfg.get<string>("defaultMode", "agent"), model: cfg.get<string>("defaultModel", "deepseek-v4-pro"), reasoningEffort: effort });
          this.ctx.postMessage({ type: "info", message: `Reasoning effort changed to ${effort}` });
        } else {
          this.ctx.postMessage({ type: "info", message: `Current reasoning effort: ${cfg.get<string>("reasoningEffort", "auto")}\nUsage: /reasoning [auto|off|low|medium|high|max]` });
        }
        break;
      }
      case "/config": {
        vscode.commands.executeCommand("workbench.action.openSettings", "brotherwhale");
        break;
      }
      case "/settings": {
        this.ctx.postMessage({ type: "info", message: `Current settings:\n- Mode: ${cfg.get<string>("defaultMode", "agent")}\n- Model: ${cfg.get<string>("defaultModel", "deepseek-v4-pro")}\n- Reasoning Effort: ${cfg.get<string>("reasoningEffort", "auto")}\n- Engine Path: ${cfg.get<string>("enginePath", "codewhale")}\n- Auto Start Engine: ${cfg.get<boolean>("autoStartEngine", true)}` });
        break;
      }
      case "/interrupt": {
        await this.ctx.handleInterrupt();
        break;
      }
      case "/clear": {
        // Note: this.ctx.messages is read-only in the interface;
        // ChatProvider handles the actual mutation via handleSlashCommand delegation
        this.ctx.postMessage({ type: "clearChat" });
        break;
      }
      case "/compact": {
        await this.ctx.handleCompact();
        break;
      }
      case "/exit": {
        vscode.commands.executeCommand("workbench.action.closeSidebar");
        break;
      }
      case "/rename": {
        const title = args.trim();
        if (title && this.ctx.currentThread) {
          try {
            await this.ctx.api.updateThread(this.ctx.currentThread.id, { title });
            this.ctx.postMessage({ type: "info", message: `Thread renamed to: ${title}` });
            this.ctx.refreshSessionList();
          } catch (err) {
            this.ctx.postMessage({ type: "error", message: `Failed to rename: ${(err as Error).message}` });
          }
        } else if (!this.ctx.currentThread) {
          this.ctx.postMessage({ type: "error", message: "No active thread to rename" });
        } else {
          this.ctx.postMessage({ type: "error", message: "Usage: /rename <new title>" });
        }
        break;
      }
      case "/save": {
        if (this.ctx.currentThread) {
          try {
            const detail = await this.ctx.api.getThreadDetail(this.ctx.currentThread.id);
            const content = JSON.stringify(detail, null, 2);
            const doc = await vscode.workspace.openTextDocument({ content, language: "json" });
            vscode.window.showTextDocument(doc);
            this.ctx.postMessage({ type: "info", message: "Conversation opened for saving" });
          } catch (err) {
            this.ctx.postMessage({ type: "error", message: `Failed to save: ${(err as Error).message}` });
          }
        } else {
          this.ctx.postMessage({ type: "error", message: "No active thread to save" });
        }
        break;
      }
      case "/export": {
        if (this.ctx.currentThread) {
          try {
            const detail = await this.ctx.api.getThreadDetail(this.ctx.currentThread.id);
            const content = JSON.stringify(detail, null, 2);
            const doc = await vscode.workspace.openTextDocument({ content, language: "json" });
            vscode.window.showTextDocument(doc);
            this.ctx.postMessage({ type: "info", message: "Conversation exported" });
          } catch (err) {
            this.ctx.postMessage({ type: "error", message: `Failed to export: ${(err as Error).message}` });
          }
        } else {
          this.ctx.postMessage({ type: "error", message: "No active thread to export" });
        }
        break;
      }
      case "/context": {
        if (this.ctx.currentThread) {
          this.ctx.postMessage({ type: "info", message: `Thread: ${this.ctx.currentThread.id.slice(0, 12)}...\nMessages: ${this.ctx.messages.length}\nMode: ${cfg.get<string>("defaultMode", "agent")}\nModel: ${cfg.get<string>("defaultModel", "deepseek-v4-pro")}` });
        } else {
          this.ctx.postMessage({ type: "info", message: "No active thread" });
        }
        break;
      }
      case "/tokens": {
        const tokenArg = args.trim().toLowerCase();

        if (tokenArg === "history" || tokenArg === "all" || tokenArg === "today" || tokenArg.startsWith("since ")) {
          try {
            await this.ctx.api.ensureReady();

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
                this.ctx.postMessage({ type: "error", message: `Invalid date format: ${dateStr}\nUsage: /tokens since YYYY-MM-DD` });
                break;
              }
            }

            const usage = await this.ctx.api.getUsage({ since, until, group_by: "day" });
            const totals = usage.totals;
            const cacheRate = totals.cached_tokens > 0
              ? ((totals.cached_tokens / (totals.input_tokens + totals.cached_tokens)) * 100).toFixed(1)
              : "0";

            const timeRange = usage.since && usage.until
              ? `${new Date(usage.since).toLocaleDateString()} - ${new Date(usage.until).toLocaleDateString()}`
              : "All time";

            this.ctx.postMessage({
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
            this.ctx.postMessage({ type: "error", message: `Failed to get usage history: ${(err as Error).message}` });
          }
        } else {
          const cfg2 = vscode.workspace.getConfiguration("brotherwhale");
          const currency2 = cfg2.get<string>("costCurrency", "usd");
          const costStr2 = currency2 === "cny"
            ? formatCostAmount(this.ctx.sessionCostCny, "cny")
            : formatCostAmount(this.ctx.sessionCostUsd, "usd");
          const cacheTotal = this.ctx.lastCacheHitTokens + this.ctx.lastCacheMissTokens;
          const cacheRate = cacheTotal > 0 ? (this.ctx.lastCacheHitTokens / cacheTotal * 100).toFixed(1) : "N/A";
          this.ctx.postMessage({ type: "info", message: `Token Usage (session):\n  Total input: ${this.ctx.totalInputTokens.toLocaleString()}\n  Total output: ${this.ctx.totalOutputTokens.toLocaleString()}\n  Last turn input: ${this.ctx.lastInputTokens.toLocaleString()}\n  Last turn output: ${this.ctx.lastOutputTokens.toLocaleString()}\n  Cache hit rate (last): ${cacheRate}%\n  Cache hit: ${this.ctx.lastCacheHitTokens.toLocaleString()} | miss: ${this.ctx.lastCacheMissTokens.toLocaleString()}\n  Estimated cost: ${costStr2}\n\nUsage: /tokens [history|today|since <date>] for historical data` });
        }
        break;
      }
      case "/cost": {
        const costArg = args.trim().toLowerCase();

        if (costArg === "history" || costArg === "all" || costArg === "today" || costArg.startsWith("since ")) {
          try {
            await this.ctx.api.ensureReady();

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
                this.ctx.postMessage({ type: "error", message: `Invalid date format: ${dateStr}\nUsage: /cost since YYYY-MM-DD` });
                break;
              }
            }

            const usage = await this.ctx.api.getUsage({ since, until, group_by: "day" });
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

            this.ctx.postMessage({
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
            this.ctx.postMessage({ type: "error", message: `Failed to get cost history: ${(err as Error).message}` });
          }
        } else {
          const cfg3 = vscode.workspace.getConfiguration("brotherwhale");
          const currency3 = cfg3.get<string>("costCurrency", "usd");
          const costStr3 = currency3 === "cny"
            ? formatCostAmount(this.ctx.sessionCostCny, "cny")
            : formatCostAmount(this.ctx.sessionCostUsd, "usd");
          const cacheTotal2 = this.ctx.lastCacheHitTokens + this.ctx.lastCacheMissTokens;
          const cacheRate2 = cacheTotal2 > 0 ? (this.ctx.lastCacheHitTokens / cacheTotal2 * 100).toFixed(1) : "N/A";
          this.ctx.postMessage({ type: "info", message: `Session Cost (approximate):\n  Total: ${costStr3}\n  Tokens: ↥${this.ctx.totalInputTokens.toLocaleString()} ↧${this.ctx.totalOutputTokens.toLocaleString()}\n  Cache hit rate: ${cacheRate2}% (hit: ${this.ctx.lastCacheHitTokens.toLocaleString()}, miss: ${this.ctx.lastCacheMissTokens.toLocaleString()})\n  Model: ${this.ctx.getCurrentModel()}\n\nUsage: /cost [history|today|since <date>] for historical data` });
        }
        break;
      }
      case "/status": {
        try {
          await this.ctx.api.ensureReady();

          const runtimeInfo = await this.ctx.api.getRuntimeInfo();
          const running = this.ctx.engine.isRunning;
          const authInfo = runtimeInfo.auth_required ? "✓ (token required)" : "✗ (no auth)";

          this.ctx.postMessage({
            type: "info",
            message: `Runtime Status:
  Engine: ${running ? "Running ✓" : "Stopped ✗"}
  Host: ${runtimeInfo.bind_host}:${runtimeInfo.port}
  Version: ${runtimeInfo.version}
  Auth: ${authInfo}
  Thread: ${this.ctx.currentThread ? this.ctx.currentThread.id.slice(0, 12) + "..." : "None"}
  Mode: ${cfg.get<string>("defaultMode", "agent")}
  Model: ${cfg.get<string>("defaultModel", "deepseek-v4-pro")}`
          });
        } catch (err) {
          const running = this.ctx.engine.isRunning;
          this.ctx.postMessage({
            type: "info",
            message: `Engine: ${running ? "Running" : "Stopped"}\nPort: ${this.ctx.engine.port}\nThread: ${this.ctx.currentThread ? this.ctx.currentThread.id.slice(0, 12) + "..." : "None"}\nMode: ${cfg.get<string>("defaultMode", "agent")}\nModel: ${cfg.get<string>("defaultModel", "deepseek-v4-pro")}\n(Runtime info unavailable: ${(err as Error).message})`
          });
        }
        break;
      }
      case "/home": {
        this.ctx.postMessage({ type: "info", message: `Dashboard:\n- Threads: see sidebar\n- Mode: ${cfg.get<string>("defaultMode", "agent")}\n- Model: ${cfg.get<string>("defaultModel", "deepseek-v4-pro")}\n- Reasoning: ${cfg.get<string>("reasoningEffort", "auto")}` });
        break;
      }
      case "/workspace": {
        try {
          await this.ctx.api.ensureReady();

          const status = await this.ctx.api.getWorkspaceStatus();
          const wsPath = status.workspace;
          const gitInfo = status.git_repo
            ? `\n  Git repo: ✓\n  Branch: ${status.branch || "N/A"}\n  Staged: ${status.staged} files\n  Unstaged: ${status.unstaged} files\n  Untracked: ${status.untracked} files\n  Ahead/Behind: ${status.ahead ?? 0}/${status.behind ?? 0}`
            : "\n  Git repo: ✗ (not a git repository)";

          this.ctx.postMessage({
            type: "info",
            message: `Workspace: ${wsPath}${gitInfo}\n\nUsage: /workspace [path] to change workspace (not implemented in GUI)`
          });
        } catch (err) {
          const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "N/A";
          this.ctx.postMessage({ type: "info", message: `Workspace: ${ws}\n(Git status unavailable: ${(err as Error).message})` });
        }
        break;
      }
      case "/task": {
        const taskSub = args.trim().split(/\s+/)[0]?.toLowerCase() || "";
        const taskRest = args.trim().slice(taskSub.length).trim();
        try {
          await this.ctx.api.ensureReady();
          if (taskSub === "add" && taskRest) {
            const taskCfg = vscode.workspace.getConfiguration("brotherwhale");
            const task = await this.ctx.api.createTask({
              prompt: taskRest,
              model: taskCfg.get<string>("defaultModel", "deepseek-v4-pro"),
              mode: taskCfg.get<string>("defaultMode", "agent"),
              workspace: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
              auto_approve: taskCfg.get<boolean>("autoApprove", false),
            });
            this.ctx.postMessage({ type: "info", message: `Task created: ${task.id.slice(0, 8)} — "${taskRest.slice(0, 60)}" [${task.status}]` });
            await this.ctx.refreshTaskList();
          } else if (taskSub === "show" && taskRest) {
            const task = await this.ctx.api.getTask(taskRest);
            this.ctx.postMessage({ type: "taskDetail", task });
          } else if (taskSub === "cancel" && taskRest) {
            await this.ctx.api.cancelTask(taskRest);
            this.ctx.postMessage({ type: "info", message: `Task ${taskRest.slice(0, 8)} cancelled.` });
            await this.ctx.refreshTaskList();
          } else {
            const result = await this.ctx.api.listTasks({ limit: 20 });
            const tasks = result.tasks;
            if (tasks && tasks.length > 0) {
              const lines = tasks.map((t: TaskSummary) => {
                const statusIcon = t.status === "completed" ? "✓" : t.status === "running" ? "⟳" : t.status === "failed" ? "✗" : t.status === "queued" ? "⏳" : "·";
                return `${statusIcon} ${t.id.slice(0, 8)}: ${t.prompt_summary.slice(0, 40)} [${t.status}]`;
              });
              this.ctx.postMessage({ type: "info", message: `Tasks (${tasks.length}):\n${lines.join("\n")}\n\nUsage: /task add <prompt> | /task show <id> | /task cancel <id>` });
            } else {
              this.ctx.postMessage({ type: "info", message: "No tasks.\n\nUsage: /task add <prompt> | /task list | /task show <id> | /task cancel <id>" });
            }
          }
        } catch (err) {
          this.ctx.postMessage({ type: "info", message: `Task error: ${(err as Error).message}\n\nUsage: /task add <prompt> | /task list | /task show <id> | /task cancel <id>` });
        }
        break;
      }
      case "/trust": {
        const sub = args.trim().toLowerCase();
        if (sub === "on") {
          await cfg.update("autoApprove", true, vscode.ConfigurationTarget.Global);
          if (this.ctx.currentThread) {
            try {
              await this.ctx.api.updateThread(this.ctx.currentThread.id, { auto_approve: true, trust_mode: true });
            } catch { /* non-critical */ }
          }
          this.ctx.postMessage({ type: "info", message: "Trust mode enabled (auto-approve)" });
        } else if (sub === "off") {
          const isYolo = cfg.get<string>("defaultMode", "agent") === "yolo";
          await cfg.update("autoApprove", false, vscode.ConfigurationTarget.Global);
          if (this.ctx.currentThread) {
            try {
              await this.ctx.api.updateThread(this.ctx.currentThread.id, { auto_approve: isYolo, trust_mode: isYolo });
            } catch { /* non-critical */ }
          }
          this.ctx.postMessage({ type: "info", message: "Trust mode disabled" });
        } else {
          this.ctx.postMessage({ type: "info", message: `Usage: /trust [on|off]\nAuto-approve is currently: ${cfg.get<boolean>("autoApprove", false) ? "on" : "off"}` });
        }
        break;
      }
      case "/verbose": {
        const sub = args.trim().toLowerCase();
        if (sub === "on") {
          await cfg.update("verbose", true, vscode.ConfigurationTarget.Global);
          this.ctx.postMessage({ type: "info", message: "Verbose mode enabled" });
        } else if (sub === "off") {
          await cfg.update("verbose", false, vscode.ConfigurationTarget.Global);
          this.ctx.postMessage({ type: "info", message: "Verbose mode disabled" });
        } else {
          this.ctx.postMessage({ type: "info", message: `Verbose mode: ${cfg.get<boolean>("verbose", false) ? "on" : "off"}\nUsage: /verbose [on|off]` });
        }
        break;
      }
      case "/init": {
        vscode.commands.executeCommand("workbench.action.openSettings", "brotherwhale");
        this.ctx.postMessage({ type: "info", message: "Use the VSCode settings to configure CodeWhale. Open settings with /config." });
        break;
      }
      case "/mcp": {
        vscode.commands.executeCommand("workbench.action.openSettings", "brotherwhale");
        this.ctx.postMessage({ type: "info", message: "MCP server configuration is available in VSCode settings." });
        break;
      }
      case "/provider": {
        this.ctx.postMessage({ type: "info", message: "Provider is configured via DEEPSEEK_API_KEY environment variable. Use /config to open settings." });
        break;
      }
      case "/links": {
        this.ctx.postMessage({ type: "info", message: "DeepSeek Links:\n- API: https://api.deepseek.com\n- Docs: https://api-docs.deepseek.com\n- Status: https://status.deepseek.com" });
        break;
      }
      case "/feedback": {
        vscode.commands.executeCommand("workbench.action.openIssueReporter");
        this.ctx.postMessage({ type: "info", message: "Opening issue reporter for feedback." });
        break;
      }
      case "/help": {
        this.ctx.postMessage({ type: "info", message: `Available commands:
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
        await this.ctx.handleUndoLastTurn();
        break;
      }
      case "/retry": {
        await this.ctx.handleRetryLastTurn();
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
            this.ctx.postMessage({ type: "info", message: "Goal cleared." });
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
            this.ctx.postMessage({ type: "info", message: `Goal set: "${objective}"${budgetStr} — tracking progress.` });
          } else {
            const currentGoal = cfg.get<string | undefined>("goalObjective");
            if (currentGoal) {
              const currentBudget = cfg.get<number | undefined>("goalTokenBudget");
              const budgetStr = currentBudget ? ` (budget: ${currentBudget} tokens)` : "";
              this.ctx.postMessage({ type: "info", message: `Current goal: "${currentGoal}"${budgetStr}` });
            } else {
              this.ctx.postMessage({ type: "info", message: "No goal set.\nUsage: /goal <objective> [| budget: <tokens>]\n/goal clear — clear current goal" });
            }
          }
          this.ctx.refreshWorkPanel();
        } catch (err) {
          this.ctx.postMessage({ type: "error", message: `Goal error: ${(err as Error).message}` });
        }
        break;
      }
      case "/skills": {
        try {
          await this.ctx.api.ensureReady();
          const result = await this.ctx.api.listSkills();
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

            this.ctx.postMessage({
              type: "info",
              message: `${output}\nUse /skill <name> [on|off] to enable/disable\n${dirInfo}${warnings}`
            });
          } else {
            const dirInfo = result.directories && result.directories.length > 1
              ? `Skills directories:\n${result.directories.map(d => `  - ${d}`).join("\n")}`
              : `Skills directory: ${result.directory}`;
            this.ctx.postMessage({
              type: "info",
              message: `No skills found.\n${dirInfo}\n\nSkills are auto-triggered when enabled and task matches.\nCreate skills in ~/.codewhale/skills/<name>/SKILL.md`
            });
          }
        } catch (err) {
          this.ctx.postMessage({ type: "error", message: `Failed to list skills: ${(err as Error).message}` });
        }
        break;
      }
      case "/skill": {
        const parts = args.trim().split(/\s+/);
        const skillName = parts[0];
        const action = parts[1]?.toLowerCase() || "";

        if (!skillName) {
          this.ctx.postMessage({ type: "error", message: "Usage: /skill <name> [on|off]" });
          break;
        }

        try {
          await this.ctx.api.ensureReady();

          if (action === "on" || action === "enable" || action === "") {
            const result = await this.ctx.api.setSkillEnabled(skillName, true);
            this.ctx.postMessage({ type: "info", message: `Skill '${result.name}' enabled. It will auto-trigger when task matches.` });
          } else if (action === "off" || action === "disable") {
            const result = await this.ctx.api.setSkillEnabled(skillName, false);
            this.ctx.postMessage({ type: "info", message: `Skill '${result.name}' disabled.` });
          } else {
            this.ctx.postMessage({ type: "error", message: `Unknown action: ${action}\nUsage: /skill <name> [on|off]` });
          }
        } catch (err) {
          const errorMsg = (err as Error).message;
          if (errorMsg.includes("not found")) {
            this.ctx.postMessage({ type: "error", message: `Skill '${skillName}' not found. Use /skills to list available skills.` });
          } else {
            this.ctx.postMessage({ type: "error", message: `Failed to toggle skill: ${errorMsg}` });
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
        await this.ctx.handleAttachFile();
        break;
      case "/anchor": {
        const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!ws) {
          this.ctx.postMessage({ type: "info", message: "No workspace open. Anchors require an open workspace." });
          break;
        }
        const anchorDir = path.join(ws, ".deepseek");
        const anchorPath = path.join(anchorDir, "anchors.md");
        const anchorArg = args.trim();
        const anchorSub = anchorArg.split(/\s+/)[0]?.toLowerCase();
        const anchorRest = anchorArg.slice(anchorSub.length).trim();

        if (!anchorArg || anchorSub === "help") {
          this.ctx.postMessage({ type: "info", message: `Usage: /anchor <text> | /anchor list | /anchor remove <n>\nAnchors are auto-injected after compaction.\nAnchors path: ${anchorPath}` });
          break;
        }

        try {
          if (!fs.existsSync(anchorDir)) fs.mkdirSync(anchorDir, { recursive: true });
        } catch (err) {
          this.ctx.postMessage({ type: "error", message: `Failed to create .deepseek directory: ${(err as Error).message}` });
          break;
        }

        try {
          if (anchorSub === "list") {
            if (!fs.existsSync(anchorPath)) {
              this.ctx.postMessage({ type: "info", message: "No anchors set." });
            } else {
              const content = fs.readFileSync(anchorPath, "utf-8");
              const lines = content.split("\n").filter(l => l.trim().length > 0);
              if (lines.length === 0) {
                this.ctx.postMessage({ type: "info", message: "No anchors set." });
              } else {
                this.ctx.postMessage({ type: "info", message: `Anchors (${lines.length}):\n${lines.map((l, i) => `${i + 1}. ${l.replace(/^[-*]\s*/, "")}`).join("\n")}` });
              }
            }
          } else if (anchorSub === "remove" || anchorSub === "rm" || anchorSub === "delete") {
            const idx = parseInt(anchorRest, 10);
            if (isNaN(idx) || idx < 1) {
              this.ctx.postMessage({ type: "error", message: "Usage: /anchor remove <n>" });
              break;
            }
            if (!fs.existsSync(anchorPath)) {
              this.ctx.postMessage({ type: "error", message: "No anchors file." });
              break;
            }
            const content = fs.readFileSync(anchorPath, "utf-8");
            const lines = content.split("\n").filter(l => l.trim().length > 0);
            if (idx > lines.length) {
              this.ctx.postMessage({ type: "error", message: `Anchor ${idx} not found. Only ${lines.length} anchors.` });
              break;
            }
            lines.splice(idx - 1, 1);
            fs.writeFileSync(anchorPath, lines.join("\n") + "\n");
            this.ctx.postMessage({ type: "info", message: `Removed anchor ${idx}.` });
          } else {
            const text = anchorArg;
            const entry = `- ${text}\n`;
            fs.appendFileSync(anchorPath, entry);
            this.ctx.postMessage({ type: "info", message: `Anchor added: ${text}` });
          }
        } catch (err) {
          this.ctx.postMessage({ type: "error", message: `Anchor error: ${(err as Error).message}` });
        }
        break;
      }
      case "/sessions": {
        try {
          await this.ctx.api.ensureReady();

          const searchArg = args.trim();
          const searchMatch = searchArg.match(/^search\s+(.+)$/i);
          const searchQuery = searchMatch ? searchMatch[1].trim() : undefined;

          const result = await this.ctx.api.listSessions({ limit: 20, search: searchQuery });
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
            this.ctx.postMessage({
              type: "info",
              message: `Saved sessions${searchHint} (${sessions.length}):\n${lines.join("\n")}\n\nUsage: /load <session-id> to resume a session\nYou can use short ID (e.g., /load ${sessions[0]?.id.slice(0, 8)})\n/sessions search <query> to filter`
            });
          } else {
            const searchHint = searchQuery ? ` matching "${searchQuery}"` : "";
            this.ctx.postMessage({
              type: "info",
              message: `No saved sessions found${searchHint}.\n\nGUI no longer auto-creates session records.\nUsage: /sessions [search <query>]`
            });
          }
        } catch (err) {
          this.ctx.postMessage({ type: "error", message: `Failed to list sessions: ${(err as Error).message}` });
        }
        break;
      }
      case "/load": {
        const sessionIdInput = args.trim();

        if (!sessionIdInput) {
          this.ctx.postMessage({ type: "error", message: "Usage: /load <session-id>\nUse /sessions to find session IDs.\nYou can use short ID (e.g., first 8 characters)." });
          break;
        }

        try {
          await this.ctx.api.ensureReady();

          let sessionId = sessionIdInput;

          if (sessionIdInput.length < 36) {
            const sessionsResult = await this.ctx.api.listSessions({ limit: 100 });
            const sessions = sessionsResult.sessions || [];

            const matches = sessions.filter(s => s.id.startsWith(sessionIdInput));

            if (matches.length === 0) {
              this.ctx.postMessage({
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

              this.ctx.postMessage({
                type: "info",
                message: `Multiple sessions match '${sessionIdInput}' (${matches.length}):\n${matchLines.join("\n")}\n\nUse /load <full-id> to select specific session.`
              });
              break;
            }
          }

          await this.ctx.loadSessionMessages(sessionId);
        } catch (err) {
          const errorMsg = (err as Error).message;
          if (errorMsg.includes("not found")) {
            this.ctx.postMessage({ type: "error", message: `Session '${sessionIdInput}' not found. Use /sessions to list available sessions.` });
          } else {
            this.ctx.postMessage({ type: "error", message: `Failed to load session: ${errorMsg}` });
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
        this.ctx.postMessage({ type: "info", message: "Changelog: See the extension's CHANGELOG or visit the repository." });
        break;
      }
      case "/cache": {
        if (this.ctx.currentThread) {
          try {
            const detail = await this.ctx.api.getThreadDetail(this.ctx.currentThread.id);
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
            this.ctx.postMessage({ type: "info", message: cacheInfo });
          } catch (err) {
            this.ctx.postMessage({ type: "error", message: `Failed to get cache info: ${(err as Error).message}` });
          }
        } else {
          this.ctx.postMessage({ type: "info", message: "No active thread for cache info." });
        }
        break;
      }
      case "/profile": {
        const profileArg = args.trim();
        if (!profileArg) {
          const currentProfile = cfg.get<string | undefined>("configProfile");
          this.ctx.postMessage({ type: "info", message: `Current profile: ${currentProfile || "(default)"}\nUsage: /profile <name>\nProfiles are defined in ~/.deepseek/config.toml under [profiles] sections.` });
        } else {
          await cfg.update("configProfile", profileArg, vscode.ConfigurationTarget.Global);
          this.ctx.postMessage({ type: "info", message: `Profile switched to '${profileArg}'. Restart the engine for full effect.` });
        }
        break;
      }
      case "/translate": {
        const current = cfg.get<boolean>("translationEnabled", false);
        await cfg.update("translationEnabled", !current, vscode.ConfigurationTarget.Global);
        this.ctx.postMessage({ type: "info", message: `Translation ${!current ? "enabled" : "disabled"}` });
        break;
      }
      case "/system": {
        if (this.ctx.currentThread) {
          try {
            const detail = await this.ctx.api.getThreadDetail(this.ctx.currentThread.id);
            const sysPrompt = detail.thread.system_prompt || "(no system prompt)";
            const display = sysPrompt.length > 500
              ? sysPrompt.slice(0, 500) + `...\n\n(truncated, ${sysPrompt.length} chars total)`
              : sysPrompt;
            this.ctx.postMessage({ type: "info", message: `System Prompt (${cfg.get<string>("defaultMode", "agent")} mode):\n─────────────────────────────\n${display}` });
          } catch (err) {
            this.ctx.postMessage({ type: "error", message: `Failed to get system prompt: ${(err as Error).message}` });
          }
        } else {
          this.ctx.postMessage({ type: "info", message: "(no system prompt)" });
        }
        break;
      }
      case "/edit":
        this.ctx.postMessage({ type: "loadLastUserMessage" });
        break;
      case "/diff": {
        const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!ws) {
          this.ctx.postMessage({ type: "info", message: "No workspace open" });
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
            this.ctx.postMessage({ type: "info", message: "No changes since session start" });
          } else {
            const files = nameOutput.trim().split("\n");
            this.ctx.postMessage({ type: "info", message: `Changed files (${files.length}):\n${files.map((f: string) => `- ${f}`).join("\n")}\n\n${statOutput.trim()}` });
          }
        } catch (err) {
          this.ctx.postMessage({ type: "info", message: `Git diff unavailable: ${(err as Error).message}` });
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
          await this.ctx.api.ensureReady();

          if (jobsSub === "list" || jobsSub === "") {
            const automations = await this.ctx.api.listAutomations();

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

              this.ctx.postMessage({
                type: "info",
                message: `Automations (${automations.length}):\n${lines.join("\n")}\n\nUsage: /jobs show <id> | /jobs run <id> | /jobs pause <id> | /jobs resume <id> | /jobs history <id>`
              });
            } else {
              this.ctx.postMessage({
                type: "info",
                message: `No automations found.\n\nAutomations are scheduled tasks that run automatically.\nCreate via TUI or use the automations API.\nUsage: /jobs list`
              });
            }
          } else if (jobsSub === "show" && jobsId) {
            const automation = await this.ctx.api.getAutomation(jobsId);
            const nextRun = automation.next_run_at
              ? new Date(automation.next_run_at).toLocaleString()
              : "Not scheduled";
            const lastRun = automation.last_run_at
              ? new Date(automation.last_run_at).toLocaleString()
              : "Never";

            this.ctx.postMessage({
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
            const automation = await this.ctx.api.runAutomation(jobsId);
            this.ctx.postMessage({
              type: "info",
              message: `Automation triggered: ${automation.name} (${automation.id.slice(0, 8)})\nStatus: ${automation.status}\nThe automation will execute according to its schedule.`
            });
          } else if (jobsSub === "pause" && jobsId) {
            const automation = await this.ctx.api.pauseAutomation(jobsId);
            this.ctx.postMessage({
              type: "info",
              message: `Automation paused: ${automation.name} (${automation.id.slice(0, 8)})\nStatus: ${automation.status}\nUse /jobs resume ${automation.id.slice(0, 8)} to resume.`
            });
          } else if (jobsSub === "resume" && jobsId) {
            const automation = await this.ctx.api.resumeAutomation(jobsId);
            this.ctx.postMessage({
              type: "info",
              message: `Automation resumed: ${automation.name} (${automation.id.slice(0, 8)})\nStatus: ${automation.status}\nNext run: ${automation.next_run_at ? new Date(automation.next_run_at).toLocaleString() : "Not scheduled"}`
            });
          } else if (jobsSub === "history" && jobsId) {
            const runs = await this.ctx.api.listAutomationRuns(jobsId, { limit: 10 });

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

              this.ctx.postMessage({
                type: "info",
                message: `Automation runs (${runs.length}):\n${lines.join("\n")}\n\nUsage: /jobs history <id>`
              });
            } else {
              this.ctx.postMessage({
                type: "info",
                message: `No run history found for automation ${jobsId}.\n\nThe automation may not have executed yet.`
              });
            }
          } else {
            this.ctx.postMessage({ type: "error", message: `Usage: /jobs list | /jobs show <id> | /jobs run <id> | /jobs pause <id> | /jobs resume <id> | /jobs history <id>` });
          }
        } catch (err) {
          const errorMsg = (err as Error).message;
          if (errorMsg.includes("not found")) {
            this.ctx.postMessage({ type: "error", message: `Automation '${jobsId}' not found. Use /jobs list to see available automations.` });
          } else {
            this.ctx.postMessage({ type: "error", message: `Failed to manage automations: ${errorMsg}` });
          }
        }
        break;
      }
      case "/logout":
        this.ctx.postMessage({ type: "info", message: "To change API key, update the DEEPSEEK_API_KEY environment variable and restart VSCode." });
        break;
      case "/note": {
        const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!ws) {
          this.ctx.postMessage({ type: "info", message: "No workspace open. Notes require an open workspace." });
          break;
        }
        const notesDir = path.join(ws, ".deepseek");
        const notesPath = path.join(notesDir, "notes.md");
        const noteArg = args.trim();
        const sub = noteArg.split(/\s+/)[0]?.toLowerCase();
        const rest = noteArg.slice(sub.length).trim();

        if (!noteArg || sub === "help") {
          this.ctx.postMessage({ type: "info", message: `Usage: /note <text> | /note add <text> | /note list | /note show <n> | /note remove <n> | /note clear | /note path\nNotes path: ${notesPath}` });
          break;
        }

        try {
          if (!fs.existsSync(notesDir)) fs.mkdirSync(notesDir, { recursive: true });
        } catch (err) {
          this.ctx.postMessage({ type: "error", message: `Failed to create .deepseek directory: ${(err as Error).message}` });
          break;
        }

        try {
          if (sub === "path") {
            this.ctx.postMessage({ type: "info", message: `Notes path: ${notesPath}` });
          } else if (sub === "list") {
            if (!fs.existsSync(notesPath)) {
              this.ctx.postMessage({ type: "info", message: "No notes yet." });
            } else {
              const content = fs.readFileSync(notesPath, "utf-8");
              const lines = content.split("\n").filter(l => l.trim().length > 0);
              if (lines.length === 0) {
                this.ctx.postMessage({ type: "info", message: "No notes yet." });
              } else {
                this.ctx.postMessage({ type: "info", message: `Notes (${lines.length}):\n${lines.map((l, i) => `${i + 1}. ${l.replace(/^[-*]\s*/, "")}`).join("\n")}` });
              }
            }
          } else if (sub === "clear") {
            if (fs.existsSync(notesPath)) {
              fs.writeFileSync(notesPath, "");
              this.ctx.postMessage({ type: "info", message: "Notes cleared." });
            } else {
              this.ctx.postMessage({ type: "info", message: "No notes to clear." });
            }
          } else if (sub === "remove" || sub === "rm" || sub === "delete") {
            const idx = parseInt(rest, 10);
            if (isNaN(idx) || idx < 1) {
              this.ctx.postMessage({ type: "error", message: "Usage: /note remove <n>" });
              break;
            }
            if (!fs.existsSync(notesPath)) {
              this.ctx.postMessage({ type: "error", message: "No notes file." });
              break;
            }
            const content = fs.readFileSync(notesPath, "utf-8");
            const lines = content.split("\n").filter(l => l.trim().length > 0);
            if (idx > lines.length) {
              this.ctx.postMessage({ type: "error", message: `Note ${idx} not found. Only ${lines.length} notes.` });
              break;
            }
            lines.splice(idx - 1, 1);
            fs.writeFileSync(notesPath, lines.join("\n") + "\n");
            this.ctx.postMessage({ type: "info", message: `Removed note ${idx}.` });
          } else {
            const text = sub === "add" ? rest : noteArg;
            if (!text) {
              this.ctx.postMessage({ type: "error", message: "Note content cannot be empty" });
              break;
            }
            const timestamp = new Date().toISOString().slice(0, 16);
            const entry = `- [${timestamp}] ${text}\n`;
            fs.appendFileSync(notesPath, entry);
            this.ctx.postMessage({ type: "info", message: `Note added: ${text}` });
          }
        } catch (err) {
          this.ctx.postMessage({ type: "error", message: `Note error: ${(err as Error).message}` });
        }
        break;
      }
      case "/memory": {
        const memoryDir = path.join(os.homedir(), ".deepseek");
        const memoryPath = path.join(memoryDir, "memory.md");
        const memArg = args.trim().toLowerCase();

        if (memArg === "help") {
          this.ctx.postMessage({ type: "info", message: `Usage: /memory [show|path|clear|edit]\nCurrent path: ${memoryPath}` });
          break;
        }

        if (memArg === "path") {
          this.ctx.postMessage({ type: "info", message: `Memory path: ${memoryPath}` });
          break;
        }

        try {
          if (memArg === "clear") {
            if (fs.existsSync(memoryPath)) {
              fs.writeFileSync(memoryPath, "(empty)\n");
              this.ctx.postMessage({ type: "info", message: "Memory cleared." });
            } else {
              this.ctx.postMessage({ type: "info", message: "No memory file to clear." });
            }
            break;
          }

          if (memArg === "edit") {
            try {
              const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(memoryPath));
              vscode.window.showTextDocument(doc);
              this.ctx.postMessage({ type: "info", message: `Opening memory file: ${memoryPath}` });
            } catch {
              this.ctx.postMessage({ type: "info", message: `Memory file not found. Create it at: ${memoryPath}` });
            }
            break;
          }

          if (!fs.existsSync(memoryPath)) {
            this.ctx.postMessage({ type: "info", message: `Memory file not found.\nPath: ${memoryPath}\nCreate it to start using memory, or use /memory edit to open it.` });
          } else {
            const content = fs.readFileSync(memoryPath, "utf-8").trim();
            if (!content || content === "(empty)") {
              this.ctx.postMessage({ type: "info", message: `Memory path: ${memoryPath}\n(empty — add content to the file or use /memory edit)` });
            } else {
              const display = content.length > 500
                ? content.slice(0, 500) + `...\n(truncated, ${content.length} chars total)`
                : content;
              this.ctx.postMessage({ type: "info", message: `Memory path: ${memoryPath}\n─────────────────────────────\n${display}` });
            }
          }
        } catch (err) {
          this.ctx.postMessage({ type: "error", message: `Memory error: ${(err as Error).message}` });
        }
        break;
      }
      default:
        this.ctx.postMessage({ type: "error", message: `Unknown command: ${command}. Type /help for available commands.` });
    }
  }
}
