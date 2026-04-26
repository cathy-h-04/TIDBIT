import hashlib
from mem0 import Memory
from .config import mem0_config

# one Memory instance per project collection, cached in process
_instances: dict[str, Memory] = {}

def _project_collection(project_id: str) -> str:
    """Stable 12-char hex slug for use as a Qdrant collection name."""
    return "tidbit_" + hashlib.md5(project_id.encode()).hexdigest()[:12]

def get_memory(project_id: str) -> Memory:
    if project_id not in _instances:
        collection = _project_collection(project_id)
        _instances[project_id] = Memory.from_config(mem0_config(collection))
    return _instances[project_id]

USER_ID = "tidbit_user"

def add(project_id: str, messages: list[dict], metadata: dict) -> list[dict]:
    m = get_memory(project_id)
    result = m.add(messages, user_id=USER_ID, agent_id=project_id, metadata=metadata)
    return result.get("results", [])

def search(project_id: str, query: str, limit: int = 10) -> list[dict]:
    m = get_memory(project_id)
    result = m.search(
        query,
        filters={"user_id": USER_ID, "agent_id": project_id},
        limit=limit
    )
    return result.get("results", [])[:limit]

def get_all(project_id: str) -> list[dict]:
    m = get_memory(project_id)
    result = m.get_all(filters={"user_id": USER_ID, "agent_id": project_id})
    return result.get("results", [])

def get_one(project_id: str, memory_id: str) -> dict | None:
    m = get_memory(project_id)
    return m.get(memory_id)

def update(project_id: str, memory_id: str, new_text: str) -> dict:
    m = get_memory(project_id)
    return m.update(memory_id, new_text)

def delete(project_id: str, memory_id: str):
    m = get_memory(project_id)
    m.delete(memory_id)

def history(project_id: str, memory_id: str) -> list[dict]:
    m = get_memory(project_id)
    return m.history(memory_id)

def get_graph_data(project_id: str) -> dict:
    from mem0.utils.entity_extraction import extract_entities

    memories = get_all(project_id)

    # Entity edges: memories sharing an extracted entity
    entity_map: dict[str, list[str]] = {}
    for mem in memories:
        try:
            entities = extract_entities(mem.get("memory", ""))
        except Exception:
            entities = []
        for entity_text, _entity_type in entities:
            key = entity_text.lower().strip()
            if not key:
                continue
            if key not in entity_map:
                entity_map[key] = []
            if mem["id"] not in entity_map[key]:
                entity_map[key].append(mem["id"])

    entity_edges: list[dict] = []
    seen_entity: set[tuple] = set()
    for entity_text, mem_ids in entity_map.items():
        if len(mem_ids) < 2:
            continue
        for i in range(len(mem_ids)):
            for j in range(i + 1, len(mem_ids)):
                pair = tuple(sorted([mem_ids[i], mem_ids[j]]))
                if pair not in seen_entity:
                    seen_entity.add(pair)
                    entity_edges.append({
                        "source": pair[0],
                        "target": pair[1],
                        "entity": entity_text,
                        "weight": 1.0,
                    })

    # Semantic edges: pull vectors directly from Qdrant (no Ollama calls)
    import numpy as np
    THRESHOLD = 0.45
    semantic_edges: list[dict] = []
    try:
        m = get_memory(project_id)
        collection = _project_collection(project_id)
        points, _ = m.vector_store.client.scroll(
            collection_name=collection,
            with_vectors=True,
            with_payload=False,
            limit=1000,
        )
        id_to_vec = {
            str(p.id): np.array(p.vector, dtype=np.float32)
            for p in points if p.vector
        }
        ids = list(id_to_vec.keys())
        seen_semantic: set[tuple] = set()
        for i in range(len(ids)):
            vi = id_to_vec[ids[i]]
            ni = float(np.linalg.norm(vi))
            if ni == 0:
                continue
            for j in range(i + 1, len(ids)):
                vj = id_to_vec[ids[j]]
                nj = float(np.linalg.norm(vj))
                if nj == 0:
                    continue
                sim = float(np.dot(vi, vj) / (ni * nj))
                if sim >= THRESHOLD:
                    pair = tuple(sorted([ids[i], ids[j]]))
                    if pair not in seen_semantic:
                        seen_semantic.add(pair)
                        semantic_edges.append({
                            "source": pair[0],
                            "target": pair[1],
                            "score": sim,
                        })
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Semantic edge computation failed: {e}")
        semantic_edges = []

    return {
        "nodes": memories,
        "entity_edges": entity_edges,
        "semantic_edges": semantic_edges,
    }
