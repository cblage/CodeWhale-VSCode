import { describe, it, expect } from "vitest";
import {
  friendlyToolName,
  FRIENDLY_TOOL_NAMES,
  isFileChangeTool,
  extractFilePath,
  extractToolNameFromSummary,
  buildApprovalSummary,
  shouldRefreshTaskList,
  FILE_CHANGE_TOOLS,
} from "./tool-utils";

describe("friendlyToolName", () => {
  it("maps known tool names to friendly names", () => {
    expect(friendlyToolName("write_file")).toBe("Write file");
    expect(friendlyToolName("read_file")).toBe("Read file");
    expect(friendlyToolName("exec_shell")).toBe("Run command");
    expect(friendlyToolName("delete_file")).toBe("Delete file");
    expect(friendlyToolName("web_search")).toBe("Web search");
  });

  it("formats MCP tool names", () => {
    // mcp__ prefix stripped, __ replaced with /, but remaining _ not converted
    expect(friendlyToolName("mcp__github__create_issue")).toBe("github / create_issue");
    expect(friendlyToolName("mcp__fs__read")).toBe("fs / read");
  });

  it("formats unknown tool names with title case", () => {
    expect(friendlyToolName("some_custom_tool")).toBe("Some Custom Tool");
    expect(friendlyToolName("search")).toBe("Search");
  });
});

describe("isFileChangeTool", () => {
  it("identifies file change tools", () => {
    expect(isFileChangeTool("write_file")).toBe(true);
    expect(isFileChangeTool("apply_patch")).toBe(true);
    expect(isFileChangeTool("replace_text")).toBe(true);
    expect(isFileChangeTool("delete_file")).toBe(true);
    expect(isFileChangeTool("move_file")).toBe(true);
    expect(isFileChangeTool("copy_file")).toBe(true);
    expect(isFileChangeTool("create_directory")).toBe(true);
    expect(isFileChangeTool("edit_file")).toBe(true);
  });

  it("rejects non-file-change tools", () => {
    expect(isFileChangeTool("read_file")).toBe(false);
    expect(isFileChangeTool("exec_shell")).toBe(false);
    expect(isFileChangeTool("web_search")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isFileChangeTool("Write_File")).toBe(true);
    expect(isFileChangeTool("APPLY_PATCH")).toBe(true);
  });
});

describe("extractFilePath", () => {
  it("extracts file_path", () => {
    expect(extractFilePath("write_file", { file_path: "/src/main.ts" })).toBe("/src/main.ts");
  });

  it("extracts path when file_path is missing", () => {
    expect(extractFilePath("read_file", { path: "/src/main.ts" })).toBe("/src/main.ts");
  });

  it("extracts destination for move/copy", () => {
    expect(extractFilePath("move_file", { source: "/a.ts", destination: "/b.ts" })).toBe("/b.ts");
  });

  it("extracts source when only source present", () => {
    expect(extractFilePath("move_file", { source: "/a.ts" })).toBe("/a.ts");
  });

  it("returns empty string when no path fields", () => {
    expect(extractFilePath("exec_shell", { command: "ls" })).toBe("");
  });
});

describe("extractToolNameFromSummary", () => {
  it("extracts tool name before colon", () => {
    expect(extractToolNameFromSummary("write_file: Created /src/main.ts")).toBe("write_file");
  });

  it("extracts tool name before first space when no colon", () => {
    expect(extractToolNameFromSummary("read_file /src/main.ts")).toBe("read_file");
  });

  it("returns full string when no separator", () => {
    expect(extractToolNameFromSummary("unknown")).toBe("unknown");
  });

  it("handles empty string", () => {
    expect(extractToolNameFromSummary("")).toBe("");
  });
});

