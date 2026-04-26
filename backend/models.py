from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class Message(BaseModel):
    role: str
    content: str

class AddMemoryRequest(BaseModel):
    messages: list[Message]
    metadata: Optional[dict] = {}

class SearchRequest(BaseModel):
    query: str
    limit: int = 10

class UpdateMemoryRequest(BaseModel):
    memory: str

class ResolveConflictRequest(BaseModel):
    keep_id: str
    discard_id: str

class MemoryResponse(BaseModel):
    id: str
    memory: str
    metadata: Optional[dict] = {}
    score: Optional[float] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    is_conflicted: bool = False
    conflict_id: Optional[str] = None

class ConflictResponse(BaseModel):
    conflict_id: str
    memory_a: MemoryResponse
    memory_b: MemoryResponse
    similarity: float
    created_at: str

class ProjectInfo(BaseModel):
    project_id: str
    path: str
    memory_count: int
    conflict_count: int

class GraphNode(BaseModel):
    id: str
    memory: str
    created_at: Optional[str] = None
    is_conflicted: bool = False

class GraphEdge(BaseModel):
    source: str
    target: str
    entity: Optional[str] = None
    score: Optional[float] = None
    weight: Optional[float] = None

class GraphResponse(BaseModel):
    nodes: list[GraphNode]
    entity_edges: list[GraphEdge]
    semantic_edges: list[GraphEdge]
