SYSTEM_PROMPT = """你是 PLA（Programming Learning Assistant，编程学习助手）的项目导师。

你的唯一任务：用户描述一个编程项目，你通过苏格拉底式提问帮助其解析项目——从理解需求到方案设计，再到分步实现。不预设任何技术领域分类，根据用户实际描述的项目灵活分析。

核心原则：
1. 你是苏格拉底式编程导师，不是代码粘贴工具——先引导思考，再给出方案与代码。
2. 采用「项目解析 → 操作描述 → 代码设计 → 运行反馈」分层学习模式（对应 logic_plan / execution_steps / code_blocks）。
3. 帮助用户理解「为什么这样设计 → 应该先做什么 → 每一步如何实现 → 代码为什么这样写」。
4. 不要一次性给出完整可运行的大项目；按步骤、按模块逐步生成。
5. 当用户信息不足时，在 follow_up_questions 中提出 2-4 个有针对性的追问，而不是直接给答案。
6. 用户可能同时提交「自由交流」与「苏格拉底式提问回答」——必须综合两部分信息后再回复，不得只处理其中一部分；assistant_message 中应体现对两部分内容的回应。
7. 前端按阶段渐进展示：操作描述与代码设计仍逐步揭示；项目解析则展示 AI 当前版本的完整 logic_plan。
8. logic_plan 不是固定模板——必须根据用户项目动态生成，并随每轮对话持续修订。

项目解析（logic_plan）动态规则：
- 用户首次提交项目描述后：必须立即根据项目名称/描述做「初步解析」，输出 2-6 条 logic_plan（每条是你基于当前信息的推断，可标注不确定性），同时给出 follow_up_questions 验证与补全。
- 用户回答苏格拉底问题或自由对话后：必须综合全部已知信息，重写/增删 logic_plan 条目（id 从 1 连续编号），使解析与用户反馈一致；不得机械保留与用户答案矛盾的旧条目。
- 条目数量与标题随项目变化，禁止每次照搬「项目目标、输入输出、功能模块…」等固定清单；只保留对当前项目真正重要的维度。
- 当宏观设计已足够清晰、无关键未知点时，设 analysis_complete=true，并输出完整 execution_steps（供操作描述阶段使用），同时在 follow_up_questions 中询问用户是否进入操作描述阶段；否则 analysis_complete=false 并继续追问。

阶段规则（workflow_phase）——严格分工，禁止越界：
- intro / project_analysis：只输出 logic_plan；execution_steps 与 code_blocks 必须为空数组。
- operation_desc（操作描述）：只输出 execution_steps（纯自然语言操作说明）；code_blocks 必须为空数组。
  · 操作描述的任务：把 logic_plan 各环节中「具体要做什么」用自然语言写清楚（先做什么、输入输出、注意点）。
  · 禁止：输出任何 code_blocks；在 assistant_message / follow_up_questions 中要求用户写代码、运行代码、选择「先生成代码还是先讲原理」、提及 .py 文件名并承诺「接下来生成代码」。
  · code_module 字段仅可填写「代码设计阶段将对应的模块名」作为占位，不得在本阶段生成该文件内容。
  · follow_up_questions 只追问用户对「操作本身」的理解（例如数据从哪来、这一步为何必要），不问代码实现细节。
  · 【渐进揭示】follow_up_questions 针对「尚未在界面展示的第 N 步」（N = 已揭示步数 + 1），引导用户先思考该步；assistant_message 不得提前写出该步完整 description。
  · execution_steps JSON 仍输出完整列表，供前端按揭示进度展示。
  · 当全部步骤均已揭示且用户确认理解后，设 operations_complete=true，并询问是否进入代码设计阶段。
- code_design（代码设计）：logic_plan 与 execution_steps 保持完整；只在本阶段输出 code_blocks。
  · 按 execution_steps 分块生成代码；assistant_message 可引导运行与调试。

操作描述（execution_steps）写作要求：
- description / why / inputs / outputs 全部用自然语言，面向「人在电脑上要做的动作」，而非代码语句。
- 正确示例：「打开终端，创建项目文件夹，确认 Python 版本在 3.8 以上，安装 opencv-python 与 scikit-learn。」
- 错误示例：「编写 load_data.py 并 import fetch_openml」——这属于代码设计，应放到 code_design 阶段。
- 每一步应对应 logic_plan 中某一环节的具体操作，步骤数量与标题随项目动态确定（通常 4-10 步）。

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
  "assistant_message": "面向用户的自然语言回复（引导性、鼓励性）",
  "analysis_complete": false,
  "operations_complete": false
}

follow_up_questions 规则：
- 每轮提出 2-4 个追问。
- 当问题存在明确有限选项（如技术栈、数据形式、是/否、阶段选择）时，使用 answer_type="choice"，并提供 2-6 个互斥选项（可含「其他」）。
- choice 的 options 须简明，不要在选项内使用括号补充说明（错误示例：「仅手写数字（0-9）」；正确示例：「仅手写数字」）。
- 当问题需要用户自由阐述（如描述需求、解释思路、补充约束）时，使用 answer_type="text"，options 留空数组。
- 不要把所有问题都做成选择题；开放式与选择题应混合使用。

规则：
- logic_plan 须贴合用户具体项目，动态增减，每轮可整体更新。
- execution_steps 仅在 operation_desc 及之后阶段输出；内容必须是自然语言操作，不是代码。
- code_blocks 仅在 code_design 阶段输出；其他阶段必须为空数组。
- 首次对话 socratic_mode=true，assistant_message 以引导提问为主。
- terms 提取 3-8 个与当前项目相关的关键术语。
- 代码需有适当中文注释，面向初学者；且只能在 code_design 阶段出现。"""


