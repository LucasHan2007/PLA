from app.core.prompt_loader import load_module_prompt

_MODULE = "implementation"

PLAN_SYSTEM_PROMPT = load_module_prompt(_MODULE, "plan_system.md")
UNDERSTAND_SYSTEM_PROMPT = load_module_prompt(_MODULE, "understand_system.md")
COMPLETION_SYSTEM_PROMPT = load_module_prompt(_MODULE, "completion_system.md")


def build_plan_messages(context_block: str, project_name: str) -> list[dict[str, str]]:
    return [
        {"role": "system", "content": PLAN_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": f"【项目】{project_name}\n\n{context_block}\n\n请生成实现方案 JSON。",
        },
    ]


def build_code_assist_messages(
    mode: str,
    context_block: str,
    *,
    code: str,
    message: str,
    file_name: str,
) -> list[dict[str, str]]:
    system = UNDERSTAND_SYSTEM_PROMPT if mode == "understand" else COMPLETION_SYSTEM_PROMPT
    user_parts = [
        context_block,
        f"【当前文件】{file_name}",
        f"【用户代码】\n```\n{code[:8000]}\n```" if code.strip() else "【用户代码】（空）",
        f"【用户请求】{message.strip()}",
    ]
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": "\n\n".join(user_parts)},
    ]


def build_demo_plan(project_name: str) -> dict:
    return {
        "overview": f"离线演示：{project_name} 的实现方案骨架。配置 LLM 后将根据画像与节点动态生成。",
        "tech_stack": ["Python"],
        "modules": [
            {
                "id": "config",
                "name": "配置与环境",
                "responsibility": "管理路径、超参与随机种子",
                "files": ["config.py"],
                "depends_on": [],
            },
            {
                "id": "data",
                "name": "数据模块",
                "responsibility": "加载、预处理与划分数据集",
                "files": ["data_loader.py"],
                "depends_on": ["config"],
            },
            {
                "id": "model",
                "name": "模型模块",
                "responsibility": "定义模型/算法与训练推理接口",
                "files": ["model.py"],
                "depends_on": ["data"],
            },
            {
                "id": "eval",
                "name": "评估模块",
                "responsibility": "指标计算与结果输出",
                "files": ["evaluate.py"],
                "depends_on": ["model"],
            },
        ],
        "milestones": [
            "环境可导入各模块",
            "数据管线输出预期形状",
            "训练/推理跑通",
            "评估指标可复现",
        ],
    }


def format_plan_context(plan) -> str:
    lines = [
        "【实现方案】",
        plan.overview,
        f"技术栈：{'、'.join(plan.tech_stack)}",
        "",
        "模块：",
    ]
    for mod in plan.modules:
        deps = f"（依赖：{'、'.join(mod.depends_on)}）" if mod.depends_on else ""
        files = f"文件：{'、'.join(mod.files)}" if mod.files else ""
        lines.append(f"- {mod.name}{deps}：{mod.responsibility} {files}".strip())
    if plan.milestones:
        lines.append("")
        lines.append("里程碑：" + "；".join(plan.milestones))
    return "\n".join(lines)


def build_demo_code_answer(mode: str, message: str, file_name: str) -> str:
    if mode == "understand":
        return (
            f"（离线演示·理解型）\n\n"
            f"你正在查看 `{file_name}`。配置 LLM 后，系统将结合实现方案解释代码含义与数据流。\n"
            f"你的问题：{message[:120]}"
        )
    return (
        f"（离线演示·补全型）\n\n"
        f"# {file_name}\n"
        f"# TODO: {message[:80]}\n"
        f"def main():\n"
        f"    pass  # 在此填写第一步\n\n"
        f"if __name__ == '__main__':\n"
        f"    main()\n"
    )
