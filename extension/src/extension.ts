import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { TidbitPanel } from './panel';
import { TidbitServer } from './server';

export function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration('tidbit');
  const configuredPath = config.get<string>('repoPath', '').trim();

  let repoRoot: string;
  if (configuredPath) {
    repoRoot = configuredPath;
  } else {
    // Dev / F5 workflow: extension folder is a symlink into the repo.
    const realExtPath = fs.realpathSync(context.extensionUri.fsPath);
    repoRoot = path.join(realExtPath, '..');
  }

  const uvicorn = path.join(repoRoot, 'bit_venv', 'bin', 'uvicorn');
  if (!fs.existsSync(uvicorn)) {
    vscode.window.showErrorMessage(
      `TIDBIT: Cannot find bit_venv at "${repoRoot}". ` +
      'Set "tidbit.repoPath" in VS Code settings to the TIDBIT repo path and reload.'
    );
    return;
  }

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
