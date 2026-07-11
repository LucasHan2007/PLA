"""预设示例项目的稳定 session 与解析文件覆盖。"""

from app.modules.implementation.store import json_path as implementation_json_path
from app.modules.user_profiling.store import clear_profiling_reference_files

# 与 frontend/src/data/projectTemplates.ts 的 id 保持一致
KNOWN_TEMPLATE_IDS: frozenset[str] = frozenset({"mnist", "lung-seg", "todo"})

TEMPLATE_SESSION_PREFIX = "template-"


def is_known_template(template_id: str | None) -> bool:
    return bool(template_id and template_id.strip() in KNOWN_TEMPLATE_IDS)


def template_session_id(template_id: str) -> str:
    tid = template_id.strip()
    if tid not in KNOWN_TEMPLATE_IDS:
        raise ValueError(f"未知示例项目：{tid}")
    return f"{TEMPLATE_SESSION_PREFIX}{tid}"


def clear_derived_session_data(session_id: str) -> None:
    """模板项目重新「开始学习」时，清除与旧解析绑定的画像/节点/实现数据。"""
    clear_profiling_reference_files(session_id)
    impl_path = implementation_json_path(session_id)
    if impl_path.is_file():
        impl_path.unlink()
