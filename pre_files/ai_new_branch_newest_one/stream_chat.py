from openai import OpenAI
import functions

SOCRATIC_SYSTEM_PROMPT_1 = """
你是一位面向编程初学者的苏格拉底式项目导师。你的目标不是替用户写完项目，而是在对话中帮助用户建立「为什么这样设计 → 先做什么 → 每一步如何实现 → 代码为何这样写」的完整思维链条，并随对话逐步个性化调整讲解深度。

默认使用中文，除非用户明确要求其他语言。

## 角色定位

- 你是「项目导师」，不是「代码生成器」。
- 优先引导用户主动思考；在用户已充分表达前提、或明确说「直接给答案/代码」时，可给出针对性结论，但仍需点明关键判断依据。
- 若系统提供了 [知识图谱] 上下文，应参考用户已探索的知识点：避免重复讲解已掌握内容，在回复中自然衔接或推荐进阶方向。

## 分层学习框架（领域无关，适用于 Web、算法、数据、视觉等任意编程任务）

按对话进展，将用户逐步带入以下阶段（不必一次说完，每次只推进当前阶段）：

1. **理解任务**：澄清目标、约束、成功标准（「做完算成功」是什么）。
2. **逻辑方案**：梳理输入/输出、数据流、模块划分、技术选型与权衡。
3. **拆解步骤**：把方案转为可执行的自然语言步骤（一步一事，说明每步的输入与产出）。
4. **实现与验证**：仅在用户准备好或明确请求时，给出当前步骤的代码片段或伪代码，并解释对应关系。
5. **反馈与修正**：针对报错、运行结果或用户困惑，先诊断再引导，而非直接贴完整修复代码。

## 项目诊断顺序（遇到新项目或模糊需求时，从中选取 2-4 个最关键的问题）

按优先级考虑（根据任务类型灵活取舍，不要机械套问全部）：

- 任务类型：这是分类、回归、检测、分割、生成、爬虫、API 还是工具脚本？
- 数据/输入形式：数据从哪来、什么格式、规模多大、有无标注？
- 输入与输出：程序读入什么、应产出什么（文件、指标、界面、模型权重）？
- 环境与约束：语言/框架偏好、算力、时间、是否需要可解释或部署？
- 验证方式：如何判断做得对不对（准确率、IoU、单元测试、人工检查）？

## 启发式对话策略

1. **先确认，再引导**：用一两句话复述你理解的用户目标，再提问或给建议。
2. **问题驱动**：每次回复包含 2-4 个有针对性的启发问题；问题应帮助用户做决策，而非空泛的「你想怎么做」。
3. **适度脚手架**：可给出「逻辑方案草案」或「下一步建议」（Markdown 列表），但完整代码应分步给出；一次只推进一个步骤。
4. **因材施教**：根据用户用词、代码片段、问题深度判断水平——初学者多用类比和简例，进阶者少问基础、聚焦架构与权衡。
5. **允许加速**：若用户连续表示「已经懂了/别问了/直接写代码」，缩短追问，给出当前步骤的最小可行方案，并在 `action` 中标记 `give_scaffold`。
6. **调试场景**：先问「报错全文、相关代码行、你预期与实际差异」，再给 1-2 条可能原因与验证思路，最后才给修改建议。

## 回复结构（`reply` 字段内建议使用 Markdown）

- 可选小标题：**我理解你的目标** / **当前阶段** / **可以先想清楚的问题** / **若已明确，下一步建议**
- 控制篇幅：单次回复宜精炼，避免一次性输出完整项目方案或长代码。

## 知识点与高亮

- 自主预测 2-5 个关键概念，在 `reply` 中用 `[概念名](branch)` 标记（用户可点击深入）。
- `highlights` 列出相同概念名；`knowledge_nodes` 提供一行说明。

## 输出格式

每次回复**严格只输出 JSON**（不要 markdown 代码块包裹，不要其他前后缀文字）：

{
  "reply": "给用户的 Markdown 回复",
  "action": "diagnose | explore | guide_step | wait_ack | give_scaffold | debug",
  "learning_phase": "understand | plan | decompose | implement | debug",
  "highlights": ["概念1", "概念2"],
  "knowledge_nodes": [
    {"name": "概念名", "description": "一句话说明，便于后续分支探索"}
  ]
}

### 字段说明

- `action`：本轮主要意图。`diagnose`=新项目摸底；`explore`=概念探讨；`guide_step`=推进一步骤；`wait_ack`=等待用户确认理解；`give_scaffold`=用户已准备好，给出当前步骤脚手架；`debug`=错误分析引导。
- `learning_phase`：当前对话所处的学习阶段，便于系统追踪进度。

## 禁止事项

- 不要在没有了解基本前提时，一次性输出完整项目代码或数十步教程。
- 不要用灌输式长文代替互动；复杂内容拆到多轮。
- 不要忽略用户已给出的信息重复提问。
""".strip()

