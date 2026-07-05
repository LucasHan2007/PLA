import ast
import hashlib
import json
import os
import re
import secrets
import sys
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta
from http import HTTPStatus
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import unquote, urlparse

from openai import OpenAI

from auth.crypto import decrypt_api_key, encrypt_api_key, hash_password, verify_password
from auth.db import get_conn, init_db
from auth.providers import API_PROVIDERS
from promt_list import PROMPTS

ROOT = Path(__file__).resolve().parent.parent
WEB_ROOT = ROOT / "frontend"
SCAFFOLD_ROOT = ROOT / "state"
PROJECT_PLAN_FILE = SCAFFOLD_ROOT / "project_plan.md"
PROJECT_GRAPH_FILE = SCAFFOLD_ROOT / "project_graph.json"
SESSION_DAYS = 14
COOKIE_NAME = "ai_ide_session"
ADMIN_ENV_KEY = "墙木的key"
ADMIN_WORKSPACE_FILE = ROOT / "data" / "admin_workspace.json"

EDITOR_LANGUAGES = {
    "python": {"label": "Python", "ext": "py", "monaco": "python"},
    "javascript": {"label": "JavaScript", "ext": "js", "monaco": "javascript"},
    "cpp": {"label": "C++", "ext": "cpp", "monaco": "cpp"},
    "java": {"label": "Java", "ext": "java", "monaco": "java"},
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
}

PROMPT_MODES = ["直接解答", "启发式引导", "LearnScaffold项目规划", "CV直接解答", "CV启发式引导"]


@dataclass
class Node:
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    parent_id: str | None = None
    title: str = "根对话"
    messages: list[dict] = field(default_factory=list)
    children: list[str] = field(default_factory=list)
    knowledge_points: list[dict] = field(default_factory=list)
    last_highlights: list[str] = field(default_factory=list)
    archived: bool = False
    merged_to: str | None = None
    code: str = "# 在此编写 Python 代码\n"


def json_response(handler, payload, status=200, extra_headers=None):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    for key, value in (extra_headers or {}).items():
        handler.send_header(key, value)
    handler.end_headers()
    handler.wfile.write(body)


def sse_response_start(handler, status=200):
    handler.send_response(status)
    handler.send_header("Content-Type", "text/event-stream; charset=utf-8")
    handler.send_header("Cache-Control", "no-cache")
    handler.send_header("Connection", "close")
    handler.end_headers()


def sse_send(handler, event, payload):
    body = f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n".encode("utf-8")
    handler.wfile.write(body)
    handler.wfile.flush()


def read_json(handler):
    length = int(handler.headers.get("Content-Length") or 0)
    if length <= 0:
        return {}
    return json.loads(handler.rfile.read(length).decode("utf-8"))


def hash_token(token):
    return hashlib.sha256(token.encode()).hexdigest()


def new_token():
    return secrets.token_urlsafe(32)


def cookie_header(token, max_age=SESSION_DAYS * 86400):
    return f"{COOKIE_NAME}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={max_age}"


def clear_cookie_header():
    return f"{COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"


def parse_cookies(raw):
    result = {}
    for part in (raw or "").split(";"):
        if "=" in part:
            key, value = part.strip().split("=", 1)
            result[key] = unquote(value)
    return result


def create_session(user_id):
    token = new_token()
    expires = (datetime.utcnow() + timedelta(days=SESSION_DAYS)).isoformat()
    conn = get_conn()
    try:
        conn.execute(
            "INSERT OR REPLACE INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)",
            (hash_token(token), user_id, expires),
        )
        conn.commit()
    finally:
        conn.close()
    return token


def load_user_by_session(token):
    if not token:
        return None
    if token.startswith("admin:"):
        username = token.split(":", 1)[1] or get_admin_username()
        return {"id": None, "username": username, "profile": "管理员", "api_provider": "管理员"}

    conn = get_conn()
    try:
        row = conn.execute(
            """
            SELECT s.expires_at, u.* FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token_hash=?
            """,
            (hash_token(token),),
        ).fetchone()
    finally:
        conn.close()
    if not row or datetime.fromisoformat(row["expires_at"]) < datetime.utcnow():
        return None
    return dict(row)


def get_admin_username():
    return os.getenv("ADMIN_USERNAME", "1234567890")


