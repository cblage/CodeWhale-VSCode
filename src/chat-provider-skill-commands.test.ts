import { beforeEach, describe, expect, it, vi } from "vitest";
import { stripTurnMeta } from "./utils/diff-utils";
import type { SkillsResponse } from "./types";

const vscodeState = vi.hoisted(() => ({
  configValues: new Map<string, unknown>([
    ["defaultMode", "agent"],
    ["defaultModel", "deepseek-v4-pro"],
    ["reasoningEffort", "auto"],
    ["autoApprove", false],
    ["showThreadList", false],
  ]),
}));

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: (key: string, fallback?: unknown) =>
        vscodeState.configValues.has(key)
          ? vscodeState.configValues.get(key)
          : fallback,
      update: vi.fn(async () => undefined),
    })),
    workspaceFolders: undefined,
  },
  commands: {
    executeCommand: vi.fn(),
  },
  window: {
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    setStatusBarMessage: vi.fn(),
    showTextDocument: vi.fn(),
  },
  env: {
    language: "en",
  },
  Uri: {
    file: (fsPath: string) => ({ fsPath }),
    parse: (value: string) => ({ toString: () => value }),
  },
  ConfigurationTarget: {
    Global: "global",
  },
}));

import { ChatProvider } from "./chat-provider";

function skillsResponse(
  entries: SkillsResponse["skills"],
): SkillsResponse {
  return {
    directory: "/skills",
    directories: ["/skills"],
    warnings: [],
    skills: entries,
  };
}

function skill(name: string, enabled = true) {
  return {
    name,
    description: "Use for pull-request engineering review",
    path: "/skills/" + name + "/SKILL.md",
    enabled,
    is_bundled: false,
  };
}

function createProvider(initialSkills = skillsResponse([
  skill("engineering-review"),
])) {
  const currentThread = {
    id: "thread-1",
    model: "deepseek-v4-pro",
    mode: "agent",
    workspace: "",
    auto_approve: false,
    trust_mode: false,
  };
  const listSkills = vi.fn(async () => initialSkills);
  const startTurn = vi.fn(async (
    _threadId: string,
    _prompt: string,
    _opts?: Record<string, unknown>,
  ) => ({
    thread: currentThread,
    turn: { id: "turn-1" },
  }));
  const api = {
    bindEngine: vi.fn(),
    ensureReady: vi.fn(async () => undefined),
    listSkills,
    getThread: vi.fn(async () => currentThread),
    startTurn,
  };
  const provider = new ChatProvider({} as any, {} as any, api as any);
  provider.currentThread = currentThread as any;
  provider.postMessage = vi.fn();
  provider.refreshSessionList = vi.fn(async () => []);
  provider.refreshTaskList = vi.fn(async () => undefined);
  provider.refreshWorkPanel = vi.fn();
  (provider as any).debugLog = vi.fn();

  return {
    api,
    provider,
    postMessage: provider.postMessage as ReturnType<typeof vi.fn>,
  };
}

