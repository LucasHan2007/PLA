"""Monaco 编辑器与 Streamlit 桥接。"""
import os
import streamlit.components.v1 as components

_COMPONENT_PATH = os.path.join(os.path.dirname(__file__), "static", "editor")
_code_editor = components.declare_component("code_editor", path=_COMPONENT_PATH)


def render_editor(code="", diagnostics=None, height=420, key="code_editor"):
    """渲染 Monaco 编辑器，返回最新代码字符串。"""
    value = _code_editor(
        code=code or "",
        diagnostics=diagnostics or [],
        key=key,
        default=code or "",
        height=height,
    )
    return value if value is not None else code