def make_root_workspace():
    root = Node(messages=[{"role": "assistant", "content": "你好！左侧编写代码，右侧与我对话。"}])
    return {
        "current_node_id": root.id,
        "nodes": {root.id: asdict(root)},
        "editor_language": "python",
        "prompt_mode": "直接解答",
        "selected_model": "deepseek-chat",
    }


def normalize_workspace(payload):
    if not payload:
        return make_root_workspace()
    if isinstance(payload, list):
        payload = {"tree": payload}
    if "nodes" in payload:
        return payload

    tree = payload.get("tree") if isinstance(payload, dict) else None
    if isinstance(tree, list):
        items = tree
    else:
        items = tree.get("nodes", []) if isinstance(tree, dict) else []
    nodes = {}
    root_id = None
    for item in items:
        node = Node(
            id=item.get("id") or str(uuid.uuid4()),
            parent_id=item.get("parent_id"),
            title=item.get("title") or "对话",
            messages=item.get("messages") or [],
            children=item.get("children") or [],
            knowledge_points=item.get("knowledge_points") or [],
            last_highlights=item.get("last_highlights") or [],
            archived=bool(item.get("archived")),
            merged_to=item.get("merged_to"),
            code=item.get("code") or "# 在此编写 Python 代码\n",
        )
        if node.parent_id is None:
            root_id = node.id
        nodes[node.id] = asdict(node)
    if not nodes:
        return make_root_workspace()
    current = payload.get("current_node_id") or root_id or next(iter(nodes))
    return {
        "current_node_id": current if current in nodes else next(iter(nodes)),
        "nodes": nodes,
        "editor_language": payload.get("editor_language", "python"),
        "prompt_mode": payload.get("prompt_mode", "直接解答"),
        "selected_model": payload.get("selected_model", "deepseek-chat"),
    }


def load_workspace(user):
    if user and user.get("api_provider") == "管理员":
        try:
            if ADMIN_WORKSPACE_FILE.exists():
                return clean_workspace_messages(normalize_workspace(json.loads(ADMIN_WORKSPACE_FILE.read_text(encoding="utf-8"))))
        except (OSError, json.JSONDecodeError):
            pass
        return make_root_workspace()
    if user and user.get("id"):
        conn = get_conn()
        try:
            row = conn.execute("SELECT tree_json FROM user_workspaces WHERE user_id=?", (user["id"],)).fetchone()
        finally:
            conn.close()
        if row and row["tree_json"]:
            try:
                return clean_workspace_messages(normalize_workspace(json.loads(row["tree_json"])))
            except json.JSONDecodeError:
                pass
    return make_root_workspace()


def save_workspace(user, workspace):
    if not user:
        return
    clean_workspace_messages(workspace)
    if user.get("api_provider") == "管理员" or user.get("id") is None:
        ADMIN_WORKSPACE_FILE.parent.mkdir(parents=True, exist_ok=True)
        ADMIN_WORKSPACE_FILE.write_text(json.dumps(workspace, ensure_ascii=False, indent=2), encoding="utf-8")
        return
    if not user.get("id"):
        return
    conn = get_conn()
    try:
        conn.execute(
            """
            INSERT INTO user_workspaces (user_id, tree_json, current_node_id, updated_at)
            VALUES (?,?,?,datetime('now'))
            ON CONFLICT(user_id) DO UPDATE SET
                tree_json=excluded.tree_json,
                current_node_id=excluded.current_node_id,
                updated_at=datetime('now')
            """,
            (user["id"], json.dumps(workspace, ensure_ascii=False), workspace.get("current_node_id")),
        )
        conn.commit()
    finally:
        conn.close()


def public_user(user):
    if not user:
        return None
    provider = user.get("api_provider") or ""
    return {
        "username": user.get("username"),
        "profile": user.get("profile") or "用户",
        "api_provider": provider,
        "models": PROVIDER_MODELS.get(provider, ["deepseek-chat"]),
        "api_connected": bool(provider == "管理员" and os.getenv(ADMIN_ENV_KEY)) or bool(user.get("api_key_encrypted") or provider == "管理员"),
    }


