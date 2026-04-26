#!/bin/bash
# Wrapper so .mcp.json can reference a repo-relative path instead of an
# absolute venv path that breaks on every other machine.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VENV_PYTHON="$REPO_ROOT/bit_venv/bin/python"

if [ ! -x "$VENV_PYTHON" ]; then
    echo "ERROR: venv not found at $VENV_PYTHON" >&2
    echo "Run ./setup.sh first to create the Python environment." >&2
    exit 1
fi

exec "$VENV_PYTHON" -m backend.mcp_server "$@"
