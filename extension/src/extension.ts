import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { TidbitPanel } from './panel';
import { TidbitServer } from './server';

export function activate(context: vscode.ExtensionContext) {
  // Resolve the symlink so that '../' points to the repo root, not ~/.vscode/extensions/.
  const realExtPath = fs.realpathSync(context.extensionUri.fsPath);
  const repoRoot = path.join(realExtPath, '..');

  const server = new TidbitServer(repoRoot);
  server.start();
  context.subscriptions.push(server);

  const provider = new TidbitPanel(context.extensionUri, server.ready);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('tidbit.memories', provider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('tidbit.refresh', () => provider.refresh())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('tidbit.search', async () => {
      const query = await vscode.window.showInputBox({
        prompt: 'Search project memories',
        placeHolder: 'e.g. authentication, database schema…',
      });
      if (query !== undefined) {
        provider.search(query);
      }
    })
  );
}

export function deactivate() {}
