"""用户注册、登录、会话恢复、工作区持久化。"""
import hashlib
import json
import secrets
import uuid
from datetime import datetime, timedelta

import streamlit as st
from openai import OpenAI

from auth.crypto import decrypt_api_key, encrypt_api_key, hash_password, verify_password
from auth.cookies import clear_session_token, write_session_token
from auth.db import get_conn, init_db

SESSION_DAYS = 14


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _new_token() -> str:
    return secrets.token_urlsafe(32)


def register_user(username, password, api_provider, api_key, api_base_url=None):
    init_db()
    username = (username or "").strip()
    password = password or ""
    if not username or not password:
        return False, "用户名和密码不能为空"
    if len(password) < 6:
        return False, "密码至少 6 位"
    conn = get_conn()
    try:
        conn.execute(
            "INSERT INTO users (username, password_hash, api_provider, api_key_encrypted, api_base_url) VALUES (?,?,?,?,?)",
            (
                username,
                hash_password(password),
                api_provider or "",
                encrypt_api_key(api_key or ""),
                api_base_url or "",
            ),
        )
        conn.commit()
        return True, "注册成功"
    except Exception as e:
        if "UNIQUE" in str(e):
            return False, "用户名已存在"
        return False, f"注册失败：{e}"
    finally:
        conn.close()


def _create_session(user_id: int) -> str:
    token = _new_token()
    expires = (datetime.utcnow() + timedelta(days=SESSION_DAYS)).isoformat()
    conn = get_conn()
    try:
        conn.execute(
            "INSERT OR REPLACE INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)",
            (_hash_token(token), user_id, expires),
        )
        conn.commit()
    finally:
        conn.close()
    return token


def _load_user_row(user_id: int):
    conn = get_conn()
    try:
        row = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def _apply_user_to_session(user_row, remember=True):
    from functions import import_tree_payload, init_tree

    api_key = decrypt_api_key(user_row.get("api_key_encrypted") or "")
    provider = user_row.get("api_provider") or ""
    base_url = (user_row.get("api_base_url") or "").rstrip("/")

    st.session_state.auth_user_id = user_row["id"]
    st.session_state.username = user_row["username"]
    st.session_state.profile = user_row.get("profile") or "用户"
    st.session_state.api_provider = provider
    st.session_state.logged_in = "已登录"

    if provider == "管理员":
        import os
        api = os.getenv("墙木的key")
        if api:
            st.session_state.client = OpenAI(api_key=api, base_url="https://api.deepseek.com/v1")
            st.session_state.selected_model = "deepseek-chat"
        else:
            st.session_state.client = None
    elif api_key and base_url:
        st.session_state.client = OpenAI(api_key=api_key, base_url=base_url)
    elif api_key and provider:
        from auth.providers import API_PROVIDERS
        url = API_PROVIDERS.get(provider)
        if url:
            st.session_state.client = OpenAI(api_key=api_key, base_url=url)
        else:
            st.session_state.client = None
    else:
        st.session_state.client = None

    from stream_chat import ensure_model_for_provider
    ensure_model_for_provider(st)

    loaded = load_user_workspace(user_row["id"])
    if not loaded:
        if "tree_nodes" in st.session_state:
            del st.session_state.tree_nodes
        init_tree()

    if remember:
        token = _create_session(user_row["id"])
        st.session_state._pending_cookie_token = token
        st.session_state._auth_cookie_needs_flush = True


def login_user(username, password, remember=True):
    init_db()
    conn = get_conn()
    try:
        row = conn.execute("SELECT * FROM users WHERE username=?", ((username or "").strip(),)).fetchone()
    finally:
        conn.close()
    if not row or not verify_password(password or "", row["password_hash"]):
        return False, "用户名或密码错误"
    _apply_user_to_session(dict(row), remember=remember)
    return True, "登录成功"


def get_admin_username():
    import os
    return os.getenv("ADMIN_USERNAME", "1234567890")


def login_admin_direct(remember=True):
    """一键管理员登录（使用环境变量 ADMIN_USERNAME，默认 1234567890）。"""
    return login_admin(get_admin_username(), remember=remember)


