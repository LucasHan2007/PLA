from app.core.prompt_loader import load_module_prompt
from app.modules.pedagogy.strategies import STRATEGY_LABELS, TeachingStrategy
from app.modules.user_profiling.schema import LearningNode, UserProfile

_MODULE = "pedagogy"

BASE_SYSTEM_PROMPT = load_module_prompt(_MODULE, "base_system.md")

_STRATEGY_INSTRUCTIONS: dict[TeachingStrategy, str] = {
    TeachingStrategy.explain: load_module_prompt(_MODULE, "strategy_explain.md"),
    TeachingStrategy.ground: load_module_prompt(_MODULE, "strategy_ground.md"),
    TeachingStrategy.demonstrate: load_module_prompt(_MODULE, "strategy_demonstrate.md"),
    TeachingStrategy.ask: load_module_prompt(_MODULE, "strategy_ask.md"),
    TeachingStrategy.hint: load_module_prompt(_MODULE, "strategy_hint.md"),
    TeachingStrategy.challenge: load_module_prompt(_MODULE, "strategy_challenge.md"),
    TeachingStrategy.verify: load_module_prompt(_MODULE, "strategy_verify.md"),
    TeachingStrategy.reflect: load_module_prompt(_MODULE, "strategy_reflect.md"),
    TeachingStrategy.advance: load_module_prompt(_MODULE, "strategy_advance.md"),
}


def format_profile_context(profile: UserProfile | None) -> str:
    if not profile:
        return ""
    lines = [
        "【用户画像】",
        profile.summary,
        f"水平：{profile.experience_level.value}",
    ]
    if profile.knowledge_gaps:
        lines.append(f"待补强：{'、'.join(profile.knowledge_gaps[:5])}")
    if profile.learning_preferences:
        lines.append(f"学习偏好：{'、'.join(profile.learning_preferences[:3])}")
    return "\n".join(lines)


def format_node_context(node: LearningNode | None) -> str:
    if not node:
        return ""
    return (
        f"【当前学习节点】第 {node.order} 步：{node.title}\n"
        f"目标：{node.summary}\n"
        f"引导问题：{node.guiding_question}"
    )


def build_strategy_system_prompt(strategy: TeachingStrategy) -> str:
    label = STRATEGY_LABELS[strategy]
    instruction = _STRATEGY_INSTRUCTIONS[strategy]
    return f"{BASE_SYSTEM_PROMPT}\n\n本次选用教学策略：**{label}（{strategy.value}）**\n{instruction}"


def build_demo_answer(
    *,
    project_name: str,
    framework_context: str,
    strategy: TeachingStrategy,
    profile: UserProfile | None,
    current_node: LearningNode | None,
) -> str:
    label = STRATEGY_LABELS[strategy]
    parts = [
        f"（离线演示：未配置 LLM_API_KEY）",
        f"教学策略：{label}",
        f"项目：{project_name}",
    ]
    if current_node:
        parts.append(f"当前节点：{current_node.title}")
    if profile:
        parts.append(f"画像摘要：{profile.summary[:80]}…")
    parts.append(
        f"参考文件已{'加载' if framework_context.strip() else '未找到'}。"
        f"请在 backend/.env 配置 LLM 后体验完整策略化答疑。"
    )
    return "\n\n".join(parts)