def format_socratic_section(socratic_answers: list[dict[str, str]]) -> str:
    answered = [item for item in socratic_answers if item.get("answer", "").strip()]
    if not answered:
        return ""
    qa_lines = [
        f"问：{item['question']}\n答：{item['answer'].strip()}"
        for item in answered
    ]
    return "【苏格拉底式提问回答】\n" + "\n\n".join(qa_lines)


def _workflow_context(
    workflow_phase: str,
    revealed_plan_count: int,
    revealed_step_count: int,
    revealed_code_count: int,
) -> str:
    phase_labels = {
        "intro": "第一步：用户尚未提交项目，或刚提交项目描述",
        "project_analysis": "第二步：项目解析阶段——宏观设计分步呈现",
        "operation_desc": "第三步：操作描述阶段——将设计转为具体操作",
        "code_design": "第四步：代码设计阶段——按操作描述分块生成代码",
    }
    label = phase_labels.get(workflow_phase, workflow_phase)
    lines = [
        f"【当前学习阶段】{label}",
        f"已揭示 logic_plan 项数：{revealed_plan_count}（下一项索引 {revealed_plan_count + 1}）",
        f"已揭示 execution_steps 步数：{revealed_step_count}（下一步索引 {revealed_step_count + 1}）",
        f"已揭示 code_blocks 块数：{revealed_code_count}（下一块索引 {revealed_code_count + 1}）",
    ]
    if workflow_phase in ("intro", "project_analysis"):
        lines.append(
            "项目解析阶段：用户提交项目描述后先输出初步 logic_plan；"
            "之后每轮须根据苏格拉底回答与自由对话更新 logic_plan（可增删改条目）。"
            "follow_up_questions 针对当前解析中仍不确定的关键点；"
            "信息充分时设 analysis_complete=true。"
        )
    elif workflow_phase == "operation_desc":
        lines.append(
            "【操作描述阶段 — 严禁代码设计；先提问、后揭示步骤】"
            f"用户已在界面看到 {revealed_step_count} 步操作描述。"
            f"follow_up_questions 必须针对第 {revealed_step_count + 1} 步（尚未展示），"
            "引导用户思考「这一步具体要做什么、为何必要」；不得提前泄露该步 description 全文。"
            "用户回答后，前端才揭示该步内容。"
            "code_blocks 必须为空。"
            "全部步骤揭示且用户确认后，设 operations_complete=true。"
        )
    elif workflow_phase == "code_design":
        lines.append(
            "【代码设计阶段】此时才输出 code_blocks。"
            "follow_up_questions 引导用户思考下一块代码如何实现；"
            "annotations 须与 code 同步且解释关键行。"
            "assistant_message 可提及运行代码与调试，但不要再重写 execution_steps 为代码语句。"
        )
    return "\n".join(lines)


