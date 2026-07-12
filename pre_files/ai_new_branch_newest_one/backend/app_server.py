import ast
import hashlib
import json
import os
import re
import secrets
import sys
import time
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
    "deepseek": ["deepseek-v4-pro", "deepseek-v4-flash", "deepseek-chat", "deepseek-reasoner"],
    "OpenAI": ["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"],
    "GPT": ["gpt-4o", "gpt-4o-mini"],
    "千问": ["qwen3.7-max", "qwen3.7-plus", "qwen3.6-plus", "qwen3.6-flash", "qwen3.5-plus", "qwen-plus", "qwen-flash", "qwen-max", "qwen-turbo"],
    "豆包": ["doubao-pro-32k", "doubao-lite-32k"],
    "Gemini": ["gemini-1.5-pro", "gemini-1.5-flash"],
    "文心一言": ["ernie-4.0-8k", "ernie-3.5-8k"],
    "讯飞星火": ["generalv3.5", "generalv3"],
    "其他": ["deepseek-v4-flash", "gpt-4o-mini", "deepseek-chat"],
    "管理员": ["deepseek-v4-pro", "deepseek-v4-flash", "deepseek-chat", "deepseek-reasoner"],
}

PROMPT_MODES = ["代码生成", "直接解答", "启发式引导", "LearnScaffold项目规划"]


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
    code_ref: str | None = None
    code_blocks: list[dict] = field(default_factory=list)
    project_plan: str = ""
    codegen_plan: str = ""
    codegen_nodes: list[dict] = field(default_factory=list)


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
        "selected_model": "deepseek-v4-flash",
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
            code_ref=item.get("code_ref"),
            code_blocks=item.get("code_blocks") or [],
            project_plan=item.get("project_plan") or "",
            codegen_plan=item.get("codegen_plan") or "",
            codegen_nodes=item.get("codegen_nodes") or [],
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
        "selected_model": payload.get("selected_model", "deepseek-v4-flash"),
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
        "api_connected": provider == "管理员" or bool(user.get("api_key_encrypted")),
    }


def get_client(user):
    if not user:
        return None
    provider = user.get("api_provider") or ""
    if provider == "管理员":
        key = os.getenv(ADMIN_ENV_KEY)
        return OpenAI(api_key=key, base_url="https://api.deepseek.com/v1", timeout=300.0) if key else None
    api_key = decrypt_api_key(user.get("api_key_encrypted") or "")
    base_url = (user.get("api_base_url") or API_PROVIDERS.get(provider) or "").rstrip("/")
    if api_key and base_url:
        return OpenAI(api_key=api_key, base_url=base_url, timeout=300.0)
    return None


def visible_messages(node, max_per_message=4000):
    msgs = [m for m in node.get("messages", []) if m.get("role") in {"user", "assistant"}]
    result = []
    for m in msgs:
        content = m.get("content", "")
        if len(content) > max_per_message:
            content = content[:max_per_message] + "\n\n...（消息已截断）"
        result.append({"role": m["role"], "content": content})
    return result


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


def _extract_json_object(text):
    """从文本中提取最外层的 JSON 对象，支持字符串、转义与嵌套。"""
    start = text.find("{")
    if start < 0:
        return None
    depth = 0
    in_str = False
    escape = False
    for i, ch in enumerate(text[start:], start):
        if escape:
            escape = False
            continue
        if ch == "\\":
            escape = True
            continue
        if ch == '"':
            in_str = not in_str
            continue
        if in_str:
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start:i + 1]
    return None


def _unescape_json_string(s):
    """手动反转义 JSON 字符串中的常见转义序列。"""
    if not isinstance(s, str):
        return s
    s = s.replace('\\"', '"').replace('\\\\', '\\').replace('\\n', '\n').replace('\\t', '\t').replace('\\r', '').replace('\\/', '/')
    s = re.sub(r'\\u([0-9a-fA-F]{4})', lambda m: chr(int(m.group(1), 16)), s)
    return s


def _extract_code_blocks_from_json_snippet(snippet):
    """从可能损坏的 JSON 片段中用正则提取 code_blocks 数组。"""
    blocks = []
    if not snippet:
        return blocks
    # 匹配 "code_blocks": [ ... ]，允许嵌套对象/数组（简单贪心到下一个 ]）
    match = re.search(r'"code_blocks"\s*:\s*(\[.*?\])', snippet, re.DOTALL)
    if not match:
        return blocks
    arr_text = match.group(1)
    # 逐个提取 { ... } 对象
    for obj_match in re.finditer(r'\{[^{}]*\}', arr_text, re.DOTALL):
        try:
            obj = json.loads(obj_match.group(0))
        except json.JSONDecodeError:
            # 对象内部可能包含转义引号，先尝试手动反转义
            try:
                fixed = _unescape_json_string(obj_match.group(0))
                obj = json.loads(fixed)
            except Exception:
                continue
        if isinstance(obj, dict) and (obj.get("code") or obj.get("file")):
            blocks.append({
                "file": str(obj.get("file") or "code.py").strip() or "code.py",
                "description": str(obj.get("description") or "").strip(),
                "lang": str(obj.get("lang") or "python").strip() or "python",
                "code": str(obj.get("code") or ""),
            })
    return blocks


