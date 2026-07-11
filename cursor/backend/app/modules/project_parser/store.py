import json
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings
from app.modules.project_parser.prompts import format_framework_context
from app.modules.project_parser.schema import ProjectFramework

FRAMEWORKS_DIR = settings.data_dir / "frameworks"


def _ensure_dir() -> None:
    FRAMEWORKS_DIR.mkdir(parents=True, exist_ok=True)


def json_path(session_id: str) -> Path:
    return FRAMEWORKS_DIR / f"{session_id}.json"


def md_path(session_id: str) -> Path:
    return FRAMEWORKS_DIR / f"{session_id}.md"


def save_framework(session_id: str, document: ProjectFramework) -> Path:
    _ensure_dir()
    payload = {
        **document.model_dump(),
        "session_id": session_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    path = json_path(session_id)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    md_lines = [
        f"# 项目解析体系：{document.project_name}",
        "",
        f"> {document.summary}",
        "",
    ]
    for section in document.sections:
        md_lines.extend([f"## {section.title}", "", section.content, ""])
    md_path(session_id).write_text("\n".join(md_lines).strip() + "\n", encoding="utf-8")

    return path


def load_framework(session_id: str) -> ProjectFramework | None:
    path = json_path(session_id)
    if not path.is_file():
        return None
    raw = json.loads(path.read_text(encoding="utf-8"))
    raw.pop("session_id", None)
    raw.pop("created_at", None)
    return ProjectFramework(**raw)


def get_framework_context(session_id: str) -> str:
    document = load_framework(session_id)
    if not document:
        return ""
    return format_framework_context(document.model_dump())


def has_framework(session_id: str) -> bool:
    return json_path(session_id).is_file()
