from app.config import settings
from app.core.json_utils import extract_json_from_text
from app.core.llm_client import llm_client
from app.modules.implementation.code_blueprint_store import clear_blueprint, has_blueprint
from app.modules.knowledge_graph.project_graph_store import clear_graph, has_graph
from app.modules.project_parser.background_jobs import (
    schedule_missing_post_parse_jobs,
    schedule_post_parse_jobs,
)
from app.modules.project_parser.parser import parse_framework
from app.modules.project_parser.prompts import build_demo_raw, build_messages, format_framework_context
from app.modules.project_parser.schema import ProjectFramework
from app.modules.project_parser.store import has_framework, load_framework, save_framework


class ProjectParserService:
    async def generate_framework(
        self,
        project_name: str,
        project_hint: str = "",
    ) -> ProjectFramework:
        name = project_name.strip()
        if not name:
            raise ValueError("项目名称不能为空")

        if not settings.llm_configured:
            return parse_framework(build_demo_raw(name, project_hint), name)

        messages = build_messages(name, project_hint)
        raw_text = await llm_client.chat_plain(messages, temperature=0.4)
        parsed = extract_json_from_text(raw_text)
        return parse_framework(parsed, name)

    async def parse_and_save(
        self,
        session_id: str,
        project_name: str,
        project_hint: str = "",
        *,
        force_regenerate: bool = False,
    ) -> tuple[ProjectFramework, bool]:
        """生成或复用八段 framework。

        返回 (document, reused_existing)。
        已有解析且未强制重生成时直接读盘，不调用 LLM、不覆盖文件。
        图谱 / 代码蓝图仅在缺失时后台补齐。
        """
        if not force_regenerate and has_framework(session_id):
            existing = load_framework(session_id)
            if existing is not None:
                need_graph = not has_graph(session_id)
                need_blueprint = not has_blueprint(session_id)
                if need_graph or need_blueprint:
                    framework_context = format_framework_context(existing.model_dump())
                    schedule_missing_post_parse_jobs(
                        session_id,
                        existing,
                        framework_context,
                        need_graph=need_graph,
                        need_blueprint=need_blueprint,
                    )
                return existing, True

        document = await self.generate_framework(project_name, project_hint)
        save_framework(session_id, document)

        clear_graph(session_id)
        clear_blueprint(session_id)

        framework_context = format_framework_context(document.model_dump())
        schedule_post_parse_jobs(session_id, document, framework_context)
        return document, False


project_parser_service = ProjectParserService()
