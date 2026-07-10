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