def build_messages(
    user_message: str,
    history: list[dict[str, str]],
    code_context: str | None = None,
    error_context: str | None = None,
    step_id: int | None = None,
    chat_message: str | None = None,
    socratic_answers: list[dict[str, str]] | None = None,
    workflow_phase: str = "intro",
    revealed_plan_count: int = 0,
    revealed_step_count: int = 0,
    revealed_code_count: int = 0,
    debug_skip_socratic: bool = False,
    debug_skip_to_phase: str | None = None,
) -> list[dict[str, str]]:
    context_parts: list[str] = [
        _workflow_context(
            workflow_phase, revealed_plan_count, revealed_step_count, revealed_code_count
        )
    ]

    if debug_skip_to_phase:
        context_parts.append(
            f"【调试跳过】用户跳过至阶段「{debug_skip_to_phase}」。"
            "请直接输出该阶段所需的完整结构化内容（logic_plan / execution_steps / code_blocks 按阶段规则）。"
            "若跳过项目解析，设 analysis_complete=true 并输出 execution_steps；"
            "若跳过操作描述，设 operations_complete=true 并输出 code_blocks 骨架。"
        )
    if debug_skip_socratic:
        context_parts.append(
            "【调试】用户开启「跳过提问」，follow_up_questions 可留空数组，assistant_message 简要说明即可。"
        )

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
        if workflow_phase == "code_design":
            context_parts.append(
                f"用户当前聚焦执行步骤 step_id={step_id}，请针对该步骤生成/解释对应 code_blocks。"
            )
        elif workflow_phase == "operation_desc":
            context_parts.append(
                f"用户当前聚焦操作步骤 step_id={step_id}，请用自然语言补充/解释该步的操作细节；"
                "不要生成任何代码或 code_blocks。"
            )
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


def _infer_preliminary_plan(user_message: str) -> list[dict]:
    """Demo: dynamic preliminary logic_plan inferred from user text."""
    text = user_message.strip()
    lower = text.lower()
    plans: list[dict] = [
        {
            "id": 1,
            "title": "项目定位",
            "content": f"基于你的描述，这是一个需要分步实现的编程学习项目：{text[:60]}{'…' if len(text) > 60 else ''}",
            "children": [],
        },
    ]
    if any(k in text for k in ("识别", "分类", "CNN", "模型", "训练", "图像", "数字")):
        plans.extend([
            {"id": 2, "title": "数据与标签", "content": "推测需要准备带标签的样本数据；具体格式与规模待你确认。", "children": []},
            {"id": 3, "title": "预处理流水线", "content": "图像类任务通常需缩放、归一化等预处理；是否增强取决于数据量。", "children": []},
            {"id": 4, "title": "模型与训练", "content": "初步判断适合采用监督学习 + 分类模型；具体架构需结合数据规模确定。", "children": []},
        ])
    elif any(k in lower for k in ("todo", "待办", "任务", "列表", "web", "网站", "api")):
        plans.extend([
            {"id": 2, "title": "核心实体", "content": "推测以「任务/条目」为核心实体，需明确字段与状态流转。", "children": []},
            {"id": 3, "title": "交互方式", "content": "可能是命令行、Web 或桌面端；界面形态将显著影响模块划分。", "children": []},
            {"id": 4, "title": "持久化", "content": "需决定数据存内存、文件还是数据库；影响后续模块设计。", "children": []},
        ])
    else:
        plans.extend([
            {"id": 2, "title": "输入与输出", "content": "初步判断存在明确的输入来源与期望输出；具体格式仍待补充。", "children": []},
            {"id": 3, "title": "核心模块", "content": "可按「数据处理 → 业务逻辑 → 结果呈现」拆分，细节随技术选型调整。", "children": []},
        ])
    for i, item in enumerate(plans, start=1):
        item["id"] = i
    return plans


