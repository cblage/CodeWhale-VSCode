import * as vscode from "vscode";

const LEGACY_NAMESPACE = "brotherwhale";
const CURRENT_NAMESPACE = "cblage.codewhale";
const MIGRATION_MARKER = "cblage.codewhale.legacyConfigurationMigrated.v1";

const CONFIGURATION_KEYS = [
  "enginePath",
  "enginePort",
  "defaultModel",
  "defaultMode",
  "reasoningEffort",
  "autoStartEngine",
  "autoApprove",
  "showThreadList",
  "costCurrency",
  "goalObjective",
  "goalTokenBudget",
  "configProfile",
  "translationEnabled",
  "verbose",
] as const;

type InspectValueField = "globalValue" | "workspaceValue" | "workspaceFolderValue";

async function migrateScope(
  scope: vscode.ConfigurationScope | null,
  target: vscode.ConfigurationTarget,
  field: InspectValueField,
): Promise<void> {
  const legacy = vscode.workspace.getConfiguration(LEGACY_NAMESPACE, scope);
  const current = vscode.workspace.getConfiguration(CURRENT_NAMESPACE, scope);

  for (const key of CONFIGURATION_KEYS) {
    const legacyInspect = legacy.inspect<unknown>(key);
    const legacyValue = legacyInspect?.[field];
    if (legacyValue === undefined) continue;

    const currentValue = current.inspect<unknown>(key)?.[field];
    if (currentValue !== undefined) continue;

    await current.update(key, legacyValue, target);
  }
}

/** Copy explicit settings from the official extension namespace once.
 * Defaults are deliberately ignored and existing cblage values always win. */
export async function migrateLegacyConfiguration(
  context: vscode.ExtensionContext,
): Promise<void> {
  if (context.globalState.get<boolean>(MIGRATION_MARKER, false)) return;

  await migrateScope(null, vscode.ConfigurationTarget.Global, "globalValue");
  await migrateScope(null, vscode.ConfigurationTarget.Workspace, "workspaceValue");
  for (const folder of vscode.workspace.workspaceFolders || []) {
    await migrateScope(
      folder.uri,
      vscode.ConfigurationTarget.WorkspaceFolder,
      "workspaceFolderValue",
    );
  }

  await context.globalState.update(MIGRATION_MARKER, true);
}

export const configMigrationConstants = {
  legacyNamespace: LEGACY_NAMESPACE,
  currentNamespace: CURRENT_NAMESPACE,
  marker: MIGRATION_MARKER,
  keys: CONFIGURATION_KEYS,
} as const;
