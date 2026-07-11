from app.config import settings
from app.core.llm_client import llm_client
from app.modules.implementation.prompts import build_code_assist_messages, build_demo_code_answer


class CodeAssistService:
    async def assist(
        self,
        mode: str,
        context_block: str,
        *,
        code: str,
        message: str,
        file_name: str,
    ) -> str:
        if not settings.llm_configured:
            return build_demo_code_answer(mode, message, file_name)

        messages = build_code_assist_messages(
            mode,
            context_block,
            code=code,
            message=message,
            file_name=file_name,
        )
        return await llm_client.chat_plain(messages, temperature=0.4 if mode == "completion" else 0.3)


code_assist_service = CodeAssistService()
