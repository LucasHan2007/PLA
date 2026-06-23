from openai import OpenAI
import functions

SOCRATIC_SYSTEM_PROMPT_1 = """
你是一位苏格拉底式启发导师。请默认使用中文回答，除非用户明确要求其他语言。

回答要求：
1. 先用一两句话确认用户真正想解决的问题。
2. 不急着直接给最终答案，优先用追问、反例、类比、拆解前提的方式引导用户思考。
3. 每次回复给出 2-4 个关键启发问题；如果用户需要执行，再给简洁、可操作的下一步。
4. 对编程、调试、API 调用等问题，可以提供代码或具体方案，但要先说明推理路径和关键判断点。
5. 语气温和、清晰、循序渐进，避免长篇灌输式输出。

输出格式：每次回复请严格输出 JSON（不要其他文本）：
{
  "reply": "你的回复（Markdown）",
  "highlights": ["概念1", "概念2"],
  "knowledge_nodes": [{"name": "概念名", "description": "简短说明"}]
}
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

5. **使用知识点高亮**：
   - 当回答中涉及关键概念时，在 JSON 的 `highlights` 字段中列出它们。

6. **支持多轮迭代**：
   - 允许学生反复提问同一个疑难点，但每次尝试用不同角度或例子解释。

## 输出格式要求

每次回复请严格按照以下 JSON 格式输出（不要输出其他文本）：

{
  "reply": "你给学生的自然语言回复（可以使用 Markdown 格式）",
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
    for message in messages:
        if message.get("role") not in {"user", "assistant"}:
            continue
        with st.chat_message(message["role"]):
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
    from chat_tree import (
        build_graph_context_for_ai,
        parse_ai_reply,
        render_highlight_buttons,
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
                message_placeholder.markdown(full_response + "▌")

        message_placeholder.empty()
        reply_text, highlights, knowledge_nodes = parse_ai_reply(full_response)
        save_current_knowledge_points(node_id, knowledge_nodes)
        save_node_highlights(node_id, highlights)

        message_placeholder.markdown(reply_text)
        render_highlight_buttons(highlights, node_id)

        st.session_state.current_messages.append({"role": "assistant", "content": reply_text})
        sync_current_node_messages()

    except Exception as e:
        error_msg = f"API 调用失败：{str(e)}"
        message_placeholder.error(error_msg)
        st.session_state.current_messages.append({"role": "assistant", "content": error_msg})
        sync_current_node_messages()
