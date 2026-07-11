from app.modules.implementation.behavior_analyzer import analyze_code
from app.modules.implementation.code_assist import code_assist_service
from app.modules.implementation.plan_generator import plan_generator
from app.modules.implementation.prompts import format_plan_context
from app.modules.implementation.store import (
    append_behavior,
    has_plan,
    load_state,
    save_draft,
    save_plan,
)
from app.modules.implementation.schema import (
    CodeAssistMode,
    CodeAssistResponse,
    CodeDraft,
    ImplementationStatusResponse,
    PlanGenerateResponse,
    PlanResponse,
)
from app.modules.knowledge_graph.project_graph_store import load_graph
from app.modules.knowledge_graph.prompts import format_graph_context
from app.modules.pedagogy.prompts import format_node_context, format_profile_context
from app.modules.project_parser.store import get_framework_context, has_framework, load_framework
from app.modules.user_profiling.nodes_store import load_learning_nodes
from app.modules.user_profiling.store import get_current_node, get_profile, has_nodes, has_profile


def _build_context_block(session_id: str, learning_node_id: str | None = None) -> str:
    parts: list[str] = []
    framework = get_framework_context(session_id)
    if framework:
        parts.append(framework)

    graph_ctx = format_graph_context(load_graph(session_id))
    if graph_ctx:
        parts.append(graph_ctx)

    profile = get_profile(session_id)
    profile_ctx = format_profile_context(profile)
    if profile_ctx:
        parts.append(profile_ctx)

    node = get_current_node(session_id, learning_node_id)
    node_ctx = format_node_context(node)
    if node_ctx:
        parts.append(node_ctx)

    state = load_state(session_id)
    if state.plan:
        parts.append(format_plan_context(state.plan))

    nodes = load_learning_nodes(session_id)
    if nodes:
        lines = ["【学习节点序列】"]
        for n in nodes:
            lines.append(f"- [{n.status.value}] {n.order}. {n.title}：{n.summary}")
        parts.append("\n".join(lines))

    return "\n\n".join(parts)


class ImplementationService:
    def get_status(self, session_id: str) -> ImplementationStatusResponse:
        doc = load_framework(session_id)
        return ImplementationStatusResponse(
            session_id=session_id,
            framework_ready=has_framework(session_id),
            profile_ready=has_profile(session_id),
            nodes_ready=has_nodes(session_id),
            plan_ready=has_plan(session_id),
            project_name=doc.project_name if doc else None,
        )

    def get_plan(self, session_id: str) -> PlanResponse:
        state = load_state(session_id)
        return PlanResponse(session_id=session_id, plan=state.plan, drafts=state.drafts)

    async def generate_plan(self, session_id: str) -> PlanGenerateResponse:
        if not has_framework(session_id):
            raise ValueError("请先生成并保存项目解析参考文件")
        if not has_profile(session_id) or not has_nodes(session_id):
            raise ValueError("请先完成用户画像并生成学习节点")

        doc = load_framework(session_id)
        project_name = doc.project_name if doc else "本项目"
        context = _build_context_block(session_id)
        plan = await plan_generator.generate(session_id, project_name, context)
        save_plan(session_id, plan)

        return PlanGenerateResponse(
            session_id=session_id,
            plan=plan,
            message="已根据学习节点与画像生成具体实现方案（模块边界 + 里程碑）。",
        )

    def save_code_draft(
        self,
        session_id: str,
        file_name: str,
        language: str,
        content: str,
    ) -> CodeDraft:
        draft = CodeDraft(file_name=file_name, language=language, content=content)
        save_draft(session_id, draft)
        return draft

    async def code_assist(
        self,
        session_id: str,
        mode: CodeAssistMode,
        code: str,
        message: str,
        file_name: str = "main.py",
        learning_node_id: str | None = None,
    ) -> CodeAssistResponse:
        if not has_framework(session_id):
            raise ValueError("请先生成并保存项目解析参考文件")

        entry = analyze_code(code, mode=mode.value)
        append_behavior(session_id, entry)
        save_draft(session_id, CodeDraft(file_name=file_name, content=code))

        context = _build_context_block(session_id, learning_node_id)
        answer = await code_assist_service.assist(
            mode.value,
            context,
            code=code,
            message=message,
            file_name=file_name,
        )

        return CodeAssistResponse(
            session_id=session_id,
            mode=mode,
            answer=answer,
            behavior_note=entry.note,
        )


implementation_service = ImplementationService()