def build_demo_output(
    user_message: str,
    workflow_phase: str = "intro",
    revealed_plan_count: int = 0,
    revealed_step_count: int = 0,
    revealed_code_count: int = 0,
    debug_skip_socratic: bool = False,
    debug_skip_to_phase: str | None = None,
) -> dict:
    """Offline demo when no API key is configured."""
    if debug_skip_to_phase:
        workflow_phase = debug_skip_to_phase
    logic_plan = _infer_preliminary_plan(user_message)
    execution_steps = [
        {
            "step_id": 1,
            "title": "准备环境与依赖",
            "description": "确认本机已安装 Python 3.8+；在终端中创建项目目录；使用 pip 安装 OpenCV 与 scikit-learn。",
            "why": "后续读取与处理图像、加载 MNIST 都依赖这些工具。",
            "inputs": "可联网的 Python 环境",
            "outputs": "可用的虚拟环境及已安装依赖",
            "knowledge_points": ["虚拟环境", "包管理"],
            "code_module": "load_data.py",
            "common_errors": ["pip 装错 Python 版本", "未激活虚拟环境"],
            "next_hint": "确认能正常 import cv2 与 sklearn",
        },
        {
            "step_id": 2,
            "title": "获取 MNIST 数据集",
            "description": "通过 scikit-learn 在线获取完整 MNIST 手写数字数据；检查样本数量与标签范围是否为 0–9。",
            "why": "KNN 需要带标签的训练样本才能学习分类边界。",
            "inputs": "网络连接",
            "outputs": "训练集与测试集的图像矩阵及标签",
            "knowledge_points": ["MNIST", "监督学习"],
            "code_module": "load_data.py",
            "common_errors": ["首次下载超时", "标签与图像数量不一致"],
            "next_hint": "记录训练集/测试集各有多少张图",
        },
        {
            "step_id": 3,
            "title": "图像预处理与特征整理",
            "description": "将每张 28×28 图像展平为一维向量；像素值归一化到 0–1；确保特征矩阵行数等于样本数。",
            "why": "KNN 基于向量距离分类，需要统一维度和数值范围。",
            "inputs": "原始图像矩阵",
            "outputs": "特征向量矩阵",
            "knowledge_points": ["特征向量", "归一化"],
            "code_module": "preprocess.py",
            "common_errors": ["展平顺序错误", "未归一化导致距离失真"],
            "next_hint": "明确每个样本特征向量的长度",
        },
        {
            "step_id": 4,
            "title": "训练 KNN 分类器",
            "description": "在训练集特征上配置 K 值（如 3 或 5）；用 scikit-learn 的 KNN 拟合训练数据。",
            "why": "KNN 通过邻近样本投票完成分类，K 值影响边界平滑程度。",
            "inputs": "训练特征与标签",
            "outputs": "已训练的 KNN 模型",
            "knowledge_points": ["KNN", "超参数 K"],
            "code_module": "train_knn.py",
            "common_errors": ["K 过大导致欠拟合", "训练集过大导致过慢"],
            "next_hint": "记录所选 K 值及训练耗时",
        },
        {
            "step_id": 5,
            "title": "在测试集上评估",
            "description": "用测试集特征预测标签；统计准确率；可选查看若干错分样本以分析原因。",
            "why": "验证模型在未见过数据上的泛化能力。",
            "inputs": "测试特征、真实标签、已训练模型",
            "outputs": "准确率及错例分析",
            "knowledge_points": ["准确率", "泛化"],
            "code_module": "evaluate.py",
            "common_errors": ["用训练集评估导致虚高", "混淆训练/测试集"],
            "next_hint": "判断准确率是否满足项目目标",
        },
        {
            "step_id": 6,
            "title": "单张手写数字试测",
            "description": "准备一张新的手写数字图像（或从测试集抽一张）；走同样的预处理流程；查看模型预测类别。",
            "why": "模拟真实使用场景，验证端到端流程。",
            "inputs": "单张图像",
            "outputs": "预测数字类别",
            "knowledge_points": ["推理", "端到端流程"],
            "code_module": "predict.py",
            "common_errors": ["预处理与训练不一致", "图像尺寸不符"],
            "next_hint": "若预测错误，回溯检查预处理是否与训练一致",
        },
    ]
    code_blocks = [
        {
            "file_name": "config.py",
            "language": "python",
            "code": '# 项目配置\nPROJECT_NAME = "demo"\nDEBUG = True\n',
            "annotations": [
                {"line": "1", "text": "配置文件集中管理常量，便于修改与测试。"},
                {"line": "2", "text": "PROJECT_NAME 标识项目，可在日志与界面中引用。"},
            ],
        },
    ]

    if workflow_phase in ("intro", "project_analysis"):
        # Simulate dynamic update after user answers
        if revealed_plan_count > 0 or "【苏格拉底" in user_message:
            logic_plan = _infer_preliminary_plan(user_message)
            if any(k in user_message for k in ("Python", "python", "PyTorch", "pytorch")):
                logic_plan.append({
                    "id": len(logic_plan) + 1,
                    "title": "技术栈",
                    "content": "已确认倾向 Python 生态；可结合具体任务选用 PyTorch / 标准库等。",
                    "children": [],
                })
            for i, item in enumerate(logic_plan, start=1):
                item["id"] = i
            analysis_done = revealed_plan_count >= 2
        else:
            analysis_done = False

        follow_up = [
            {
                "question": "上述初步解析中，哪一点与你的预期差距最大？请说明。",
                "answer_type": "text",
                "options": [],
            },
            {
                "question": "这个项目的主要输入形式是什么？",
                "answer_type": "choice",
                "options": ["本地文件/文件夹", "在线 API 或数据库", "用户手动输入", "其他"],
            },
        ]
        assistant = (
            "我已根据你的项目描述做了初步解析（见上方「项目解析」）。"
            "请先看看是否符合你的设想，再回答下方问题，我会据此更新解析。"
            if revealed_plan_count == 0 and "【苏格拉底" not in user_message
            else "已根据你的回答更新了项目解析。请继续确认或补充，直到宏观设计清晰为止。"
        )
        return {
            "task_summary": _infer_summary(user_message),
            "logic_plan": logic_plan,
            "execution_steps": execution_steps if analysis_done else [],
            "code_blocks": [],
            "terms": [
                {"term": "初步解析", "definition": "AI 基于有限信息给出的第一版宏观设计，会随对话不断修订。"},
                {"term": "动态方案", "definition": "解析条目随用户反馈增删改，而非固定模板。"},
            ],
            "follow_up_questions": [] if analysis_done else follow_up,
            "socratic_mode": True,
            "assistant_message": assistant,
            "analysis_complete": analysis_done,
        }

    if workflow_phase == "operation_desc":
        if revealed_step_count < len(execution_steps):
            target = execution_steps[revealed_step_count]
            follow_up = [] if debug_skip_socratic else [
                {
                    "question": (
                        f"在展示「{target['title']}」的具体操作之前，"
                        f"请先思考：这一步你需要完成哪些具体动作？输入和输出分别是什么？"
                    ),
                    "answer_type": "text",
                    "options": [],
                },
            ]
            assistant = (
                "项目宏观设计已定。请先回答下方问题，思考通过后才会在「操作描述」中展示对应步骤的内容。"
                if revealed_step_count == 0
                else f"很好，已展示前 {revealed_step_count} 步。请继续思考下一步。"
            )
        else:
            follow_up = [] if debug_skip_socratic else [
                {
                    "question": "以上操作描述是否清晰？确认后进入代码设计阶段（届时才编写代码）。",
                    "answer_type": "choice",
                    "options": ["确认，进入代码设计", "还需补充", "其他"],
                },
            ]
            assistant = "全部操作步骤已揭示。请确认是否进入代码设计。"
        ops_done = revealed_step_count >= len(execution_steps) and (
            debug_skip_socratic or "进入代码设计" in user_message or "确认" in user_message
        )
        return {
            "task_summary": _infer_summary(user_message),
            "logic_plan": logic_plan,
            "execution_steps": execution_steps,
            "code_blocks": [],
            "terms": [
                {"term": "操作描述", "definition": "用自然语言说明每一步具体做什么，不涉及写代码。"},
            ],
            "follow_up_questions": follow_up,
            "socratic_mode": not debug_skip_socratic,
            "assistant_message": assistant,
            "analysis_complete": True,
            "operations_complete": ops_done,
        }

    if workflow_phase == "code_design":
        return {
            "task_summary": _infer_summary(user_message),
            "logic_plan": logic_plan,
            "execution_steps": execution_steps,
            "code_blocks": code_blocks,
            "terms": [{"term": "注解", "definition": "对关键代码行的说明，帮助理解为何这样写。"}],
            "follow_up_questions": [] if debug_skip_socratic else [
                {
                    "question": "你认为 config.py 里还需要哪些配置项？",
                    "answer_type": "text",
                    "options": [],
                },
            ],
            "socratic_mode": not debug_skip_socratic,
            "assistant_message": "操作步骤已明确。接下来按模块分块设计代码——先从配置模块开始。",
            "analysis_complete": True,
            "operations_complete": True,
        }


def _infer_summary(user_message: str) -> str:
    text = user_message.strip()
    if len(text) <= 40:
        return f"解析编程项目：{text}"
    return f"解析编程项目：{text[:40]}..."
