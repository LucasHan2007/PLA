from app.modules.implementation.behavior_analyzer import analyze_code
from app.modules.implementation.code_assist import code_assist_service
from app.modules.implementation.code_blueprint_extractor import code_blueprint_extractor
from app.modules.implementation.code_blueprint_store import has_blueprint, load_blueprint
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
    CodeBlueprintResponse,
    CodeDraft,
    ImplementationStatusResponse,
    PlanGenerateResponse,
    PlanResponse,
)
from app.modules.knowledge_graph.project_graph_store import load_graph
from app.modules.knowledge_graph.prompts import format_graph_context
from app.modules.pedagogy.prompts import format_node_context, format_profile_context
from app.modules.project_parser.background_jobs import get_job_state
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

    bp = load_blueprint(session_id)
    if bp and bp.code_nodes:
        lines = ["【代码蓝图节点】"]
        for cn in bp.code_nodes:
            lines.append(f"- {cn.order}. {cn.title}")
        parts.append("\n".join(lines))

    return "\n\n".join(parts)


class ImplementationService:
    def get_status(self, session_id: str) -> ImplementationStatusResponse:
        doc = load_framework(session_id)
        bp = load_blueprint(session_id)
        ready = has_blueprint(session_id)
        pending = get_job_state(session_id, "code_blueprint") == "pending" and not ready
        return ImplementationStatusResponse(
            session_id=session_id,
            framework_ready=has_framework(session_id),
            profile_ready=has_profile(session_id),
            nodes_ready=has_nodes(session_id),
            plan_ready=has_plan(session_id),
            code_blueprint_ready=ready,
            code_blueprint_pending=pending,
            code_node_count=len(bp.code_nodes) if bp else 0,
            project_name=doc.project_name if doc else None,
        )

    def get_plan(self, session_id: str) -> PlanResponse:
        state = load_state(session_id)
        return PlanResponse(session_id=session_id, plan=state.plan, drafts=state.drafts)

    def get_code_blueprint(self, session_id: str) -> CodeBlueprintResponse:
        return CodeBlueprintResponse(
            session_id=session_id,
            blueprint=load_blueprint(session_id),
        )

    async def rebuild_code_blueprint(
        self,
        session_id: str,
        *,
        force_regenerate: bool = False,
    ) -> CodeBlueprintResponse:
        if not has_framework(session_id):
            raise ValueError("请先生成并保存项目解析参考文件")
        bp = await code_blueprint_extractor.build_from_session(
            session_id,
            force_regenerate=force_regenerate,
        )
        return CodeBlueprintResponse(session_id=session_id, blueprint=bp)

    async def generate_plan(
        self,
        session_id: str,
        *,
        force_regenerate: bool = False,
    ) -> PlanGenerateResponse:
        if not force_regenerate and has_plan(session_id):
            state = load_state(session_id)
            if state.plan is not None:
                return PlanGenerateResponse(
                    session_id=session_id,
                    plan=state.plan,
                    message="已有实现方案，已直接复用原文件。",
                )

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
