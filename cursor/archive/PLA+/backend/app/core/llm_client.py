import asyncio

import httpx

from app.config import settings
from app.core.llm_errors import format_llm_http_error

_MAX_RETRIES = 3


class LLMClient:
    async def chat_plain(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.5,
        timeout: float = 180.0,
    ) -> str:
        if not settings.llm_configured:
            raise RuntimeError("未配置 LLM_API_KEY，请在 backend/.env 中设置。")

        url = f"{settings.llm_api_base.rstrip('/')}/chat/completions"
        headers = {
            "Authorization": f"Bearer {settings.llm_api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": settings.llm_model,
            "messages": messages,
            "temperature": temperature,
        }

        last_request_error: httpx.RequestError | None = None
        for attempt in range(1, _MAX_RETRIES + 1):
            try:
                async with httpx.AsyncClient(timeout=timeout, trust_env=True) as client:
                    try:
                        resp = await client.post(url, headers=headers, json=payload)
                        resp.raise_for_status()
                    except httpx.HTTPStatusError as exc:
                        raise RuntimeError(format_llm_http_error(exc)) from exc
                    data = resp.json()
                break
            except httpx.TimeoutException as exc:
                if attempt < _MAX_RETRIES:
                    await asyncio.sleep(1.5 * attempt)
                    continue
                raise RuntimeError(
                    f"LLM 请求超时（>{int(timeout)}s）。可换更快模型（如 qwen-flash）或稍后重试。"
                ) from exc
            except httpx.RequestError as exc:
                last_request_error = exc
                if attempt < _MAX_RETRIES:
                    await asyncio.sleep(1.5 * attempt)
                    continue
                raise RuntimeError(
                    f"无法连接 LLM 服务（{settings.llm_api_base}），已重试 {_MAX_RETRIES} 次。"
                    f"请检查网络/代理；模型名应为 qwen-flash（不是 flush）。"
                    f" 详情：{exc}"
                ) from exc
        else:
            raise RuntimeError(
                f"无法连接 LLM 服务（{settings.llm_api_base}）。"
                f" 详情：{last_request_error}"
            ) from last_request_error

        choices = data.get("choices") or []
        if not choices:
            err = data.get("error") or data
            raise RuntimeError(f"LLM 返回异常（无 choices）：{err}")

        message = choices[0].get("message") or {}
        content = message.get("content") or ""
        if not str(content).strip():
            raise RuntimeError("LLM 返回了空内容，请检查模型名称是否正确（如 qwen-flash、qwen-plus）。")
        return str(content).strip()


llm_client = LLMClient()
