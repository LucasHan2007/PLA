from typing import Any

from app.modules.project_parser.schema import (
    SECTION_ORDER,
    SECTION_TITLES,
    FrameworkSection,
    ProjectFramework,
)


def parse_framework(raw: dict[str, Any] | None, project_name: str) -> ProjectFramework:
    if not raw:
        raw = {}
    name = str(raw.get("project_name") or project_name).strip() or project_name.strip()
    summary = str(raw.get("summary") or "").strip()

    by_id: dict[str, dict[str, Any]] = {}
    for item in raw.get("sections") or []:
        if isinstance(item, dict) and item.get("id"):
            by_id[str(item["id"])] = item

    sections: list[FrameworkSection] = []
    for sid in SECTION_ORDER:
        item = by_id.get(sid, {})
        sections.append(
            FrameworkSection(
                id=sid,
                title=str(item.get("title") or SECTION_TITLES[sid]),
                content=str(item.get("content") or "").strip() or "（待补充）",
            )
        )

    if not summary:
        goal = sections[0].content[:80] if sections else name
        summary = f"{name}：{goal}{'…' if len(goal) >= 80 else ''}"

    return ProjectFramework(project_name=name, summary=summary, sections=sections)
