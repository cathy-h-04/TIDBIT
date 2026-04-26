import sqlite3
import uuid
from datetime import datetime, timezone

CONFLICT_DB = "/tmp/tidbit_conflicts.db"

def _conn():
    c = sqlite3.connect(CONFLICT_DB)
    c.execute("""
        CREATE TABLE IF NOT EXISTS conflicts (
            conflict_id TEXT PRIMARY KEY,
            project_id  TEXT NOT NULL,
            memory_a_id TEXT NOT NULL,
            memory_b_id TEXT NOT NULL,
            similarity  REAL NOT NULL,
            resolved    INTEGER DEFAULT 0,
            created_at  TEXT NOT NULL
        )
    """)
    c.commit()
    return c

def flag_conflict(project_id: str, memory_a_id: str, memory_b_id: str, similarity: float) -> str:
    """Store a detected conflict. Returns the conflict_id."""
    db = _conn()
    # don't duplicate if already flagged
    existing = db.execute(
        "SELECT conflict_id FROM conflicts WHERE project_id=? AND "
        "((memory_a_id=? AND memory_b_id=?) OR (memory_a_id=? AND memory_b_id=?)) AND resolved=0",
        (project_id, memory_a_id, memory_b_id, memory_b_id, memory_a_id)
    ).fetchone()
    if existing:
        db.close()
        return existing[0]

    conflict_id = str(uuid.uuid4())
    db.execute(
        "INSERT INTO conflicts VALUES (?,?,?,?,?,0,?)",
        (conflict_id, project_id, memory_a_id, memory_b_id, similarity,
         datetime.now(timezone.utc).isoformat())
    )
    db.commit()
    db.close()
    return conflict_id

def get_conflicts(project_id: str) -> list[dict]:
    db = _conn()
    rows = db.execute(
        "SELECT conflict_id, memory_a_id, memory_b_id, similarity, created_at "
        "FROM conflicts WHERE project_id=? AND resolved=0",
        (project_id,)
    ).fetchall()
    db.close()
    return [
        {"conflict_id": r[0], "memory_a_id": r[1], "memory_b_id": r[2],
         "similarity": r[3], "created_at": r[4]}
        for r in rows
    ]

def resolve_conflict(conflict_id: str):
    db = _conn()
    db.execute("UPDATE conflicts SET resolved=1 WHERE conflict_id=?", (conflict_id,))
    db.commit()
    db.close()

def purge_conflicts_for_memory(project_id: str, memory_id: str):
    """Mark all unresolved conflicts involving memory_id as resolved."""
    db = _conn()
    db.execute(
        "UPDATE conflicts SET resolved=1 WHERE project_id=? AND resolved=0 "
        "AND (memory_a_id=? OR memory_b_id=?)",
        (project_id, memory_id, memory_id),
    )
    db.commit()
    db.close()

def conflicted_ids(project_id: str) -> set[str]:
    """Return set of all memory IDs currently in an unresolved conflict."""
    db = _conn()
    rows = db.execute(
        "SELECT memory_a_id, memory_b_id FROM conflicts WHERE project_id=? AND resolved=0",
        (project_id,)
    ).fetchall()
    db.close()
    ids = set()
    for a, b in rows:
        ids.add(a)
        ids.add(b)
    return ids

SIMILARITY_THRESHOLD = 0.50

def detect_conflicts(project_id: str, new_memory_id: str, new_memory_text: str,
                     existing_memories: list[dict]) -> list[str]:
    """
    Compare a new memory against existing ones.
    Flags pairs with very high similarity (likely duplicates or contradictions).
    Returns list of conflict_ids created.
    """
    created = []
    for mem in existing_memories:
        if mem["id"] == new_memory_id:
            continue
        score = mem.get("score", 0)
        if score >= SIMILARITY_THRESHOLD:
            cid = flag_conflict(project_id, new_memory_id, mem["id"], score)
            created.append(cid)
    return created
