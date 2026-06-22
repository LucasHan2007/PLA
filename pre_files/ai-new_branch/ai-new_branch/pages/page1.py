# page1.py 修改版
import streamlit as st
from openai import OpenAI
from 流式对话 import build_socratic_messages, show_messages, chat_with_ai
from chat_tree import init_tree, render_tree_sidebar, switch_to_node

# ========== 检查登录状态 ==========
if "未登录" in st.session_state.get("logged_in", "未登录"):
    st.warning("请先登录")
    st.stop()

# ========== 页面配置 ==========
st.set_page_config(page_title="AI 聊天助手", page_icon="💬")
st.title("💬 AI 聊天助手")

# 初始化对话树（必须在所有使用 current_messages 之前）
init_tree()

# 确保当前节点有消息列表（新根节点为空，可以给一条欢迎语）
if len(st.session_state.current_messages) == 0:
    st.session_state.current_messages = [
        {"role": "assistant", "content": "你好！我是 AI 启发式助手。我们可以一步步拆问题，我会用问题帮你把思路理清。"}
    ]
    st.session_state.tree_nodes[st.session_state.current_node_id].messages = st.session_state.current_messages

# ========== 显示用户信息 ==========
col1, col2 = st.columns([3, 1])
with col1:
    st.write(f"欢迎，**{st.session_state.username}**")
    st.write(f"角色：{st.session_state.profile}")
with col2:
    if st.button("🚪 退出登录", use_container_width=True):
        st.session_state.clear()
        st.switch_page("login.py")
st.divider()

# ========== 侧边栏（包含树形结构）==========
with st.sidebar:
    render_tree_sidebar()   # 显示知识树和导出按钮
    
    st.subheader("⚙️ 对话设置")
    if st.button("🗑️ 清空当前对话", use_container_width=True):
        # 清空当前节点的消息，而不是清空所有树
        st.session_state.current_messages = [
            {"role": "assistant", "content": "对话已清空。我们从头开始。"}
        ]
        st.session_state.tree_nodes[st.session_state.current_node_id].messages = st.session_state.current_messages
        st.rerun()
    
    st.divider()
    st.subheader("📊 对话统计")
    user_msgs = sum(1 for m in st.session_state.current_messages if m["role"] == "user")
    assistant_msgs = sum(1 for m in st.session_state.current_messages if m["role"] == "assistant")
    st.write(f"用户消息：{user_msgs} 条")
    st.write(f"AI 回复：{assistant_msgs} 条")
    st.write(f"消耗 token：{st.session_state.get('tokens', 0)}")
    st.caption("流式回复通常不会返回精确 token 用量。")
    
    st.divider()
    st.subheader("🔌 API 信息")
    st.write(f"用户：{st.session_state.username}")
    st.write(f"API 类型：{st.session_state.profile}")

# ========== 显示聊天记录 ==========
show_messages(st.session_state.current_messages, st)

# ========== 检查 API 客户端 ==========
client = st.session_state.get("client")
if client is None:
    st.info("🔓 游客模式：请登录后使用完整功能")
    if prompt := st.chat_input("请输入你的问题"):
        st.session_state.current_messages.append({"role": "user", "content": prompt})
        st.session_state.tree_nodes[st.session_state.current_node_id].messages = st.session_state.current_messages
        with st.chat_message("user"):
            st.markdown(prompt)
        with st.chat_message("assistant"):
            st.markdown("请先登录配置 API Key")
        st.session_state.current_messages.append({"role": "assistant", "content": "请先登录配置 API Key"})
        st.session_state.tree_nodes[st.session_state.current_node_id].messages = st.session_state.current_messages
        st.rerun()
else:
    st.success("✅ API 已连接")
    
    # 模型选择
    model_options = ["gpt-3.5-turbo", "gpt-4", "deepseek-chat", "gpt-4o"]
    selected_model = st.selectbox("选择模型", model_options, index=2)
    st.session_state.selected_model = selected_model
    
    # 聊天输入
    if prompt := st.chat_input("请输入你的问题"):
        st.session_state.current_messages.append({"role": "user", "content": prompt})
        st.session_state.tree_nodes[st.session_state.current_node_id].messages = st.session_state.current_messages
        
        with st.chat_message("user"):
            st.markdown(prompt)
        
        with st.chat_message("assistant"):
            message_placeholder = st.empty()
            chat_with_ai(st, message_placeholder)   # 该函数内部会更新 current_messages 和树节点
        
    