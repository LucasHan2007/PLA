from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.config import settings
from app.database import init_db


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    for name in (
        "frameworks",
        "knowledge_graph",
        "profiling_sessions",
        "user_profiles",
        "learning_nodes",
        "implementation",
        "code_blueprint",
    ):
        (settings.data_dir / name).mkdir(exist_ok=True)
    yield


app = FastAPI(
    title="PLA - Programming Learning Assistant",
    description="项目制学习编排：项目解析 → 用户画像 → 教学策略 → 实现与知识图谱",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "PLA",
        "llm_configured": settings.llm_configured,
        "llm_model": settings.llm_model if settings.llm_configured else None,
    }
