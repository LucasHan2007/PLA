# 流式对话.py (修改后)
import streamlit as st
from openai import OpenAI
import json
from chat_tree import parse_ai_reply, render_highlight_buttons

# 这里使用你最终的二号提示词（可以放在单独文件）
SOCRATIC_SYSTEM_PROMPT = """
你是一个专业的编程学习引导者。...（上面修改后的完整提示词）...
"""

def build_socratic_messages(messages, max_history=10):
    recent_messages = [
        {"role": m["role"], "content": m["content"]}
        for m in messages[-max_history:]
        if m.get("role") in ("user", "assistant")
    ]
    return [{"role": "system", "content": SOCRATIC_SYSTEM_PROMPT}] + recent_messages

def show_messages(messages, st):
    for msg in messages:
        with st.chat_message(msg["role"]):
            st.markdown(msg["content"])

def chat_with_ai(st, message_placeholder):
    """非流式调用 AI，解析 JSON，显示回复和高亮按钮"""
    client = st.session_state.get("client")
    if client is None:
        message_placeholder.error("未连接 API，请重新登录")
        return
    model = st.session_state.get("selected_model", "deepseek-chat")
    messages = build_socratic_messages(st.session_state.current_messages)  # 注意使用 current_messages
    
    try:
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.7,
            max_tokens=2000,
            stream=False  # 方便解析完整 JSON
        )
        full_response = response.choices[0].message.content
        # 解析 JSON
        reply_text, highlights = parse_ai_reply(full_response)
        message_placeholder.markdown(reply_text)
        # 渲染高亮按钮（传入当前节点 ID）
        render_highlight_buttons(highlights, st.session_state.current_node_id)
        # 将 AI 回复存入消息列表（只存 reply_text，不存 JSON 结构）
        st.session_state.current_messages.append({"role": "assistant", "content": reply_text})
        # 同步更新到树节点
        st.session_state.tree_nodes[st.session_state.current_node_id].messages = st.session_state.current_messages
    except Exception as e:
        error_msg = f"API 调用失败：{str(e)}"
        message_placeholder.error(error_msg)
        st.session_state.current_messages.append({"role": "assistant", "content": error_msg})
        st.session_state.tree_nodes[st.session_state.current_node_id].messages = st.session_state.current_messages