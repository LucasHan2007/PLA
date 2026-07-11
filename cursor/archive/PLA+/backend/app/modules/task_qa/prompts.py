from app.core.prompt_loader import load_module_prompt

_MODULE = "task_qa"

TASK_QA_SYSTEM_PROMPT = load_module_prompt(_MODULE, "system.md")


def build_task_qa_messages(
    question: str,
    history: list[dict[str, str]],
    *,
    project_name: str,
    framework_context: str,
    step_index: int = 0,
    step_total: int = 0,
    plan_title: str = "",
    plan_content: str = "",
    task_title: str = "",
    task_summary: str = "",
) -> list[dict[str, str]]:
    parts = [f"【项目】{project_name}"]
    if framework_context.strip():
        parts.append(framework_context.strip())
    if plan_title or task_title:
        parts.extend([
            f"【当前进度】第 {step_index}/{step_total} 步",
            f"【本步解析】{plan_title}：{plan_content}",
            f"【本步任务】{task_title}：{task_summary}",
        ])
    parts.append("以上解析体系为解读该项目的核心参考，请勿推翻或重写。")

    messages: list[dict[str, str]] = [
        {"role": "system", "content": TASK_QA_SYSTEM_PROMPT},
        {"role": "system", "content": "\n\n".join(parts)},
    ]
    for msg in history[-16:]:
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": question.strip()})
    return messages


def build_demo_answer(*, project_name: str, framework_context: str) -> str:
    return (
        f"（离线演示：未配置 LLM_API_KEY）\n\n"
        f"当前项目：{project_name}\n"
        f"参考文件已{'加载' if framework_context.strip() else '未找到'}。"
        f"请在 backend/.env 配置 LLM 后重试。"
    )