def parse_ai_reply(text):
    raw = (text or "").strip()
    # 去除可能的 markdown 代码围栏
    cleaned = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    cleaned = cleaned.strip()
    snippet = _extract_json_object(cleaned)
    if snippet:
        try:
            data = json.loads(snippet)
            reply = data.get("reply") or data.get("回复") or raw
            highlights = data.get("highlights") or data.get("精彩片段") or []
            knowledge_nodes = data.get("knowledge_nodes") or []
            return (
                data,
                reply,
                [h for h in highlights if h],
                [k for k in knowledge_nodes if isinstance(k, dict)],
            )
        except json.JSONDecodeError:
            # 尝试从 JSON 片段里用正则抽出 reply（处理转义引号）
            reply = raw
            try:
                match = re.search(r'"reply"\s*:\s*"((?:[^"\\]|\\.)*)"', snippet, re.DOTALL)
                if match:
                    reply = _unescape_json_string(match.group(1))
            except Exception:
                pass
            # 即使 JSON 损坏，也尝试提取 code_blocks
            blocks = _extract_code_blocks_from_json_snippet(snippet)
            if blocks:
                data = {"code_blocks": blocks}
                return data, reply, [], []
            return {}, reply, [], []
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
        "lkg_edges": data.get("lkg_edges") or [],
        "latest": data.get("latest") or {},
    }


def _lkg_weight_group(weight):
    if weight >= 0.8:
        return "mastered"
    if weight >= 0.5:
        return "familiar"
    return "learning"


def _lkg_node_aliases(node_id):
    """生成节点别名，用于关系推断。"""
    aliases = {node_id.lower()}
    simple = re.sub(r"^(std::|std::\w+::)", "", node_id).lower()
    if simple and simple != node_id.lower():
        aliases.add(simple)
    # 提取括号里的中文名，如 "Deadlock (死锁)"
    m = re.search(r"\(([^)]+)\)", node_id)
    if m:
        aliases.add(m.group(1).lower())
    return aliases


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

    def add_edge(source, target, edge_type):
        if not source or not target or source == target or target not in node_ids:
            return
        key = (source, target)
        if key in seen_edges:
            return
        seen_edges.add(key)
        edges.append({"source": source, "target": target, "type": edge_type})

    # 1. AI 显式提供的知识点边
    for edge in graph.get("lkg_edges") or []:
        add_edge(edge.get("source"), edge.get("target"), edge.get("type") or "related")

    # 2. 节点自身携带的 related_to / dependencies
    for item in lkg:
        source = item.get("name")
        if not source:
            continue
        for target in item.get("related_to") or []:
            add_edge(source, target, "related")
        for target in item.get("dependencies") or []:
            add_edge(source, target, "depends_on")

    # 3. 自动推断：若一个节点的别名出现在另一个节点的名称/描述中，则认为相关
    if len(edges) < len(nodes):
        for a in nodes:
            out_count = 0
            aliases = _lkg_node_aliases(a["id"])
            for b in nodes:
                if a["id"] == b["id"]:
                    continue
                text_b = f"{b['id']} {b['description']}".lower()
                for alias in aliases:
                    if len(alias) <= 2:
                        continue
                    if alias in text_b:
                        add_edge(a["id"], b["id"], "implicit")
                        out_count += 1
                        break
                if out_count >= 3:
                    break

    # 4. 兜底：把不连通的子图串起来，避免孤岛
    if len(edges) < len(nodes) - 1:
        adj = {n["id"]: set() for n in nodes}
        for e in edges:
            adj[e["source"]].add(e["target"])
            adj[e["target"]].add(e["source"])
        visited = set()
        reps = []
        for n in nodes:
            if n["id"] in visited:
                continue
            stack = [n["id"]]
            comp = []
            while stack:
                cur = stack.pop()
                if cur in visited:
                    continue
                visited.add(cur)
                comp.append(cur)
                for nb in adj.get(cur, []):
                    if nb not in visited:
                        stack.append(nb)
            reps.append(comp[0])
        for i in range(len(reps) - 1):
            add_edge(reps[i], reps[i + 1], "sequence")

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
        # 清理显式边与节点上的关系引用
        graph["lkg_edges"] = [
            e for e in graph.get("lkg_edges", [])
            if e.get("source") != key and e.get("target") != key
        ]
        for item in graph["lkg"]:
            item["related_to"] = [n for n in item.get("related_to", []) if n != key]
            item["dependencies"] = [n for n in item.get("dependencies", []) if n != key]
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


def scaffold_context_messages(node=None):
    messages = [{"role": "system", "content": PROMPTS["LearnScaffold标准"]}]
    # 项目规划严格跟随当前对话，不再回退到全局文件，避免不同对话互相污染
    plan = (node.get("project_plan") or "") if node else ""
    if plan:
        messages.append({
            "role": "system",
            "content": f"[项目规划摘要]\n{plan}",
        })
    graph = read_text_file(PROJECT_GRAPH_FILE, max_chars=3000)
    if graph:
        messages.append({
            "role": "system",
            "content": f"[内部知识图谱摘要]\n{graph}",
        })
    return messages


def _normalize_weight(value):
    try:
        w = float(value)
        return max(0.0, min(1.0, w))
    except (TypeError, ValueError):
        return None


def update_scaffold_state(data, knowledge_nodes, node=None):
    if not isinstance(data, dict):
        return
    project_markdown = data.get("project_markdown")
    if isinstance(project_markdown, str) and project_markdown.strip():
        plan_text = project_markdown.strip()
        # 每个对话有自己的项目规划
        if node is not None:
            node["project_plan"] = plan_text
        # 同时保留全局文件作为兼容/模板
        SCAFFOLD_ROOT.mkdir(parents=True, exist_ok=True)
        PROJECT_PLAN_FILE.write_text(plan_text + "\n", encoding="utf-8")

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
                "weight": item.get("weight"),
                "evidence": item.get("evidence") or "",
                "type": item.get("type") or "",
                "related_to": item.get("related_to") or [],
                "dependencies": item.get("dependencies") or [],
                "misconception": item.get("misconception") or "",
                "next_recommendation": item.get("next_recommendation") or "",
            })
    for item in updates:
        if "weight" in item:
            item["weight"] = _normalize_weight(item.get("weight"))
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

    # 保存 AI 提供的知识点关系边
    lkg_edges = graph.setdefault("lkg_edges", [])
    seen_edges = {(e.get("source"), e.get("target")) for e in lkg_edges}
    for edge in data.get("knowledge_edges") or []:
        if not isinstance(edge, dict):
            continue
        source = edge.get("source")
        target = edge.get("target")
        if not source or not target or source == target:
            continue
        key = (source, target)
        if key in seen_edges:
            continue
        seen_edges.add(key)
        lkg_edges.append({
            "source": source,
            "target": target,
            "type": edge.get("type") or "related",
        })
    # 为边中尚未存在的节点创建占位知识点
    existing_names = {n.get("name") for n in graph["lkg"] if isinstance(n, dict)}
    for edge in lkg_edges:
        for name in (edge.get("source"), edge.get("target")):
            if name and name not in existing_names:
                graph["lkg"].append({"name": name, "description": ""})
                existing_names.add(name)

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


