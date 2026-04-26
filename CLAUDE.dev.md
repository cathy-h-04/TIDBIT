# TIDBIT — Claude Code Context

TIDBIT is a memory OS built on top of mem0. All TIDBIT-specific code lives in `backend/` and `extension/`; upstream mem0 code lives in `mem0/`. Repo: github.com/cathy-h-04/TIDBIT.

---

## Phase Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | mem0 + Ollama local stack, project-scoped memory, smoke tests | ✅ Complete |
| 2 | FastAPI backend (REST + WebSocket + conflict detection) | ✅ Complete |
| 3 | MCP server wrapping the FastAPI backend | ✅ Complete |
| 4 | VS Code extension (TypeScript, React webview) | ✅ Complete |
| 5 | Graph view with Sigma.js (4 tabs: force/timeline × entity/semantic) | ✅ Complete |
| 6 | Session approval flow (CLAUDE.user.md, mode.sh, start.sh, auto-launch) | ✅ Complete |
| 7 | Packaging + researcher onboarding | ✅ Complete |
| 8 | Query retrieval panel | Planned |
| 9 | Ruleset engine + polish | Planned |

---

## Stack

| Component | Choice | Notes |
|-----------|--------|-------|
| LLM (extraction) | Ollama — `qwen2.5:14b` | Local, zero API cost |
| Embeddings | Ollama — `nomic-embed-text` | **768 dims** — NOT 1536 |
| Vector store | Qdrant Docker server (port 6333) | Must run as server, not on-disk |
| Memory library | mem0 OSS (`mem0ai`) | v3 algorithm, ADD-only extraction |
| Backend | FastAPI + Python 3.12 | `backend/` package |
| Conflict store | SQLite at `/tmp/tidbit_conflicts.db` | |
| History DB | SQLite at `/tmp/tidbit_history.db` | mem0 internal |
| Env config | pydantic-settings, prefix `TIDBIT_` | See `backend/config.py` |
| Venv | `bit_venv/` | `source bit_venv/bin/activate` |

---

## Running Services

```bash
# Normal use — extension manages Ollama + backend automatically
docker compose up -d
# Then F5 in VS Code (extension/ workspace)

# Backend-only dev
docker compose up -d
source bit_venv/bin/activate && uvicorn backend.main:app --reload
python test_phase1.py
```

**WARNING:** Never run uvicorn manually while the extension is active — two processes against the same Qdrant collection triggers a migration lock that wipes data.

---

## Backend Layout

```
backend/
├── config.py        — pydantic-settings, mem0_config() builder
├── memory_store.py  — mem0 wrapper, per-project Memory instances; get_graph_data()
├── conflict.py      — SQLite conflict detection/resolution
├── models.py        — Pydantic request/response models (incl. GraphNode/GraphEdge/GraphResponse)
├── ws_manager.py    — WebSocket broadcast manager
├── main.py          — FastAPI app, all endpoints
└── mcp_server.py    — MCP stdio server, wraps FastAPI via httpx
```

---

## Key Architecture Decisions

**Project scoping:** Each project maps to a separate Qdrant collection (`tidbit_{md5(project_id)[:12]}`) AND uses `agent_id=project_id` + `user_id="tidbit_user"` as mem0 filters. Both are required — collection isolation handles storage, filters handle mem0's query layer. Search uses `filters={}`, not top-level `user_id` (mem0 v3 removed that param).

**Embeddings:** `nomic-embed-text` produces 768-dim vectors. Always set `embedding_model_dims: 768` in vector_store config. Qdrant dimension mismatch → delete volume and restart.

**Conflict threshold:** `SIMILARITY_THRESHOLD = 0.50` in `conflict.py`. nomic scores for genuine duplicates cluster ≥ 0.50; same-domain-but-unrelated memories cluster 0.28–0.45. Measured on real data; was 0.28 before, caused 100% false-positive rate.

**Project ID encoding:** Workspace paths contain slashes — `encodeURIComponent` isn't safe (WHATWG URL parser normalizes `%2F` back to `/`). Extension base64url-encodes IDs in `api.ts`; backend decodes with `_decode_pid()` in `main.py`. MCP server uses the same scheme.

**Webview API routing:** All API calls go through the extension host (Node.js) via `postMessage` — the webview never contacts the backend directly (CSP).

**BM25 warmup:** fastembed's `Qdrant/bm25` model is lazy-loaded and can take minutes on first use. `main.py` pre-loads it in a startup event. Model cached at `/var/folders/.../T/fastembed_cache`.

**Symlink resolution:** The extension symlinks into `~/.vscode/extensions/`. VS Code's webview server doesn't follow symlinks — always `fs.realpathSync()` before using `context.extensionUri.fsPath`.

---

## API Endpoints

