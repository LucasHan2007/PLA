import httpx
from fastapi import APIRouter, HTTPException

from app.modules.pedagogy.strategies import all_strategies
from app.modules.project_parser.schema import (
    ProjectParseRequest,
    ProjectParseResponse,
    TaskQaRequest,
    TaskQaResponse,
)
from app.modules.project_parser.service import project_parser_service
from app.modules.project_parser.store import has_framework, load_framework
from app.modules.project_parser.templates import (
    clear_derived_session_data,
    is_known_template,
    template_session_id,
)
from app.modules.implementation.schema import (
    CodeAssistRequest,
    CodeAssistResponse,
    ImplementationStatusResponse,
    PlanGenerateResponse,
    PlanResponse,
    SaveDraftRequest,
)
from app.modules.implementation.service import implementation_service
from app.modules.knowledge_graph.project_graph_store import has_graph, load_graph
from app.modules.knowledge_graph.schema import GraphResponse, GraphStatusResponse
from app.modules.knowledge_graph.service import knowledge_graph_service
from app.modules.task_qa.service import task_qa_service
from app.modules.user_profiling.schema import (
    ProfileAnswerRequest,
    ProfileAnswerResponse,
    ProfileBuildRequest,
    ProfileBuildResponse,
    ProfileStatusResponse,
    ProfilingReferenceStatusResponse,
    QuestionsResponse,
)
from app.modules.user_profiling.service import user_profiling_service
from app.services.session_service import session_service

router = APIRouter(prefix="/api", tags=["pla-plus"])


@router.get("/version")
async def version():
    return {
        "name": "PLA+",
        "version": "0.1.0",
        "modules": [
            "project_parser",
            "user_profiling",
            "pedagogy",
            "knowledge_graph",
            "implementation",
        ],
        "pedagogy_strategies": all_strategies(),
    }


