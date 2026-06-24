# pages/ide.py — VS Code 式 IDE 主界面
"""编辑器 + 底部 Panel（Chat / Problems）。"""
import streamlit as st
import streamlit.components.v1 as components

from code_bridge import render_editor
from stream_chat import show_messages, chat_with_ai, get_model_options, PROMPT_MODES
from functions import (
    init_tree,
    render_vscode_sidebar,
    render_status_bar,
    inject_vscode_css,
    get_node_code,
    save_node_code,
    check_python_syntax,
    sync_current_node_messages,
    render_stored_highlights,
    get_breadcrumb,
    switch_to_root,
)

if "未登录" in st.session_state.get("logged_in", "未登录"):
    st.warning("请先登录")
    st.stop()

st.set_page_config(page_title="AI 编程 IDE", page_icon="📝", layout="wide")
inject_vscode_css()
init_tree()

if "code_dirty" not in st.session_state:
    st.session_state.code_dirty = False
if "editor_diagnostics" not in st.session_state:
    st.session_state.editor_diagnostics = []

if len(st.session_state.current_messages) == 0:
    st.session_state.current_messages = [
        {
            "role": "assistant",
            "content": "你好！在上方编写代码，在下方与我对话。我可以阅读并帮你修改代码。",
        }
    ]
    sync_current_node_messages()

# ========== 侧边栏 ==========
with st.sidebar:
    render_vscode_sidebar()

# ========== 顶栏 ==========
top1, top2 = st.columns([4, 1])
with top1:
    breadcrumb = get_breadcrumb()
    if len(breadcrumb) > 1:
        st.caption("分支：" + " › ".join(breadcrumb))
        st.button("回到主线", on_click=switch_to_root, key="ide_back_root")
with top2:
    if st.button("简洁聊天模式", use_container_width=True):
        st.switch_page("pages/page1.py")

st.markdown('<div class="vscode-tab-bar">📄 main.py</div>', unsafe_allow_html=True)

# ========== 代码编辑器 ==========
current_code = get_node_code()
diagnostics = st.session_state.get("editor_diagnostics") or check_python_syntax(current_code)
st.session_state.editor_diagnostics = diagnostics

edited_code = render_editor(
    code=current_code,
    diagnostics=diagnostics,
    height=400,
    key=f"editor_{st.session_state.current_node_id}",
)

if edited_code is not None and edited_code != current_code:
    save_node_code(edited_code)
    st.session_state.code_dirty = True
    st.session_state.editor_diagnostics = check_python_syntax(edited_code)

tool_col1, tool_col2, tool_col3 = st.columns([1, 1, 4])
with tool_col1:
    if st.button("保存代码", use_container_width=True):
        code = edited_code if edited_code is not None else get_node_code()
        save_node_code(code)
        st.session_state.editor_diagnostics = check_python_syntax(code)
        st.success("已保存")
with tool_col2:
    if st.button("检查语法", use_container_width=True):
        code = get_node_code()
        st.session_state.editor_diagnostics = check_python_syntax(code)
        st.rerun()

# ========== 底部 Panel ==========
panel_tab = st.radio(
    "Panel",
    ["Chat", "Problems"],
    horizontal=True,
    label_visibility="collapsed",
    key="bottom_panel",
)

if panel_tab == "Problems":
    diags = st.session_state.get("editor_diagnostics") or []
    if diags:
        for d in diags:
            st.error(f"行 {d.get('line', '?')}: {d.get('message', '')}")
    else:
        st.success("未发现语法错误")
else:
    chat_box = st.container(height=320)
    with chat_box:
        show_messages(st.session_state.current_messages, st)
        render_stored_highlights()

    client = st.session_state.get("client")
    if client is None:
        if prompt := st.chat_input("请输入问题（游客请先登录 API）"):
            st.session_state.current_messages.append({"role": "user", "content": prompt})
            st.session_state.current_messages.append(
                {"role": "assistant", "content": "请先登录并配置 API Key。"}
            )
            sync_current_node_messages()
            st.rerun()
    else:
        if prompt := st.chat_input("向 AI 提问，可请求检查或修改上方代码..."):
            code_ctx = get_node_code()
            full_prompt = prompt
            if code_ctx.strip():
                full_prompt = f"{prompt}\n\n【当前代码】\n```python\n{code_ctx}\n```"
            st.session_state.current_messages.append({"role": "user", "content": full_prompt})
            sync_current_node_messages()
            st.session_state.pending_ai_response = True
            st.rerun()

    if st.session_state.get("pending_ai_response") and client is not None:
        with st.chat_message("assistant"):
            message_placeholder = st.empty()
            chat_with_ai(st, message_placeholder)
        st.session_state.pending_ai_response = False
        st.rerun()

render_status_bar()
