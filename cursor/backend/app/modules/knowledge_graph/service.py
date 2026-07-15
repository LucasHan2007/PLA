from app.modules.knowledge_graph.extractor import graph_extractor
from app.modules.knowledge_graph.project_graph_store import has_graph, load_graph, save_graph
from app.modules.knowledge_graph.queries import topological_layers
from app.modules.knowledge_graph.schema import GraphResponse, GraphStatusResponse, ProjectKnowledgeGraph
from app.modules.project_parser.background_jobs import get_job_state
from app.modules.project_parser.store import get_framework_context, has_framework, load_framework


class KnowledgeGraphService:
    def get_status(self, session_id: str) -> GraphStatusResponse:
        framework_ready = has_framework(session_id)
        graph = load_graph(session_id)
        ready = graph is not None and len(graph.nodes) > 0
        pending = get_job_state(session_id, "graph") == "pending" and not ready
        return GraphStatusResponse(
            session_id=session_id,
            framework_ready=framework_ready,
            graph_ready=ready,
            graph_pending=pending,
            node_count=len(graph.nodes) if graph else 0,
            edge_count=len(graph.edges) if graph else 0,
            project_name=graph.project_name if graph else None,
            summary=graph.summary if graph else None,
        )

    def get_graph(self, session_id: str) -> GraphResponse:
        return GraphResponse(session_id=session_id, graph=load_graph(session_id))

    def get_layers(self, session_id: str) -> list[list[dict]]:
        graph = load_graph(session_id)
        if not graph:
            return []
        return [
            [n.model_dump() for n in layer]
            for layer in topological_layers(graph)
        ]

    async def build_from_session(
        self,
        session_id: str,
        *,
        force_regenerate: bool = False,
    ) -> ProjectKnowledgeGraph:
        if not force_regenerate and has_graph(session_id):
            existing = load_graph(session_id)
            if existing is not None and existing.nodes:
                return existing

        if not has_framework(session_id):
            raise ValueError("请先生成并保存项目解析参考文件")

        document = load_framework(session_id)
        if not document:
            raise ValueError("无法加载项目解析体系")

        framework_context = get_framework_context(session_id)
        graph = await graph_extractor.extract_from_framework(
            session_id,
            document,
            framework_context,
        )
        save_graph(graph)
        return graph

    async def build_after_parse(
        self,
        session_id: str,
        document,
        framework_context: str,
        *,
        force_regenerate: bool = False,
    ) -> ProjectKnowledgeGraph:
        if not force_regenerate and has_graph(session_id):
            existing = load_graph(session_id)
            if existing is not None and existing.nodes:
                return existing

        graph = await graph_extractor.extract_from_framework(
            session_id,
            document,
            framework_context,
        )
        save_graph(graph)
        return graph


knowledge_graph_service = KnowledgeGraphService()
