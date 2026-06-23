
# chat_tree.py
import uuid
import copy
import re
import json
import streamlit as st
import os
'''文件保存和读取'''
def create_file_name(name):
    path=os.path.join(os.getcwd(),name)
    counter=1
    while True:
        if os.path.exists(path):
            path = os.path.join(os.getcwd(), name+"_"+str(counter))
            counter += 1
        else:
            return path
def save_history(history,name="对话历史.txt"):
    file_name=create_file_name(name)
    with open(file_name,"w",encoding="utf-8") as f:
        f.write(history)
'''将消息转换为字符串'''
def message_to_string(messages):
    history=""
    set=""
    for message in messages:
        role=message["role"]
        content=message["content"]
        if role=="system":
            set=content
        if role=="user":
            history+="你: "+content+"\n"
        elif role=="assistant":
            history+="助手: "+content+"\n"
    return set,history
'''知识树节点处理和相关操作'''
class SessionNode:
    def __init__(self, parent_id=None, title="", messages=None, knowledge_points=None):
        self.id = str(uuid.uuid4())
        self.parent_id = parent_id
        self.title = title
        self.messages = messages if messages is not None else []
        self.children = []
        self.knowledge_points = knowledge_points if knowledge_points is not None else []
        self.last_highlights = []
        self.archived = False
        self.merged_to = None


def init_tree():
    if "tree_nodes" not in st.session_state:
        root = SessionNode(parent_id=None, title="根对话", messages=[])
        st.session_state.tree_nodes = {root.id: root}
        st.session_state.current_node_id = root.id
        st.session_state.current_messages = root.messages


def get_node(node_id):
    return st.session_state.tree_nodes.get(node_id)


def get_root_node():
    return next((v for v in st.session_state.tree_nodes.values() if v.parent_id is None), None)


def sync_current_node_messages():
    """将 current_messages 写回当前树节点。"""

    node_id = st.session_state.get("current_node_id")
    if node_id and node_id in st.session_state.tree_nodes:
        st.session_state.tree_nodes[node_id].messages = st.session_state.current_messages


def create_sub_node(parent_id, title):
    parent_node = st.session_state.tree_nodes[parent_id]
    inherited = copy.deepcopy(parent_node.messages)
    inherited.append({"role": "system", "content": f"【分支对话】深入探讨：{title}"})
    parent_kp_hint = ""
    if parent_node.knowledge_points:
        names = "、".join(kp.get("name", "") for kp in parent_node.knowledge_points if kp.get("name"))
        if names:
            parent_kp_hint = f"\n父分支已涉及知识点：{names}"
            inherited.append({"role": "system", "content": parent_kp_hint})
    new_node = SessionNode(parent_id=parent_id, title=title, messages=inherited)
    st.session_state.tree_nodes[new_node.id] = new_node
    parent_node.children.append(new_node.id)
    return new_node.id


def switch_to_node(node_id):
    if node_id not in st.session_state.tree_nodes:
        return
    st.session_state.current_node_id = node_id
    st.session_state.current_messages = st.session_state.tree_nodes[node_id].messages


def switch_to_parent():
    node = get_node(st.session_state.current_node_id)
    if node and node.parent_id:
        switch_to_node(node.parent_id)


def get_breadcrumb(node_id=None):
    if node_id is None:
        node_id = st.session_state.current_node_id
    trail = []
    while node_id:
        node = get_node(node_id)
        if not node:
            break
        trail.append(node.title)
        node_id = node.parent_id
    return list(reversed(trail))


def archive_node(node_id):
    st.session_state.tree_nodes[node_id].archived = True


def unarchive_node(node_id):
    st.session_state.tree_nodes[node_id].archived = False


