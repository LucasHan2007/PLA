from app.core.prompt_loader import load_module_prompt
from app.modules.user_profiling.question_bank import MACRO_QUESTIONS

_MODULE = "user_profiling"

PROFILE_SYSTEM_PROMPT = load_module_prompt(_MODULE, "profile_system.md")
NODE_PLANNER_SYSTEM_PROMPT = load_module_prompt(_MODULE, "node_planner_system.md")


def format_answers_for_prompt(answers: dict[str, str]) -> str:
    lines: list[str] = []
    for q in MACRO_QUESTIONS:
        ans = answers.get(q.id, "").strip()
        if ans:
            lines.append(f"【{q.category}】{q.question}")
            lines.append(f"用户回答：{ans}")
            lines.append("")
    return "\n".join(lines).strip()


def build_profile_messages(
    framework_context: str,
    answers: dict[str, str],
    graph_context: str = "",
) -> list[dict[str, str]]:
    parts = [
        "【项目解析体系摘要】\n" + framework_context,
    ]
    if graph_context.strip():
        parts.append(graph_context.strip())
    parts.extend([
        "【用户宏观问答】\n" + format_answers_for_prompt(answers),
        "请生成用户画像 JSON。结合基础知识图谱识别用户已会/待学的概念。",
    ])
    user_content = "\n\n".join(parts)
    return [
        {"role": "system", "content": PROFILE_SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]


def build_node_plan_messages(
    framework_context: str,
    profile_summary: str,
    profile_json: str,
    graph_context: str = "",
) -> list[dict[str, str]]:
    parts = [
        "【项目解析体系】\n" + framework_context,
    ]
    if graph_context.strip():
        parts.append(graph_context.strip())
    parts.extend([
        "【用户画像】\n" + profile_summary,
        f"画像详情：\n{profile_json}",
        "请生成学习节点序列 JSON。学习节点顺序应尊重基础知识图谱中的前置依赖；guiding_question 只引导思考，不给答案。",
    ])
    user_content = "\n\n".join(parts)
    return [
        {"role": "system", "content": NODE_PLANNER_SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]


def build_demo_profile(answers: dict[str, str]) -> dict:
    understanding = answers.get("project_understanding", "").strip() or "（用户尚未详细描述）"
    return {
        "experience_level": "beginner",
        "project_understanding": understanding[:200],
        "prior_knowledge": ["基础编程概念"],
        "knowledge_gaps": ["项目领域专项知识", "完整工程实践"],
        "learning_preferences": ["边做边学", "需要分步引导"],
        "learning_goals": ["理解项目全流程"],
        "concerns": [answers.get("concerns", "待进一步了解")[:100] or "环境配置与调试"],
        "summary": f"离线演示画像：用户正在学习该项目，当前理解——{understanding[:80]}。配置 LLM 后将生成精准画像。",
    }


def build_demo_nodes(project_name: str) -> dict:
    return {
        "nodes": [
            {
                "id": "node_1",
                "order": 1,
                "title": "建立问题边界",
                "summary": f"弄清「{project_name}」的输入、输出与验收标准",
                "guiding_question": "如果向同学用三句话介绍这个项目，你会强调哪三个要点？为什么？",
                "focus_skills": ["问题定义", "I/O 规格"],
                "related_sections": ["project_goal", "problem_definition"],
                "status": "in_progress",
            },
            {
                "id": "node_2",
                "order": 2,
                "title": "理解数据流",
                "summary": "弄清数据从进入到输出的变换过程",
                "guiding_question": "画一条从原始输入到最终输出的数据流，中间经过哪些关键变换？",
                "focus_skills": ["数据预处理", "模型 I/O"],
                "related_sections": ["data_flow"],
                "status": "not_started",
            },
            {
                "id": "node_3",
                "order": 3,
                "title": "梳理知识与技能",
                "summary": "对照项目所需技能，标记自己已会/待学的部分",
                "guiding_question": "列出你认为完成本项目必须掌握的 3 个概念——哪些你已经理解，哪些还不确定？",
                "focus_skills": ["知识自检"],
                "related_sections": ["knowledge_skills", "task_decomposition"],
                "status": "not_started",
            },
            {
                "id": "node_4",
                "order": 4,
                "title": "规划实现路径",
                "summary": "将宏观任务分解为可推进的小阶段",
                "guiding_question": "如果只有一周时间，你会把实现分成哪几个阶段？每阶段如何验证自己做对了？",
                "focus_skills": ["任务分解", "里程碑设计"],
                "related_sections": ["implementation_plan", "run_verify_debug"],
                "status": "not_started",
            },
        ]
    }