def should_use_code_generation_mode(workspace, prompt=""):
    """判定是否进入结构化代码生成模式。"""
    prompt_mode = workspace.get("prompt_mode", "直接解答")
    if prompt_mode == "代码生成":
        return True, "prompt_mode"

    # 用户意图
    code_intent_keywords = ["生成代码", "写代码", "实现", "写成代码", "代码实现", "coding", "写程序"]
    prompt_lower = (prompt or "").lower()
    for kw in code_intent_keywords:
        if kw.lower() in prompt_lower:
            return True, "user_intent"

    # 基于当前对话的项目规划阶段识别
    node = workspace.get("nodes", {}).get(workspace.get("current_node_id")) if workspace else None
    plan = (node.get("project_plan") or "") if node else ""
    if plan:
        plan_lower = plan.lower()
        phase_keywords = ["实现", "编码", "输出", "代码", "运行", "执行", "开发", "implement", "coding"]
        # 简单判定：规划文本中提到代码相关阶段，且用户问题涉及实现
        if any(kw in plan_lower for kw in phase_keywords):
            return True, "project_plan"

    return False, None


def graph_context(workspace):
    lines = []
    for node in workspace["nodes"].values():
        for point in node.get("knowledge_points") or []:
            name = point.get("name")
            if name:
                desc = point.get("description") or ""
                lines.append(f"- {name}（{node.get('title', '对话')}）：{desc}")
    # 同时提供全局 LKG 的熟悉度，便于 AI 更新 weight
    graph = load_graph()
    lkg_items = graph.get("lkg") or []
    if lkg_items:
        lines.append("\n[已记录知识点熟悉度]")
        for item in lkg_items[:40]:
            name = item.get("name")
            if not name:
                continue
            weight = item.get("weight")
            group = _lkg_weight_group(weight) if weight is not None else "learning"
            lines.append(f"- {name}：熟悉度 {weight or 0.5}（{group}）")
    return "\n".join(lines[:80])


def build_user_content(node, prompt, attach_code, lang):
    content = prompt or ""
    if attach_code and node.get("code", "").strip():
        code = node["code"].strip()
        if len(code) > 8000:
            code = code[:8000] + "\n\n...（代码已截断，仅保留前 8000 字符）"
        content += f"\n\n【当前代码】\n```{lang}\n{code}\n```"
    return content


def chat_with_ai(user, workspace, prompt, attach_code=False):
    node = workspace["nodes"][workspace["current_node_id"]]
    lang = workspace.get("editor_language", "python")
    content = build_user_content(node, prompt, attach_code, lang)
    node["messages"].append({"role": "user", "content": content})

    client = get_client(user)
    if client is None:
        reply = "API 未连接，请在登录或注册时配置 API Key。"
        node["messages"].append({"role": "assistant", "content": reply})
        return reply

    model, messages, max_tokens = build_chat_messages(user, workspace, node)
    try:
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.7,
            max_tokens=max_tokens,
        )
        raw = response.choices[0].message.content
        reply, highlights, knowledge_nodes = apply_ai_reply_to_node(node, raw)
    except Exception as exc:
        sys.stderr.write(f"AI chat failed: {exc}\n")
        reply, highlights, knowledge_nodes = "API 调用失败，请检查模型名称或 API 配置。", [], []
        node["messages"].append({"role": "assistant", "content": reply})

    return reply


def recommend_next_knowledge(user, workspace):
    """根据 LKG 和项目规划推荐下一知识点，返回按相关度排序的列表。"""
    client = get_client(user)
    if client is None:
        raise RuntimeError("API 未连接，请在登录或注册时配置 API Key，或使用管理员一键登录。")

    graph = load_graph()
    lkg = graph.get("lkg") or []
    # 推荐基于当前对话的项目规划，知识图谱仍为全局共享
    node = workspace.get("nodes", {}).get(workspace.get("current_node_id"), {})
    plan = node.get("project_plan") or ""

    # 构造上下文：项目目标 + 已探索知识点
    lines = []
    if plan:
        lines.append("[项目规划]\n" + plan)
    if lkg:
        lines.append("[已探索知识点]")
        for item in lkg:
            name = item.get("name")
            desc = item.get("description") or ""
            weight = item.get("weight")
            if name:
                lines.append(f"- {name}（掌握度：{weight}）：{desc}")
    else:
        lines.append("[已探索知识点]\n暂无")
    graph_ctx = "\n".join(lines)

    if not plan and not lkg:
        raise RuntimeError("暂无项目规划和知识图谱，请先与 AI 进行对话，让系统自动提取知识点。")

    messages = [
        {"role": "system", "content": PROMPTS["推荐下一知识点_system"]},
        {"role": "user", "content": PROMPTS["推荐下一知识点_user"].format(graph_ctx=graph_ctx)},
    ]
    model = workspace.get("selected_model") or PROVIDER_MODELS.get(user.get("api_provider"), ["deepseek-v4-flash"])[0]
    try:
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.7,
            max_tokens=1200,
            timeout=30,
        )
        raw = response.choices[0].message.content
        cleaned = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned).strip()
        snippet = _extract_json_object(cleaned)
        data = json.loads(snippet) if snippet else {}
        recommendations = data.get("recommendations") or []
        # 标准化字段并排序
        normalized = []
        for rec in recommendations:
            if not isinstance(rec, dict):
                continue
            name = str(rec.get("name") or "").strip()
            if not name:
                continue
            try:
                relevance = float(rec.get("relevance", 0.5))
            except (TypeError, ValueError):
                relevance = 0.5
            normalized.append({
                "name": name,
                "description": str(rec.get("description") or "").strip(),
                "relevance": max(0.0, min(1.0, relevance)),
                "reason": str(rec.get("reason") or "").strip(),
            })
        normalized.sort(key=lambda x: x["relevance"], reverse=True)
        return normalized
    except Exception as exc:
        sys.stderr.write(f"Recommend knowledge failed: {exc}\n")
        return []


