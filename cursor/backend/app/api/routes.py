from fastapi import APIRouter, HTTPException

from app.schemas.ai_output import ChatRequest, ChatResponse, TaskQaRequest, TaskQaResponse
from app.services.history_service import history_service
from app.services.llm_service import llm_service
from app.services.post_processor import build_mindmap_data
from app.services.phase_guard import sanitize_output_for_phase
from app.services.prompt_builder import format_user_submission

router = APIRouter(prefix="/api", tags=["chat"])


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    socratic_payload = [
        {"question": item.question, "answer": item.answer}
        for item in request.socratic_answers
    ]
    combined_message = format_user_submission(request.message, socratic_payload)

    if not combined_message.strip() and not request.debug_skip_to_phase:
        raise HTTPException(status_code=400, detail="请至少填写自由对话内容或一个引导性问题的回答")

    if request.debug_skip_to_phase and not combined_message.strip():
        combined_message = f"[调试] 跳过至阶段：{request.debug_skip_to_phase}"

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
        workflow_phase=request.workflow_phase,
        revealed_plan_count=request.revealed_plan_count,
        revealed_step_count=request.revealed_step_count,
        revealed_code_count=request.revealed_code_count,
        debug_skip_to_phase=request.debug_skip_to_phase,
    )
    output = sanitize_output_for_phase(output, request.workflow_phase)

    assistant_text = output.assistant_message or output.task_summary or "已生成学习方案"
    history_service.add_message(session_id, "assistant", assistant_text, output)

    return ChatResponse(session_id=session_id, output=output, raw_fallback=raw_fallback)


@router.post("/task-qa", response_model=TaskQaResponse)
async def task_qa(request: TaskQaRequest):
    question = request.message.strip()
    if not question:
        raise HTTPException(status_code=400, detail="请输入要问的问题")

    session_id = history_service.get_or_create(request.session_id)
    history = history_service.get_history(session_id)

    user_label = f"【任务答疑·第{request.step_index}步】{question}"
    history_service.add_message(session_id, "user", user_label)

    answer = await llm_service.task_qa(
        question,
        history[:-1],
        project_name=request.project_name,
        step_index=request.step_index,
        step_total=request.step_total,
        plan_title=request.plan_title,
        plan_content=request.plan_content,
        task_title=request.task_title,
        task_summary=request.task_summary,
    )

    history_service.add_message(session_id, "assistant", answer)
    return TaskQaResponse(session_id=session_id, answer=answer)


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
