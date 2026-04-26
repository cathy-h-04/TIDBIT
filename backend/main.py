import base64

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import memory_store as store
from .conflict import detect_conflicts, get_conflicts, resolve_conflict, conflicted_ids, purge_conflicts_for_memory
from .models import (
    AddMemoryRequest, SearchRequest, UpdateMemoryRequest,
    ResolveConflictRequest, MemoryResponse, ConflictResponse, ProjectInfo,
    GraphNode, GraphEdge, GraphResponse,
)
from .ws_manager import ws_manager

import asyncio
import logging

logger = logging.getLogger(__name__)

app = FastAPI(title="TIDBIT Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def _warmup_bm25():
    """Pre-load the fastembed BM25 model so the first search isn't slow."""
    def _load():
        try:
            from fastembed import SparseTextEmbedding
            enc = SparseTextEmbedding(model_name="Qdrant/bm25")
            list(enc.embed(["warmup"]))
            logger.info("BM25 encoder warmed up.")
        except Exception as e:
            logger.warning(f"BM25 warmup failed (search will still work): {e}")
    await asyncio.get_event_loop().run_in_executor(None, _load)

# ── helpers ───────────────────────────────────────────────────────────────────

def _decode_pid(encoded: str) -> str:
    """Decode a base64url project_id sent by the VS Code extension."""
    encoded += '=' * (-len(encoded) % 4)
    return base64.urlsafe_b64decode(encoded).decode()

def _enrich(memories: list[dict], project_id: str) -> list[MemoryResponse]:
    """Attach conflict metadata to memory dicts before returning."""
    all_conflicts = get_conflicts(project_id)
    flagged = {mid for c in all_conflicts for mid in (c["memory_a_id"], c["memory_b_id"])}
    conflicts = {c["memory_a_id"]: c["conflict_id"] for c in all_conflicts} | {
        c["memory_b_id"]: c["conflict_id"] for c in all_conflicts
    }
    result = []
    for m in memories:
        mid = m.get("id", "")
        result.append(MemoryResponse(
            id=mid,
            memory=m.get("memory", ""),
            metadata=m.get("metadata", {}),
            score=m.get("score"),
            created_at=m.get("created_at"),
            updated_at=m.get("updated_at"),
            is_conflicted=mid in flagged,
            conflict_id=conflicts.get(mid),
        ))
    return result

# ── project info ──────────────────────────────────────────────────────────────

@app.get("/projects/{project_id}", response_model=ProjectInfo)
def project_info(project_id: str):
    project_id = _decode_pid(project_id)
    memories = store.get_all(project_id)
    conflicts = get_conflicts(project_id)
    return ProjectInfo(
        project_id=project_id,
        path=project_id,
        memory_count=len(memories),
        conflict_count=len(conflicts),
    )

# ── memories ──────────────────────────────────────────────────────────────────

@app.post("/projects/{project_id}/memories", response_model=list[MemoryResponse])
async def add_memories(project_id: str, req: AddMemoryRequest):
    project_id = _decode_pid(project_id)
    messages = [m.model_dump() for m in req.messages]
    added = store.add(project_id, messages, req.metadata or {})

    new_conflicts = []
    for mem in added:
        nearby = store.search(project_id, mem["memory"], limit=5)
        cids = detect_conflicts(project_id, mem["id"], mem["memory"], nearby)
        new_conflicts.extend(cids)

    if new_conflicts:
        await ws_manager.broadcast(project_id, "conflicts_detected", {
            "conflict_ids": new_conflicts
        })

    await ws_manager.broadcast(project_id, "memories_added", {
        "count": len(added),
        "memories": [m["memory"] for m in added]
    })

    return _enrich(added, project_id)

@app.get("/projects/{project_id}/memories", response_model=list[MemoryResponse])
def list_memories(project_id: str):
    project_id = _decode_pid(project_id)
    memories = store.get_all(project_id)
    return _enrich(memories, project_id)

@app.get("/projects/{project_id}/memories/{memory_id}", response_model=MemoryResponse)
def get_memory(project_id: str, memory_id: str):
    project_id = _decode_pid(project_id)
    mem = store.get_one(project_id, memory_id)
    if not mem:
        raise HTTPException(status_code=404, detail="Memory not found")
    return _enrich([mem], project_id)[0]

@app.put("/projects/{project_id}/memories/{memory_id}", response_model=MemoryResponse)
async def update_memory(project_id: str, memory_id: str, req: UpdateMemoryRequest):
    project_id = _decode_pid(project_id)
    store.update(project_id, memory_id, req.memory)
    updated = store.get_one(project_id, memory_id)
    await ws_manager.broadcast(project_id, "memory_updated", {"memory_id": memory_id})
    return _enrich([updated], project_id)[0]

@app.delete("/projects/{project_id}/memories/{memory_id}")
async def delete_memory(project_id: str, memory_id: str):
    project_id = _decode_pid(project_id)
    store.delete(project_id, memory_id)
    purge_conflicts_for_memory(project_id, memory_id)
    await ws_manager.broadcast(project_id, "memory_deleted", {"memory_id": memory_id})
    return {"deleted": memory_id}

@app.get("/projects/{project_id}/memories/{memory_id}/history")
def memory_history(project_id: str, memory_id: str):
    project_id = _decode_pid(project_id)
    return store.history(project_id, memory_id)

# ── search ────────────────────────────────────────────────────────────────────

@app.post("/projects/{project_id}/search", response_model=list[MemoryResponse])
def search_memories(project_id: str, req: SearchRequest):
    project_id = _decode_pid(project_id)
    results = store.search(project_id, req.query, req.limit)
    return _enrich(results, project_id)

# ── conflicts ─────────────────────────────────────────────────────────────────

@app.get("/projects/{project_id}/conflicts")
def list_conflicts(project_id: str):
    project_id = _decode_pid(project_id)
    return get_conflicts(project_id)

@app.post("/projects/{project_id}/conflicts/{conflict_id}/resolve")
async def resolve(project_id: str, conflict_id: str, req: ResolveConflictRequest):
    project_id = _decode_pid(project_id)
    store.delete(project_id, req.discard_id)
    purge_conflicts_for_memory(project_id, req.discard_id)
    await ws_manager.broadcast(project_id, "conflict_resolved", {
        "conflict_id": conflict_id,
        "kept": req.keep_id,
        "discarded": req.discard_id,
    })
    return {"resolved": conflict_id}

# ── graph ─────────────────────────────────────────────────────────────────────

@app.get("/projects/{project_id}/graph", response_model=GraphResponse)
async def get_graph(project_id: str):
    project_id = _decode_pid(project_id)

    def _build():
        data = store.get_graph_data(project_id)
        all_conflicts = get_conflicts(project_id)
        conflicted = {mid for c in all_conflicts for mid in (c["memory_a_id"], c["memory_b_id"])}
        nodes = [
            GraphNode(
                id=m.get("id", ""),
                memory=m.get("memory", ""),
                created_at=m.get("created_at"),
                is_conflicted=m.get("id", "") in conflicted,
            )
            for m in data["nodes"]
        ]
        return GraphResponse(
            nodes=nodes,
            entity_edges=[GraphEdge(**e) for e in data["entity_edges"]],
            semantic_edges=[GraphEdge(**e) for e in data["semantic_edges"]],
        )

    return await asyncio.get_event_loop().run_in_executor(None, _build)

# ── websocket ─────────────────────────────────────────────────────────────────

@app.websocket("/ws/{project_id}")
async def websocket_endpoint(project_id: str, ws: WebSocket):
    project_id = _decode_pid(project_id)
    await ws_manager.connect(project_id, ws)
    try:
        while True:
            await ws.receive_text()  # keep connection alive
    except WebSocketDisconnect:
        ws_manager.disconnect(project_id, ws)