def build_chat_messages(user, workspace, node):
    mode = workspace.get("prompt_mode", "直接解答")
    # 从最近的用户消息提取当前 prompt 用于意图判定
    last_user_prompt = ""
    for msg in reversed(node.get("messages", [])):
        if msg.get("role") == "user":
            last_user_prompt = msg.get("content", "")
            break
    use_code_mode, _ = should_use_code_generation_mode(workspace, last_user_prompt)
    # 当用户明确要求代码时，统一使用代码生成提示词，确保 code_blocks 输出
    if use_code_mode:
        system_prompt = PROMPTS["代码生成"]
    else:
        system_prompt = PROMPTS.get(mode, PROMPTS["直接解答"])
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(scaffold_context_messages(node))
    ctx = graph_context(workspace)
    if ctx:
        messages.append({"role": "system", "content": PROMPTS["知识图谱上下文"].format(graph_ctx=ctx)})
    messages.extend(visible_messages(node)[-20:])
    model = workspace.get("selected_model") or PROVIDER_MODELS.get(user.get("api_provider"), ["deepseek-v4-flash"])[0]
    # 解释/引导类回复也容易写长，给足 4000 tokens；代码生成给 8000
    max_tokens = 8000 if use_code_mode else 4000
    return model, messages, max_tokens


def _extract_code_blocks_from_markdown(text, default_lang="python"):
    """从 markdown 代码围栏中提取代码块，支持 [CODE:文件名] 引用；同时把代码围栏从回复文本中移除。
    兼容 ``` 与 ~~~ 围栏，以及语言提示后无换行等不规范写法。"""
    blocks = []
    # 先对 JSON 转义的换行/反引号做一层反转义，避免 AI 把 ``` 写成 \n 后无法识别
    text = _unescape_json_string(text)
    # 匹配 ``` 或 ~~~ 围栏，语言提示后允许可选空白/换行
    pattern = re.compile(r"(?:(?:^|\n)\s*)```([^\n]*)\n?(.*?)```|(?:(?:^|\n)\s*)~~~([^\n]*)\n?(.*?)~~~", re.DOTALL)
    last = 0
    cleaned_parts = []
    for match in pattern.finditer(text):
        cleaned_parts.append(text[last:match.start()])
        last = match.end()
        lang_hint = (match.group(1) or match.group(3) or "").strip()
        code = match.group(2) or match.group(4) or ""
        # 去除首尾多余换行
        code = code.strip("\n")
        preceding = text[:match.start()]
        file_match = re.search(r"\[CODE:([^\]]+)\]", preceding)
        if file_match:
            file_name = file_match.group(1).strip()
        else:
            ext = {
                "python": "py", "cpp": "cpp", "c": "c", "java": "java",
                "javascript": "js", "typescript": "ts", "html": "html",
                "css": "css", "go": "go", "rust": "rs", "csharp": "cs",
            }.get(lang_hint.lower()) or "py"
            file_name = f"main.{ext}" if lang_hint else f"code.{ext}"
        blocks.append({
            "file": file_name,
            "description": "",
            "lang": lang_hint or default_lang,
            "code": _clean_code_content(code),
        })
    cleaned_parts.append(text[last:])
    cleaned = re.sub(r"\n{3,}", "\n\n", "".join(cleaned_parts)).strip()
    return blocks, cleaned


_SMALL_CODE_MAX_LINES = 5
_SMALL_CODE_MAX_CHARS = 300


def _is_small_code(code):
    """判定代码是否属于可内联在 reply 中的少量代码。"""
    if not code:
        return True
    lines = [ln for ln in code.splitlines() if ln.strip()]
    return len(lines) <= _SMALL_CODE_MAX_LINES and len(code) <= _SMALL_CODE_MAX_CHARS


def _merge_code_blocks(blocks):
    """按文件名合并代码块，保留第一次出现的顺序，避免同一文件出现多个标签页。"""
    merged = {}
    order = []
    for block in blocks:
        file = block.get("file")
        if file in merged:
            merged[file]["code"] += "\n\n" + block.get("code", "")
            if not merged[file].get("description") and block.get("description"):
                merged[file]["description"] = block["description"]
        else:
            merged[file] = dict(block)
            order.append(file)
    return [merged[f] for f in order]


def _clean_reply(text):
    return re.sub(r"\n{3,}", "\n\n", str(text or "").strip()).strip()


def _clean_code_content(code):
    """去除 AI 在 code 字段里多加的 markdown 围栏和语言提示行。"""
    s = str(code or "")
    # 去掉首尾 ``` 围栏（含可选语言）
    s = re.sub(r"^```[a-zA-Z0-9]*\s*\n?", "", s)
    s = re.sub(r"\n?```\s*$", "", s)
    # 去掉首行单独的语言提示，如 "cpp\n" 或 "python\n"
    s = re.sub(r"^[a-zA-Z0-9+#]+\s*\n", "", s)
    return s.strip("\n")


