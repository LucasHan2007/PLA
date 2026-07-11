from app.config import settings
from app.core.json_utils import extract_json_from_text
from app.core.llm_client import llm_client
from app.modules.user_profiling.prompts import build_demo_profile, build_profile_messages
from app.modules.user_profiling.schema import ExperienceLevel, UserProfile


def _parse_profile(raw: dict) -> UserProfile:
    level = raw.get("experience_level", "beginner")
    if level not in {e.value for e in ExperienceLevel}:
        level = "beginner"
    return UserProfile(
        experience_level=ExperienceLevel(level),
        project_understanding=str(raw.get("project_understanding", "")),
        prior_knowledge=list(raw.get("prior_knowledge") or []),
        knowledge_gaps=list(raw.get("knowledge_gaps") or []),
        learning_preferences=list(raw.get("learning_preferences") or []),
        learning_goals=list(raw.get("learning_goals") or []),
        concerns=list(raw.get("concerns") or []),
        summary=str(raw.get("summary", "")),
    )


class Profiler:
    async def build_profile(
        self,
        framework_context: str,
        answers: dict[str, str],
        graph_context: str = "",
    ) -> UserProfile:
        if not settings.llm_configured:
            return _parse_profile(build_demo_profile(answers))

        messages = build_profile_messages(framework_context, answers, graph_context)
        raw_text = await llm_client.chat_plain(messages, temperature=0.3)
        parsed = extract_json_from_text(raw_text)
        if not parsed:
            return _parse_profile(build_demo_profile(answers))
        return _parse_profile(parsed)


profiler = Profiler()