def _set_admin_session(username):
    import os

    admin_user = get_admin_username()
    if (username or "").strip() != admin_user:
        return False, f"非管理员账号（当前管理员：{admin_user}）"
    api = os.getenv("墙木的key")
    if not api:
        return False, "环境变量「墙木的key」未设置"
    st.session_state.profile = "管理员"
    st.session_state.username = username
    st.session_state.api_provider = "管理员"
    st.session_state.client = OpenAI(api_key=api, base_url="https://api.deepseek.com/v1")
    st.session_state.logged_in = "已登录"
    st.session_state.selected_model = "deepseek-chat"
    st.session_state.auth_user_id = None
    return True, "管理员登录成功"


def login_admin(username, remember=True):
    ok, msg = _set_admin_session(username)
    if not ok:
        return ok, msg
    if remember:
        token = f"admin:{username}"
        st.session_state._pending_cookie_token = token
        st.session_state._auth_cookie_needs_flush = True
    else:
        clear_session_token()
    return True, msg


def _apply_persisted_token(token: str) -> bool:
    from functions import init_tree

    if token.startswith("admin:"):
        username = token.split(":", 1)[1]
        ok, _ = _set_admin_session(username)
        if ok and "tree_nodes" not in st.session_state:
            init_tree()
        return ok

    conn = get_conn()
    try:
        row = conn.execute(
            """
            SELECT s.user_id, s.expires_at, u.* FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token_hash=?
            """,
            (_hash_token(token),),
        ).fetchone()
    finally:
        conn.close()

    if not row:
        clear_session_token()
        return False

    if datetime.fromisoformat(row["expires_at"]) < datetime.utcnow():
        clear_session_token()
        return False

    _apply_user_to_session(dict(row), remember=False)
    return True


def auth_cookie_pending() -> bool:
    """Cookie 组件尚未完成读取时为 True，用于阻止页面闪烁渲染。"""
    if st.session_state.get("logged_in") == "已登录":
        return False
    return st.session_state.get("_auth_cookie_attempt", 0) < 2


def restore_session_from_cookie():
    from auth.cookies import read_session_token

    if st.session_state.get("logged_in") == "已登录":
        return True

    token = read_session_token()
    if not token:
        return False

    return _apply_persisted_token(token)


def logout_user():
    """退出登录并清除会话。"""
    save_user_workspace()
    uid = st.session_state.get("auth_user_id")
    if uid:
        conn = get_conn()
        try:
            conn.execute("DELETE FROM sessions WHERE user_id=?", (uid,))
            conn.commit()
        finally:
            conn.close()
    clear_session_token()
    st.session_state.clear()
    st.session_state.logged_in = "未登录"
    st.session_state.client = None
    st.session_state._auth_cookie_attempt = 2


def export_workspace_payload():
    from functions import export_tree_payload, get_root_node

    root = get_root_node()
    if not root:
        return None
    return {
        "current_node_id": st.session_state.get("current_node_id"),
        "tree": export_tree_payload(),
    }


def save_user_workspace(user_id=None):
    uid = user_id or st.session_state.get("auth_user_id")
    if not uid:
        return
    payload = export_workspace_payload()
    if not payload:
        return
    init_db()
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
            (uid, json.dumps(payload, ensure_ascii=False), payload.get("current_node_id")),
        )
        conn.commit()
    finally:
        conn.close()


def load_user_workspace(user_id):
    from functions import import_tree_payload

    init_db()
    conn = get_conn()
    try:
        row = conn.execute("SELECT tree_json, current_node_id FROM user_workspaces WHERE user_id=?", (user_id,)).fetchone()
    finally:
        conn.close()
    if not row or not row["tree_json"]:
        return False
    try:
        data = json.loads(row["tree_json"])
        tree = data.get("tree") or data
        if not import_tree_payload(tree):
            return False
        cid = data.get("current_node_id") or row["current_node_id"]
        if cid and cid in st.session_state.tree_nodes:
            st.session_state.current_node_id = cid
            st.session_state.current_messages = st.session_state.tree_nodes[cid].messages
        return True
    except (json.JSONDecodeError, TypeError, KeyError):
        return False


def bootstrap_auth():
    init_db()
    if "logged_in" not in st.session_state:
        st.session_state.logged_in = "未登录"
        st.session_state.client = None
    if st.session_state.get("logged_in") == "已登录":
        return

    if restore_session_from_cookie():
        return

    attempt = st.session_state.get("_auth_cookie_attempt", 0) + 1
    st.session_state._auth_cookie_attempt = attempt
    if attempt < 2:
        st.rerun()