def _looks_like_raw_response_json(code):
    """检测 AI 是否把整条 JSON 回复误当成 code 塞了进来。"""
    s = str(code or "").strip()
    if not s.startswith(("{", "[")):
        return False
    try:
        data = json.loads(s)
        if isinstance(data, dict) and ("reply" in data or "code_blocks" in data):
            return True
    except Exception:
        pass
    # 未解析成功，但包含 reply/code_blocks 字段特征也算
    return '"reply"' in s and '"code_blocks"' in s


def _append_small_code_to_reply(blocks, reply):
    """少量代码以内联卡片形式追加到 reply，但所有代码块仍保留在 code_blocks 中供代码区显示。"""
    inline_parts = []
    for block in blocks:
        if _is_small_code(block.get("code", "")):
            lang = block.get("lang") or "text"
            file = block.get("file") or "snippet"
            inline_parts.append(f"**{file}**\n\n```{lang}\n{block['code']}\n```")
    if inline_parts:
        reply = (reply or "") + "\n\n" + "\n\n".join(inline_parts)
    return _clean_reply(reply)


def apply_ai_reply_to_node(node, raw):
    data, reply, highlights, knowledge_nodes = parse_ai_reply(raw)
    update_scaffold_state(data, knowledge_nodes, node)
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
    # 处理代码生成模式返回的多文件代码块
    normalized_blocks = []
    code_blocks = data.get("code_blocks") if isinstance(data, dict) else None
    if isinstance(code_blocks, list) and code_blocks:
        for block in code_blocks:
            if not isinstance(block, dict):
                continue
            cleaned_code = _clean_code_content(block.get("code"))
            if _looks_like_raw_response_json(cleaned_code):
                sys.stderr.write("[DEBUG] Skipping code block that looks like raw JSON response\n")
                continue
            normalized_blocks.append({
                "file": str(block.get("file") or "code.py").strip() or "code.py",
                "description": str(block.get("description") or "").strip(),
                "lang": str(block.get("lang") or "python").strip() or "python",
                "code": cleaned_code,
            })
    # 兜底：AI 没按 JSON 输出 code_blocks 时，从 markdown 代码围栏提取
    if not normalized_blocks:
        normalized_blocks, reply = _extract_code_blocks_from_markdown(reply)
    if normalized_blocks:
        normalized_blocks = _merge_code_blocks(normalized_blocks)
        reply = _append_small_code_to_reply(normalized_blocks, reply)
    if not normalized_blocks and re.search(r"\[CODE:\s*[^\]]+\]", reply):
        sys.stderr.write(f"[DEBUG] reply references CODE but no blocks kept. raw_preview={raw[:200]!r}\n")
    if normalized_blocks:
        # 每次 AI 回复只生成一个标签页
        # 标签名优先使用当前对话标题，和左侧对话区对应；无标题时保持原有“回复 N”规则
        existing_tabs = node.get("code_blocks", []) or []
        base_name = (node.get("title") or "").strip()
        if base_name:
            existing_names = {b.get("file") for b in existing_tabs}
            tab_name = base_name
            suffix = 2
            while tab_name in existing_names:
                tab_name = f"{base_name} {suffix}"
                suffix += 1
        else:
            max_index = 0
            for b in existing_tabs:
                m = re.match(r"回复\s+(\d+)", b.get("file", ""))
                if m:
                    max_index = max(max_index, int(m.group(1)))
            tab_name = f"回复 {max_index + 1}"
        lang = normalized_blocks[0].get("lang") or "python" if normalized_blocks else "python"

        if len(normalized_blocks) == 1:
            # 单文件回复：代码区直接显示干净代码，不保留 [CODE:] 标记
            single = normalized_blocks[0]
            merged_code = single.get("code", "")
            lang = single.get("lang") or lang
        else:
            # 多文件回复：合并到一个标签页，用 [CODE:] 分隔
            parts = []
            for block in normalized_blocks:
                file = block.get("file") or "code"
                code = block.get("code", "")
                parts.append(f"[CODE:{file}]\n{code}")
            merged_code = "\n\n".join(parts)

        node.setdefault("code_blocks", []).append({
            "file": tab_name,
            "description": "",
            "lang": lang,
            "code": merged_code,
        })
        # 兼容：将最新代码同步到 node.code
        node["code"] = merged_code
        assistant_message = {"role": "assistant", "content": reply, "tab": tab_name}
    else:
        assistant_message = {"role": "assistant", "content": reply}
    node["messages"].append(assistant_message)
    return reply, highlights, knowledge_nodes


# ---------------------------------------------------------------------------
# 代码生成节点工作流（Code Generation Nodes）
# ---------------------------------------------------------------------------

def _codegen_ai_call(user, workspace, prompt_key, user_content, max_tokens=8000):
    """为代码生成节点工作流发起一次独立的 AI 调用。"""
    client = get_client(user)
    if client is None:
        raise RuntimeError("API 未连接，请在登录或注册时配置 API Key。")
    model = workspace.get("selected_model") or PROVIDER_MODELS.get(user.get("api_provider"), ["deepseek-v4-flash"])[0]
    messages = [
        {"role": "system", "content": PROMPTS[prompt_key]},
        {"role": "user", "content": user_content},
    ]
    try:
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.5,
            max_tokens=max_tokens,
        )
    except Exception as exc:
        raise RuntimeError(f"AI 调用失败: {exc}")
    return response.choices[0].message.content


def _add_or_update_code_block(node, file, description, lang, code):
    """把节点代码追加或更新到当前对话节点的 code_blocks 中。"""
    blocks = node.setdefault("code_blocks", [])
    for b in blocks:
        if b.get("file") == file:
            b["description"] = description
            b["lang"] = lang
            b["code"] = code
            return
    blocks.append({"file": file, "description": description, "lang": lang, "code": code})


