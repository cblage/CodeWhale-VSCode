import { beforeEach, describe, expect, it, vi } from "vitest";

type InspectRecord = Partial<Record<
  "globalValue" | "workspaceValue" | "workspaceFolderValue",
  unknown
>>;

const state = vi.hoisted(() => ({
  values: new Map<string, Map<string, InspectRecord>>(),
  updates: [] as Array<{
    namespace: string;
    scope: string;
    key: string;
    value: unknown;
    target: number;
  }>,
  marker: false,
  markerUpdates: [] as Array<[string, unknown]>,
  folders: [{ uri: { fsPath: "/workspace-one" } }],
}));

function scopeKey(namespace: string, scope: unknown): string {
  const fsPath = (scope as { fsPath?: string } | null)?.fsPath || "root";
  return `${namespace}|${fsPath}`;
}

vi.mock("vscode", () => ({
  workspace: {
    get workspaceFolders() {
      return state.folders;
    },
    getConfiguration: (namespace: string, scope: unknown) => ({
      inspect: (key: string) =>
        state.values.get(scopeKey(namespace, scope))?.get(key),
      update: async (key: string, value: unknown, target: number) => {
        state.updates.push({
          namespace,
          scope: (scope as { fsPath?: string } | null)?.fsPath || "root",
          key,
          value,
          target,
        });
      },
    }),
  },
  ConfigurationTarget: {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3,
  },
}));

import {
  configMigrationConstants,
  migrateLegacyConfiguration,
} from "./config-migration";

function context() {
  return {
    globalState: {
      get: (_key: string, fallback: boolean) => state.marker ?? fallback,
      update: async (key: string, value: unknown) => {
        state.markerUpdates.push([key, value]);
        state.marker = value === true;
      },
    },
  } as any;
}

function setInspect(
  namespace: string,
  scope: string,
  key: string,
  value: InspectRecord,
): void {
  const id = `${namespace}|${scope}`;
  const values = state.values.get(id) || new Map<string, InspectRecord>();
  values.set(key, value);
  state.values.set(id, values);
}

describe("legacy configuration migration", () => {
  beforeEach(() => {
    state.values.clear();
    state.updates.length = 0;
    state.markerUpdates.length = 0;
    state.marker = false;
  });

  it("copies explicit values at global, workspace, and folder scopes", async () => {
    setInspect("brotherwhale", "root", "defaultMode", {
      globalValue: "yolo",
      workspaceValue: "plan",
    });
    setInspect("brotherwhale", "/workspace-one", "reasoningEffort", {
      workspaceFolderValue: "max",
    });

    await migrateLegacyConfiguration(context());

    expect(state.updates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        namespace: "cblage.codewhale",
        key: "defaultMode",
        value: "yolo",
        target: 1,
      }),
      expect.objectContaining({
        namespace: "cblage.codewhale",
        key: "defaultMode",
        value: "plan",
        target: 2,
      }),
      expect.objectContaining({
        namespace: "cblage.codewhale",
        scope: "/workspace-one",
        key: "reasoningEffort",
        value: "max",
        target: 3,
      }),
    ]));
    expect(state.markerUpdates).toEqual([[
      configMigrationConstants.marker,
      true,
    ]]);
  });

  it("never overwrites an explicit setting in the cblage namespace", async () => {
    setInspect("brotherwhale", "root", "defaultMode", {
      globalValue: "yolo",
    });
    setInspect("cblage.codewhale", "root", "defaultMode", {
      globalValue: "agent",
    });

    await migrateLegacyConfiguration(context());

    expect(state.updates).toEqual([]);
  });

  it("is idempotent after its migration marker is set", async () => {
    state.marker = true;
    setInspect("brotherwhale", "root", "defaultMode", {
      globalValue: "yolo",
    });

    await migrateLegacyConfiguration(context());

    expect(state.updates).toEqual([]);
    expect(state.markerUpdates).toEqual([]);
  });
});