describe("ChatProvider dynamic skill commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invokes an enabled skill while preserving the exact visible slash text", async () => {
    const { api, provider, postMessage } = createProvider();
    const rawText = "/Engineering-Review  review #177";

    await (provider as any).handleWebviewMessage({
      type: "slashCommand",
      command: "/engineering-review",
      args: "review #177",
      text: rawText,
    });

    expect(api.startTurn).toHaveBeenCalledOnce();
    const [, backendPrompt, opts] = api.startTurn.mock.calls[0];
    expect(backendPrompt).toContain("load_skill");
    expect(backendPrompt).toContain('{"name":"engineering-review"}');
    expect(stripTurnMeta(backendPrompt)).toBe(rawText);
    expect(opts?.input_summary).toBe(rawText);

    const userMessage = postMessage.mock.calls
      .map(([message]) => message)
      .find((message) =>
        message.type === "addMessage" && message.message?.role === "user"
      );
    expect(userMessage.message.content).toBe(rawText);
  });

  it("keeps attachments identical in visible and persisted skill requests", async () => {
    const { api, provider, postMessage } = createProvider();
    (provider as any).currentAttachments = [{
      kind: "file",
      path: "/workspace/review.md",
      name: "review.md",
    }];

    await (provider as any).handleWebviewMessage({
      type: "slashCommand",
      command: "/engineering-review",
      args: "review #177",
      text: "/engineering-review review #177",
    });

    const backendPrompt = api.startTurn.mock.calls[0][1];
    const visible = "/engineering-review review #177\n@/workspace/review.md";
    expect(stripTurnMeta(backendPrompt)).toBe(visible);
    const userMessage = postMessage.mock.calls
      .map(([message]) => message)
      .find((message) =>
        message.type === "addMessage" && message.message?.role === "user"
      );
    expect(userMessage.message.content).toBe(visible);
  });

  it("blocks direct invocation of a disabled skill", async () => {
    const { api, provider, postMessage } = createProvider(
      skillsResponse([skill("engineering-review", false)]),
    );

    await (provider as any).handleWebviewMessage({
      type: "slashCommand",
      command: "/engineering-review",
      args: "review #177",
      text: "/engineering-review review #177",
    });

    expect(api.startTurn).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        message: expect.stringContaining("disabled"),
      }),
    );
  });

  it("reports a cached skill that disappeared instead of invoking stale state", async () => {
    const { api, provider, postMessage } = createProvider();
    await provider.refreshSkillCommands();
    api.listSkills.mockResolvedValueOnce(skillsResponse([]));

    await (provider as any).handleWebviewMessage({
      type: "slashCommand",
      command: "/engineering-review",
      args: "review #177",
      text: "/engineering-review review #177",
    });

    expect(api.startTurn).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        message: expect.stringContaining("no longer available"),
      }),
    );
  });

  it("consumes a skill refresh failure without a misleading unknown-command error", async () => {
    const { api, provider, postMessage } = createProvider();
    api.listSkills.mockRejectedValueOnce(new Error("engine unavailable"));

    await (provider as any).handleWebviewMessage({
      type: "slashCommand",
      command: "/engineering-review",
      args: "review #177",
      text: "/engineering-review review #177",
    });

    expect(api.startTurn).not.toHaveBeenCalled();
    const errors = postMessage.mock.calls
      .map(([message]) => message)
      .filter((message) => message.type === "error");
    expect(errors.some((message) =>
      String(message.message).includes("Failed to refresh skills")
    )).toBe(true);
    expect(errors.some((message) =>
      String(message.message).includes("Unknown command")
    )).toBe(false);
  });

  it("never lets a skill shadow a registered slash command", async () => {
    const { api, provider, postMessage } = createProvider(
      skillsResponse([skill("review")]),
    );

    await (provider as any).handleWebviewMessage({
      type: "slashCommand",
      command: "/review",
      args: "#177",
      text: "/review #177",
    });

    expect(api.listSkills).not.toHaveBeenCalled();
    expect(api.startTurn).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "info" }),
    );
  });

  it("strips hidden skill metadata when undo restores the composer text", async () => {
    const { api, provider, postMessage } = createProvider();
    const rawText = "/engineering-review review #177";
    const backendPrompt = [
      "<turn_meta>load engineering-review</turn_meta>",
      rawText,
    ].join("\n");
    (api as any).patchUndoThreadTurn = vi.fn(async () => ({
      patch_result: { files_restored: false, summary: null },
      thread: provider.currentThread,
      original_user_text: backendPrompt,
    }));
    (provider as any).apiCapabilities.threadPatchUndo = true;
    (provider as any).loadThread = vi.fn(async () => undefined);

    await provider.handleUndoLastTurn();

    expect(postMessage).toHaveBeenCalledWith({
      type: "setInputText",
      text: rawText,
    });
  });

  it("prevents an older refresh response from replacing a newer menu", async () => {
    const { api, provider, postMessage } = createProvider();
    let resolveOld!: (value: SkillsResponse) => void;
    let resolveNew!: (value: SkillsResponse) => void;
    api.listSkills
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveOld = resolve;
      }))
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveNew = resolve;
      }));

    const oldRefresh = provider.refreshSkillCommands();
    const newRefresh = provider.refreshSkillCommands();
    await vi.waitFor(() => {
      expect(api.listSkills).toHaveBeenCalledTimes(2);
    });
    resolveNew(skillsResponse([skill("new-skill")]));
    await newRefresh;
    resolveOld(skillsResponse([skill("old-skill")]));
    await oldRefresh;

    const menuUpdates = postMessage.mock.calls
      .map(([message]) => message)
      .filter((message) => message.type === "skillCommands");
    expect(menuUpdates).toEqual([{
      type: "skillCommands",
      skills: [{
        name: "new-skill",
        description: "Use for pull-request engineering review",
      }],
    }]);
  });
});
