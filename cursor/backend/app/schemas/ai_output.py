from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


class LogicPlanItem(BaseModel):
    id: int
    title: str
    content: str
    children: list["LogicPlanItem"] = Field(default_factory=list)


class OperationSubStep(BaseModel):
    """小步骤：用户不可见的目标，通过引导性问题思考后揭示。"""

    sub_id: int
    title: str
    description: str = ""
    rationale: str = ""
    why: str = ""
    inputs: str = ""
    outputs: str = ""
    knowledge_points: list[str] = Field(default_factory=list)
    code_module: str = ""
    common_errors: list[str] = Field(default_factory=list)
    next_hint: str = ""


class ExecutionStep(BaseModel):
    """大步骤：源于 logic_plan 某一点，含若干小步骤 sub_steps。"""

    step_id: int
    title: str
    logic_plan_ref: int | None = None
    description: str = ""
    sub_steps: list[OperationSubStep] = Field(default_factory=list)
    why: str = ""
    inputs: str = ""
    outputs: str = ""
    knowledge_points: list[str] = Field(default_factory=list)
    code_module: str = ""
    common_errors: list[str] = Field(default_factory=list)
    next_hint: str = ""


class CodeBlock(BaseModel):
    file_name: str
    language: str = "python"
    code: str
    annotations: list[dict[str, str]] = Field(default_factory=list)


class TermDefinition(BaseModel):
    term: str
    definition: str


class FollowUpQuestion(BaseModel):
    question: str
    answer_type: Literal["choice", "text"] = "text"
    options: list[str] = Field(default_factory=list)


class AIStructuredOutput(BaseModel):
    task_summary: str = ""
    logic_plan: list[LogicPlanItem] = Field(default_factory=list)
    execution_steps: list[ExecutionStep] = Field(default_factory=list)
    code_blocks: list[CodeBlock] = Field(default_factory=list)
    terms: list[TermDefinition] = Field(default_factory=list)
    follow_up_questions: list[FollowUpQuestion] = Field(default_factory=list)
    socratic_mode: bool = True
    assistant_message: str = ""
    analysis_complete: bool = False
    operations_complete: bool = False

    @model_validator(mode="before")
    @classmethod
    def _coerce_follow_up_questions(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        raw = data.get("follow_up_questions")
        if not isinstance(raw, list):
            return data
        normalized: list[dict[str, Any]] = []
        for item in raw:
            if isinstance(item, FollowUpQuestion):
                normalized.append(item.model_dump())
            elif isinstance(item, str):
                normalized.append({"question": item, "answer_type": "text", "options": []})
            elif isinstance(item, dict):
                normalized.append(item)
        data["follow_up_questions"] = normalized
        return data


class SocraticAnswer(BaseModel):
    question: str
    answer: str = ""


WorkflowPhase = Literal["intro", "project_analysis", "operation_desc", "code_design"]


class ChatRequest(BaseModel):
    message: str = ""
    socratic_answers: list[SocraticAnswer] = Field(default_factory=list)
    session_id: str | None = None
    step_id: int | None = None
    code_context: str | None = None
    error_context: str | None = None
    workflow_phase: WorkflowPhase = "intro"
    revealed_plan_count: int = 0
    revealed_step_count: int = 0
    revealed_code_count: int = 0
    debug_skip_to_phase: WorkflowPhase | None = None


class ChatResponse(BaseModel):
    session_id: str
    output: AIStructuredOutput
    raw_fallback: str | None = None


class SessionSummary(BaseModel):
    id: str
    title: str
    created_at: str
    updated_at: str
    message_count: int


class MessageRecord(BaseModel):
    id: int
    role: str
    content: str
    structured_output: AIStructuredOutput | None = None
    created_at: str