@router.post("/project-parse", response_model=ProjectParseResponse)
async def project_parse(request: ProjectParseRequest):
    name = request.project_name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="请输入项目名称")

    template_id = (request.project_template_id or "").strip() or None
    if template_id and not is_known_template(template_id):
        raise HTTPException(status_code=400, detail=f"未知示例项目：{template_id}")

    if template_id:
        session_id = template_session_id(template_id)
        session_service.ensure_session(session_id, name)
        if request.session_id is None:
            clear_derived_session_data(session_id)
    else:
        session_id = session_service.get_or_create(request.session_id)

    try:
        document = await project_parser_service.parse_and_save(
            session_id,
            name,
            request.project_hint,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        from app.core.llm_errors import format_llm_http_error

        raise HTTPException(status_code=502, detail=format_llm_http_error(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"项目解析失败：{exc}") from exc

    session_service.add_message(
        session_id,
        "assistant",
        f"（系统）已生成并保存项目解析体系：{document.project_name}",
    )

    return ProjectParseResponse(
        session_id=session_id,
        project_name=document.project_name,
        summary=document.summary,
        framework_ready=True,
        graph_ready=has_graph(session_id),
        graph_node_count=len(load_graph(session_id).nodes) if has_graph(session_id) else 0,
    )


@router.get("/framework/{session_id}/status")
async def framework_status(session_id: str):
    ready = has_framework(session_id)
    if not ready:
        return {"session_id": session_id, "framework_ready": False}
    doc = load_framework(session_id)
    return {
        "session_id": session_id,
        "framework_ready": True,
        "project_name": doc.project_name if doc else None,
        "summary": doc.summary if doc else None,
    }


@router.post("/task-qa", response_model=TaskQaResponse)
async def task_qa(request: TaskQaRequest):
    question = request.message.strip()
    if not question:
        raise HTTPException(status_code=400, detail="请输入要问的问题")

    session_id = session_service.get_or_create(request.session_id)
    if not has_framework(session_id):
        raise HTTPException(status_code=400, detail="请先生成并保存项目解析参考文件")

    history = session_service.get_history(session_id)
    label = (
        f"【任务答疑·第{request.step_index}步】{question}"
        if request.step_index
        else f"【任务答疑】{question}"
    )
    session_service.add_message(session_id, "user", label)

    try:
        answer, strategy, strategy_label, node_title = await task_qa_service.answer(
            question,
            history[:-1],
            session_id=session_id,
            project_name=request.project_name,
            learning_node_id=request.learning_node_id,
            step_index=request.step_index,
            step_total=request.step_total,
            plan_title=request.plan_title,
            plan_content=request.plan_content,
            task_title=request.task_title,
            task_summary=request.task_summary,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        from app.core.llm_errors import format_llm_http_error

        raise HTTPException(status_code=502, detail=format_llm_http_error(exc)) from exc

    session_service.add_message(session_id, "assistant", answer)
    return TaskQaResponse(
        session_id=session_id,
        answer=answer,
        strategy=strategy,
        strategy_label=strategy_label,
        learning_node_title=node_title,
    )


@router.get("/user-profile/{session_id}/status", response_model=ProfileStatusResponse)
async def user_profile_status(session_id: str):
    return user_profiling_service.get_status(session_id)


@router.get("/user-profile/{session_id}/questions", response_model=QuestionsResponse)
async def user_profile_questions(session_id: str):
    return user_profiling_service.get_questions(session_id)


@router.post("/user-profile/answer", response_model=ProfileAnswerResponse)
async def user_profile_answer(request: ProfileAnswerRequest):
    try:
        return user_profiling_service.submit_answer(
            request.session_id,
            request.question_id,
            request.answer,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/user-profile/build", response_model=ProfileBuildResponse)
async def user_profile_build(request: ProfileBuildRequest):
    try:
        result = await user_profiling_service.build_profile_and_nodes(request.session_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        from app.core.llm_errors import format_llm_http_error

        raise HTTPException(status_code=502, detail=format_llm_http_error(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"画像生成失败：{exc}") from exc

    session_service.add_message(
        request.session_id,
        "assistant",
        f"（系统）{result.message}",
    )
    return result


@router.get("/user-profile/{session_id}/reference-status", response_model=ProfilingReferenceStatusResponse)
async def user_profile_reference_status(session_id: str):
    return user_profiling_service.get_reference_status(session_id)


@router.get("/user-profile/{session_id}/nodes", response_model=ProfilingReferenceStatusResponse)
async def user_profile_nodes(session_id: str):
    """兼容旧路径；返回参考文件状态，不含画像/节点正文。"""
    return user_profiling_service.get_reference_status(session_id)


@router.get("/knowledge-graph/{session_id}/status", response_model=GraphStatusResponse)
async def knowledge_graph_status(session_id: str):
    return knowledge_graph_service.get_status(session_id)


@router.get("/knowledge-graph/{session_id}", response_model=GraphResponse)
async def knowledge_graph_get(session_id: str):
    return knowledge_graph_service.get_graph(session_id)


@router.get("/knowledge-graph/{session_id}/layers")
async def knowledge_graph_layers(session_id: str):
    return {
        "session_id": session_id,
        "layers": knowledge_graph_service.get_layers(session_id),
    }


@router.post("/knowledge-graph/{session_id}/build", response_model=GraphResponse)
async def knowledge_graph_build(session_id: str):
    try:
        graph = await knowledge_graph_service.build_from_session(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        from app.core.llm_errors import format_llm_http_error

        raise HTTPException(status_code=502, detail=format_llm_http_error(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"图谱生成失败：{exc}") from exc
    return GraphResponse(session_id=session_id, graph=graph)


@router.get("/implementation/{session_id}/status", response_model=ImplementationStatusResponse)
async def implementation_status(session_id: str):
    return implementation_service.get_status(session_id)


@router.get("/implementation/{session_id}/plan", response_model=PlanResponse)
async def implementation_plan(session_id: str):
    return implementation_service.get_plan(session_id)


@router.post("/implementation/{session_id}/generate-plan", response_model=PlanGenerateResponse)
async def implementation_generate_plan(session_id: str):
    try:
        return await implementation_service.generate_plan(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        from app.core.llm_errors import format_llm_http_error

        raise HTTPException(status_code=502, detail=format_llm_http_error(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"方案生成失败：{exc}") from exc


@router.post("/implementation/save-draft")
async def implementation_save_draft(request: SaveDraftRequest):
    draft = implementation_service.save_code_draft(
        request.session_id,
        request.file_name,
        request.language,
        request.content,
    )
    return {"session_id": request.session_id, "file_name": draft.file_name}


@router.post("/implementation/code-assist", response_model=CodeAssistResponse)
async def implementation_code_assist(request: CodeAssistRequest):
    message = request.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="请输入问题或补全请求")
    try:
        return await implementation_service.code_assist(
            request.session_id,
            request.mode,
            request.code,
            message,
            request.file_name,
            request.learning_node_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        from app.core.llm_errors import format_llm_http_error

        raise HTTPException(status_code=502, detail=format_llm_http_error(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"代码辅助失败：{exc}") from exc