describe("buildApprovalSummary", () => {
  it("builds summary for write_file", () => {
    // /src/main.ts is only 2 parts, not abbreviated
    expect(buildApprovalSummary("write_file", { file_path: "/src/main.ts" })).toBe("Write to /src/main.ts");
  });

  it("builds summary for exec_shell", () => {
    expect(buildApprovalSummary("exec_shell", { command: "npm test" })).toBe("Run: npm test");
  });

  it("builds summary for delete_file", () => {
    // /tmp/old.ts is only 2 parts, not abbreviated
    expect(buildApprovalSummary("delete_file", { file_path: "/tmp/old.ts" })).toBe("Delete /tmp/old.ts");
  });

  it("builds summary for move_file", () => {
    // /a.ts and /b.ts are 1 part each, not abbreviated
    expect(buildApprovalSummary("move_file", { source: "/a.ts", destination: "/b.ts" })).toBe("Move /a.ts → /b.ts");
  });

  it("falls back to friendlyToolName for unknown tools", () => {
    expect(buildApprovalSummary("custom_tool", {})).toBe("Custom Tool");
  });

  it("handles web_search with no input", () => {
    expect(buildApprovalSummary("web_search", {})).toBe("Search the web");
  });

  it("handles fetch_url with URL", () => {
    expect(buildApprovalSummary("fetch_url", { url: "https://example.com/api" })).toContain("Fetch");
  });

  it("handles write_file with no path", () => {
    expect(buildApprovalSummary("write_file", {})).toBe("Write a file");
  });

  it("truncates long shell commands", () => {
    const longCmd = "a".repeat(100);
    const summary = buildApprovalSummary("exec_shell", { command: longCmd });
    expect(summary.length).toBeLessThan(100);
    expect(summary).toContain("…");
  });
});

describe("shouldRefreshTaskList", () => {
  it("triggers refresh for agent tools", () => {
    expect(shouldRefreshTaskList("agent_open")).toBe(true);
    expect(shouldRefreshTaskList("agent_spawn")).toBe(true);
    expect(shouldRefreshTaskList("agent_close")).toBe(true);
    expect(shouldRefreshTaskList("agent_cancel")).toBe(true);
  });

  it("triggers refresh for todo tools", () => {
    expect(shouldRefreshTaskList("todo_write")).toBe(true);
    expect(shouldRefreshTaskList("todo_add")).toBe(true);
    expect(shouldRefreshTaskList("todo_update")).toBe(true);
  });

  it("triggers refresh for checklist tools", () => {
    expect(shouldRefreshTaskList("checklist_write")).toBe(true);
    expect(shouldRefreshTaskList("checklist_add")).toBe(true);
    expect(shouldRefreshTaskList("checklist_update")).toBe(true);
  });

  it("triggers refresh for shell tools", () => {
    expect(shouldRefreshTaskList("task_shell_start")).toBe(true);
    expect(shouldRefreshTaskList("exec_shell")).toBe(true);
  });

  it("does not trigger for read-only tools", () => {
    expect(shouldRefreshTaskList("read_file")).toBe(false);
    expect(shouldRefreshTaskList("grep_files")).toBe(false);
    expect(shouldRefreshTaskList("project_map")).toBe(false);
  });
});

describe("FRIENDLY_TOOL_NAMES completeness", () => {
  it("has entries for all common tools", () => {
    const essential = ["write_file", "read_file", "exec_shell", "delete_file", "web_search"];
    for (const name of essential) {
      expect(FRIENDLY_TOOL_NAMES[name]).toBeDefined();
      expect(FRIENDLY_TOOL_NAMES[name].length).toBeGreaterThan(0);
    }
  });
});

describe("FILE_CHANGE_TOOLS completeness", () => {
  it("includes all file-modifying tools", () => {
    const expected = ["write_file", "edit_file", "apply_patch", "replace_text", "delete_file", "move_file", "copy_file", "create_directory"];
    for (const name of expected) {
      expect(FILE_CHANGE_TOOLS.has(name)).toBe(true);
    }
  });
});
