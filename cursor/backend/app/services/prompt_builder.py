SYSTEM_PROMPT = """你是 PLA（Programming Learning Assistant，编程学习助手）的项目导师。

你的唯一任务：用户描述一个编程项目，你通过苏格拉底式提问帮助其解析项目——从理解需求到方案设计，再到分步实现。不预设任何技术领域分类，根据用户实际描述的项目灵活分析。

核心原则：
1. 你是苏格拉底式编程导师，不是代码粘贴工具——先引导思考，再给出方案与代码。
2. 采用「逻辑方案 → 执行步骤 → 模块代码 → 运行反馈」分层学习模式。
3. 帮助用户理解「为什么这样设计 → 应该先做什么 → 每一步如何实现 → 代码为什么这样写」。
4. 不要一次性给出完整可运行的大项目；按步骤、按模块逐步生成。
5. 当用户信息不足时，在 follow_up_questions 中提出 2-4 个有针对性的追问，而不是直接给答案。
6. 用户可能同时提交「自由交流」与「苏格拉底式提问回答」——必须综合两部分信息后再回复，不得只处理其中一部分；assistant_message 中应体现对两部分内容的回应。

项目解析链路（按此顺序引导用户思考，不要跳步）：
项目目标 → 输入与输出 → 核心功能模块 → 技术选型 → 数据/状态如何流动 → 实现顺序 → 测试与验证

输出格式：必须返回合法 JSON，结构如下（不要包裹 markdown 代码块）：
{
  "task_summary": "一句话概括用户当前项目",
  "logic_plan": [{"id": 1, "title": "...", "content": "...", "children": []}],
  "execution_steps": [{
    "step_id": 1, "title": "...", "description": "...",
    "why": "为什么需要这一步", "inputs": "所需输入", "outputs": "产出",
    "knowledge_points": ["知识点"], "code_module": "文件名",
    "common_errors": ["常见错误"], "next_hint": "下一步建议"
  }],
  "code_blocks": [{
    "file_name": "xxx.py", "language": "python", "code": "...",
    "annotations": [{"line": "1", "text": "解释"}]
  }],
  "terms": [{"term": "术语", "definition": "解释"}],
  "follow_up_questions": [
    {
      "question": "追问内容",
      "answer_type": "choice",
      "options": ["选项A", "选项B", "选项C", "其他"]
    },
    {
      "question": "需要用户自由描述的问题",
      "answer_type": "text"
    }
  ],
  "socratic_mode": true,
  "assistant_message": "面向用户的自然语言回复（引导性、鼓励性）"
}

follow_up_questions 规则：
- 每轮提出 2-4 个追问。
- 当问题存在明确有限选项（如技术栈、数据形式、是/否、阶段选择）时，使用 answer_type="choice"，并提供 2-6 个互斥选项（可含「其他」）。
- choice 的 options 须简明，不要在选项内使用括号补充说明（错误示例：「仅手写数字（0-9）」；正确示例：「仅手写数字」）。
- 当问题需要用户自由阐述（如描述需求、解释思路、补充约束）时，使用 answer_type="text"，options 留空数组。
- 不要把所有问题都做成选择题；开放式与选择题应混合使用。

规则：
- logic_plan 覆盖完整项目宏观设计（5-8 个节点），内容须贴合用户描述的具体项目。
- execution_steps 具体可执行（首轮对话可少些，信息充分后扩展到 6-10 步）。
- code_blocks 按模块组织，首轮信息不足时可为空或只给第一步骨架代码。
- 首次对话 socratic_mode=true，assistant_message 以引导提问为主。
- terms 提取 3-8 个与当前项目相关的关键术语。
- 代码需有适当中文注释，面向初学者。"""


def format_socratic_section(socratic_answers: list[dict[str, str]]) -> str:
    answered = [item for item in socratic_answers if item.get("answer", "").strip()]
    if not answered:
        return ""
    qa_lines = [
        f"问：{item['question']}\n答：{item['answer'].strip()}"
        for item in answered
    ]
    return "【苏格拉底式提问回答】\n" + "\n\n".join(qa_lines)


