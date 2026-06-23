from fastapi import APIRouter, HTTPException

from app.schemas.ai_output import ChatRequest, ChatResponse
from app.services.history_service import history_service
from app.services.llm_service import llm_service
from app.services.post_processor import build_mindmap_data
from app.services.prompt_builder import format_user_submission

router = APIRouter(prefix="/api", tags=["chat"])


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    socratic_payload = [
        {"question": item.question, "answer": item.answer}
        for item in request.socratic_answers
    ]
    combined_message = format_user_submission(request.message, socratic_payload)

    if not combined_message.strip():
        raise HTTPException(status_code=400, detail="请至少填写自由对话内容或一个引导性问题的回答")

    session_id = history_service.get_or_create(request.session_id)
    history = history_service.get_history(session_id)

    history_service.add_message(session_id, "user", combined_message)

    output, raw_fallback = await llm_service.chat(
        user_message=combined_message,
        history=history[:-1],
        code_context=request.code_context,
        error_context=request.error_context,
        step_id=request.step_id,
        chat_message=request.message,
        socratic_answers=socratic_payload,
    )

    assistant_text = output.assistant_message or output.task_summary or "已生成学习方案"
    history_service.add_message(session_id, "assistant", assistant_text, output)

    return ChatResponse(session_id=session_id, output=output, raw_fallback=raw_fallback)


@router.get("/sessions")
async def get_sessions():
    return {"sessions": history_service.list_sessions()}


@router.get("/sessions/{session_id}/messages")
async def get_session_messages(session_id: str):
    return {"messages": history_service.get_messages(session_id)}


@router.get("/sessions/{session_id}/mindmap")
async def get_mindmap(session_id: str):
    messages = history_service.get_messages(session_id)
    for msg in reversed(messages):
        if msg.structured_output and msg.structured_output.logic_plan:
            return build_mindmap_data(msg.structured_output.logic_plan)
    raise HTTPException(status_code=404, detail="No logic plan found for session")
