# chat_tree.py
import uuid
import copy
import streamlit as st
import json

class SessionNode:
    def __init__(self, parent_id=None, title="", messages=None):
        self.id = str(uuid.uuid4())
        self.parent_id = parent_id
        self.title = title
        self.messages = messages if messages is not None else []
        self.children = []

def init_tree():
    """初始化对话树，必须在 session_state 中创建"""
    if "tree_nodes" not in st.session_state:
        root = SessionNode(parent_id=None, title="根对话", messages=[])
        st.session_state.tree_nodes = {root.id: root}
        st.session_state.current_node_id = root.id
        st.session_state.current_messages = root.messages

def create_sub_node(parent_id, title):
    """创建子对话节点，继承父节点的消息历史（深拷贝）"""
    parent_node = st.session_state.tree_nodes[parent_id]
    inherited = copy.deepcopy(parent_node.messages)
    # 可选：添加系统消息标记分支起点
    inherited.append({"role": "system", "content": f"【分支对话】深入探讨：{title}"})
    new_node = SessionNode(parent_id=parent_id, title=title, messages=inherited)
    st.session_state.tree_nodes[new_node.id] = new_node
    parent_node.children.append(new_node.id)
    return new_node.id

def switch_to_node(node_id):
    """切换到指定节点，同时更新 current_messages"""
    st.session_state.current_node_id = node_id
    st.session_state.current_messages = st.session_state.tree_nodes[node_id].messages
   

def render_tree_sidebar():
    """侧边栏渲染树形结构"""
    import streamlit as st
    st.subheader("📚 知识树")
    root_id = [nid for nid, node in st.session_state.tree_nodes.items() if node.parent_id is None][0]
    
    def _show_tree(node_id, level=0):
        node = st.session_state.tree_nodes[node_id]
        indent = "　" * level
        label = f"{indent}📁 {node.title}"
        if st.button(label, key=node_id):
            switch_to_node(node_id)
        for child_id in node.children:
            _show_tree(child_id, level+1)
    
    _show_tree(root_id)
    st.divider()
    
    # 导出知识图谱按钮
    if st.button("🗺️ 导出知识图谱"):
        def dfs_export(node_id, result):
            node = st.session_state.tree_nodes[node_id]
            result.append({
                "id": node.id,
                "parent_id": node.parent_id,
                "title": node.title,
                "messages": node.messages
            })
            for child_id in node.children:
                dfs_export(child_id, result)
        export_data = []
        dfs_export(root_id, export_data)
        st.download_button(
            label="📥 下载 JSON",
            data=json.dumps(export_data, ensure_ascii=False, indent=2),
            file_name="knowledge_tree.json",
            mime="application/json"
        )

def parse_ai_reply(ai_output: str):
    """解析 AI 返回的 JSON，提取 reply 和 highlights"""
    try:
        data = json.loads(ai_output)
        reply = data.get("reply", ai_output)
        highlights = data.get("highlights", [])
    except:
        reply = ai_output
        highlights = []
    return reply, highlights

def render_highlight_buttons(highlights, parent_node_id):
    if not highlights:
        return
    st.markdown("**📌 可深入探讨的知识点：**")
    cols = st.columns(len(highlights))
    for i, word in enumerate(highlights):
        # 使用 on_click 回调，避免直接调用
        cols[i].button(
            f"🔍 {word}",
            key=f"sub_{parent_node_id}_{word}",
            on_click=create_and_switch,
            args=(parent_node_id, word)
        )

def create_and_switch(parent_id, title):
    """回调函数：创建子节点并切换"""
    new_id = create_sub_node(parent_id, title)
    switch_to_node(new_id)