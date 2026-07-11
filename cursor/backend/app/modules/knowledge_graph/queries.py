from app.modules.knowledge_graph.schema import GraphEdge, GraphNode, ProjectKnowledgeGraph


def topological_layers(graph: ProjectKnowledgeGraph) -> list[list[GraphNode]]:
    """按前置依赖分层，便于前端展示。"""
    if not graph.nodes:
        return []

    node_map = {n.id: n for n in graph.nodes}
    in_degree = {n.id: 0 for n in graph.nodes}
    adj: dict[str, list[str]] = {n.id: [] for n in graph.nodes}

    for edge in graph.edges:
        if edge.source in in_degree and edge.target in in_degree:
            in_degree[edge.target] += 1
            adj[edge.source].append(edge.target)

    layers: list[list[GraphNode]] = []
    queue = [nid for nid, deg in in_degree.items() if deg == 0]
    visited = 0

    while queue:
        queue.sort()
        layer = [node_map[nid] for nid in queue if nid in node_map]
        if layer:
            layers.append(layer)
        next_queue: list[str] = []
        for nid in queue:
            visited += 1
            for nxt in adj.get(nid, []):
                in_degree[nxt] -= 1
                if in_degree[nxt] == 0:
                    next_queue.append(nxt)
        queue = next_queue

    if visited < len(graph.nodes):
        remaining = [n for n in graph.nodes if n.id not in {x.id for layer in layers for x in layer}]
        if remaining:
            layers.append(remaining)
    return layers


def prerequisites(graph: ProjectKnowledgeGraph, node_id: str) -> list[GraphNode]:
    node_map = {n.id: n for n in graph.nodes}
    preds = [
        edge.source
        for edge in graph.edges
        if edge.target == node_id and edge.relation.value == "requires"
    ]
    return [node_map[p] for p in preds if p in node_map]
