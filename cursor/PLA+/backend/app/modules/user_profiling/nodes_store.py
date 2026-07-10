import json
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings
from app.modules.user_profiling.schema import LearningNode, NodeStatus

LEARNING_NODES_DIR = settings.data_dir / "learning_nodes"

STATUS_LABELS = {
    NodeStatus.not_started: "未开始",
    NodeStatus.in_progress: "进行中",
    NodeStatus.completed: "已完成",
}


def _ensure_dir() -> None:
    LEARNING_NODES_DIR.mkdir(parents=True, exist_ok=True)


def json_path(session_id: str) -> Path:
    return LEARNING_NODES_DIR / f"{session_id}.json"


def md_path(session_id: str) -> Path:
    return LEARNING_NODES_DIR / f"{session_id}.md"


def save_learning_nodes(
    session_id: str,
    nodes: list[LearningNode],
    *,
    project_name: str = "",
) -> Path:
    _ensure_dir()
    now = datetime.now(timezone.utc).isoformat()
    payload = {
        "session_id": session_id,
        "project_name": project_name,
        "node_count": len(nodes),
        "nodes": [n.model_dump() for n in nodes],
        "created_at": now,
    }
    path = json_path(session_id)
    if path.is_file():
        existing = json.loads(path.read_text(encoding="utf-8"))
        payload["created_at"] = existing.get("created_at", now)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    title = project_name or "本项目"
    md_lines = [f"# 学习节点序列：{title}", ""]
    for node in sorted(nodes, key=lambda n: n.order):
        status = STATUS_LABELS.get(node.status, node.status.value)
        md_lines.extend([
            f"## {node.order}. {node.title}（{status}）",
            "",
            f"**目标**：{node.summary}",
            "",
            f"**引导问题**：{node.guiding_question}",
            "",
        ])
        if node.focus_skills:
            md_lines.append(f"**技能**：{'、'.join(node.focus_skills)}")
            md_lines.append("")
        if node.related_sections:
            md_lines.append(f"**关联解析段**：{'、'.join(node.related_sections)}")
            md_lines.append("")
    md_path(session_id).write_text("\n".join(md_lines).strip() + "\n", encoding="utf-8")
    return path


def load_learning_nodes(session_id: str) -> list[LearningNode]:
    path = json_path(session_id)
    if not path.is_file():
        return []
    raw = json.loads(path.read_text(encoding="utf-8"))
    nodes: list[LearningNode] = []
    for item in raw.get("nodes") or []:
        status = item.get("status", "not_started")
        if status not in {s.value for s in NodeStatus}:
            status = "not_started"
        nodes.append(
            LearningNode(
                id=str(item.get("id", f"node_{len(nodes) + 1}")),
                order=int(item.get("order", len(nodes) + 1)),
                title=str(item.get("title", "")),
                summary=str(item.get("summary", "")),
                guiding_question=str(item.get("guiding_question", "")),
                focus_skills=list(item.get("focus_skills") or []),
                related_sections=list(item.get("related_sections") or []),
                status=NodeStatus(status),
            )
        )
    nodes.sort(key=lambda n: n.order)
    return nodes


def has_learning_nodes(session_id: str) -> bool:
    return json_path(session_id).is_file() and len(load_learning_nodes(session_id)) > 0


def get_current_node(session_id: str, node_id: str | None = None) -> LearningNode | None:
    nodes = load_learning_nodes(session_id)
    if not nodes:
        return None
    if node_id:
        return next((n for n in nodes if n.id == node_id), None)
    for node in nodes:
        if node.status == NodeStatus.in_progress:
            return node
    return nodes[0]
