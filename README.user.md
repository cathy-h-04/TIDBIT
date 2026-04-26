# TIDBIT — Researcher Setup Guide

TIDBIT is a persistent, project-scoped memory system for AI coding tools. It captures decisions, findings, and context across sessions so you never re-explain your research to Claude.

---

## Quickstart

```bash
# Prerequisites: Docker Desktop, Ollama, VS Code, Python 3.10+, Node 18+

git clone https://github.com/cathy-h-04/TIDBIT.git
cd TIDBIT
./setup.sh                                                  # create venv, install deps, write .mcp.json
code --install-extension extension/tidbit-0.1.0.vsix        # install VS Code extension
./start.sh                                                  # start Qdrant + Ollama + backend (pulls models on first run ~10 min)
# In VS Code: set "tidbit.repoPath" to the path where you cloned TIDBIT (e.g. /Users/you/TIDBIT)
# Then open your project folder — TIDBIT activates automatically.
# Restart Claude Code to pick up the MCP tools.
```

---

## Prerequisites

| Requirement | Install |
|-------------|---------|
| macOS (Apple Silicon or Intel) | — |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | Download + install |
| [Ollama](https://ollama.com) | `brew install ollama` or download from ollama.com |
| [VS Code](https://code.visualstudio.com) | Download + install |
| Python 3.10+ | `brew install python` or system Python |
| Node.js 18+ | `brew install node` |

---

## One-Time Setup (new machine)

```bash
# 1. Clone the repo
git clone https://github.com/cathy-h-04/TIDBIT.git
cd TIDBIT

# 2. Create the Python environment and install dependencies
./setup.sh

# 3. Install the VS Code extension
code --install-extension extension/tidbit-0.1.0.vsix

# 4. Start backend services (Docker/Qdrant + Ollama)
./start.sh
```

`setup.sh` creates `bit_venv/`, installs all Python dependencies, downloads the spaCy NLP model, and writes a machine-local `.mcp.json` for Claude Code.

`./start.sh` (on first run) also switches CLAUDE.md to user mode so Claude Code knows to act as a memory assistant rather than a TIDBIT developer.

> **Note on model downloads:** `start.sh` pulls `qwen2.5:14b` (~9 GB) and `nomic-embed-text` (~274 MB) from Ollama on first run. This can take several minutes on a slow connection.

---

## Daily Use

```bash
# Each time you open a session
./start.sh          # starts Docker/Qdrant + Ollama (fast after first run)
```

Then open your **project folder** (not the TIDBIT repo) in VS Code and press **F5** — or just open any VS Code window after the extension is installed; it activates automatically on startup.

The TIDBIT sidebar (brain icon in the activity bar) shows all memories for the current workspace.

---

## What TIDBIT Does

When Claude Code starts a session it calls `get_context` to load your project's memories and presents them:

> "Here's what I remember from previous sessions: ..."

You approve which memories to load, then work normally. During the session Claude automatically saves decisions, findings, and constraints using `add_memory`. On the next session those memories are surfaced again.

### Memory lifecycle

| Action | Trigger |
|--------|---------|
| **Load** | Session start (`get_context`) |
| **Save** | Automatically during session (`add_memory`) |
| **Search** | Before answering questions about prior work (`search_memories`) |
| **View / Delete** | TIDBIT sidebar in VS Code |

---

## Extension Features

- **Memories list** — all captured memories for the current workspace, with conflict indicators (orange dot = potential duplicate).
- **Search** — filter memories by keyword or semantic similarity.
- **Graph view** — visualize memory relationships by entity (shared named entities) or semantic similarity (vector cosine). Four layouts: Force·Entity, Force·Semantic, Timeline·Entity, Timeline·Semantic.
- **Conflict resolution** — when two memories conflict, TIDBIT prompts you to keep one.

---

## Troubleshooting

**"Cannot find bit_venv" or backend fails to start**
- In VS Code, open Settings (`Cmd+,`) → search "tidbit.repoPath" → set it to the full path where you cloned TIDBIT (e.g. `/Users/you/TIDBIT`), then reload the window.

**Backend won't start / extension shows "disconnected"**
- Make sure `./start.sh` ran without errors (it starts Qdrant, Ollama, and the backend)
- Make sure Docker Desktop is running: `docker ps`
- Make sure Ollama is running: `ollama list`

**"Qdrant dimension mismatch" error in backend logs**
- The vector store schema changed. Reset it: `docker compose down -v && docker compose up -d`

**Extension not visible in sidebar**
- Open the Command Palette (`Cmd+Shift+P`) → "TIDBIT: Refresh Memories"
- Or reinstall: `code --install-extension extension/tidbit-0.1.0.vsix`

**MCP tools not available in Claude Code**
- Restart Claude Code after running `./setup.sh` (it regenerates `.mcp.json`)
- Confirm the backend is running before starting Claude Code

---

## Switching Between Modes

If you are working *on* TIDBIT (not just using it):

```bash
./mode.sh dev    # CLAUDE.md = development context
./mode.sh user   # CLAUDE.md = memory assistant context (default for researchers)
```

---

## Directory Layout (what matters for users)

```
TIDBIT/
├── start.sh          — start services each session
├── setup.sh          — one-time environment setup
├── extension/
│   └── tidbit-0.1.0.vsix   — installable VS Code extension
└── .mcp.json         — generated by setup.sh; Claude Code reads this
```