def get_client(user):
    if not user:
        return None
    provider = user.get("api_provider") or ""
    if provider == "管理员":
        key = os.getenv(ADMIN_ENV_KEY)
        return OpenAI(api_key=key, base_url="https://api.deepseek.com/v1") if key else None
    api_key = decrypt_api_key(user.get("api_key_encrypted") or "")
    base_url = (user.get("api_base_url") or API_PROVIDERS.get(provider) or "").rstrip("/")
    if api_key and base_url:
        return OpenAI(api_key=api_key, base_url=base_url, timeout=60.0)
    return None


def visible_messages(node):
    return [m for m in node.get("messages", []) if m.get("role") in {"user", "assistant"}]


def clean_assistant_content(content):
    text = str(content or "")
    if (
        "model_not_found" in text
        or "request_id" in text
        or "does not exist or you do not have access" in text
        or "invalid_request_error" in text
        or text.startswith("API 调用失败")
        or text.startswith("API request failed")
    ):
        return "API 调用失败，请检查模型名称或 API 配置。"
    return text


def clean_workspace_messages(workspace):
    for node in (workspace.get("nodes") or {}).values():
        for msg in node.get("messages") or []:
            if msg.get("role") == "assistant":
                msg["content"] = clean_assistant_content(msg.get("content"))
    return workspace


def check_python_syntax(code):
    try:
        ast.parse(code or "")
        return []
    except SyntaxError as exc:
        return [{
            "line": exc.lineno or 1,
            "col": exc.offset or 1,
            "message": exc.msg,
            "severity": "error",
        }]


def parse_ai_reply(text):
    raw = (text or "").strip()
    # 去除可能的 markdown 代码围栏
    cleaned = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    cleaned = cleaned.strip()
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start >= 0 and end > start:
        try:
            data = json.loads(cleaned[start:end + 1])
            reply = data.get("reply") or data.get("回复") or raw
            highlights = data.get("highlights") or data.get("精彩片段") or []
            knowledge_nodes = data.get("knowledge_nodes") or []
            return data, reply, [h for h in highlights if h], [k for k in knowledge_nodes if isinstance(k, dict)]
        except json.JSONDecodeError:
            # 尝试从 JSON 片段里用正则抽出 reply
            try:
                match = re.search(r'"reply"\s*:\s*"(.*?)"\s*,', cleaned[start:end + 1], re.DOTALL)
                if match:
                    reply = match.group(1).encode("utf-8").decode("unicode_escape")
                    return {}, reply, [], []
            except Exception:
                pass
    return {}, raw, [], []


def read_text_file(path, max_chars=12000):
    try:
        if path.exists():
            return path.read_text(encoding="utf-8")[:max_chars]
    except OSError:
        pass
    return ""


def read_json_file(path):
    try:
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        pass
    return {}


