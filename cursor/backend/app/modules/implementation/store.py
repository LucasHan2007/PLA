import json
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings
from app.modules.implementation.schema import (
    BehaviorEntry,
    CodeDraft,
    ImplementationPlan,
    ImplementationState,
)

IMPL_DIR = settings.data_dir / "implementation"


def _ensure_dir() -> None:
    IMPL_DIR.mkdir(parents=True, exist_ok=True)


def json_path(session_id: str) -> Path:
    return IMPL_DIR / f"{session_id}.json"


def load_state(session_id: str) -> ImplementationState:
    path = json_path(session_id)
    if not path.is_file():
        return ImplementationState(session_id=session_id)
    raw = json.loads(path.read_text(encoding="utf-8"))
    return ImplementationState(**raw)


def save_state(state: ImplementationState) -> Path:
    _ensure_dir()
    path = json_path(state.session_id)
    payload = {
        **state.model_dump(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if not path.is_file():
        payload["created_at"] = payload["updated_at"]
    else:
        existing = json.loads(path.read_text(encoding="utf-8"))
        payload["created_at"] = existing.get("created_at", payload["updated_at"])
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def save_plan(session_id: str, plan: ImplementationPlan) -> ImplementationState:
    state = load_state(session_id)
    state.plan = plan
    save_state(state)
    return state


def save_draft(session_id: str, draft: CodeDraft) -> ImplementationState:
    state = load_state(session_id)
    replaced = False
    for i, d in enumerate(state.drafts):
        if d.file_name == draft.file_name:
            state.drafts[i] = draft
            replaced = True
            break
    if not replaced:
        state.drafts.append(draft)
    save_state(state)
    return state


def append_behavior(session_id: str, entry: BehaviorEntry) -> None:
    state = load_state(session_id)
    state.behavior_log.append(entry)
    if len(state.behavior_log) > 50:
        state.behavior_log = state.behavior_log[-50:]
    save_state(state)


def has_plan(session_id: str) -> bool:
    state = load_state(session_id)
    return state.plan is not None
