from pydantic import BaseModel, Field


SECTION_ORDER: list[str] = [
    "project_goal",
    "problem_definition",
    "data_flow",
    "task_decomposition",
    "knowledge_skills",
    "implementation_plan",
    "run_verify_debug",
    "iterative_optimization",
]

SECTION_TITLES: dict[str, str] = {
    "project_goal": "项目目标",
    "problem_definition": "问题定义",
    "data_flow": "数据输入、输出流与数据模型及约束",
    "task_decomposition": "任务分解",
    "knowledge_skills": "所涉及的知识与技能",
    "implementation_plan": "实现方案",
    "run_verify_debug": "代码的运行、验证与调试",
    "iterative_optimization": "迭代优化",
}


class FrameworkSection(BaseModel):
    id: str
    title: str
    content: str


class ProjectFramework(BaseModel):
    """项目解析器生成的后台参考体系。"""

    project_name: str
    summary: str = ""
    sections: list[FrameworkSection] = Field(default_factory=list)


class TaskQaRequest(BaseModel):
    message: str
    session_id: str | None = None
    project_name: str = ""
    learning_node_id: str | None = None
    step_index: int = 0
    step_total: int = 0
    plan_title: str = ""
    plan_content: str = ""
    task_title: str = ""
    task_summary: str = ""


class TaskQaResponse(BaseModel):
    session_id: str
    answer: str
    strategy: str | None = None
    strategy_label: str | None = None
    learning_node_title: str | None = None


class ProjectParseRequest(BaseModel):
    project_name: str
    project_hint: str = ""
    session_id: str | None = None
    project_template_id: str | None = None
    force_regenerate: bool = False  # True：强制 LLM 重解析并覆盖原文件


class ProjectParseResponse(BaseModel):
    session_id: str
    project_name: str
    summary: str
    framework_ready: bool = True
    reused_existing: bool = False
    graph_ready: bool = False
    graph_pending: bool = False
    graph_node_count: int = 0
    code_blueprint_ready: bool = False
    code_blueprint_pending: bool = False
    code_node_count: int = 0
