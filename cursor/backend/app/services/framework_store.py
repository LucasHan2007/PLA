import json
from datetime import datetime, timezone
from pathlib import Path

from app.schemas.ai_output import ProjectParseDocument
from app.services.prompt_builder import format_framework_context

_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
FRAMEWORKS_DIR = _BACKEND_DIR / "data" / "frameworks"


def _ensure_dir() -> None:
    FRAMEWORKS_DIR.mkdir(parents=True, exist_ok=True)


def framework_json_path(session_id: str) -> Path:
    return FRAMEWORKS_DIR / f"{session_id}.json"


def framework_md_path(session_id: str) -> Path:
    return FRAMEWORKS_DIR / f"{session_id}.md"


def save_framework(session_id: str, document: ProjectParseDocument) -> Path:
    """Persist the seven-section framework as backend reference files (JSON + Markdown)."""
    _ensure_dir()
    payload = {
        **document.model_dump(),
        "session_id": session_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    json_path = framework_json_path(session_id)
    json_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    md_lines = [
        f"# 项目解析体系：{document.project_name}",
        "",
        f"> {document.summary}",
        "",
    ]
    for section in document.sections:
        md_lines.extend([f"## {section.title}", "", section.content, ""])
    framework_md_path(session_id).write_text("\n".join(md_lines).strip() + "\n", encoding="utf-8")

    return json_path


def load_framework(session_id: str) -> ProjectParseDocument | None:
    path = framework_json_path(session_id)
    if not path.is_file():
        return None
    raw = json.loads(path.read_text(encoding="utf-8"))
    raw.pop("session_id", None)
    raw.pop("created_at", None)
    return ProjectParseDocument(**raw)


def get_framework_context(session_id: str) -> str:
    document = load_framework(session_id)
    if not document:
        return ""
    return format_framework_context(document.model_dump())


def has_framework(session_id: str) -> bool:
    return framework_json_path(session_id).is_file()
