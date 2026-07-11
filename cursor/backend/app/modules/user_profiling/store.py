from app.modules.user_profiling.nodes_store import (
    get_current_node,
    has_learning_nodes,
    json_path as nodes_json_path,
    load_learning_nodes,
    save_learning_nodes,
)
from app.modules.user_profiling.profile_store import (
    get_profile_summary,
    has_user_profile,
    json_path as profile_json_path,
    load_user_profile,
    save_user_profile,
)
from app.modules.user_profiling.schema import LearningNode, UserProfile
from app.modules.user_profiling.session_store import json_path as session_json_path
from app.modules.user_profiling.session_store import load_answers, save_answer


def get_profile(session_id: str) -> UserProfile | None:
    return load_user_profile(session_id)


def has_profile(session_id: str) -> bool:
    return has_user_profile(session_id)


def has_nodes(session_id: str) -> bool:
    return has_learning_nodes(session_id)


def save_profile_and_nodes(
    session_id: str,
    profile: UserProfile,
    nodes: list[LearningNode],
    *,
    project_name: str = "",
) -> None:
    save_user_profile(session_id, profile, project_name=project_name)
    save_learning_nodes(session_id, nodes, project_name=project_name)


def clear_profiling_reference_files(session_id: str) -> None:
    """清除画像/节点参考文件及宏观问答进度（模板项目重新解析时）。"""
    for path in (session_json_path(session_id), profile_json_path(session_id), nodes_json_path(session_id)):
        if path.is_file():
            path.unlink()
    from app.modules.user_profiling.nodes_store import md_path as nodes_md_path
    from app.modules.user_profiling.profile_store import md_path as profile_md_path

    for path in (profile_md_path(session_id), nodes_md_path(session_id)):
        if path.is_file():
            path.unlink()
