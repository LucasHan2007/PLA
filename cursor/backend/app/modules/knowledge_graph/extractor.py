from app.config import settings
from app.core.json_utils import extract_json_from_text
from app.core.llm_client import llm_client
from app.modules.knowledge_graph.prompts import build_demo_graph, build_extract_messages
from app.modules.knowledge_graph.schema import (
    EdgeRelation,
    GraphEdge,
    GraphNode,
    NodeCategory,
    ProjectKnowledgeGraph,
)
from app.modules.project_parser.schema import ProjectFramework


def _safe_importance(value) -> int:
    try:
        level = int(value)
    except (TypeError, ValueError):
        return 2
    return min(3, max(1, level))


def _parse_graph(
    raw: dict,
    session_id: str,
    project_name: str,
) -> ProjectKnowledgeGraph:
    nodes: list[GraphNode] = []
    for item in raw.get("nodes") or []:
        cat = item.get("category", "concept")
        if cat not in {c.value for c in NodeCategory}:
            cat = "concept"
        nodes.append(
            GraphNode(
                id=str(item.get("id", f"node_{len(nodes) + 1}")),
                label=str(item.get("label", "")),
                description=str(item.get("description", "")),
                category=NodeCategory(cat),
                related_sections=list(item.get("related_sections") or []),
                importance=_safe_importance(item.get("importance", 2)),
            )
        )

    edges: list[GraphEdge] = []
    for item in raw.get("edges") or []:
        rel = item.get("relation", "requires")
        if rel not in {r.value for r in EdgeRelation}:
            rel = "requires"
        edges.append(
            GraphEdge(
                id=str(item.get("id", f"e{len(edges) + 1}")),
                source=str(item.get("source", "")),
                target=str(item.get("target", "")),
                relation=EdgeRelation(rel),
            )
        )

    return ProjectKnowledgeGraph(
        session_id=session_id,
        project_name=project_name,
        summary=str(raw.get("summary", "")),
        nodes=nodes,
        edges=edges,
    )


class GraphExtractor:
    async def extract_from_framework(
        self,
        session_id: str,
        document: ProjectFramework,
        framework_context: str,
    ) -> ProjectKnowledgeGraph:
        knowledge_content = ""
        for section in document.sections:
            if section.id == "knowledge_skills":
                knowledge_content = section.content
                break

        if not settings.llm_configured:
            raw = build_demo_graph(document.project_name, knowledge_content)
            return _parse_graph(raw, session_id, document.project_name)

        messages = build_extract_messages(framework_context, document.project_name)
        raw_text = await llm_client.chat_plain(messages, temperature=0.3)
        parsed = extract_json_from_text(raw_text)
        if not parsed:
            raw = build_demo_graph(document.project_name, knowledge_content)
            return _parse_graph(raw, session_id, document.project_name)
        return _parse_graph(parsed, session_id, document.project_name)


graph_extractor = GraphExtractor()
