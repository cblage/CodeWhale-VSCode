import * as vscode from "vscode";
import { DeepSeekEngine } from "./engine";
import { DeepSeekApiClient } from "./api-client";
import { ChatProvider } from "./chat-provider";
import { t } from "./i18n";

let engine: DeepSeekEngine;
let api: DeepSeekApiClient;
let chatProvider: ChatProvider;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel("DeepSeek");
  context.subscriptions.push(outputChannel);

  engine = new DeepSeekEngine(outputChannel, context);
  api = new DeepSeekApiClient(engine.baseUrl, engine.token ?? undefined);

  context.subscriptions.push(engine);

  chatProvider = new ChatProvider(context.extensionUri, engine, api);
  context.subscriptions.push(chatProvider);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatProvider.viewType,
      chatProvider
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("deepseek.openChat", () => {
      vscode.commands.executeCommand("workbench.view.extension.deepseek");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("deepseek.newThread", () => {
      chatProvider.handleNewThreadCommand();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("deepseek.compactContext", () => {
      chatProvider.handleCompactCommand();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("deepseek.restartEngine", async () => {
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

  outputChannel.appendLine("DeepSeek extension activated");
}

export function deactivate(): void {
  // cleanup handled by disposables
}
