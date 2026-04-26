"""TIDBIT MCP server — stdio transport for Claude Code integration.

Wraps the running FastAPI backend (default: http://localhost:8000) via HTTP.
Registered in .mcp.json at the repo root; Claude Code auto-discovers it on startup.
"""

import base64
import json
import os
import httpx
from mcp.server.fastmcp import FastMCP

BASE_URL = os.environ.get("TIDBIT_BASE_URL", "http://localhost:8000")

mcp = FastMCP("tidbit")


def _client() -> httpx.Client:
    return httpx.Client(base_url=BASE_URL, timeout=60.0)


def _pid(project_id: str) -> str:
    """Base64url-encode a project_id so filesystem paths are URL-safe."""
    return base64.urlsafe_b64encode(project_id.encode()).decode().rstrip("=")


@mcp.tool(description=(
    "Add new information to TIDBIT memory for a project. "
    "Pass the conversation turn(s) as 'messages' — the LLM will extract "
    "and deduplicate facts automatically. Returns the stored memories."
))
def add_memory(
    project_id: str,
    messages: list[dict],
    metadata: dict = {},
) -> str:
    """
    Args:
        project_id: Workspace identifier (e.g. the repo path or project name).
        messages: List of {"role": "user"|"assistant", "content": "..."} dicts.
        metadata: Optional key/value tags to attach to the memories.
    """
    with _client() as c:
        resp = c.post(
            f"/projects/{_pid(project_id)}/memories",
            json={"messages": messages, "metadata": metadata},
        )
        resp.raise_for_status()
        return json.dumps(resp.json(), indent=2)


@mcp.tool(description=(
    "Search TIDBIT memories for a project using mem0's hybrid retrieval: "
    "vector similarity + BM25 keyword + entity boost, combined into a single ranked result. "
    "Returns the most relevant stored facts."
))
def search_memories(
    project_id: str,
    query: str,
    limit: int = 10,
) -> str:
    """
    Args:
        project_id: Workspace identifier.
        query: Natural-language query describing what you're looking for.
        limit: Maximum number of results to return (default 10).
    """
    with _client() as c:
        resp = c.post(
            f"/projects/{_pid(project_id)}/search",
            json={"query": query, "limit": limit},
        )
        resp.raise_for_status()
        return json.dumps(resp.json(), indent=2)


@mcp.tool(description=(
    "Retrieve all stored memories for a project to load full context. "
    "Use this at the start of a session to recall everything known about the project."
))
def get_context(
    project_id: str,
    limit: int = 50,
) -> str:
    """
    Args:
        project_id: Workspace identifier.
        limit: Cap on memories returned (default 50, most recent first).
    """
    with _client() as c:
        resp = c.get(f"/projects/{_pid(project_id)}/memories")
        resp.raise_for_status()
        memories = resp.json()
        return json.dumps(memories[:limit], indent=2)


if __name__ == "__main__":
    mcp.run()
