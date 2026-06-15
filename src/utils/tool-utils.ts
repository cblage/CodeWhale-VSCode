/**
 * Tool name/display utilities and file-change detection helpers.
 *
 * Extracted from chat-provider.ts for independent testing and reuse.
 */

import { shortPath, truncate } from "./diff-utils";

// ── Tool name mappings ──

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

export { FRIENDLY_TOOL_NAMES };

export function friendlyToolName(raw: string): string {
  if (FRIENDLY_TOOL_NAMES[raw]) return FRIENDLY_TOOL_NAMES[raw];
  if (raw.startsWith("mcp__")) return raw.slice(5).replace(/__/g, " / ");
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── File change detection ──

export const FILE_CHANGE_TOOLS = new Set([
  "write_file",
  "edit_file",
  "apply_patch",
  "replace_text",
  "delete_file",
  "move_file",
  "copy_file",
  "create_directory",
]);

export function isFileChangeTool(toolName: string): boolean {
  return FILE_CHANGE_TOOLS.has(toolName) || FILE_CHANGE_TOOLS.has(toolName.toLowerCase());
}

export function extractFilePath(_toolName: string, input: Record<string, unknown>): string {
  return (input.file_path || input.path || input.destination || input.source || "") as string;
}

export function extractToolNameFromSummary(summary: string): string {
  const idx = summary.indexOf(":");
  if (idx > 0) return summary.slice(0, idx).trim();
  const spaceIdx = summary.indexOf(" ");
  if (spaceIdx > 0) return summary.slice(0, spaceIdx).trim();
  return summary.trim();
}

// ── Approval summaries ──

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

export function buildApprovalSummary(toolName: string, input: Record<string, unknown>): string {
  const builder = TOOL_APPROVAL_SUMMARIES[toolName];
  if (builder) return builder(input);
  return friendlyToolName(toolName);
}

// ── Task refresh trigger ──

export const TASK_REFRESH_TOOL_NAMES = new Set([
  "agent_open", "agent_spawn", "agent_close", "agent_cancel",
  "todo_write", "todo_add", "todo_update",
  "checklist_write", "checklist_add", "checklist_update",
  "task_shell_start", "exec_shell",
]);

export function shouldRefreshTaskList(toolName: string): boolean {
  return TASK_REFRESH_TOOL_NAMES.has(toolName);
}