def merge_node(source_id, target_id):
    source = st.session_state.tree_nodes[source_id]
    target = st.session_state.tree_nodes[target_id]
    summary_parts = []
    for msg in source.messages:
        if msg["role"] == "assistant":
            text = re.sub(r"\[([^\]]+)\]\(knowledge:[^)]*\)", r"\1", msg["content"])
            first_sentence = text.split("。")[0].strip()
            if len(first_sentence) > 10:
                summary_parts.append(first_sentence)
    if source.knowledge_points:
        kp_names = "、".join(kp.get("name", "") for kp in source.knowledge_points if kp.get("name"))
        if kp_names:
            summary_parts.append(f"涉及知识点：{kp_names}")
    summary = "\n".join(f"- {s}" for s in summary_parts[:4])
    summary_text = f"分支「{source.title}」核心发现：\n{summary}" if summary else f"分支「{source.title}」已合并"
    target.messages.append({"role": "system", "content": f"【已合并分支：{source.title}】\n{summary_text}"})
    for kp in source.knowledge_points:
        name = kp.get("name", "")
        if name and name not in {p.get("name") for p in target.knowledge_points}:
            target.knowledge_points.append(kp)
    source.merged_to = target_id
    source.archived = True
    st.session_state.tree_nodes[target_id].messages = target.messages
    st.session_state.tree_nodes[target_id].knowledge_points = target.knowledge_points
    if st.session_state.current_node_id == target_id:
        st.session_state.current_messages = target.messages

'''保存知识点'''
def save_knowledge_points(node_id, knowledge_nodes):
    if not knowledge_nodes:
        return
    node = st.session_state.tree_nodes[node_id]
    existing = {kp.get("name") for kp in node.knowledge_points}
    for kn in knowledge_nodes:
        name = kn.get("name", "")
        if name and name not in existing:
            node.knowledge_points.append({"name": name, "description": kn.get("description", "")})
            existing.add(name)


def save_current_knowledge_points(node_id, knowledge_nodes):
    """保存知识点并同步当前节点状态。"""
    save_knowledge_points(node_id, knowledge_nodes)
    sync_current_node_messages()


def save_node_highlights(node_id, highlights):
    node = get_node(node_id)
    if node is not None:
        node.last_highlights = [h for h in highlights if h]


BRANCH_LINK = re.compile(r"\[([^\]]+)\]\(branch(?::[^)]*)?\)")


def extract_partial_reply(text):
    """流式输出时从 partial JSON 中提取 reply 字段内容。"""
    m = re.search(r'"(?:reply|回复)"\s*:\s*"', text or "")
    if not m:
        return None
    i, out = m.end(), []
    while i < len(text):
        if text[i] == "\\" and i + 1 < len(text):
            out.append({"n": "\n", "t": "\t", '"': '"', "\\": "\\"}.get(text[i + 1], text[i + 1]))
            i += 2
        elif text[i] == '"':
            return "".join(out)
        else:
            out.append(text[i])
            i += 1
    return "".join(out) if out else None


def parse_ai_reply(ai_output):
    """解析 AI JSON，提取 reply、highlights、knowledge_nodes。"""
    text = (ai_output or "").strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        return text, [], []
    try:
        data = json.loads(text[start:end + 1])
        reply = data.get("reply") or data.get("回复") or text
        highlights = data.get("highlights") or data.get("精彩片段") or []
        knowledge_nodes = data.get("knowledge_nodes") or []
        from_reply = BRANCH_LINK.findall(reply)
        if from_reply:
            highlights = from_reply + [h for h in highlights if h not in from_reply]
        elif not highlights and knowledge_nodes:
            highlights = [kn.get("name") or kn.get("名称") or "" for kn in knowledge_nodes if isinstance(kn, dict)]
        nodes = []
        for kn in knowledge_nodes:
            if not isinstance(kn, dict):
                continue
            name = kn.get("name") or kn.get("名称") or ""
            if name:
                nodes.append({"name": name, "description": kn.get("description") or kn.get("描述") or ""})
        return reply, [h for h in highlights if h], nodes
    except (json.JSONDecodeError, TypeError, AttributeError):
        return text[:start].strip() or text, [], []


