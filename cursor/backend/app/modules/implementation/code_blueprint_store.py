import json
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings
from app.modules.implementation.schema import (
    CodeBlueprint,
    CodeNode,
    CodeSegment,
    CodeSegmentType,
)

BLUEPRINT_DIR = settings.data_dir / "code_blueprint"


def _ensure_dir() -> None:
    BLUEPRINT_DIR.mkdir(parents=True, exist_ok=True)


def json_path(session_id: str) -> Path:
    return BLUEPRINT_DIR / f"{session_id}.json"


def has_blueprint(session_id: str) -> bool:
    return json_path(session_id).is_file()


def clear_blueprint(session_id: str) -> None:
    path = json_path(session_id)
    if path.is_file():
        path.unlink()


def save_blueprint(blueprint: CodeBlueprint) -> Path:
    _ensure_dir()
    path = json_path(blueprint.session_id)
    now = datetime.now(timezone.utc).isoformat()
    payload = {
        **blueprint.model_dump(),
        "updated_at": now,
    }
    if path.is_file():
        existing = json.loads(path.read_text(encoding="utf-8"))
        payload["created_at"] = existing.get("created_at", now)
    else:
        payload["created_at"] = now
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def load_blueprint(session_id: str) -> CodeBlueprint | None:
    path = json_path(session_id)
    if not path.is_file():
        return None
    raw = json.loads(path.read_text(encoding="utf-8"))
    nodes: list[CodeNode] = []
    for item in raw.get("code_nodes") or []:
        segs: list[CodeSegment] = []
        for s in item.get("segments") or []:
            st = s.get("type", "prose")
            if st not in {t.value for t in CodeSegmentType}:
                st = "prose"
            segs.append(
                CodeSegment(
                    type=CodeSegmentType(st),
                    content=str(s.get("content") or ""),
                    language=str(s.get("language") or raw.get("language") or "python"),
                    label=str(s.get("label") or ""),
                )
            )
        nodes.append(
            CodeNode(
                id=str(item.get("id") or f"node_{len(nodes)+1}"),
                order=int(item.get("order") or len(nodes) + 1),
                title=str(item.get("title") or f"节点 {len(nodes)+1}"),
                related_sections=list(item.get("related_sections") or []),
                related_learning_node_ids=list(item.get("related_learning_node_ids") or []),
                segments=segs,
            )
        )
    nodes.sort(key=lambda n: n.order)
    return CodeBlueprint(
        session_id=session_id,
        project_name=str(raw.get("project_name") or ""),
        summary=str(raw.get("summary") or ""),
        language=str(raw.get("language") or "python"),
        code_nodes=nodes,
    )
