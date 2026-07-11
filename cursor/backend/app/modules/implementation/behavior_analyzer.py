from app.modules.implementation.schema import BehaviorEntry


def analyze_code(code: str, *, mode: str | None = None) -> BehaviorEntry:
    lines = [ln for ln in code.splitlines() if ln.strip()]
    line_count = len(lines)
    notes: list[str] = []

    if line_count == 0:
        notes.append("代码区为空，尚未开始编写")
    elif line_count < 10:
        notes.append("代码量较少，处于起步阶段")
    else:
        notes.append(f"已编写约 {line_count} 行")

    text = code.lower()
    if "import " in code or "from " in code:
        notes.append("已引入依赖/模块")
    if "def " in code:
        notes.append("已定义函数")
    if "class " in code:
        notes.append("已定义类")
    if "todo" in text or "pass" in text:
        notes.append("存在待完成占位（TODO/pass）")
    if "error" in text or "except" in code:
        notes.append("涉及错误处理")

    from datetime import datetime, timezone

    return BehaviorEntry(
        timestamp=datetime.now(timezone.utc).isoformat(),
        note="；".join(notes),
        code_lines=line_count,
        mode=mode,
    )
