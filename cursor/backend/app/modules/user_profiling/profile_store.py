import json
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings
from app.modules.user_profiling.schema import UserProfile

USER_PROFILES_DIR = settings.data_dir / "user_profiles"

LEVEL_LABELS = {
    "beginner": "初学者",
    "intermediate": "进阶",
    "advanced": "高级",
}


def _ensure_dir() -> None:
    USER_PROFILES_DIR.mkdir(parents=True, exist_ok=True)


def json_path(session_id: str) -> Path:
    return USER_PROFILES_DIR / f"{session_id}.json"


def md_path(session_id: str) -> Path:
    return USER_PROFILES_DIR / f"{session_id}.md"


def save_user_profile(
    session_id: str,
    profile: UserProfile,
    *,
    project_name: str = "",
) -> Path:
    _ensure_dir()
    now = datetime.now(timezone.utc).isoformat()
    payload = {
        **profile.model_dump(),
        "session_id": session_id,
        "project_name": project_name,
        "created_at": now,
    }
    path = json_path(session_id)
    if path.is_file():
        existing = json.loads(path.read_text(encoding="utf-8"))
        payload["created_at"] = existing.get("created_at", now)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    title = project_name or "本项目"
    md_lines = [
        f"# 用户画像：{title}",
        "",
        f"> {profile.summary}",
        "",
        f"## 水平",
        "",
        LEVEL_LABELS.get(profile.experience_level.value, profile.experience_level.value),
        "",
    ]
    if profile.project_understanding.strip():
        md_lines.extend(["## 项目理解", "", profile.project_understanding, ""])
    for heading, items in (
        ("已掌握", profile.prior_knowledge),
        ("待补强", profile.knowledge_gaps),
        ("学习偏好", profile.learning_preferences),
        ("学习目标", profile.learning_goals),
        ("顾虑与难点", profile.concerns),
    ):
        if items:
            md_lines.append(f"## {heading}")
            md_lines.append("")
            for item in items:
                md_lines.append(f"- {item}")
            md_lines.append("")
    md_path(session_id).write_text("\n".join(md_lines).strip() + "\n", encoding="utf-8")
    return path


def load_user_profile(session_id: str) -> UserProfile | None:
    path = json_path(session_id)
    if not path.is_file():
        return None
    raw = json.loads(path.read_text(encoding="utf-8"))
    for key in ("session_id", "created_at", "project_name"):
        raw.pop(key, None)
    return UserProfile(**raw)


def has_user_profile(session_id: str) -> bool:
    return json_path(session_id).is_file()


def get_profile_summary(session_id: str) -> str:
    profile = load_user_profile(session_id)
    return profile.summary if profile else ""
