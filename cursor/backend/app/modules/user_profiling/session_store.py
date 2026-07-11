import json
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings

PROFILING_SESSIONS_DIR = settings.data_dir / "profiling_sessions"


def _ensure_dir() -> None:
    PROFILING_SESSIONS_DIR.mkdir(parents=True, exist_ok=True)


def json_path(session_id: str) -> Path:
    return PROFILING_SESSIONS_DIR / f"{session_id}.json"


def load_answers(session_id: str) -> dict[str, str]:
    path = json_path(session_id)
    if not path.is_file():
        return {}
    raw = json.loads(path.read_text(encoding="utf-8"))
    return dict(raw.get("answers") or {})


def save_answer(session_id: str, question_id: str, answer: str) -> dict[str, str]:
    _ensure_dir()
    path = json_path(session_id)
    now = datetime.now(timezone.utc).isoformat()
    if path.is_file():
        payload = json.loads(path.read_text(encoding="utf-8"))
        payload.setdefault("created_at", now)
    else:
        payload = {"session_id": session_id, "answers": {}, "created_at": now}
    payload["answers"][question_id] = answer.strip()
    payload["updated_at"] = now
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload["answers"]