def _codegen_plan(user, workspace, prompt):
    """根据用户需求生成项目规划与节点列表。"""
    node = workspace["nodes"][workspace["current_node_id"]]
    lang = workspace.get("editor_language", "python")
    ext = EDITOR_LANGUAGES.get(lang, {}).get("ext", "py")
    ctx = graph_context(workspace)
    user_content = f"项目需求：{prompt}\n编程语言：{lang}\n文件扩展名：{ext}\n"
    if ctx:
        user_content += f"\n相关知识点：\n{ctx}\n"
    raw = _codegen_ai_call(user, workspace, "代码生成节点规划", user_content, max_tokens=4000)
    data, reply, highlights, knowledge_nodes = parse_ai_reply(raw)
    plan = data.get("project_markdown") or ""
    nodes = data.get("codegen_nodes") or []
    for n in nodes:
        n.setdefault("status", "planned")
        n.setdefault("knowledge", [])
        n.setdefault("pseudocode", "")
        n.setdefault("code_file", "")
        n.setdefault("code", "")
        n.setdefault("description", "")
        # 若 AI 没给 id，用 title 的 snake_case 兜底
        if not n.get("id"):
            n["id"] = re.sub(r"[^\w]+", "_", n.get("title", "node")).strip("_").lower() or str(uuid.uuid4())[:8]
    node["codegen_plan"] = plan
    node["codegen_nodes"] = nodes
    node["messages"].append({"role": "assistant", "content": reply or "项目规划已生成。"})
    # 同步把规划也写入 project_plan，方便现有 Project 面板查看
    if plan:
        node["project_plan"] = plan
    return workspace


def _codegen_implement(user, workspace, node_id):
    """为指定节点生成正式代码文件。"""
    node = workspace["nodes"][workspace["current_node_id"]]
    target = next((n for n in node.get("codegen_nodes", []) if n.get("id") == node_id), None)
    if target is None:
        raise ValueError("节点不存在")
    lang = workspace.get("editor_language", "python")
    ext = EDITOR_LANGUAGES.get(lang, {}).get("ext", "py")
    plan = node.get("codegen_plan", "")
    user_content = (
        f"项目规划：\n{plan}\n\n"
        f"当前节点 ID：{target.get('id')}\n"
        f"当前节点标题：{target.get('title')}\n"
        f"职责：{target.get('description')}\n"
        f"需要掌握的知识：{', '.join(target.get('knowledge', []))}\n"
        f"伪代码：\n{target.get('pseudocode')}\n"
        f"编程语言：{lang}\n文件扩展名：{ext}\n"
    )
    raw = _codegen_ai_call(user, workspace, "代码生成节点实现", user_content, max_tokens=8000)
    data, reply, highlights, knowledge_nodes = parse_ai_reply(raw)
    blocks = data.get("code_blocks") or []
    if blocks:
        block = blocks[0]
        file_name = str(block.get("file") or f"{target.get('id')}.{ext}").strip()
        if not file_name:
            file_name = f"{target.get('id')}.{ext}"
        _add_or_update_code_block(
            node,
            file_name,
            str(block.get("description") or target.get("title") or "").strip(),
            str(block.get("lang") or lang).strip(),
            str(block.get("code") or ""),
        )
        target["code_file"] = file_name
        target["code"] = block.get("code", "")
    target["status"] = "coded"
    node["messages"].append({"role": "assistant", "content": reply or f"已生成 {target.get('title')} 的代码。"})
    return workspace


def _codegen_main(user, workspace):
    """根据已实现的节点生成主文件。"""
    node = workspace["nodes"][workspace["current_node_id"]]
    lang = workspace.get("editor_language", "python")
    ext = EDITOR_LANGUAGES.get(lang, {}).get("ext", "py")
    plan = node.get("codegen_plan", "")
    coded_nodes = [n for n in node.get("codegen_nodes", []) if n.get("status") == "coded"]
    if not coded_nodes:
        raise ValueError("还没有任何节点生成代码，无法生成主文件")
    summary_lines = []
    for n in coded_nodes:
        summary_lines.append(f"- {n.get('title')} (文件：{n.get('code_file')}, id：{n.get('id')})")
    user_content = (
        f"项目规划：\n{plan}\n\n"
        f"已实现的节点：\n" + "\n".join(summary_lines) + f"\n\n"
        f"编程语言：{lang}\n文件扩展名：{ext}\n"
    )
    raw = _codegen_ai_call(user, workspace, "代码生成主文件", user_content, max_tokens=8000)
    data, reply, highlights, knowledge_nodes = parse_ai_reply(raw)
    blocks = data.get("code_blocks") or []
    if blocks:
        block = blocks[0]
        file_name = str(block.get("file") or f"main.{ext}").strip()
        if not file_name:
            file_name = f"main.{ext}"
        _add_or_update_code_block(
            node,
            file_name,
            str(block.get("description") or "项目入口主文件").strip(),
            str(block.get("lang") or lang).strip(),
            str(block.get("code") or ""),
        )
    node["messages"].append({"role": "assistant", "content": reply or "主文件已生成。"})
    return workspace


def _codegen_pseudo(user, workspace, node_id):
    """为指定节点重新生成/细化伪代码和知识点。"""
    node = workspace["nodes"][workspace["current_node_id"]]
    target = next((n for n in node.get("codegen_nodes", []) if n.get("id") == node_id), None)
    if target is None:
        raise ValueError("节点不存在")
    lang = workspace.get("editor_language", "python")
    plan = node.get("codegen_plan", "")
    user_content = (
        f"项目规划：\n{plan}\n\n"
        f"当前节点：{target.get('title')}\n"
        f"当前职责：{target.get('description')}\n"
        f"请为该节点重新生成知识点和伪代码，要求更详细、更适合初学者理解。\n"
        f"编程语言：{lang}\n"
    )
    raw = _codegen_ai_call(user, workspace, "代码生成节点规划", user_content, max_tokens=4000)
    data, reply, highlights, knowledge_nodes = parse_ai_reply(raw)
    nodes = data.get("codegen_nodes") or []
    if nodes:
        src = nodes[0]
        target["knowledge"] = src.get("knowledge") or target.get("knowledge", [])
        target["pseudocode"] = src.get("pseudocode") or target.get("pseudocode", "")
        target["description"] = src.get("description") or target.get("description", "")
        if target.get("status") == "planned":
            target["status"] = "planned"  # 保持 planned，让用户再触发生成代码
    node["messages"].append({"role": "assistant", "content": reply or f"已更新 {target.get('title')} 的伪代码。"})
    return workspace


