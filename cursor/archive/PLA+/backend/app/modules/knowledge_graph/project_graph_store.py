import json
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings
from app.modules.knowledge_graph.schema import ProjectKnowledgeGraph

GRAPH_DIR = settings.data_dir / "knowledge_graph"


def _ensure_dir() -> None:
    GRAPH_DIR.mkdir(parents=True, exist_ok=True)


def json_path(session_id: str) -> Path:
    return GRAPH_DIR / f"{session_id}.json"


def save_graph(graph: ProjectKnowledgeGraph) -> Path:
    _ensure_dir()
    path = json_path(graph.session_id)
    payload = {
        **graph.model_dump(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if not path.is_file():
        payload["created_at"] = payload["updated_at"]
    else:
        existing = json.loads(path.read_text(encoding="utf-8"))
        payload["created_at"] = existing.get("created_at", payload["updated_at"])
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def load_graph(session_id: str) -> ProjectKnowledgeGraph | None:
    path = json_path(session_id)
    if not path.is_file():
        return None
    raw = json.loads(path.read_text(encoding="utf-8"))
    raw.pop("created_at", None)
    raw.pop("updated_at", None)
    return ProjectKnowledgeGraph(**raw)


def has_graph(session_id: str) -> bool:
    return json_path(session_id).is_file()