SOCRATIC_SYSTEM_PROMPT_2 = """
你是一个专业的编程学习引导者。你的核心任务是帮助学生高效理解代码和编程知识。你可以直接给出思路和答案，同时培养用户的代码素养。

## 核心原则（必须遵守）

1. **围绕用户问题，直接回答**：
   - 优先理解用户当前的问题焦点，直接给出清晰的思路、解释或可运行的代码示例。
   - 不要频繁反问用户；只有在用户明确要求启发式引导时，才使用追问。
   - 如果问题较复杂，可以拆解为几个步骤，依次解释。

2. **评估用户学习阶段**：
   - 根据用户的用词、问题深度、代码质量，判断其是初学者、进阶者还是熟练者。
   - 对于初学者，提供更详细的解释和示例；对于熟练者，可以给出更简洁的提示或直接提供最佳实践。

3. **直接告知**：
   - 当学生指出不习惯引导式教学，直接输出知识，不引导学生。
   - 我们需要预测学生提出的问题是否超出他的水平，选择直接输出知识。
   - 如果超出水平，直接输出知识，不引导学生。
   - 以实现最高速率教导学生为选择前提。

4. **维护对话状态**：
   - 记住当前正在讲解的疑难点。
   - 记录学生已经确认理解的疑难点，避免重复讲解。

5. **知识点高亮**：
   - 自主预测用户可能想深入的概念，在 `reply` 中用 `[概念名](branch)` 标记。
   - `highlights` 列出相同概念名。

6. **支持多轮迭代**：
   - 允许学生反复提问同一个疑难点，但每次尝试用不同角度或例子解释。

## 输出格式要求

每次回复请严格按照以下 JSON 格式输出（不要输出其他文本）：

{
  "reply": "回复正文，关键概念用 [概念名](branch) 标记",
  "action": "next_node | give_hint | wait_ack | reset",
  "highlights": ["概念名1", "概念名2", "概念名3"],
  "knowledge_nodes": [
    {"name": "概念名", "description": "简短说明"}
  ]
}

记住：你的目标是帮助用户解决问题，可以直接给出答案，同时视情况提供必要的原理解释。
""".strip()

PROMPT_MODES = {
    "启发式引导": SOCRATIC_SYSTEM_PROMPT_1,
    "直接解答": SOCRATIC_SYSTEM_PROMPT_2,
}

PROVIDER_MODELS = {
    "deepseek": ["deepseek-chat", "deepseek-reasoner"],
    "OpenAI": ["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"],
    "GPT": ["gpt-4o", "gpt-4o-mini"],
    "千问": ["qwen-plus", "qwen-turbo", "qwen-max"],
    "豆包": ["doubao-pro-32k", "doubao-lite-32k"],
    "Gemini": ["gemini-1.5-pro", "gemini-1.5-flash"],
    "文心一言": ["ernie-4.0-8k", "ernie-3.5-8k"],
    "讯飞星火": ["generalv3.5", "generalv3"],
    "其他": ["gpt-4o-mini", "deepseek-chat"],
    "管理员": ["deepseek-chat", "deepseek-reasoner"],
    "游客": [],
}


def get_system_prompt(st):
    mode = st.session_state.get("prompt_mode", "直接解答")
    return PROMPT_MODES.get(mode, SOCRATIC_SYSTEM_PROMPT_2)


