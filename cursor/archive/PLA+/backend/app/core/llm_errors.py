import httpx


def format_llm_http_error(exc: httpx.HTTPStatusError) -> str:
    status = exc.response.status_code
    body = exc.response.text[:400]

    if status == 403 and "Workspace endpoint access denied" in body:
        return (
            "LLM 调用失败 (403)：业务空间域名与 API Key 不匹配。"
            "请将 LLM_API_BASE 改为 https://dashscope.aliyuncs.com/compatible-mode/v1 ，"
            "或在百炼控制台复制与当前 Key 配对的 API Host。"
        )
    if status == 401:
        return "LLM 调用失败 (401)：API Key 无效或已过期，请检查 backend/.env 中的 LLM_API_KEY。"
    if status == 404:
        return (
            "LLM 调用失败 (404)：API 地址错误。"
            "千问 OpenAI 兼容地址应形如 …/compatible-mode/v1（不要写到 /chat/completions）。"
        )
    if status == 429:
        return "LLM 调用失败 (429)：请求过于频繁或额度不足，请稍后重试。"
    if status == 400:
        if "model" in body.lower():
            return (
                f"LLM 调用失败 (400)：模型名称可能无效（当前请在 .env 检查 LLM_MODEL）。"
                f" 详情：{body[:200]}"
            )
    return f"LLM 调用失败 ({status})：{body or exc.response.reason_phrase}"
