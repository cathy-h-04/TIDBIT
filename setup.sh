#!/bin/bash
# One-time setup for TIDBIT — creates the Python venv, installs deps,
# and generates the machine-local .mcp.json.
# Re-running is safe (idempotent).
set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$REPO_ROOT/bit_venv"
PYTHON=python3

echo "=== TIDBIT setup ==="

# ── Python version check ────────────────────────────────────────────────────
PY_VER=$("$PYTHON" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
PY_MAJOR=$(echo "$PY_VER" | cut -d. -f1)
PY_MINOR=$(echo "$PY_VER" | cut -d. -f2)
if [ "$PY_MAJOR" -lt 3 ] || { [ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -lt 10 ]; }; then
    echo "ERROR: Python 3.10+ required (found $PY_VER)."
    exit 1
fi
echo "→ Python $PY_VER OK"

# ── Venv ────────────────────────────────────────────────────────────────────
if [ ! -d "$VENV" ]; then
    echo "→ Creating venv at bit_venv/ ..."
    "$PYTHON" -m venv "$VENV"
fi

VENV_PY="$VENV/bin/python"
VENV_PIP="$VENV/bin/pip"

echo "→ Upgrading pip..."
"$VENV_PIP" install --quiet --upgrade pip

# ── mem0 (local editable install) ───────────────────────────────────────────
echo "→ Installing mem0 (editable)..."
"$VENV_PIP" install --quiet -e "$REPO_ROOT"

# ── Backend deps ─────────────────────────────────────────────────────────────
echo "→ Installing backend dependencies..."
"$VENV_PIP" install --quiet -r "$REPO_ROOT/requirements.txt"

# ── spaCy model ──────────────────────────────────────────────────────────────
if ! "$VENV_PY" -c "import en_core_web_sm" 2>/dev/null; then
    echo "→ Downloading spaCy model (en_core_web_sm)..."
    "$VENV_PY" -m spacy download en_core_web_sm
else
    echo "→ spaCy model already installed"
fi

# ── Generate .mcp.json ───────────────────────────────────────────────────────
MCP_SCRIPT="$REPO_ROOT/scripts/mcp_server.sh"
MCP_JSON="$REPO_ROOT/.mcp.json"
echo "→ Writing .mcp.json..."
cat > "$MCP_JSON" <<EOF
{
  "mcpServers": {
    "tidbit": {
      "type": "stdio",
      "command": "$MCP_SCRIPT",
      "args": [],
      "env": {
        "TIDBIT_BASE_URL": "http://localhost:8000"
      }
    }
  }
}
EOF

echo ""
echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "  1. Run: ./start.sh          (starts Docker/Qdrant/Ollama)"
echo "  2. Open this repo in VS Code and press F5 to launch the extension."
echo "  3. Restart Claude Code to pick up .mcp.json."