def write_json_file(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def load_graph():
    data = read_json_file(PROJECT_GRAPH_FILE)
    return {
        "project_profile": data.get("project_profile") or {},
        "pcg": data.get("pcg") or {"nodes": [], "edges": []},
        "lkg": data.get("lkg") or [],
        "latest": data.get("latest") or {},
    }


def _lkg_weight_group(weight):
    if weight >= 0.8:
        return "mastered"
    if weight >= 0.5:
        return "familiar"
    return "learning"


def build_lkg_visualization():
    """为前端可视化独立生成 LKG 图结构，不修改现有 LKG/PCG 逻辑。"""
    graph = load_graph()
    lkg = graph.get("lkg") or []
    nodes = []
    node_ids = set()
    for item in lkg:
        name = item.get("name")
        if not name or name in node_ids:
            continue
        node_ids.add(name)
        try:
            weight = float(item.get("weight") if item.get("weight") is not None else 0.5)
        except (TypeError, ValueError):
            weight = 0.5
        nodes.append({
            "id": name,
            "label": name,
            "description": item.get("description") or "",
            "weight": weight,
            "evidence": item.get("evidence") or "",
            "group": _lkg_weight_group(weight),
        })

    edges = []
    seen_edges = set()

    # 1. 显式 related_to 关联
    for item in lkg:
        source = item.get("name")
        if not source:
            continue
        for target in item.get("related_to") or []:
            if target == source or target not in node_ids:
                continue
            key = (source, target)
            if key in seen_edges:
                continue
            seen_edges.add(key)
            edges.append({"source": source, "target": target, "type": "related"})

    # 2. 若不存在显式边，按名称/描述包含关系自动推断边
    if not edges:
        for a in nodes:
            out_count = 0
            for b in nodes:
                if a["id"] == b["id"]:
                    continue
                text_b = f"{b['id']} {b['description']}".lower()
                if a["id"].lower() in text_b:
                    key = (a["id"], b["id"])
                    if key in seen_edges:
                        continue
                    seen_edges.add(key)
                    edges.append({"source": a["id"], "target": b["id"], "type": "implicit"})
                    out_count += 1
                    if out_count >= 3:
                        break

    return {"nodes": nodes, "edges": edges}


def save_graph(graph):
    write_json_file(PROJECT_GRAPH_FILE, graph)


def upsert_graph_node(section, node, old_key=None):
    graph = load_graph()
    if section == "pcg":
        key = node.get("id")
        nodes = [n for n in graph["pcg"]["nodes"] if n.get("id") != old_key]
        if old_key != key:
            nodes = [n for n in nodes if n.get("id") != key]
        nodes.append(node)
        graph["pcg"]["nodes"] = nodes
    elif section == "lkg":
        key = node.get("name")
        items = [item for item in graph["lkg"] if item.get("name") != old_key]
        if old_key != key:
            items = [item for item in items if item.get("name") != key]
        items.append(node)
        graph["lkg"] = items
    save_graph(graph)
    return graph


def delete_graph_node(section, key):
    graph = load_graph()
    if section == "pcg":
        graph["pcg"]["nodes"] = [n for n in graph["pcg"]["nodes"] if n.get("id") != key]
        graph["pcg"]["edges"] = [e for e in graph["pcg"]["edges"] if e.get("source") != key and e.get("target") != key]
    elif section == "lkg":
        graph["lkg"] = [item for item in graph["lkg"] if item.get("name") != key]
    save_graph(graph)
    return graph


def edge_key(edge):
    return (edge.get("source"), edge.get("target"))


def upsert_graph_edge(edge, old_key=None):
    graph = load_graph()
    edges = graph["pcg"]["edges"]
    target_key = edge_key(edge)
    if old_key:
        edges = [e for e in edges if edge_key(e) != tuple(old_key)]
    else:
        edges = [e for e in edges if edge_key(e) != target_key]
    edges.append(edge)
    graph["pcg"]["edges"] = edges
    save_graph(graph)
    return graph


def delete_graph_edge(source, target):
    graph = load_graph()
    graph["pcg"]["edges"] = [e for e in graph["pcg"]["edges"] if not (e.get("source") == source and e.get("target") == target)]
    save_graph(graph)
    return graph


def scaffold_context_messages():
    messages = [{"role": "system", "content": PROMPTS["LearnScaffold标准"]}]
    plan = read_text_file(PROJECT_PLAN_FILE)
    if plan:
        messages.append({
            "role": "system",
            "content": f"[项目规划]\n以下是本地保存的项目规划文件内容，仅供你内部参考，不要整段复述给用户：\n{plan}",
        })
    graph = read_text_file(PROJECT_GRAPH_FILE)
    if graph:
        messages.append({
            "role": "system",
            "content": f"[内部知识图谱]\n以下是本地保存的项目能力图谱/学习者知识图谱摘要，仅供内部决策，不要在 reply 中暴露原始 JSON：\n{graph}",
        })
    return messages


def update_scaffold_state(data, knowledge_nodes):
    if not isinstance(data, dict):
        return
    project_markdown = data.get("project_markdown")
    if isinstance(project_markdown, str) and project_markdown.strip():
        SCAFFOLD_ROOT.mkdir(parents=True, exist_ok=True)
        PROJECT_PLAN_FILE.write_text(project_markdown.strip() + "\n", encoding="utf-8")

    existing = read_json_file(PROJECT_GRAPH_FILE)
    graph = {
        "project_profile": existing.get("project_profile") or {},
        "pcg": existing.get("pcg") or {"nodes": [], "edges": []},
        "lkg": existing.get("lkg") or [],
        "latest": existing.get("latest") or {},
    }
    if isinstance(data.get("project_profile"), dict):
        graph["project_profile"] = data["project_profile"]
    if isinstance(data.get("pcg"), dict):
        graph["pcg"] = data["pcg"]

    updates = []
    if isinstance(data.get("lkg_updates"), list):
        updates.extend([item for item in data["lkg_updates"] if isinstance(item, dict)])
    for item in knowledge_nodes:
        if isinstance(item, dict) and item.get("name"):
            updates.append({
                "name": item.get("name"),
                "description": item.get("description") or "",
            })
    if updates:
        by_name = {item.get("name"): item for item in graph["lkg"] if isinstance(item, dict) and item.get("name")}
        for item in updates:
            name = item.get("name")
            if not name:
                continue
            merged = dict(by_name.get(name) or {})
            merged.update({k: v for k, v in item.items() if v not in (None, "", [])})
            by_name[name] = merged
        graph["lkg"] = list(by_name.values())

    graph["latest"] = {
        "action": data.get("action") or "",
        "learning_phase": data.get("learning_phase") or "",
        "evidence_task": data.get("evidence_task") or "",
        "next_question": data.get("next_question") or "",
    }
    if graph["project_profile"] or graph["pcg"].get("nodes") or graph["lkg"] or any(graph["latest"].values()):
        write_json_file(PROJECT_GRAPH_FILE, graph)


def partial_reply(text):
    raw = text or ""
    match = re_search_reply(raw)
    return match if match is not None else raw


def re_search_reply(raw):
    marker = '"reply"'
    idx = raw.find(marker)
    if idx < 0:
        marker = '"回复"'
        idx = raw.find(marker)
    if idx < 0:
        return None
    colon = raw.find(":", idx + len(marker))
    if colon < 0:
        return None
    quote = raw.find('"', colon + 1)
    if quote < 0:
        return None
    out = []
    i = quote + 1
    while i < len(raw):
        ch = raw[i]
        if ch == "\\" and i + 1 < len(raw):
            nxt = raw[i + 1]
            out.append({"n": "\n", "t": "\t", '"': '"', "\\": "\\"}.get(nxt, nxt))
            i += 2
        elif ch == '"':
            return "".join(out)
        else:
            out.append(ch)
            i += 1
    return "".join(out) if out else None


def graph_context(workspace):
    lines = []
    for node in workspace["nodes"].values():
        for point in node.get("knowledge_points") or []:
            name = point.get("name")
            if name:
                desc = point.get("description") or ""
                lines.append(f"- {name}（{node.get('title', '对话')}）：{desc}")
    return "\n".join(lines[:80])


def chat_with_ai(user, workspace, prompt, attach_code=False):
    node = workspace["nodes"][workspace["current_node_id"]]
    lang = workspace.get("editor_language", "python")
    content = prompt or ""
    if attach_code and node.get("code", "").strip():
        content += f"\n\n【当前代码】\n```{lang}\n{node['code'].strip()}\n```"
    node["messages"].append({"role": "user", "content": content})

    client = get_client(user)
    if client is None:
        reply = "API 未连接，请在登录或注册时配置 API Key。"
        node["messages"].append({"role": "assistant", "content": reply})
        return reply

    mode = workspace.get("prompt_mode", "直接解答")
    system_prompt = PROMPTS.get(mode, PROMPTS["直接解答"])
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(scaffold_context_messages())
    ctx = graph_context(workspace)
    if ctx:
        messages.append({"role": "system", "content": PROMPTS["知识图谱上下文"].format(graph_ctx=ctx)})
    messages.extend(visible_messages(node)[-40:])

    model = workspace.get("selected_model") or PROVIDER_MODELS.get(user.get("api_provider"), ["deepseek-chat"])[0]
    try:
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.7,
            max_tokens=2000,
        )
        raw = response.choices[0].message.content
        data, reply, highlights, knowledge_nodes = parse_ai_reply(raw)
        update_scaffold_state(data, knowledge_nodes)
    except Exception as exc:
        sys.stderr.write(f"AI chat failed: {exc}\n")
        reply, highlights, knowledge_nodes = "API 调用失败，请检查模型名称或 API 配置。", [], []

    node["last_highlights"] = highlights
    existing = {p.get("name") for p in node.get("knowledge_points", [])}
    for point in knowledge_nodes:
        name = point.get("name") or point.get("名称")
        if name and name not in existing:
            saved = dict(point)
            saved["name"] = name
            saved["description"] = point.get("description") or point.get("描述") or ""
            node.setdefault("knowledge_points", []).append(saved)
            existing.add(name)
    node["messages"].append({"role": "assistant", "content": reply})
    return reply


