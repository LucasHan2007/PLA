from app.config import settings
from app.core.json_utils import extract_json_from_text
from app.core.llm_client import llm_client
from app.modules.project_parser.parser import parse_framework
from app.modules.project_parser.prompts import build_demo_raw, build_messages, format_framework_context
from app.modules.project_parser.schema import ProjectFramework
from app.modules.project_parser.store import save_framework
from app.modules.knowledge_graph.service import knowledge_graph_service


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
    ) -> ProjectFramework:
        document = await self.generate_framework(project_name, project_hint)
        save_framework(session_id, document)
        framework_context = format_framework_context(document.model_dump())
        try:
            await knowledge_graph_service.build_after_parse(
                session_id,
                document,
                framework_context,
            )
        except Exception:
            # 八段参考文件已保存；图谱失败不应导致整次解析失败
            pass
        return document


project_parser_service = ProjectParserService()
