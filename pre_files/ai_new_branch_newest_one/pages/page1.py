# page1.py
"""主界面，负责显示聊天记录和侧边栏"""
'''整合函数全在function内部，负责处理聊天逻辑和侧边栏操作'''
import streamlit as st
import functions
from  stream_chat import show_messages, chat_with_ai, get_model_options, PROMPT_MODES
from functions import (
    init_tree,
    render_tree_sidebar,
    switch_to_node,
    build_graph_context_for_ai,
    create_sub_node,
    render_stored_highlights,
    sync_current_node_messages,
    get_breadcrumb,
<<<<<<< HEAD
    switch_to_root,
=======
>>>>>>> c971cb01ad90e291373c6466b70720d3a55c6371
)

# ========== 检查登录状态 ==========
if "未登录" in st.session_state.get("logged_in", "未登录"):
    st.warning("请先登录")
    st.stop()

# ========== 页面配置 ==========
st.set_page_config(page_title="AI 聊天助手", page_icon="💬")
st.title("💬 AI 聊天助手")

init_tree()

if len(st.session_state.current_messages) == 0:
    st.session_state.current_messages = [
        {"role": "assistant", "content": "你好！我是 AI 编程学习助手。你可以直接提问，也可以点击回复中的知识点深入探索。"}
    ]
    sync_current_node_messages()

# ========== 显示用户信息 ==========
col1, col2 = st.columns([3, 1])
with col1:
    st.write(f"欢迎，**{st.session_state.username}**")
    st.write(f"角色：{st.session_state.profile}")
    breadcrumb = get_breadcrumb()
    if len(breadcrumb) > 1:
        st.caption("分支路径：" + " › ".join(breadcrumb))
<<<<<<< HEAD
        st.button("↩ 回到主线", on_click=switch_to_root, key="back_to_root")
=======
>>>>>>> c971cb01ad90e291373c6466b70720d3a55c6371
with col2:
    if st.button("🚪 退出登录", use_container_width=True):
        st.session_state.clear()
        st.switch_page("pages/login.py")
st.divider()

# ========== 侧边栏 ==========
with st.sidebar:
    render_tree_sidebar()

    st.subheader("⚙️ 对话设置")
    mode_options = list(PROMPT_MODES.keys())
    current_mode = st.session_state.get("prompt_mode", "直接解答")
    prompt_mode = st.selectbox(
        "回答风格",
        mode_options,
        index=mode_options.index(current_mode) if current_mode in mode_options else 0,
    )
    st.session_state.prompt_mode = prompt_mode

    with st.expander("🌱 手动创建分支"):
        branch_title = st.text_input("分支主题", key="branch_title_input", placeholder="输入分支名称...")
        if st.button("创建分支", use_container_width=True):
            if branch_title.strip():
                new_id = create_sub_node(st.session_state.current_node_id, branch_title.strip())
                switch_to_node(new_id)
                st.rerun()
            else:
                st.warning("请输入分支名称")

    if st.button("🗑️ 清空当前对话", use_container_width=True):
        st.session_state.current_messages = [
            {"role": "assistant", "content": "对话已清空。我们从头开始。"}
        ]
        node = st.session_state.tree_nodes[st.session_state.current_node_id]
        node.messages = st.session_state.current_messages
        node.last_highlights = []
        st.session_state.pending_ai_response = False
        st.rerun()

    st.divider()
    st.subheader("📊 对话统计")
    user_msgs = sum(1 for m in st.session_state.current_messages if m["role"] == "user")
    assistant_msgs = sum(1 for m in st.session_state.current_messages if m["role"] == "assistant")
    st.write(f"用户消息：{user_msgs} 条")
    st.write(f"AI 回复：{assistant_msgs} 条")
    st.write(f"消耗 token：{st.session_state.get('tokens', 0)}")

    if st.button("💾 导出当前对话 TXT", use_container_width=True):
        _, history = functions.message_to_string(st.session_state.current_messages)
        st.download_button(
            "📥 下载对话历史",
            history,
            file_name="对话历史.txt",
            mime="text/plain",
        )

    st.divider()
    st.subheader("🔌 API 信息")
    st.write(f"用户：{st.session_state.username}")
    st.write(f"供应商：{st.session_state.get('api_provider', '未设置')}")

    st.divider()
    st.subheader("🧠 AI 推荐")
    if st.button("💡 推荐下一知识点", use_container_width=True):
        graph_ctx = build_graph_context_for_ai()
        if not graph_ctx:
            st.session_state.recommendation = "还没有知识点记录，继续对话积累吧。"
        else:
            client = st.session_state.get("client")
            if client is not None:
                try:
                    rec_messages = [
                        {"role": "system", "content": "你是学习路径规划专家。请根据用户已探索的知识点，推荐 1-2 个值得深入学习的下一知识点。用 [名称](knowledge:简介) 格式标记。"},
                        {"role": "user", "content": f"用户已探索的知识点图谱：{graph_ctx}\n请给出推荐。"},
                    ]
                    rec_response = client.chat.completions.create(
                        model=st.session_state.get("selected_model", "deepseek-chat"),
                        messages=rec_messages,
                        temperature=0.7,
                        max_tokens=300,
                    )
                    st.session_state.recommendation = rec_response.choices[0].message.content
                except Exception as e:
                    st.session_state.recommendation = f"获取推荐失败：{e}"
            else:
                st.session_state.recommendation = "游客模式无法获取推荐，请先登录。"

    if "recommendation" in st.session_state:
        with st.expander("📖 推荐结果", expanded=True):
            st.markdown(st.session_state.recommendation)
            if st.button("清除推荐", key="clear_rec"):
                del st.session_state.recommendation
                st.rerun()

# ========== 聊天记录 ==========
show_messages(st.session_state.current_messages, st)
render_stored_highlights()

# ========== API 客户端与输入 ==========
client = st.session_state.get("client")

if client is None:
    st.info("🔓 游客模式：请登录后使用完整功能")
    if prompt := st.chat_input("请输入你的问题"):
        st.session_state.current_messages.append({"role": "user", "content": prompt})
        st.session_state.current_messages.append({"role": "assistant", "content": "请先登录并配置 API Key。"})
        sync_current_node_messages()
        st.rerun()
else:
    st.success("✅ API 已连接")
    model_options = get_model_options(st)
    default_model = st.session_state.get("selected_model", model_options[0])
    if default_model not in model_options:
        default_model = model_options[0]
    selected_model = st.selectbox("选择模型", model_options, index=model_options.index(default_model))
    st.session_state.selected_model = selected_model

    if prompt := st.chat_input("请输入你的问题"):
        st.session_state.current_messages.append({"role": "user", "content": prompt})
        sync_current_node_messages()
        st.session_state.pending_ai_response = True
        st.rerun()

if st.session_state.get("pending_ai_response") and client is not None:
    with st.chat_message("assistant"):
        message_placeholder = st.empty()
        chat_with_ai(st, message_placeholder)
    st.session_state.pending_ai_response = False
    st.rerun()
