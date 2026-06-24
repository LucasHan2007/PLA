import httpx

from app.config import settings
from app.schemas.ai_output import AIStructuredOutput
from app.services.post_processor import parse_structured_output, process_llm_response
from app.services.prompt_builder import (
    build_demo_output,
    build_messages,
    build_task_qa_demo_answer,
    build_task_qa_messages,
)


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
        workflow_phase: str = "intro",
        revealed_plan_count: int = 0,
        revealed_step_count: int = 0,
        revealed_code_count: int = 0,
        debug_skip_to_phase: str | None = None,
    ) -> tuple[AIStructuredOutput, str | None]:
        effective_phase = debug_skip_to_phase or workflow_phase
        if not settings.llm_configured:
            demo = build_demo_output(
                user_message,
                workflow_phase=effective_phase,
                revealed_plan_count=revealed_plan_count,
                revealed_step_count=revealed_step_count,
                revealed_code_count=revealed_code_count,
                debug_skip_to_phase=debug_skip_to_phase,
            )
            return parse_structured_output(demo), None

        messages = build_messages(
            user_message,
            history,
            code_context,
            error_context,
            step_id,
            chat_message=chat_message,
            socratic_answers=socratic_answers,
            workflow_phase=effective_phase,
            revealed_plan_count=revealed_plan_count,
            revealed_step_count=revealed_step_count,
            revealed_code_count=revealed_code_count,
            debug_skip_to_phase=debug_skip_to_phase,
        )
        raw_text = await self._call_api(messages)
        return process_llm_response(raw_text)

    async def task_qa(
        self,
        question: str,
        history: list[dict[str, str]],
        *,
        project_name: str,
        step_index: int,
        step_total: int,
        plan_title: str,
        plan_content: str,
        task_title: str,
        task_summary: str,
    ) -> str:
        if not settings.llm_configured:
            return build_task_qa_demo_answer(
                project_name=project_name,
                plan_title=plan_title,
                task_title=task_title,
                task_summary=task_summary,
            )

        messages = build_task_qa_messages(
            question,
            history,
            project_name=project_name,
            step_index=step_index,
            step_total=step_total,
            plan_title=plan_title,
            plan_content=plan_content,
            task_title=task_title,
            task_summary=task_summary,
        )
        return await self._call_api_plain(messages)

    async def _call_api_plain(self, messages: list[dict[str, str]]) -> str:
        url = f"{settings.llm_api_base.rstrip('/')}/chat/completions"
        headers = {
            "Authorization": f"Bearer {settings.llm_api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": settings.llm_model,
            "messages": messages,
            "temperature": 0.5,
        }
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return (data["choices"][0]["message"]["content"] or "").strip()

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