def switch_to_root():
    root = get_root_node()
    if root:
        switch_to_node(root.id)


def render_reply(reply, node_id, key_prefix=""):
    """渲染回复：文中 [概念](branch) 渲染为可点击按钮，其余为 Markdown。"""
    if not reply:
        return
    pos, found = 0, False
    for m in BRANCH_LINK.finditer(reply):
        found = True
        if m.start() > pos:
            st.markdown(reply[pos:m.start()])
        st.button(
            m.group(1),
            key=f"hl_{key_prefix}_{node_id}_{m.start()}_{m.group(1)}",
            on_click=_create_and_switch,
            args=(node_id, m.group(1)),
        )
        pos = m.end()
    if pos < len(reply):
        st.markdown(reply[pos:])
    if not found:
        st.markdown(reply)


def render_stored_highlights(node_id=None):
    node = get_node(node_id or st.session_state.current_node_id)
    if node and node.last_highlights and not BRANCH_LINK.search(
        (node.messages[-1]["content"] if node.messages else "")
    ):
        st.caption("📌 点击深入：")
        cols = st.columns(min(len(node.last_highlights), 4))
        for i, word in enumerate(node.last_highlights[:4]):
            cols[i].button(
                word,
                key=f"stored_{node.id}_{i}_{word}",
                on_click=_create_and_switch,
                args=(node.id, word),
            )


def aggregate_knowledge_graph():
    graph = {"all_points": [], "edges": []}
    seen = set()

    def _walk(nid, parent_names=None):
        if parent_names is None:
            parent_names = set()
        n = st.session_state.tree_nodes.get(nid)
        if not n or n.merged_to:
            return
        cur = set()
        for kp in n.knowledge_points:
            name = kp.get("name", "")
            if name and name not in seen:
                seen.add(name)
                graph["all_points"].append({
                    "name": name,
                    "description": kp.get("description", ""),
                    "node_title": n.title,
                })
                cur.add(name)
        for pn in parent_names:
            for cn in cur:
                graph["edges"].append({"source": pn, "target": cn})
        for cid in n.children:
            _walk(cid, cur)

    root = get_root_node()
    if root:
        _walk(root.id)
    return graph


def graph_context_for_ai():
    g = aggregate_knowledge_graph()
    if not g["all_points"]:
        return ""
    points = "、".join(p["name"] for p in g["all_points"])
    return f"用户已探索：{points}。"


def build_graph_context_for_ai():
    return graph_context_for_ai()


def export_tree_payload():
    root = get_root_node()
    if not root:
        return []
    data = []

    def _exp(nid, out):
        n = st.session_state.tree_nodes[nid]
        out.append({
            "id": n.id,
            "parent_id": n.parent_id,
            "title": n.title,
            "messages": n.messages,
            "knowledge_points": n.knowledge_points,
            "last_highlights": n.last_highlights,
            "archived": n.archived,
            "merged_to": n.merged_to,
            "children": n.children,
        })
        for cid in n.children:
            _exp(cid, out)

    _exp(root.id, data)
    return data


def import_tree_payload(payload):
    if not payload:
        return False
    nodes = {}
    for item in payload:
        node = SessionNode(
            parent_id=item.get("parent_id"),
            title=item.get("title", "未命名"),
            messages=item.get("messages", []),
            knowledge_points=item.get("knowledge_points", []),
        )
        node.id = item.get("id", node.id)
        node.last_highlights = item.get("last_highlights", [])
        node.archived = item.get("archived", False)
        node.merged_to = item.get("merged_to")
        node.children = item.get("children", [])
        nodes[node.id] = node
    if not nodes:
        return False
    st.session_state.tree_nodes = nodes
    root = get_root_node()
    if root is None:
        first = next(iter(nodes.values()))
        first.parent_id = None
        root = first
    st.session_state.current_node_id = root.id
    st.session_state.current_messages = root.messages
    return True


