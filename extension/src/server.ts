import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';

export class TidbitServer implements vscode.Disposable {
  readonly ready: Promise<void>;

  private proc: cp.ChildProcess | null = null;
  private readonly channel: vscode.OutputChannel;
  private _resolveReady!: () => void;
  private _rejectReady!: (err: Error) => void;
  private _resolved = false;

  constructor(private readonly repoRoot: string) {
    this.channel = vscode.window.createOutputChannel('TIDBIT Backend');
    this.ready = new Promise((res, rej) => {
      this._resolveReady = res;
      this._rejectReady = rej;
    });
  }

  start() {
    this._boot().catch((err) => {
      if (!this._resolved) {
        this._resolved = true;
        this._rejectReady(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  private async _boot() {
    await this._ensureOllama();
    this._startUvicorn();
  }

  private async _ensureOllama() {
    this.channel.appendLine('[TIDBIT] Checking Ollama…');
    if (await this._ollamaReady()) {
      this.channel.appendLine('[TIDBIT] Ollama is already running.');
      return;
    }

    this.channel.appendLine('[TIDBIT] Ollama not running — launching ollama serve…');
    cp.spawn('ollama', ['serve'], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}` },
    }).unref();

    // Wait up to 60 s for Ollama to come up
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      await delay(1000);
      if (await this._ollamaReady()) {
        this.channel.appendLine('[TIDBIT] Ollama is ready.');
        return;
      }
    }
    throw new Error('Ollama did not start within 60 seconds. Open the Ollama app and try again.');
  }

  private async _ollamaReady(): Promise<boolean> {
    try {
      const res = await fetch('http://localhost:11434/');
      return res.ok;
    } catch {
      return false;
    }
  }

  private _startUvicorn() {
    const uvicorn = path.join(this.repoRoot, 'bit_venv', 'bin', 'uvicorn');
    this.channel.appendLine(`[TIDBIT] Starting uvicorn: ${uvicorn}`);

    this.proc = cp.spawn(uvicorn, ['backend.main:app'], {
      cwd: this.repoRoot,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });

    this.proc.stdout?.on('data', (d: Buffer) => this.channel.append(d.toString()));

    this.proc.stderr?.on('data', (d: Buffer) => {
      const text = d.toString();
      this.channel.append(text);
      if (text.includes('Application startup complete') && !this._resolved) {
        this._resolved = true;
        this._resolveReady();
      }
    });

    this.proc.on('error', (err) => {
      this.channel.appendLine(`[TIDBIT] Failed to start uvicorn: ${err.message}`);
      if (!this._resolved) {
        this._resolved = true;
        this._rejectReady(new Error(`Failed to start backend: ${err.message}`));
      }
    });

    this.proc.on('exit', (code) => {
      this.channel.appendLine(`[TIDBIT] Backend exited (code ${code})`);
    });

    // Fallback: poll /docs in case we miss the log line
    this._pollUvicornReady();
  }

  private async _pollUvicornReady() {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      await delay(800);
      if (this._resolved) return;
      try {
        const res = await fetch('http://localhost:8000/docs');
        if (res.ok && !this._resolved) {
          this._resolved = true;
          this._resolveReady();
          return;
        }
      } catch {
        // still starting
      }
    }
    if (!this._resolved) {
      this._resolved = true;
      this._rejectReady(new Error('Backend did not start within 30 seconds.'));
    }
  }

  dispose() {
    if (this.proc) {
      this.channel.appendLine('[TIDBIT] Stopping backend…');
      this.proc.kill('SIGTERM');
      this.proc = null;
    }
    this.channel.dispose();
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
