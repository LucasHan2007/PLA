# PLA — Programming Learning Assistant

项目制学习编排系统：八段项目解析 → 基础知识图谱 → 用户画像 & 学习节点 → 教学策略答疑 → 代码辅助。

## 主链路

```
选择示例/自定义项目
  → 自动八段解析 + 基础知识图谱
  → 标签工作区（项目解析 | 知识图谱 | 代码辅助 | 用户画像）
  → 右侧任务答疑（教学策略引擎）
```

**端口**：前端 **5173** · 后端 **8000**

> 历史 PLA+ 代码已归档至 [`archive/PLA+/`](archive/PLA+/)，日常请只启动本目录。

## 快速开始

```powershell
# 终端 1 — 后端
cd d:\Docs\ProjectCode\PLA\cursor
.\start-backend.bat

# 终端 2 — 前端
.\start-frontend.bat
```

浏览器：http://localhost:5173 · 健康检查：http://localhost:8000/health

## 项目结构

```
cursor/
├── HANDOFF.md              # 交接文档（首选）
├── prompt/                 # ★ 全部 LLM 提示词
├── backend/
│   ├── data/               # frameworks / knowledge_graph / user_profiles …
│   └── app/
│       ├── core/           # llm_client, prompt_loader
│       ├── modules/        # project_parser, user_profiling, knowledge_graph …
│       └── api/routes.py
├── frontend/src/
│   ├── App.tsx             # intro → 标签工作区
│   └── components/         # 解析 / 图谱 / 画像 / 代码辅助 / 答疑
└── archive/PLA+/           # 合并前 PLA+ 快照
```

## 配置 LLM

`backend/.env`（可参考 `.env.example`）：

```env
LLM_API_BASE=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_API_KEY=your-api-key-here
LLM_MODEL=qwen-flash
```

改 `.env` 后须重启后端。`GET /health` 确认 `llm_configured: true`。

## 主要 API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/project-parse` | 八段解析 + 图谱 |
| GET/POST | `/api/user-profile/*` | 宏观问答与画像/节点 |
| GET/POST | `/api/knowledge-graph/*` | 基础知识图谱 |
| POST | `/api/task-qa` | 任务答疑（策略引擎） |
| GET/POST | `/api/implementation/*` | 实现方案与代码辅助 |

详情见 [`HANDOFF.md`](HANDOFF.md)。
