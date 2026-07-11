import json

from app.config import settings
from app.core.json_utils import extract_json_from_text
from app.core.llm_client import llm_client
from app.modules.user_profiling.prompts import build_demo_nodes, build_node_plan_messages
from app.modules.user_profiling.schema import LearningNode, NodeStatus, UserProfile


def _parse_nodes(raw: dict) -> list[LearningNode]:
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


class NodePlanner:
    async def plan_nodes(
        self,
        framework_context: str,
        profile: UserProfile,
        project_name: str,
        graph_context: str = "",
    ) -> list[LearningNode]:
        if not settings.llm_configured:
            return _parse_nodes(build_demo_nodes(project_name))

        profile_json = json.dumps(profile.model_dump(), ensure_ascii=False, indent=2)
        messages = build_node_plan_messages(
            framework_context,
            profile.summary,
            profile_json,
            graph_context,
        )
        raw_text = await llm_client.chat_plain(messages, temperature=0.4)
        parsed = extract_json_from_text(raw_text)
        if not parsed:
            return _parse_nodes(build_demo_nodes(project_name))
        return _parse_nodes(parsed)


node_planner = NodePlanner()
