from enum import Enum

from pydantic import BaseModel, Field


class NodeCategory(str, Enum):
    concept = "concept"
    skill = "skill"
    tool = "tool"
    practice = "practice"


class EdgeRelation(str, Enum):
    requires = "requires"
    relates_to = "relates_to"


class GraphNode(BaseModel):
    id: str
    label: str
    description: str = ""
    category: NodeCategory = NodeCategory.concept
    related_sections: list[str] = Field(default_factory=list)
    importance: int = Field(default=2, ge=1, le=3)


class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    relation: EdgeRelation = EdgeRelation.requires


class ProjectKnowledgeGraph(BaseModel):
    session_id: str
    project_name: str
    summary: str = ""
    nodes: list[GraphNode] = Field(default_factory=list)
    edges: list[GraphEdge] = Field(default_factory=list)


class GraphStatusResponse(BaseModel):
    session_id: str
    framework_ready: bool
    graph_ready: bool
    node_count: int = 0
    edge_count: int = 0
    project_name: str | None = None
    summary: str | None = None


class GraphResponse(BaseModel):
    session_id: str
    graph: ProjectKnowledgeGraph | None = None