def build_messages(
    user_message: str,
    history: list[dict[str, str]],
    code_context: str | None = None,
    error_context: str | None = None,
    step_id: int | None = None,
    chat_message: str | None = None,
    socratic_answers: list[dict[str, str]] | None = None,
) -> list[dict[str, str]]:
    context_parts: list[str] = []

    chat_text = (chat_message or "").strip()
    socratic_section = format_socratic_section(socratic_answers or [])
    has_dual_submission = bool(chat_text and socratic_section)

    if has_dual_submission:
        context_parts.append(
            "【本轮提交】用户同时填写了「自由交流」和「苏格拉底式提问回答」。"
            "你必须先阅读两部分，再综合生成 logic_plan、assistant_message 与 follow_up_questions，"
            "assistant_message 中需明确回应自由交流中的观点或问题。"
        )

    if step_id is not None:
        context_parts.append(f"用户当前聚焦执行步骤 step_id={step_id}，请针对该步骤生成/解释代码。")
    if code_context:
        context_parts.append(f"用户提供的代码上下文：\n```\n{code_context}\n```")
    if error_context:
        context_parts.append(
            f"用户遇到报错，请分析原因、给出修复建议和修改代码：\n```\n{error_context}\n```"
        )

    messages: list[dict[str, str]] = [{"role": "system", "content": SYSTEM_PROMPT}]
    if context_parts:
        messages.append({"role": "system", "content": "\n\n".join(context_parts)})

    for msg in history[-20:]:
        messages.append({"role": msg["role"], "content": msg["content"]})

    if has_dual_submission:
        messages.append({"role": "user", "content": f"【自由交流】\n{chat_text}"})
        messages.append({"role": "user", "content": socratic_section})
    else:
        messages.append({"role": "user", "content": user_message})
    return messages


def format_user_submission(chat_message: str, socratic_answers: list[dict[str, str]]) -> str:
    """Merge free-form chat and selective Socratic Q&A into one user turn for history storage."""
    parts: list[str] = []

    if chat_message.strip():
        parts.append(f"【自由交流】\n{chat_message.strip()}")

    socratic_section = format_socratic_section(socratic_answers)
    if socratic_section:
        parts.append(socratic_section)

    return "\n\n".join(parts)


def build_demo_output(user_message: str) -> dict:
    """Offline demo when no API key is configured."""
    return {
        "task_summary": _infer_summary(user_message),
        "logic_plan": [
            {"id": 1, "title": "项目目标", "content": "明确要解决什么问题、为谁服务、成功标准是什么。", "children": []},
            {"id": 2, "title": "输入与输出", "content": "梳理系统的输入来源、输出形式及数据格式。", "children": []},
            {"id": 3, "title": "功能模块", "content": "将项目拆分为若干职责单一的模块（如数据层、业务层、界面层）。", "children": []},
            {"id": 4, "title": "技术选型", "content": "根据项目特点选择合适的语言、框架和工具。", "children": []},
            {"id": 5, "title": "实现顺序", "content": "从最小可行模块开始，逐步集成与联调。", "children": []},
            {"id": 6, "title": "测试验证", "content": "定义每个阶段的验证方式与验收标准。", "children": []},
        ],
        "execution_steps": [
            {
                "step_id": 1,
                "title": "用一句话定义项目",
                "description": "描述：输入是什么、输出是什么、核心功能是什么。",
                "why": "清晰的项目边界是后续所有设计的基础。",
                "inputs": "用户的自然语言描述",
                "outputs": "一句话项目定义",
                "knowledge_points": ["需求分析", "问题建模"],
                "code_module": "",
                "common_errors": ["目标过于宽泛", "混淆「想要」和「需要」"],
                "next_hint": "列出 3 个必须实现的核心功能",
            },
        ],
        "code_blocks": [],
        "terms": [
            {"term": "MVP", "definition": "Minimum Viable Product，最小可行产品——先实现最核心的功能。"},
            {"term": "模块化", "definition": "将项目拆分为职责独立的部分，便于理解和逐步开发。"},
            {"term": "苏格拉底式提问", "definition": "通过连续追问引导你自己发现答案，而非直接告知结论。"},
        ],
        "follow_up_questions": [
            {
                "question": "这个项目的主要输入形式是什么？",
                "answer_type": "choice",
                "options": ["本地文件/文件夹", "在线 API 或数据库", "用户手动输入", "传感器/设备数据", "其他"],
            },
            {
                "question": "你计划使用哪种编程语言或框架？",
                "answer_type": "choice",
                "options": ["Python", "JavaScript / TypeScript", "Java", "C / C++", "尚未确定"],
            },
            {
                "question": "项目有没有必须满足的约束或特殊目标？（请补充说明）",
                "answer_type": "text",
                "options": [],
            },
        ],
        "socratic_mode": True,
        "assistant_message": (
            "收到你的项目描述。我不会直接给出完整代码，而是先帮你把项目想清楚。"
            "请先回答下面几个关键问题，我们再一起拆解逻辑方案和实现步骤。"
        ),
    }


def _infer_summary(user_message: str) -> str:
    text = user_message.strip()
    if len(text) <= 40:
        return f"解析编程项目：{text}"
    return f"解析编程项目：{text[:40]}..."
