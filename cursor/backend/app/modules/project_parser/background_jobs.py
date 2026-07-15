"""解析后的图谱 / 代码蓝图后台任务状态（进程内）。"""

from __future__ import annotations

import asyncio
import logging
from typing import Literal

logger = logging.getLogger(__name__)

JobState = Literal["idle", "pending", "ready", "failed"]

# session_id -> job kind -> state
_jobs: dict[str, dict[str, JobState]] = {}
_lock = asyncio.Lock()


def get_job_state(session_id: str, kind: str) -> JobState:
    return _jobs.get(session_id, {}).get(kind, "idle")


async def set_job_state(session_id: str, kind: str, state: JobState) -> None:
    async with _lock:
        _jobs.setdefault(session_id, {})[kind] = state


def set_job_state_sync(session_id: str, kind: str, state: JobState) -> None:
    _jobs.setdefault(session_id, {})[kind] = state


async def _run_graph(
    session_id: str,
    document,
    framework_context: str,
    *,
    force_regenerate: bool = False,
) -> None:
    from app.modules.knowledge_graph.service import knowledge_graph_service

    await set_job_state(session_id, "graph", "pending")
    try:
        await knowledge_graph_service.build_after_parse(
            session_id,
            document,
            framework_context,
            force_regenerate=force_regenerate,
        )
        await set_job_state(session_id, "graph", "ready")
    except Exception:
        logger.exception("background knowledge graph failed session=%s", session_id)
        await set_job_state(session_id, "graph", "failed")


async def _run_blueprint(
    session_id: str,
    document,
    framework_context: str,
    *,
    force_regenerate: bool = False,
) -> None:
    from app.modules.implementation.code_blueprint_extractor import (
        code_blueprint_extractor,
    )

    await set_job_state(session_id, "code_blueprint", "pending")
    try:
        await code_blueprint_extractor.build_after_parse(
            session_id,
            document,
            framework_context,
            force_regenerate=force_regenerate,
        )
        await set_job_state(session_id, "code_blueprint", "ready")
    except Exception:
        logger.exception("background code blueprint failed session=%s", session_id)
        await set_job_state(session_id, "code_blueprint", "failed")


def schedule_post_parse_jobs(session_id: str, document, framework_context: str) -> None:
    """新解析后强制重建图谱与代码蓝图（并行，不阻塞响应）。"""
    set_job_state_sync(session_id, "graph", "pending")
    set_job_state_sync(session_id, "code_blueprint", "pending")
    asyncio.create_task(
        _run_graph(session_id, document, framework_context, force_regenerate=True)
    )
    asyncio.create_task(
        _run_blueprint(session_id, document, framework_context, force_regenerate=True)
    )


def schedule_missing_post_parse_jobs(
    session_id: str,
    document,
    framework_context: str,
    *,
    need_graph: bool,
    need_blueprint: bool,
) -> None:
    """复用已有 framework 时，仅补齐缺失的图谱 / 代码蓝图（有则跳过）。"""
    if need_graph:
        set_job_state_sync(session_id, "graph", "pending")
        asyncio.create_task(
            _run_graph(session_id, document, framework_context, force_regenerate=False)
        )
    if need_blueprint:
        set_job_state_sync(session_id, "code_blueprint", "pending")
        asyncio.create_task(
            _run_blueprint(session_id, document, framework_context, force_regenerate=False)
        )
