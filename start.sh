#!/bin/bash
set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE_FILE="$REPO_ROOT/.tidbit_mode"

echo "Starting TIDBIT services..."

# ── First-run: switch to user mode ──────────────────────────────────────────
# CLAUDE.md defaults to the dev context (for working on TIDBIT).
# Researchers opening the repo for the first time should get user mode.
if [ ! -f "$MODE_FILE" ]; then
    echo "→ First run detected — applying user mode..."
    cp "$REPO_ROOT/CLAUDE.user.md" "$REPO_ROOT/CLAUDE.md"
    echo "user" > "$MODE_FILE"
    echo "  CLAUDE.md is now the memory-assistant context."
    echo "  (Run ./mode.sh dev to switch back to development mode.)"
fi

# ── Docker / Qdrant ─────────────────────────────────────────────────────────
if ! docker info > /dev/null 2>&1; then
    echo "→ Starting Docker Desktop..."
    open -a Docker
    echo "  Waiting for Docker to be ready..."
    until docker info > /dev/null 2>&1; do sleep 2; done
    echo "  Docker ready."
fi

echo "→ Starting Qdrant..."
docker compose up -d

# ── Ollama ──────────────────────────────────────────────────────────────────
if ! command -v ollama > /dev/null 2>&1; then
    echo ""
    echo "ERROR: Ollama not found. Install it first:"
    echo "  brew install ollama"
    echo "  or download from https://ollama.com"
    exit 1
fi

if ! pgrep -x ollama > /dev/null 2>&1; then
    echo "→ Starting Ollama..."
    ollama serve > /tmp/ollama.log 2>&1 &
    sleep 3
fi

# Pull required models if missing (first-time only, may take a few minutes)
for model in "qwen2.5:14b" "nomic-embed-text"; do
    if ! ollama list 2>/dev/null | grep -q "^${model}"; then
        echo "→ Pulling $model (first-time setup, may take several minutes)..."
        ollama pull "$model"
    fi
done

# ── Backend (uvicorn) ────────────────────────────────────────────────────────
UVICORN="$REPO_ROOT/bit_venv/bin/uvicorn"
if [ ! -x "$UVICORN" ]; then
    echo ""
    echo "ERROR: bit_venv not found. Run ./setup.sh first."
    exit 1
fi

if curl -sf http://localhost:8000/docs > /dev/null 2>&1; then
    echo "→ Backend already running."
else
    echo "→ Starting backend..."
    cd "$REPO_ROOT"
    "$UVICORN" backend.main:app > /tmp/tidbit_backend.log 2>&1 &
    echo "  Logs: /tmp/tidbit_backend.log"
fi

echo ""
echo "TIDBIT services ready."
echo "Open your project in VS Code — the extension connects automatically."
