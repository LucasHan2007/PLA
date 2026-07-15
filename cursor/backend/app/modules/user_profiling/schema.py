from enum import Enum

from pydantic import BaseModel, Field


class ExperienceLevel(str, Enum):
    beginner = "beginner"
    intermediate = "intermediate"
    advanced = "advanced"


class NodeStatus(str, Enum):
    not_started = "not_started"
    in_progress = "in_progress"
    completed = "completed"


class MacroQuestion(BaseModel):
    id: str
    category: str
    question: str
    hint: str = ""
    placeholder: str = ""


class UserProfile(BaseModel):
    experience_level: ExperienceLevel = ExperienceLevel.beginner
    project_understanding: str = ""
    prior_knowledge: list[str] = Field(default_factory=list)
    knowledge_gaps: list[str] = Field(default_factory=list)
    learning_preferences: list[str] = Field(default_factory=list)
    learning_goals: list[str] = Field(default_factory=list)
    concerns: list[str] = Field(default_factory=list)
    summary: str = ""


class LearningNode(BaseModel):
    id: str
    order: int
    title: str
    summary: str
    guiding_question: str
    focus_skills: list[str] = Field(default_factory=list)
    related_sections: list[str] = Field(default_factory=list)
    status: NodeStatus = NodeStatus.not_started


class ProfilingState(BaseModel):
    """宏观问答进度（仅存 profiling_sessions，不含画像/节点正文）。"""

    session_id: str
    answers: dict[str, str] = Field(default_factory=dict)


class ProfileStatusResponse(BaseModel):
    session_id: str
    framework_ready: bool
    questions_total: int
    questions_answered: int
    all_answered: bool
    profile_ready: bool
    nodes_ready: bool
    profile_summary: str | None = None
    node_count: int = 0
    current_node_id: str | None = None
    current_node_title: str | None = None
    next_question_id: str | None = None


class QuestionsResponse(BaseModel):
    session_id: str
    questions: list[MacroQuestion]
    answers: dict[str, str]


class ProfileAnswerRequest(BaseModel):
    session_id: str
    question_id: str
    answer: str


class ProfileAnswerResponse(BaseModel):
    session_id: str
    questions_answered: int
    questions_total: int
    all_answered: bool
    next_question_id: str | None = None


class ProfileBuildRequest(BaseModel):
    session_id: str
    force_regenerate: bool = False  # True：强制重生成画像与节点


class ProfileBuildResponse(BaseModel):
    session_id: str
    profile_ready: bool = True
    nodes_ready: bool = True
    profile_summary: str = ""
    node_count: int = 0
    current_node_id: str | None = None
    current_node_title: str | None = None
    message: str


class ProfilingReferenceStatusResponse(BaseModel):
    """画像与学习节点参考文件状态（不含正文）。"""

    session_id: str
    profile_ready: bool
    nodes_ready: bool
    profile_summary: str | None = None
    node_count: int = 0
    current_node_id: str | None = None
    current_node_title: str | None = None


class LearningNodesListResponse(BaseModel):
    """学习节点列表（供页面 3/4 展示整理内容）。"""

    session_id: str
    nodes_ready: bool
    nodes: list[LearningNode] = Field(default_factory=list)
