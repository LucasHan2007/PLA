from app.core.prompt_loader import load_module_prompt
from app.modules.knowledge_graph.schema import ProjectKnowledgeGraph

_MODULE = "knowledge_graph"

EXTRACT_SYSTEM_PROMPT = load_module_prompt(_MODULE, "extract_system.md")


def build_extract_messages(framework_context: str, project_name: str) -> list[dict[str, str]]:
    user_content = (
        f"【项目】{project_name}\n\n"
        f"【项目解析体系】\n{framework_context}\n\n"
        "请抽取基础知识图谱 JSON。"
    )
    return [
        {"role": "system", "content": EXTRACT_SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]


def build_demo_graph(project_name: str, knowledge_content: str = "") -> dict:
    """离线演示：从 knowledge_skills 段落或默认模板生成简易图谱。"""
    labels = _split_bullet_lines(knowledge_content)
    if len(labels) < 3:
        labels = [
            "问题定义与 I/O 规格",
            "数据预处理",
            "核心算法/模型",
            "训练与评估",
            "运行验证与调试",
        ]

    nodes = []
    for i, label in enumerate(labels[:8]):
        nodes.append({
            "id": f"node_{i + 1}",
            "label": label[:40],
            "description": f"「{project_name}」相关知识：{label[:60]}",
            "category": "concept" if i < 2 else ("skill" if i < 4 else "practice"),
            "related_sections": ["knowledge_skills" if i >= 2 else "project_goal"],
            "importance": 1 if i < 2 else 2,
        })

    edges = [
        {
            "id": f"e{i + 1}",
            "source": nodes[i]["id"],
            "target": nodes[i + 1]["id"],
            "relation": "requires",
        }
        for i in range(len(nodes) - 1)
    ]

    return {
        "summary": f"离线演示：{project_name} 的基础知识依赖链（配置 LLM 后将从八段体系自动抽取）",
        "nodes": nodes,
        "edges": edges,
    }


def _split_bullet_lines(text: str) -> list[str]:
    if not text.strip():
        return []
    lines: list[str] = []
    for raw in text.replace("•", "\n").split("\n"):
        line = raw.strip().lstrip("-*·0123456789.) ").strip()
        if len(line) >= 2:
            lines.append(line)
    return lines


def format_graph_context(graph: ProjectKnowledgeGraph | None) -> str:
    if not graph or not graph.nodes:
        return ""
    lines = [f"【基础知识图谱】{graph.summary}", ""]
    for node in graph.nodes:
        lines.append(f"- [{node.category.value}] {node.label}：{node.description[:80]}")
    if graph.edges:
        lines.append("")
        lines.append("依赖关系（前置 → 后续）：")
        node_map = {n.id: n.label for n in graph.nodes}
        for edge in graph.edges[:12]:
            src = node_map.get(edge.source, edge.source)
            tgt = node_map.get(edge.target, edge.target)
            lines.append(f"  {src} → {tgt}")
    return "\n".join(lines)