def build_chat_messages(user, workspace, node):
    mode = workspace.get("prompt_mode", "直接解答")
    system_prompt = PROMPTS.get(mode, PROMPTS["直接解答"])
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(scaffold_context_messages())
    ctx = graph_context(workspace)
    if ctx:
        messages.append({"role": "system", "content": PROMPTS["知识图谱上下文"].format(graph_ctx=ctx)})
    messages.extend(visible_messages(node)[-40:])
    model = workspace.get("selected_model") or PROVIDER_MODELS.get(user.get("api_provider"), ["deepseek-chat"])[0]
    return model, messages


def apply_ai_reply_to_node(node, raw):
    data, reply, highlights, knowledge_nodes = parse_ai_reply(raw)
    update_scaffold_state(data, knowledge_nodes)
    node["last_highlights"] = highlights
    existing = {p.get("name") for p in node.get("knowledge_points", [])}
    for point in knowledge_nodes:
        name = point.get("name") or point.get("名称")
        if name and name not in existing:
            saved = dict(point)
            saved["name"] = name
            saved["description"] = point.get("description") or point.get("描述") or ""
            node.setdefault("knowledge_points", []).append(saved)
            existing.add(name)
    node["messages"].append({"role": "assistant", "content": reply})
    return reply, highlights, knowledge_nodes


