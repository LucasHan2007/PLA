import httpx

from app.config import settings
from app.schemas.ai_output import AIStructuredOutput
from app.services.post_processor import parse_structured_output, process_llm_response
from app.services.prompt_builder import build_demo_output, build_messages


class LLMService:
    async def chat(
        self,
        user_message: str,
        history: list[dict[str, str]],
        code_context: str | None = None,
        error_context: str | None = None,
        step_id: int | None = None,
        chat_message: str | None = None,
        socratic_answers: list[dict[str, str]] | None = None,
    ) -> tuple[AIStructuredOutput, str | None]:
        if not settings.llm_configured:
            demo = build_demo_output(user_message)
            return parse_structured_output(demo), None

        messages = build_messages(
            user_message,
            history,
            code_context,
            error_context,
            step_id,
            chat_message=chat_message,
            socratic_answers=socratic_answers,
        )
        raw_text = await self._call_api(messages)
        return process_llm_response(raw_text)

    async def _call_api(self, messages: list[dict[str, str]]) -> str:
        url = f"{settings.llm_api_base.rstrip('/')}/chat/completions"
        headers = {
            "Authorization": f"Bearer {settings.llm_api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": settings.llm_model,
            "messages": messages,
            "temperature": 0.7,
            "response_format": {"type": "json_object"},
        }
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"]


llm_service = LLMService()
