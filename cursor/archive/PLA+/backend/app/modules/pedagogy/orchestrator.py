from app.modules.pedagogy.prompts import (
    build_demo_answer,
    build_strategy_system_prompt,
    format_node_context,
    format_profile_context,
)
from app.modules.pedagogy.strategies import TeachingStrategy, select_strategy
from app.modules.user_profiling.schema import LearningNode, UserProfile


class PedagogyOrchestrator:
    def pick_strategy(
        self,
        question: str,
        profile: UserProfile | None,
    ) -> TeachingStrategy:
        level = profile.experience_level.value if profile else "beginner"
        return select_strategy(
            question,
            has_profile=profile is not None,
            experience_level=level,
        )

    def build_messages(
        self,
        question: str,
        history: list[dict[str, str]],
        *,
        project_name: str,
        framework_context: str,
        profile: UserProfile | None = None,
        current_node: LearningNode | None = None,
        graph_context: str = "",
        strategy: TeachingStrategy | None = None,
        step_index: int = 0,
        step_total: int = 0,
        plan_title: str = "",
        plan_content: str = "",
        task_title: str = "",
        task_summary: str = "",
    ) -> tuple[list[dict[str, str]], TeachingStrategy]:
        chosen = strategy or self.pick_strategy(question, profile)

        context_parts = [f"【项目】{project_name}"]
        if framework_context.strip():
            context_parts.append(framework_context.strip())
        profile_ctx = format_profile_context(profile)
        if profile_ctx:
            context_parts.append(profile_ctx)
        node_ctx = format_node_context(current_node)
        if node_ctx:
            context_parts.append(node_ctx)
        if graph_context.strip():
            context_parts.append(graph_context.strip())
        if plan_title or task_title:
            context_parts.extend([
                f"【当前进度】第 {step_index}/{step_total} 步",
                f"【本步解析】{plan_title}：{plan_content}",
                f"【本步任务】{task_title}：{task_summary}",
            ])
        context_parts.append("以上解析体系为解读该项目的核心参考，请勿推翻或重写。")

        messages: list[dict[str, str]] = [
            {"role": "system", "content": build_strategy_system_prompt(chosen)},
            {"role": "system", "content": "\n\n".join(context_parts)},
        ]
        for msg in history[-16:]:
            messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": question.strip()})
        return messages, chosen

    def build_demo(
        self,
        *,
        project_name: str,
        framework_context: str,
        profile: UserProfile | None,
        current_node: LearningNode | None,
        strategy: TeachingStrategy,
    ) -> str:
        return build_demo_answer(
            project_name=project_name,
            framework_context=framework_context,
            strategy=strategy,
            profile=profile,
            current_node=current_node,
        )


pedagogy_orchestrator = PedagogyOrchestrator()
