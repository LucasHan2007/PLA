from app.modules.knowledge_graph.project_graph_store import load_graph
from app.modules.knowledge_graph.prompts import format_graph_context
from app.modules.project_parser.store import get_framework_context, has_framework, load_framework
from app.modules.user_profiling.node_planner import node_planner
from app.modules.user_profiling.nodes_store import get_current_node, load_learning_nodes
from app.modules.user_profiling.profiler import profiler
from app.modules.user_profiling.profile_store import get_profile_summary, has_user_profile
from app.modules.user_profiling.question_bank import MACRO_QUESTIONS, get_question, question_ids
from app.modules.user_profiling.schema import (
    ProfileAnswerResponse,
    ProfileBuildResponse,
    ProfileStatusResponse,
    ProfilingReferenceStatusResponse,
    QuestionsResponse,
)
from app.modules.user_profiling.session_store import load_answers, save_answer
from app.modules.user_profiling.store import save_profile_and_nodes
from app.modules.user_profiling.nodes_store import has_learning_nodes


class UserProfilingService:
    def _next_unanswered(self, answers: dict[str, str]) -> str | None:
        for qid in question_ids():
            if not answers.get(qid, "").strip():
                return qid
        return None

    def get_status(self, session_id: str) -> ProfileStatusResponse:
        framework_ready = has_framework(session_id)
        answers = load_answers(session_id)
        answered = sum(1 for qid in question_ids() if answers.get(qid, "").strip())
        total = len(MACRO_QUESTIONS)
        all_answered = answered >= total
        profile_ready = has_user_profile(session_id)
        nodes_ready = has_learning_nodes(session_id)
        current = get_current_node(session_id) if nodes_ready else None
        return ProfileStatusResponse(
            session_id=session_id,
            framework_ready=framework_ready,
            questions_total=total,
            questions_answered=answered,
            all_answered=all_answered,
            profile_ready=profile_ready,
            nodes_ready=nodes_ready,
            profile_summary=get_profile_summary(session_id) if profile_ready else None,
            node_count=len(load_learning_nodes(session_id)) if nodes_ready else 0,
            current_node_id=current.id if current else None,
            current_node_title=current.title if current else None,
            next_question_id=self._next_unanswered(answers) if framework_ready else None,
        )

    def get_questions(self, session_id: str) -> QuestionsResponse:
        return QuestionsResponse(
            session_id=session_id,
            questions=MACRO_QUESTIONS,
            answers=load_answers(session_id),
        )

    def submit_answer(
        self,
        session_id: str,
        question_id: str,
        answer: str,
    ) -> ProfileAnswerResponse:
        if not get_question(question_id):
            raise ValueError(f"未知问题：{question_id}")
        text = answer.strip()
        if not text:
            raise ValueError("请填写回答")

        answers = save_answer(session_id, question_id, text)
        answered = sum(1 for qid in question_ids() if answers.get(qid, "").strip())
        total = len(MACRO_QUESTIONS)
        return ProfileAnswerResponse(
            session_id=session_id,
            questions_answered=answered,
            questions_total=total,
            all_answered=answered >= total,
            next_question_id=self._next_unanswered(answers),
        )

    async def build_profile_and_nodes(self, session_id: str) -> ProfileBuildResponse:
        if not has_framework(session_id):
            raise ValueError("请先生成并保存项目解析参考文件")

        answers = load_answers(session_id)
        answered = sum(1 for qid in question_ids() if answers.get(qid, "").strip())
        if answered < len(MACRO_QUESTIONS):
            raise ValueError("请先完成全部宏观问题")

        framework_context = get_framework_context(session_id)
        graph_context = format_graph_context(load_graph(session_id))
        profile = await profiler.build_profile(framework_context, answers, graph_context)

        doc = load_framework(session_id)
        project_name = doc.project_name if doc else "本项目"
        nodes = await node_planner.plan_nodes(
            framework_context, profile, project_name, graph_context
        )

        save_profile_and_nodes(session_id, profile, nodes, project_name=project_name)
        current = get_current_node(session_id)

        return ProfileBuildResponse(
            session_id=session_id,
            profile_ready=True,
            nodes_ready=len(nodes) > 0,
            profile_summary=profile.summary,
            node_count=len(nodes),
            current_node_id=current.id if current else None,
            current_node_title=current.title if current else None,
            message="已根据你的回答生成用户画像与学习节点参考文件，保存至后台。",
        )

    def get_reference_status(self, session_id: str) -> ProfilingReferenceStatusResponse:
        profile_ready = has_user_profile(session_id)
        nodes_ready = has_learning_nodes(session_id)
        current = get_current_node(session_id) if nodes_ready else None
        return ProfilingReferenceStatusResponse(
            session_id=session_id,
            profile_ready=profile_ready,
            nodes_ready=nodes_ready,
            profile_summary=get_profile_summary(session_id) if profile_ready else None,
            node_count=len(load_learning_nodes(session_id)) if nodes_ready else 0,
            current_node_id=current.id if current else None,
            current_node_title=current.title if current else None,
        )


user_profiling_service = UserProfilingService()
