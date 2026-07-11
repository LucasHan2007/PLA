from app.config import settings
from app.core.llm_client import llm_client
from app.modules.knowledge_graph.project_graph_store import load_graph
from app.modules.knowledge_graph.prompts import format_graph_context
from app.modules.pedagogy.orchestrator import pedagogy_orchestrator
from app.modules.pedagogy.strategies import STRATEGY_LABELS
from app.modules.project_parser.store import get_framework_context
from app.modules.user_profiling.store import get_current_node, get_profile


class TaskQaService:
    async def answer(
        self,
        question: str,
        history: list[dict[str, str]],
        *,
        session_id: str,
        project_name: str,
        learning_node_id: str | None = None,
        step_index: int = 0,
        step_total: int = 0,
        plan_title: str = "",
        plan_content: str = "",
        task_title: str = "",
        task_summary: str = "",
    ) -> tuple[str, str | None, str | None, str | None]:
        framework_context = get_framework_context(session_id)
        profile = get_profile(session_id)
        current_node = get_current_node(session_id, learning_node_id)
        graph_context = format_graph_context(load_graph(session_id))

        strategy = pedagogy_orchestrator.pick_strategy(question, profile)

        if not settings.llm_configured:
            answer = pedagogy_orchestrator.build_demo(
                project_name=project_name,
                framework_context=framework_context,
                profile=profile,
                current_node=current_node,
                strategy=strategy,
            )
            return (
                answer,
                strategy.value,
                STRATEGY_LABELS[strategy],
                current_node.title if current_node else None,
            )

        messages, strategy = pedagogy_orchestrator.build_messages(
            question,
            history,
            project_name=project_name,
            framework_context=framework_context,
            profile=profile,
            current_node=current_node,
            graph_context=graph_context,
            step_index=step_index,
            step_total=step_total,
            plan_title=plan_title,
            plan_content=plan_content,
            task_title=task_title,
            task_summary=task_summary,
        )
        answer = await llm_client.chat_plain(messages)
        return (
            answer,
            strategy.value,
            STRATEGY_LABELS[strategy],
            current_node.title if current_node else None,
        )


task_qa_service = TaskQaService()
