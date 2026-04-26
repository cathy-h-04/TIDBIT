import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getMemories, searchMemories, deleteMemory, getConflicts, getGraph, GraphData } from './api';

type IncomingMessage =
  | { type: 'ready' }
  | { type: 'refresh' }
  | { type: 'delete'; id: string }
  | { type: 'search'; query: string }
  | { type: 'loadGraph' }
  | { type: 'graphSearch'; query: string };

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export class TidbitPanel implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _backendReady: Promise<void>,
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'dist')],
    };

    webviewView.webview.html = this._getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (msg: IncomingMessage) => {
      switch (msg.type) {
        case 'ready':
        case 'refresh':
          await this._loadMemories();
          break;
        case 'delete':
          await this._handleDelete(msg.id);
          break;
        case 'search':
          await this._handleSearch(msg.query);
          break;
        case 'loadGraph':
          await this._loadGraph();
          break;
        case 'graphSearch':
          await this._handleGraphSearch(msg.query);
          break;
      }
    });
  }

  refresh() {
    this._loadMemories();
  }

  search(query: string) {
    this._view?.webview.postMessage({ type: 'searchStart', query });
    this._handleSearch(query);
  }

  private _projectId(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  private async _loadMemories() {
    if (!this._view) return;
    const projectId = this._projectId();

    if (!projectId) {
      this._view.webview.postMessage({ type: 'error', message: 'No workspace folder open.' });
      return;
    }

    this._view.webview.postMessage({ type: 'loading', text: 'Starting TIDBIT backend…' });
    try {
      await this._backendReady;
      this._view?.webview.postMessage({ type: 'loading', text: 'Loading memories…' });
      const [memories, conflicts] = await Promise.all([
        getMemories(projectId),
        getConflicts(projectId),
      ]);
      const conflictIds = new Set(conflicts.flatMap((c) => [c.memory_id_1, c.memory_id_2]));
      const enriched = memories.map((m) => ({ ...m, has_conflict: conflictIds.has(m.id) }));
      this._view.webview.postMessage({ type: 'memories', memories: enriched });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._view.webview.postMessage({ type: 'error', message: msg });
    }
  }

  private async _handleSearch(query: string) {
    if (!this._view) return;
    const projectId = this._projectId();
    if (!projectId) return;

    this._view.webview.postMessage({ type: 'loading' });
    try {
      const results = await searchMemories(projectId, query);
      this._view.webview.postMessage({ type: 'memories', memories: results, searchQuery: query });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._view.webview.postMessage({ type: 'error', message: msg });
    }
  }

  private async _loadGraph() {
    if (!this._view) return;
    const projectId = this._projectId();
    if (!projectId) return;

    this._view.webview.postMessage({ type: 'graphLoading' });
    try {
      await this._backendReady;
      const data = await getGraph(projectId);
      this._view.webview.postMessage({ type: 'graph', data });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._view.webview.postMessage({ type: 'error', message: msg });
    }
  }

  private async _handleGraphSearch(query: string) {
    if (!this._view) return;
    const projectId = this._projectId();
    if (!projectId) return;
    try {
      const results = await searchMemories(projectId, query);
      this._view.webview.postMessage({ type: 'graphSearchResults', results });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._view.webview.postMessage({ type: 'error', message: msg });
    }
  }

  private async _handleDelete(memoryId: string) {
    const projectId = this._projectId();
    if (!projectId) return;
    try {
      await deleteMemory(projectId, memoryId);
      await this._loadMemories();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`TIDBIT: Failed to delete memory — ${msg}`);
    }
  }

  private _getHtml(webview: vscode.Webview): string {
    // Resolve symlink so VS Code's webview file server can actually read the file.
    const realExtPath = fs.realpathSync(this._extensionUri.fsPath);
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(realExtPath, 'dist', 'webview.js'))
    );
    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(path.join(realExtPath, 'dist'))],
    };
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>TIDBIT</title>
</head>
<body style="padding:0;margin:0;">
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
