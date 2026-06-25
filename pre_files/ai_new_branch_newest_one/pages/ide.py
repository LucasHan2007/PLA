# pages/ide.py — LeetCode 式左右布局：左代码区，右对话区
import streamlit as st

from code_bridge import render_editor
from stream_chat import show_messages, chat_with_ai
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


def _sync_editor_draft_from_node():
    node_id = st.session_state.current_node_id
    if st.session_state.get("_editor_node_id") != node_id:
        st.session_state.editor_draft = get_node_code()
        st.session_state._editor_node_id = node_id


@st.fragment
def _chat_panel(client):
    panel_tab = st.radio(
        "Panel",
        ["Chat", "Problems"],
        horizontal=True,
        label_visibility="collapsed",
        key="right_panel",
    )

    if panel_tab == "Problems":
        diags = st.session_state.get("editor_diagnostics") or []
        if diags:
            for d in diags:
                st.error(f"行 {d.get('line', '?')}: {d.get('message', '')}")
        else:
            st.success("未发现语法错误")
        return

    chat_box = st.container(height=520)
    with chat_box:
        show_messages(st.session_state.current_messages, st)
        render_stored_highlights()

    if client is None:
        if prompt := st.chat_input("请输入问题（请先登录 API）", key="chat_input_guest"):
            st.session_state.current_messages.append({"role": "user", "content": prompt})
            st.session_state.current_messages.append(
                {"role": "assistant", "content": "请先登录并配置 API Key。"}
            )
            sync_current_node_messages()
            st.rerun()
    else:
        if prompt := st.chat_input("向 AI 提问，可请求检查或修改左侧代码...", key="chat_input_user"):
            code_ctx = st.session_state.get("editor_draft") or get_node_code()
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
if "editor_draft" not in st.session_state:
    st.session_state.editor_draft = get_node_code()
if "_editor_node_id" not in st.session_state:
    st.session_state._editor_node_id = st.session_state.current_node_id

if len(st.session_state.current_messages) == 0:
    st.session_state.current_messages = [
        {
            "role": "assistant",
            "content": "你好！左侧编写代码，右侧与我对话。我可以阅读并帮你修改代码。",
        }
    ]
    sync_current_node_messages()

_sync_editor_draft_from_node()

with st.sidebar:
    render_vscode_sidebar()

header_l, header_r = st.columns([5, 1])
with header_l:
    st.markdown("### AI 编程 IDE")
    breadcrumb = get_breadcrumb()
    if len(breadcrumb) > 1:
        st.caption("分支：" + " › ".join(breadcrumb))
        st.button("回到主线", on_click=switch_to_root, key="ide_back_root")
with header_r:
    if st.button("简洁聊天", use_container_width=True):
        st.switch_page("pages/page1.py")

col_code, col_chat = st.columns([7, 5], gap="small")

diagnostics = st.session_state.get("editor_diagnostics") or []

with col_code:
    st.markdown('<div class="leetcode-panel-head"><span>代码</span><span class="file-tag">main.py</span></div>', unsafe_allow_html=True)
    edited_code, editor_action = render_editor(
        code=st.session_state.editor_draft,
        diagnostics=diagnostics,
        height=640,
        key="main_editor",
    )
    if edited_code is not None:
        st.session_state.editor_draft = edited_code
        if editor_action == "save":
            save_node_code(edited_code)
            st.session_state.code_dirty = False
            st.toast("代码已保存", icon="💾")
        elif editor_action == "check":
            st.session_state.editor_diagnostics = check_python_syntax(edited_code)
            st.session_state.right_panel = "Problems"
            st.rerun()
        elif edited_code != get_node_code():
            st.session_state.code_dirty = True

with col_chat:
    st.markdown('<div class="leetcode-panel-head"><span>对话 / 诊断</span></div>', unsafe_allow_html=True)
    _chat_panel(st.session_state.get("client"))

render_status_bar()