def _codegen_update_node(workspace, node_id, updates):
    """用户手动编辑节点内容（伪代码、知识点、状态等）。"""
    node = workspace["nodes"][workspace["current_node_id"]]
    target = next((n for n in node.get("codegen_nodes", []) if n.get("id") == node_id), None)
    if target is None:
        raise ValueError("节点不存在")
    allowed = {"title", "description", "knowledge", "pseudocode", "code_file", "code", "status"}
    for key, value in updates.items():
        if key in allowed:
            target[key] = value
    return workspace


def node_depth(nodes, node_id):
    depth = 0
    while node_id:
        node = nodes.get(node_id)
        if not node:
            break
        parent_id = node.get("parent_id")
        if not parent_id:
            break
        depth += 1
        node_id = parent_id
    return depth


def create_child(workspace, title, inherit=False, code_ref=False):
    parent_id = workspace["current_node_id"]
    parent = workspace["nodes"][parent_id]
    nodes = workspace["nodes"]
    if node_depth(nodes, parent_id) >= 2:
        raise ValueError("对话树最多支持到孙子分支，不能创建曾孙分支")
    messages = []
    if inherit:
        messages = list(parent.get("messages", []))
        messages.append({"role": "system", "content": f"【分支对话】深入探讨：{title}"})
    else:
        messages = [{"role": "assistant", "content": f"我们来深入探讨「{title}」。"}]
    child = Node(
        parent_id=parent_id,
        title=(title or "新对话")[:40],
        messages=messages,
        code=parent.get("code", ""),
        code_ref=parent_id if code_ref else None,
    )
    workspace["nodes"][child.id] = asdict(child)
    parent.setdefault("children", []).append(child.id)
    workspace["current_node_id"] = child.id
    return child.id


def create_root_chat(workspace, title=None):
    root = Node(
        parent_id=None,
        title=(title or "新对话")[:40],
        messages=[{"role": "assistant", "content": "新对话已开始。"}],
        code="",
        code_ref=None,
    )
    workspace["nodes"][root.id] = asdict(root)
    workspace["current_node_id"] = root.id
    return root.id


def merge_nodes(workspace, node_a_id, node_b_id):
    nodes = workspace.get("nodes", {})
    node_a = nodes.get(node_a_id)
    node_b = nodes.get(node_b_id)

    if not node_a or not node_b:
        raise ValueError("节点不存在")
    parent_id = node_a.get("parent_id")
    if not parent_id or parent_id != node_b.get("parent_id"):
        raise ValueError("只能合并同一父对话下的两个子对话")
    if node_a.get("parent_id") is None or node_b.get("parent_id") is None:
        raise ValueError("不能合并根对话")

    parent = nodes.get(parent_id)
    if not parent:
        raise ValueError("父对话不存在")

    # 按各自 messages 数组顺序拼接
    merged_messages = list(node_a.get("messages", [])) + list(node_b.get("messages", []))
    # 简单去重：相邻且完全相同的消息只保留一条
    cleaned_messages = []
    for msg in merged_messages:
        if not cleaned_messages or msg != cleaned_messages[-1]:
            cleaned_messages.append(msg)

    # 合并代码块，后选择的节点（node_b）同名文件优先
    merged_blocks = []
    seen_files = set()
    for block in (node_a.get("code_blocks") or []) + (node_b.get("code_blocks") or []):
        if not isinstance(block, dict):
            continue
        file_name = str(block.get("file") or "code.py").strip() or "code.py"
        if file_name in seen_files:
            continue
        seen_files.add(file_name)
        merged_blocks.append({
            "file": file_name,
            "description": str(block.get("description") or "").strip(),
            "lang": str(block.get("lang") or "python").strip() or "python",
            "code": str(block.get("code") or ""),
        })

    merged_code = merged_blocks[0]["code"] if merged_blocks else node_b.get("code", node_a.get("code", ""))
    merged_code_ref = node_b.get("code_ref") or node_a.get("code_ref") or None

    merged = Node(
        parent_id=parent_id,
        title=f"合并：{node_a.get('title', '对话')} + {node_b.get('title', '对话')}"[:40],
        messages=cleaned_messages,
        code=merged_code,
        code_ref=merged_code_ref,
        code_blocks=merged_blocks,
    )
    nodes[merged.id] = asdict(merged)
    parent.setdefault("children", []).append(merged.id)

    # 从父节点 children 中移除旧节点并彻底删除
    parent["children"] = [cid for cid in parent.get("children", []) if cid not in (node_a_id, node_b_id)]

    def collect_delete(nid):
        n = nodes.get(nid)
        if not n:
            return
        for child_id in list(n.get("children", [])):
            collect_delete(child_id)
        nodes.pop(nid, None)

    collect_delete(node_a_id)
    collect_delete(node_b_id)

    workspace["current_node_id"] = merged.id
    return merged.id



