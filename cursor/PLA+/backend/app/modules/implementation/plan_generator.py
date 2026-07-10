from app.config import settings
from app.core.json_utils import extract_json_from_text
from app.core.llm_client import llm_client
from app.modules.implementation.prompts import build_demo_plan, build_plan_messages
from app.modules.implementation.schema import ImplementationModule, ImplementationPlan


def _parse_plan(raw: dict, session_id: str, project_name: str) -> ImplementationPlan:
    modules: list[ImplementationModule] = []
    for item in raw.get("modules") or []:
        modules.append(
            ImplementationModule(
                id=str(item.get("id", f"mod_{len(modules) + 1}")),
                name=str(item.get("name", "")),
                responsibility=str(item.get("responsibility", "")),
                files=list(item.get("files") or []),
                depends_on=list(item.get("depends_on") or []),
            )
        )
    return ImplementationPlan(
        session_id=session_id,
        project_name=project_name,
        overview=str(raw.get("overview", "")),
        tech_stack=list(raw.get("tech_stack") or []),
        modules=modules,
        milestones=list(raw.get("milestones") or []),
    )


class PlanGenerator:
    async def generate(
        self,
        session_id: str,
        project_name: str,
        context_block: str,
    ) -> ImplementationPlan:
        if not settings.llm_configured:
            return _parse_plan(build_demo_plan(project_name), session_id, project_name)

        messages = build_plan_messages(context_block, project_name)
        raw_text = await llm_client.chat_plain(messages, temperature=0.35)
        parsed = extract_json_from_text(raw_text)
        if not parsed:
            return _parse_plan(build_demo_plan(project_name), session_id, project_name)
        return _parse_plan(parsed, session_id, project_name)


plan_generator = PlanGenerator()