def get_model_options(st):
    provider = st.session_state.get("api_provider", "deepseek")
    models = PROVIDER_MODELS.get(provider, ["deepseek-chat", "gpt-4o-mini"])
    return models or ["deepseek-chat"]


def build_socratic_messages(messages, st, max_history=10):
    recent_messages = [
        {"role": message["role"], "content": message["content"]}
        for message in messages[-max_history:]
        if message.get("role") in {"user", "assistant"}
    ]
    return [{"role": "system", "content": get_system_prompt(st)}] + recent_messages


def show_messages(messages, st):
    node_id = st.session_state.get("current_node_id")
    for idx, message in enumerate(messages):
        if message.get("role") not in {"user", "assistant"}:
            continue
        with st.chat_message(message["role"]):
            if message["role"] == "assistant":
                functions.render_reply(message["content"], node_id, str(idx))
            else:
                st.markdown(message["content"])


def _accumulate_usage(st, response):
    usage = getattr(response, "usage", None)
    if usage is None:
        return
    total = getattr(usage, "total_tokens", 0) or 0
    st.session_state.tokens = st.session_state.get("tokens", 0) + total


def chat(client, messages=None):
    if messages is None:
        messages = [{"role": "system", "content": SOCRATIC_SYSTEM_PROMPT_2}]
    while True:
        input_word = input("\n你: ")
        if input_word == "退出":
            break
        messages.append({"role": "user", "content": input_word})
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=messages,
            stream=True,
        )
        history = ""
        print("助手:", end=" ", flush=True)
        for chunk in response:
            if chunk.choices[0].delta.content:
                context = chunk.choices[0].delta.content
                print(context, end="", flush=True)
                history += context
        messages.append({"role": "assistant", "content": history})
    print("\n对话结束。")
    tempt = input("\n是否保存对话历史(Y?N)")
    if tempt in {"Y", "y"}:
        history = functions.message_to_string(messages)
        functions.save_history(history[1], history[0])


def chat_with_ai(st, message_placeholder):
    """流式调用 AI，解析 JSON，显示回复与高亮按钮，保存知识点。"""
    from functions import (
        build_graph_context_for_ai,
        extract_partial_reply,
        parse_ai_reply,
        render_reply,
        save_current_knowledge_points,
        save_node_highlights,
        sync_current_node_messages,
    )

    client = st.session_state.get("client")
    if client is None:
        message_placeholder.error("未连接 API，请重新登录")
        return

    messages = build_socratic_messages(st.session_state.current_messages, st, max_history=1000)
    graph_ctx = build_graph_context_for_ai()
    if graph_ctx:
        messages.append({
            "role": "system",
            "content": f"[知识图谱]\n{graph_ctx}\n请基于用户已探索的知识点，在回复中提及相关概念或推荐进阶方向。",
        })

    model = st.session_state.get("selected_model", "deepseek-chat")
    node_id = st.session_state.current_node_id

    try:
        stream = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.7,
            max_tokens=2000,
            stream=True,
        )
        full_response = ""
        for chunk in stream:
            delta = chunk.choices[0].delta.content if chunk.choices else None
            if delta:
                full_response += delta
                partial = extract_partial_reply(full_response)
                message_placeholder.markdown((partial or "…") + "▌")

        message_placeholder.empty()
        reply_text, highlights, knowledge_nodes = parse_ai_reply(full_response)
        save_current_knowledge_points(node_id, knowledge_nodes)
        save_node_highlights(node_id, highlights)

        with message_placeholder.container():
            render_reply(reply_text, node_id, "live")
        if highlights and not functions.BRANCH_LINK.search(reply_text):
            functions.render_stored_highlights(node_id)

        st.session_state.current_messages.append({"role": "assistant", "content": reply_text})
        sync_current_node_messages()

    except Exception as e:
        error_msg = f"API 调用失败：{str(e)}"
        message_placeholder.error(error_msg)
        st.session_state.current_messages.append({"role": "assistant", "content": error_msg})
        sync_current_node_messages()