All under `/projects/{project_id}/` — `project_id` is base64url-encoded workspace path.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/projects/{id}` | Project info (memory + conflict counts) |
| POST | `/projects/{id}/memories` | Add (runs conflict detection, broadcasts WS) |
| GET | `/projects/{id}/memories` | List all with conflict flags |
| GET | `/projects/{id}/memories/{mid}` | Get single |
| PUT | `/projects/{id}/memories/{mid}` | Update text |
| DELETE | `/projects/{id}/memories/{mid}` | Delete + purge orphan conflicts |
| GET | `/projects/{id}/memories/{mid}/history` | mem0 change history |
| POST | `/projects/{id}/search` | Hybrid search (vector + BM25 + entity boost), limit enforced |
| GET | `/projects/{id}/graph` | Graph data: nodes + entity edges + semantic edges (vectors from Qdrant, no Ollama call) |
| GET | `/projects/{id}/conflicts` | List unresolved |
| POST | `/projects/{id}/conflicts/{cid}/resolve` | Keep one, discard + purge other |
| WS | `/ws/{id}` | Live events: `memories_added`, `conflicts_detected`, `memory_updated`, `memory_deleted`, `conflict_resolved` |

---

## MCP Server (Phase 3)

`backend/mcp_server.py` — stdio FastMCP server, auto-discovered via `.mcp.json`. Tools: `add_memory`, `search_memories`, `get_context`. Restart Claude Code after changes to `.mcp.json` or `mcp_server.py`. Requires backend running first.

---

## Extension (Phases 4–5)

`extension/` — TypeScript + React webview. Build: `cd extension && npm run build` (or `npm run watch`), then F5.

**List view (Phase 4):** activity bar sidebar, auto-starts Ollama + uvicorn, memory list, search, delete, conflict indicators (orange dot), `tidbit.refresh`/`tidbit.search` commands, `tidbit.backendUrl` setting.

**Graph view (Phase 5):** top-level List/Graph tab switcher. Graph tab has 4 sub-tabs: Force·Entity, Force·Semantic, Timeline·Entity, Timeline·Semantic. Features: Sigma.js WebGL rendering, click node to expand full memory text, delete from detail panel, search bar highlights top result (gold) + up to 4 more (dim). Graph loads lazily on first tab switch; reloads after deletion.

Graph layout details:
- **Force layouts**: ForceAtlas2, 100 iterations. Nodes cluster by relationship strength.
- **Timeline layouts**: all nodes on a single horizontal axis (left=oldest, right=newest), small sine-wave y jitter to prevent overlap.
- **Entity edges**: memories sharing an extracted entity (spaCy NLP) are connected.
- **Semantic edges**: cosine similarity computed directly from Qdrant vectors — no Ollama call. Threshold: 0.45.

Webview graph deps: `sigma@2`, `graphology`, `graphology-layout-forceatlas2`.

Build outputs: `dist/extension.js` (CommonJS/Node 18) and `dist/webview.js` (IIFE/browser), both via esbuild.

---

## Hooks

PostToolUse hook auto-runs `test_phase1.py` after any `.py` edit. Configured in `.claude/settings.json`. Test 3 ("what Python version?") may fail non-deterministically — known and acceptable.

---

## Known Gotchas

1. **Qdrant volume**: Schema or dim change → `docker compose down -v && docker compose up -d`.
2. **mem0 migration lock**: Never two `Memory.from_config()` calls against the same on-disk Qdrant path.
3. **Extension owns uvicorn**: Don't run it manually while extension is active — migration lock wipes collection.
4. **Ollama models needed**: `qwen2.5:14b` and `nomic-embed-text`. Extension auto-starts Ollama if Homebrew-installed; Mac app users start manually.
5. **`pip install ollama`**: mem0's Ollama provider needs the Python package separately from the server binary.
6. **Pydantic v2**: `model_config = ConfigDict(...)`, not inner `class Config`.
7. **WebSocket project_id must be decoded**: `/ws/{project_id}` must call `_decode_pid()` — without it, `connect()` registers under the encoded key but `broadcast()` uses the decoded path; events are silently dropped.
8. **Orphan conflict cleanup**: Any code path that deletes a memory must call `purge_conflicts_for_memory(project_id, memory_id)` from `conflict.py` — otherwise `GET /conflicts` returns ghost records.
9. **mem0 hybrid search ignores limit**: `memory_store.search()` applies `[:limit]` after the mem0 call — don't remove it.
10. **BM25 cache**: Cleared temp dir (e.g. OS reinstall) → re-download on next startup (~30s). Warmup in `main.py` ensures this happens before requests are served.
11. **Symlink + webview**: `fs.realpathSync()` required on `context.extensionUri.fsPath` before any webview path construction.
12. **Git root**: `.git` is at `/Users/pzhang/Documents/TIDBIT/.git` — the repo root, not a subdirectory.
13. **Graph semantic edges use Qdrant scroll, not search**: `get_graph_data()` calls `m.vector_store.client.scroll(with_vectors=True)` to get all embeddings in one shot, then computes cosine similarity locally. Do NOT replace this with N mem0 `search()` calls — each search embeds via Ollama and is ~200ms; 20 memories = 4s+ latency.
14. **Uvicorn has no --reload in extension**: `server.ts` spawns uvicorn without `--reload`. After any backend Python change, kill the old process (`pkill -f "uvicorn backend.main:app"`) and F5 to reload the extension — it spawns a fresh uvicorn with the new code.

---

## Phase 7 — Packaging + Researcher Onboarding

All items complete:

1. **`.mcp.json` portability**: `scripts/mcp_server.sh` wraps the venv Python using a path resolved relative to the script itself. `setup.sh` generates a machine-local `.mcp.json` pointing at this wrapper. `.mcp.json` and `.tidbit_mode` are gitignored.
2. **Python environment setup**: `setup.sh` creates `bit_venv/`, installs `requirements.txt` + mem0 editable, and downloads the spaCy model.
3. **Extension packaged**: `extension/tidbit-0.1.0.vsix` — install with `code --install-extension extension/tidbit-0.1.0.vsix`. Rebuilt via `cd extension && npm run package`.
4. **First-run user mode**: `start.sh` checks for `.tidbit_mode`; on first run copies `CLAUDE.user.md` → `CLAUDE.md` and writes the sentinel file.
5. **Researcher README**: `README.user.md` — prerequisites, one-time setup, daily use, feature overview, troubleshooting.
