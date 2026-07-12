import * as vscode from "vscode";
import { CodeWhaleEngine } from "./api/engine";
import { CodeWhaleApiClient } from "./api/api-client";
import { ChatProvider } from "./chat-provider";
import { t } from "./i18n";
import { migrateLegacyConfiguration } from "./utils/config-migration";

let engine: CodeWhaleEngine;
let api: CodeWhaleApiClient;
let chatProvider: ChatProvider;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel("CodeWhale");
  context.subscriptions.push(outputChannel);

  try {
    await migrateLegacyConfiguration(context);
  } catch (err) {
    outputChannel.appendLine(
      `Legacy configuration migration failed: ${(err as Error).message}`
    );
  }

  engine = new CodeWhaleEngine(outputChannel, context);
  api = new CodeWhaleApiClient(engine.baseUrl, engine.token ?? undefined);

  context.subscriptions.push(engine);

  chatProvider = new ChatProvider(context.extensionUri, engine, api, context.workspaceState);
  context.subscriptions.push(chatProvider);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("cblage.codewhale.showAgentToolCards")) {
        chatProvider.notifyDisplaySettingsChanged();
      }
      if (
        event.affectsConfiguration("cblage.codewhale.autoWakeMasterForAgents")
        || event.affectsConfiguration("cblage.codewhale.agentWakeIntervalSeconds")
      ) {
        chatProvider.notifyAgentWatchdogSettingsChanged();
      }
    })
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatProvider.viewType,
      chatProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }
    )
  );

  const openChat = async (): Promise<void> => {
    await vscode.commands.executeCommand("workbench.view.extension.cblage-codewhale");
    await vscode.commands.executeCommand("cblage.codewhale.chat.focus");
  };
  context.subscriptions.push(
    vscode.commands.registerCommand("cblage.codewhale.openChat", openChat)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cblage.codewhale.newThread", () => {
      chatProvider.handleNewThreadCommand();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cblage.codewhale.compactContext", () => {
      chatProvider.handleCompactCommand();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cblage.codewhale.restartEngine", async () => {
      try {
        await engine.restart();
        api.setBaseUrl(engine.baseUrl);
        api.setToken(engine.token);
        vscode.window.showInformationMessage(t().engineRestarted);
      } catch (err) {
        vscode.window.showErrorMessage(
          `Failed to restart engine: ${(err as Error).message}`
        );
      }
    })
  );

  outputChannel.appendLine("CodeWhale extension activated");
}

export function deactivate(): void {
  // cleanup handled by disposables
}