def delete_node(workspace, node_id):
    nodes = workspace.get("nodes", {})
    if node_id not in nodes:
        return False
    node = nodes[node_id]
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
    # 清理指向已删除节点的 code_ref
    for n in nodes.values():
        if n.get("code_ref") in to_delete:
            n["code_ref"] = None
    current = workspace.get("current_node_id")
    if current in to_delete:
        if parent_id and parent_id in nodes:
            workspace["current_node_id"] = parent_id
        else:
            root = next((nid for nid, n in nodes.items() if n.get("parent_id") is None), None)
            if root:
                workspace["current_node_id"] = root
            else:
                # 删光了，创建一个新的根对话
                new_root = Node(messages=[{"role": "assistant", "content": "你好！左侧编写代码，右侧与我对话。"}])
                nodes[new_root.id] = asdict(new_root)
                workspace["current_node_id"] = new_root.id
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
            workspace = load_workspace(user)
            node = workspace["nodes"].get(workspace["current_node_id"], {})
            plan = node.get("project_plan") or read_text_file(PROJECT_PLAN_FILE, max_chars=50000) or ""
            self.send_json({
                "project_markdown": plan,
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
            elif path == "/api/scaffold":
                action = data.get("action")
                if action == "save_plan":
                    plan = data.get("project_markdown", "")
                    plan_text = plan.strip()
                    node_id = workspace.get("current_node_id")
                    node = workspace["nodes"].get(node_id) if node_id else None
                    if node is not None:
                        node["project_plan"] = plan_text
                        save_workspace(user, workspace)
                    # 同时保留全局文件作为兼容
                    SCAFFOLD_ROOT.mkdir(parents=True, exist_ok=True)
                    PROJECT_PLAN_FILE.write_text(plan_text + "\n" if plan_text else "", encoding="utf-8")
                    self.send_json({"ok": True, "project_markdown": plan, "workspace": workspace})
                elif action == "clear_plan":
                    node_id = workspace.get("current_node_id")
                    node = workspace["nodes"].get(node_id) if node_id else None
                    if node is not None:
                        node["project_plan"] = ""
                        save_workspace(user, workspace)
                    if PROJECT_PLAN_FILE.exists():
                        PROJECT_PLAN_FILE.write_text("", encoding="utf-8")
                    # 知识图谱/PCG 是全局共享的，清空单个对话的规划不应影响其他对话
                    self.send_json({"ok": True, "workspace": workspace})
                else:
                    self.send_json({"error": "未知操作"}, HTTPStatus.BAD_REQUEST)
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
            elif path == "/api/new-chat":
                create_root_chat(workspace, data.get("title"))
                save_workspace(user, workspace)
                self.send_json({"ok": True, "workspace": workspace})
            elif path == "/api/branch":
                create_child(workspace, data.get("title") or "新分支", bool(data.get("inherit")), bool(data.get("code_ref")))
                save_workspace(user, workspace)
                self.send_json({"ok": True, "workspace": workspace})
            elif path == "/api/merge-nodes":
                merge_nodes(workspace, data.get("node_a"), data.get("node_b"))
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
            elif path == "/api/recommend-knowledge":
                try:
                    recommendations = recommend_next_knowledge(user, workspace)
                    self.send_json({"ok": True, "recommendations": recommendations})
                except Exception as exc:
                    self.send_json({"error": str(exc)}, HTTPStatus.INTERNAL_SERVER_ERROR)
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
            elif path == "/api/codegen/plan":
                prompt = data.get("prompt", "")
                if not prompt.strip():
                    self.send_json({"error": "需求不能为空"}, HTTPStatus.BAD_REQUEST)
                    return
                _codegen_plan(user, workspace, prompt.strip())
                save_workspace(user, workspace)
                self.send_json({"ok": True, "workspace": workspace})
            elif path == "/api/codegen/pseudo":
                node_id = data.get("node_id")
                if not node_id:
                    self.send_json({"error": "node_id 不能为空"}, HTTPStatus.BAD_REQUEST)
                    return
                _codegen_pseudo(user, workspace, node_id)
                save_workspace(user, workspace)
                self.send_json({"ok": True, "workspace": workspace})
            elif path == "/api/codegen/implement":
                node_id = data.get("node_id")
                if not node_id:
                    self.send_json({"error": "node_id 不能为空"}, HTTPStatus.BAD_REQUEST)
                    return
                _codegen_implement(user, workspace, node_id)
                save_workspace(user, workspace)
                self.send_json({"ok": True, "workspace": workspace})
            elif path == "/api/codegen/main":
                _codegen_main(user, workspace)
                save_workspace(user, workspace)
                self.send_json({"ok": True, "workspace": workspace})
            elif path == "/api/codegen/update-node":
                node_id = data.get("node_id")
                updates = data.get("updates") or {}
                if not node_id:
                    self.send_json({"error": "node_id 不能为空"}, HTTPStatus.BAD_REQUEST)
                    return
                _codegen_update_node(workspace, node_id, updates)
                save_workspace(user, workspace)
                self.send_json({"ok": True, "workspace": workspace})
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
        workspace["selected_model"] = PROVIDER_MODELS.get(provider, ["deepseek-v4-flash"])[0]
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
        content = build_user_content(node, data.get("prompt", ""), bool(data.get("attach_code")), lang)
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

        model, messages, max_tokens = build_chat_messages(user, workspace, node)
        raw = ""
        try:
            stream = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.7,
                max_tokens=max_tokens,
                stream=True,
            )
            # 批量缓冲 SSE：首包尽快发出降低首字延迟，后续按 30ms/64 字合并减少往返
            delta_buffer = ""
            last_flush = time.monotonic()
            flush_interval = 0.03  # 30ms
            min_batch_chars = 64
            has_flushed = False
            for chunk in stream:
                delta = chunk.choices[0].delta.content if chunk.choices else None
                if not delta:
                    continue
                raw += delta
                delta_buffer += delta
                now = time.monotonic()
                elapsed = now - last_flush
                # 第一个 token 尽量立刻发出去，提升「首字可见」速度
                if not has_flushed and delta_buffer:
                    self.send_sse("delta", {"text": delta_buffer})
                    delta_buffer = ""
                    last_flush = now
                    has_flushed = True
                    continue
                if len(delta_buffer) >= min_batch_chars or elapsed >= flush_interval:
                    self.send_sse("delta", {"text": delta_buffer})
                    delta_buffer = ""
                    last_flush = now
            if delta_buffer:
                self.send_sse("delta", {"text": delta_buffer})
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




