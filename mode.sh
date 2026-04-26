#!/bin/bash
# Switch CLAUDE.md between dev mode (building TIDBIT) and user mode (using TIDBIT).

MODE=${1:-}

case "$MODE" in
    dev)
        cp CLAUDE.dev.md CLAUDE.md
        echo "Dev mode active — CLAUDE.md is now the development context."
        ;;
    user)
        cp CLAUDE.user.md CLAUDE.md
        echo "User mode active — CLAUDE.md is now the memory assistant context."
        ;;
    *)
        echo "Usage: ./mode.sh [dev|user]"
        echo ""
        echo "  dev   — CLAUDE.md = development/build context (for working on TIDBIT)"
        echo "  user  — CLAUDE.md = memory assistant context (for researchers using TIDBIT)"
        exit 1
        ;;
esac
