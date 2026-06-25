"""Monaco 编辑器与 Streamlit 桥接。"""
import os
import streamlit.components.v1 as components

_COMPONENT_PATH = os.path.join(os.path.dirname(__file__), "static", "editor")
_code_editor = components.declare_component("code_editor", path=_COMPONENT_PATH)


def _normalize_editor_result(result):
    """兼容旧版纯字符串与新版 {code, action} 结构。"""
    if result is None:
        return None, None
    if isinstance(result, dict):
        return result.get("code", ""), result.get("action")
    return str(result), "edit"


def render_editor(code="", diagnostics=None, height=620, key="main_editor"):
    """渲染 Monaco 编辑器；返回 (code, action) 或 (None, None)。"""
    raw = _code_editor(
        code=code or "",
        diagnostics=diagnostics or [],
        default={"code": code or "", "action": "edit"},
        key=key,
        height=height,
    )
    return _normalize_editor_result(raw)
