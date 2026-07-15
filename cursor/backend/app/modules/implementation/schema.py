from enum import Enum

from pydantic import BaseModel, Field


class CodeAssistMode(str, Enum):
    understand = "understand"
    completion = "completion"


class ImplementationModule(BaseModel):
    id: str
    name: str
    responsibility: str
    files: list[str] = Field(default_factory=list)
    depends_on: list[str] = Field(default_factory=list)


class ImplementationPlan(BaseModel):
    session_id: str
    project_name: str
    overview: str = ""
    tech_stack: list[str] = Field(default_factory=list)
    modules: list[ImplementationModule] = Field(default_factory=list)
    milestones: list[str] = Field(default_factory=list)


class CodeDraft(BaseModel):
    file_name: str = "main.py"
    language: str = "python"
    content: str = ""


class BehaviorEntry(BaseModel):
    timestamp: str
    note: str
    code_lines: int = 0
    mode: str | None = None


class ImplementationState(BaseModel):
    session_id: str
    plan: ImplementationPlan | None = None
    drafts: list[CodeDraft] = Field(default_factory=list)
    behavior_log: list[BehaviorEntry] = Field(default_factory=list)


class ImplementationStatusResponse(BaseModel):
    session_id: str
    framework_ready: bool
    profile_ready: bool
    nodes_ready: bool
    plan_ready: bool
    code_blueprint_ready: bool = False
    code_blueprint_pending: bool = False
    code_node_count: int = 0
    project_name: str | None = None


class PlanGenerateResponse(BaseModel):
    session_id: str
    plan: ImplementationPlan
    message: str


class PlanResponse(BaseModel):
    session_id: str
    plan: ImplementationPlan | None = None
    drafts: list[CodeDraft] = Field(default_factory=list)


class CodeAssistRequest(BaseModel):
    session_id: str
    mode: CodeAssistMode
    code: str = ""
    message: str
    file_name: str = "main.py"
    learning_node_id: str | None = None


class CodeAssistResponse(BaseModel):
    session_id: str
    mode: CodeAssistMode
    answer: str
    behavior_note: str | None = None


class SaveDraftRequest(BaseModel):
    session_id: str
    file_name: str = "main.py"
    language: str = "python"
    content: str


class CodeSegmentType(str, Enum):
    prose = "prose"
    code = "code"


class CodeSegment(BaseModel):
    """自然语言段落或穿插的代码模板/伪代码。"""

    type: CodeSegmentType = CodeSegmentType.prose
    content: str = ""
    language: str = "python"
    label: str = ""  # 如「模板」「伪代码」


class CodeNode(BaseModel):
    """解析阶段抽取的代码功能节点。"""

    id: str
    order: int
    title: str
    related_sections: list[str] = Field(default_factory=list)
    related_learning_node_ids: list[str] = Field(default_factory=list)
    segments: list[CodeSegment] = Field(default_factory=list)


class CodeBlueprint(BaseModel):
    """项目代码蓝图：自然语言节点 + 穿插伪代码。"""

    session_id: str
    project_name: str
    summary: str = ""
    language: str = "python"
    code_nodes: list[CodeNode] = Field(default_factory=list)


class CodeBlueprintResponse(BaseModel):
    session_id: str
    blueprint: CodeBlueprint | None = None