def create_child(workspace, title, inherit=False):
    parent_id = workspace["current_node_id"]
    parent = workspace["nodes"][parent_id]
    messages = []
    if inherit:
        messages = list(parent.get("messages", []))
        messages.append({"role": "system", "content": f"【分支对话】深入探讨：{title}"})
    else:
        messages = [{"role": "assistant", "content": f"我们来深入探讨「{title}」。"}]
    child = Node(parent_id=parent_id, title=(title or "新对话")[:40], messages=messages, code=parent.get("code", ""))
    workspace["nodes"][child.id] = asdict(child)
    parent.setdefault("children", []).append(child.id)
    workspace["current_node_id"] = child.id
    return child.id



def delete_node(workspace, node_id):
    nodes = workspace.get("nodes", {})
    if node_id not in nodes:
        return False
    node = nodes[node_id]
    if node.get("parent_id") is None:
        return False
    to_delete = set()
    def collect(nid):
        to_delete.add(nid)
        n = nodes.get(nid)
        if n:
            for child in n.get("children", []):
                collect(child)
    collect(node_id)
    parent_id = node.get("parent_id")
    if parent_id and parent_id in nodes:
        parent = nodes[parent_id]
        parent["children"] = [c for c in parent.get("children", []) if c != node_id]
    for nid in to_delete:
        if nid in nodes:
            del nodes[nid]
    current = workspace.get("current_node_id")
    if current in to_delete:
        if parent_id and parent_id in nodes:
            workspace["current_node_id"] = parent_id
        else:
            root = next((nid for nid, n in nodes.items() if n.get("parent_id") is None), next(iter(nodes), None))
            workspace["current_node_id"] = root
    return True

