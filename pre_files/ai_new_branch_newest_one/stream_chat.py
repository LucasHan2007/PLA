from openai import OpenAI
import functions
from promt_list import PROMPTS

PROMPT_MODES = {
    "启发式引导": PROMPTS["启发式引导"],
    "直接解答": PROMPTS["直接解答"],
    "CV启发式引导": PROMPTS["CV启发式引导"],
    "CV直接解答": PROMPTS["CV直接解答"],
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
    return PROMPT_MODES.get(mode, PROMPTS["直接解答"])


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
        messages = [{"role": "system", "content": PROMPTS["直接解答"]}]
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
            "content": PROMPTS["知识图谱上下文"].format(graph_ctx=graph_ctx),
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