def _render_tree_node(nid, level):
    node = get_node(nid)
    if not node or node.archived:
        return
    indent = "　" * level
    icon = "🔗" if node.merged_to else ("📍" if nid == st.session_state.current_node_id else "📁")
    label = f"{indent}{icon} {node.title}"
    show_actions = node.parent_id and nid != st.session_state.current_node_id
    if show_actions:
        cols = st.columns([3, 1, 1])
        with cols[0]:
            st.button(
                label,
                key=f"tr_{nid}",
                on_click=switch_to_node,
                args=(nid,),
                use_container_width=True,
            )
        with cols[1]:
            st.button("归档", key=f"arc_{nid}", on_click=archive_node, args=(nid,))
        with cols[2]:
            st.button("合并", key=f"mrg_{nid}", on_click=_merge_and_switch, args=(nid,))
    else:
        st.button(
            label,
            key=f"tr_{nid}",
            disabled=nid == st.session_state.current_node_id,
            on_click=switch_to_node,
            args=(nid,),
            use_container_width=True,
        )


def render_tree_sidebar():
    st.subheader("📚 知识树")
    root = get_root_node()
    if not root:
        return

    breadcrumb = get_breadcrumb()
    if breadcrumb:
        st.caption("当前路径：" + " › ".join(breadcrumb))

    current = get_node(st.session_state.current_node_id)
    if current and current.parent_id:
        if st.button("⬆️ 返回上级分支", use_container_width=True, on_click=switch_to_parent):
            pass
        st.divider()

    q = [(root.id, 0)]
    while q:
        nid, level = q.pop(0)
        _render_tree_node(nid, level)
        node = get_node(nid)
        if node:
            for cid in node.children:
                q.append((cid, level + 1))

    st.divider()
    archived = [v for v in st.session_state.tree_nodes.values() if v.archived and v.parent_id]
    if archived:
        with st.expander(f"🗄️ 已归档 ({len(archived)})"):
            for node in archived:
                if st.button(f"恢复 {node.title}", key=f"unarc_{node.id}", on_click=unarchive_node, args=(node.id,)):
                    pass
        st.divider()

    g = aggregate_knowledge_graph()
    if g["all_points"]:
        st.markdown(f"**📊 知识图谱** ({len(g['all_points'])} 点)")
        with st.expander("查看"):
            for p in g["all_points"]:
                if p["description"]:
                    st.write(f"- **{p['name']}** ({p['node_title']}): {p['description']}")
                else:
                    st.write(f"- **{p['name']}** ({p['node_title']})")
        st.divider()

    export_col, import_col = st.columns(2)
    with export_col:
        if st.button("🗺️ 导出", use_container_width=True):
            st.session_state.show_tree_export = True
    with import_col:
        uploaded = st.file_uploader("📥 导入", type=["json"], key="tree_import_uploader", label_visibility="collapsed")
        if uploaded is not None:
            try:
                payload = json.loads(uploaded.getvalue().decode("utf-8"))
                if import_tree_payload(payload):
                    st.success("知识树导入成功")
                    st.rerun()
            except (json.JSONDecodeError, UnicodeDecodeError) as e:
                st.error(f"导入失败：{e}")

    if st.session_state.get("show_tree_export"):
        st.download_button(
            "📥 下载 JSON",
            json.dumps(export_tree_payload(), ensure_ascii=False, indent=2),
            file_name="knowledge_tree.json",
            mime="application/json",
        )


def _create_and_switch(parent_id, title):
    new_id = create_sub_node(parent_id, title)
    switch_to_node(new_id)


def _merge_and_switch(source_id):
    node = st.session_state.tree_nodes[source_id]
    if node.parent_id:
        merge_node(source_id, node.parent_id)
        switch_to_node(node.parent_id)