class AppHandler(SimpleHTTPRequestHandler):
    server_version = "AIIdeLite/1.0"

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def current_user(self):
        token = parse_cookies(self.headers.get("Cookie")).get(COOKIE_NAME)
        return load_user_by_session(token)

    def send_json(self, payload, status=200, headers=None):
        json_response(self, payload, status, headers)

    def send_sse(self, event, payload):
        sse_send(self, event, payload)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/config":
            user = self.current_user()
            self.send_json({
                "user": public_user(user),
                "providers": list(API_PROVIDERS.keys()) + ["其他"],
                "languages": EDITOR_LANGUAGES,
                "prompt_modes": PROMPT_MODES,
                "workspace": load_workspace(user) if user else None,
            })
            return
        if path == "/api/scaffold":
            user = self.current_user()
            if not user:
                self.send_json({"error": "未登录"}, HTTPStatus.UNAUTHORIZED)
                return
            self.send_json({
                "project_markdown": read_text_file(PROJECT_PLAN_FILE, max_chars=50000),
                "graph": read_json_file(PROJECT_GRAPH_FILE),
            })
            return
        if path == "/api/graph":
            user = self.current_user()
            if not user:
                self.send_json({"error": "未登录"}, HTTPStatus.UNAUTHORIZED)
                return
            self.send_json(load_graph())
            return
        if path == "/api/lkg-visualization":
            user = self.current_user()
            if not user:
                self.send_json({"error": "未登录"}, HTTPStatus.UNAUTHORIZED)
                return
            self.send_json(build_lkg_visualization())
            return
        if path == "/api/export":
            user = self.current_user()
            if not user:
                self.send_json({"error": "未登录"}, HTTPStatus.UNAUTHORIZED)
                return
            self.send_json(load_workspace(user))
            return
        if path == "/":
            self.path = "/index.html"
        return super().do_GET()

    def translate_path(self, path):
        rel = urlparse(path).path.lstrip("/") or "index.html"
        target = (WEB_ROOT / rel).resolve()
        try:
            target.relative_to(WEB_ROOT.resolve())
        except ValueError:
            return str(WEB_ROOT / "index.html")
        return str(target)

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            data = read_json(self)
            if path == "/api/register":
                return self.handle_register(data)
            if path == "/api/login":
                return self.handle_login(data)
            if path == "/api/admin-login":
                return self.handle_admin_login(data)
            if path == "/api/logout":
                return self.handle_logout()

            user = self.current_user()
            if not user:
                self.send_json({"error": "未登录"}, HTTPStatus.UNAUTHORIZED)
                return
            workspace = normalize_workspace(data.get("workspace") or load_workspace(user))

            if path == "/api/workspace":
                save_workspace(user, workspace)
                self.send_json({"ok": True, "workspace": workspace})
            elif path == "/api/chat":
                chat_with_ai(user, workspace, data.get("prompt", ""), bool(data.get("attach_code")))
                save_workspace(user, workspace)
                self.send_json({"ok": True, "workspace": workspace})
            elif path == "/api/chat-stream":
                self.handle_chat_stream(user, workspace, data)
            elif path == "/api/syntax":
                lang = workspace.get("editor_language", "python")
                diagnostics = check_python_syntax(data.get("code", "")) if lang == "python" else []
                self.send_json({"ok": True, "diagnostics": diagnostics})
            elif path == "/api/branch":
                create_child(workspace, data.get("title") or "新分支", bool(data.get("inherit")))
                save_workspace(user, workspace)
                self.send_json({"ok": True, "workspace": workspace})
            elif path == "/api/delete-node":
                node_id = data.get("node_id")
                if node_id and delete_node(workspace, node_id):
                    save_workspace(user, workspace)
                self.send_json({"ok": True, "workspace": workspace})
            elif path == "/api/import":
                workspace = normalize_workspace(data.get("workspace"))
                save_workspace(user, workspace)
                self.send_json({"ok": True, "workspace": workspace})
            elif path == "/api/graph":
                action = data.get("action")
                if action == "save_node":
                    graph = upsert_graph_node(data.get("section"), data.get("node") or {}, data.get("old_key"))
                    self.send_json({"ok": True, "graph": graph})
                elif action == "delete_node":
                    graph = delete_graph_node(data.get("section"), data.get("key"))
                    self.send_json({"ok": True, "graph": graph})
                elif action == "save_edge":
                    graph = upsert_graph_edge(data.get("edge") or {}, data.get("old_key"))
                    self.send_json({"ok": True, "graph": graph})
                elif action == "delete_edge":
                    graph = delete_graph_edge(data.get("source"), data.get("target"))
                    self.send_json({"ok": True, "graph": graph})
                else:
                    self.send_json({"error": "未知操作"}, HTTPStatus.BAD_REQUEST)
            else:
                self.send_json({"error": "接口不存在"}, HTTPStatus.NOT_FOUND)
        except json.JSONDecodeError:
            self.send_json({"error": "JSON 格式错误"}, HTTPStatus.BAD_REQUEST)
        except Exception as exc:
            self.send_json({"error": str(exc)}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def handle_register(self, data):
        username = (data.get("username") or "").strip()
        password = data.get("password") or ""
        provider = data.get("provider") or "deepseek"
        api_key = data.get("api_key") or ""
        base_url = (data.get("api_base_url") or API_PROVIDERS.get(provider) or "").rstrip("/")
        if not username or not password:
            self.send_json({"error": "用户名和密码不能为空"}, HTTPStatus.BAD_REQUEST)
            return
        if len(password) < 6:
            self.send_json({"error": "密码至少 6 位"}, HTTPStatus.BAD_REQUEST)
            return
        conn = get_conn()
        try:
            cur = conn.execute(
                "INSERT INTO users (username, password_hash, api_provider, api_key_encrypted, api_base_url) VALUES (?,?,?,?,?)",
                (username, hash_password(password), provider, encrypt_api_key(api_key), base_url),
            )
            conn.commit()
            user_id = cur.lastrowid
        except Exception as exc:
            conn.close()
            status = HTTPStatus.CONFLICT if "UNIQUE" in str(exc) else HTTPStatus.BAD_REQUEST
            self.send_json({"error": "用户名已存在" if status == HTTPStatus.CONFLICT else str(exc)}, status)
            return
        conn.close()
        token = create_session(user_id)
        user = load_user_by_session(token)
        workspace = make_root_workspace()
        save_workspace(user, workspace)
        self.send_json({"ok": True, "user": public_user(user), "workspace": workspace}, headers={"Set-Cookie": cookie_header(token)})

    def handle_login(self, data):
        username = (data.get("username") or "").strip()
        password = data.get("password") or ""
        conn = get_conn()
        try:
            row = conn.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
        finally:
            conn.close()
        if not row or not verify_password(password, row["password_hash"]):
            self.send_json({"error": "用户名或密码错误"}, HTTPStatus.UNAUTHORIZED)
            return
        token = create_session(row["id"])
        user = load_user_by_session(token)
        self.send_json({"ok": True, "user": public_user(user), "workspace": load_workspace(user)}, headers={"Set-Cookie": cookie_header(token)})

    def handle_admin_login(self, data):
        username = (data.get("username") or "").strip()
        if not username:
            username = get_admin_username()
        token = f"admin:{username}"
        user = load_user_by_session(token)
        self.send_json({"ok": True, "user": public_user(user), "workspace": load_workspace(user)}, headers={"Set-Cookie": cookie_header(token)})

    def handle_logout(self):
        self.send_json({"ok": True}, headers={"Set-Cookie": clear_cookie_header()})

    def handle_chat_stream(self, user, workspace, data):
        node = workspace["nodes"][workspace["current_node_id"]]
        lang = workspace.get("editor_language", "python")
        content = data.get("prompt", "") or ""
        if data.get("attach_code") and node.get("code", "").strip():
            content += f"\n\n【当前代码】\n```{lang}\n{node['code'].strip()}\n```"
        node["messages"].append({"role": "user", "content": content})

        sse_response_start(self)
        self.send_sse("user", {"content": content})

        client = get_client(user)
        if client is None:
            reply = "API 未连接，请在登录或注册时配置 API Key。"
            node["messages"].append({"role": "assistant", "content": reply})
            save_workspace(user, workspace)
            self.send_sse("delta", {"text": reply})
            self.send_sse("done", {"workspace": workspace, "reply": reply, "highlights": [], "knowledge_nodes": []})
            return

        model, messages = build_chat_messages(user, workspace, node)
        raw = ""
        try:
            stream = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.7,
                max_tokens=2000,
                stream=True,
            )
            for chunk in stream:
                delta = chunk.choices[0].delta.content if chunk.choices else None
                if not delta:
                    continue
                raw += delta
                self.send_sse("delta", {"text": delta})
            reply, highlights, knowledge_nodes = apply_ai_reply_to_node(node, raw)
            save_workspace(user, workspace)
            self.send_sse("done", {
                "workspace": workspace,
                "reply": reply,
                "highlights": highlights,
                "knowledge_nodes": knowledge_nodes,
            })
        except Exception as exc:
            sys.stderr.write(f"AI stream failed: {exc}\n")
            reply = "API 调用失败，请检查模型名称或 API 配置。"
            node["messages"].append({"role": "assistant", "content": reply})
            save_workspace(user, workspace)
            self.send_sse("replace", {"text": reply})
            self.send_sse("done", {"workspace": workspace, "reply": reply, "highlights": [], "knowledge_nodes": []})


def main():
    init_db()
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8501"))
    server = ThreadingHTTPServer((host, port), AppHandler)
    print(f"AI IDE running at http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()




