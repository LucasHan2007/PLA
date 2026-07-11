from app.core.prompt_loader import load_module_prompt

_MODULE = "project_parser"

SECTION_SPECS: list[tuple[str, str]] = [
    ("project_goal", "项目目标"),
    ("problem_definition", "问题定义"),
    ("data_flow", "数据输入、输出流与数据模型及约束"),
    ("task_decomposition", "任务分解"),
    ("knowledge_skills", "所涉及的知识与技能"),
    ("implementation_plan", "实现方案"),
    ("run_verify_debug", "代码的运行、验证与调试"),
    ("iterative_optimization", "迭代优化"),
]

SYSTEM_PROMPT = load_module_prompt(_MODULE, "system.md")
USER_PROMPT_SUFFIX = load_module_prompt(_MODULE, "user.md")


def build_messages(project_name: str, project_hint: str = "") -> list[dict[str, str]]:
    user_parts = [f"项目名称：{project_name.strip()}"]
    hint = project_hint.strip()
    if hint:
        user_parts.append(f"补充说明：{hint}")
        user_parts.append("（补充说明中的约束与偏好须优先体现在解析体系中。）")
    user_parts.append(USER_PROMPT_SUFFIX)
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": "\n".join(user_parts)},
    ]


def build_demo_raw(project_name: str, project_hint: str = "") -> dict:
    name = project_name.strip() or "示例项目"
    hint = project_hint.strip()
    hint_note = f"（补充：{hint}）" if hint else ""
    sections = [
        {
            "id": sid,
            "title": title,
            "content": (
                f"【离线演示】针对「{name}」的「{title}」占位内容{hint_note}。"
                f"配置 LLM_API_KEY 后将由 AI 根据项目名生成具体解析。"
            ),
        }
        for sid, title in SECTION_SPECS
    ]
    return {
        "project_name": name,
        "summary": f"离线演示：{name} 的项目解析体系（需配置 LLM 以生成真实内容）",
        "sections": sections,
    }


def format_framework_context(document: dict) -> str:
    lines = [
        f"【项目解析体系·核心参考文件】{document.get('project_name', '')}",
        document.get("summary", ""),
        "",
    ]
    for sec in document.get("sections", []):
        lines.append(f"## {sec.get('title', '')}")
        lines.append(sec.get("content", ""))
        lines.append("")
    return "\n".join(lines).strip()
