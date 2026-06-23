# PLA — Programming Learning Assistant

AI 编程项目学习助手：用户描述任意编程项目，系统通过**苏格拉底式提问**帮助解析项目，并分层呈现「逻辑方案 → 执行步骤 → 模块代码」。

## 核心理念

```
用户描述项目 → 苏格拉底式追问 → 逻辑方案 → 执行步骤 → 模块代码 → 运行反馈
```

- 不预设技术领域分类，根据用户实际项目灵活分析
- 先引导思考，再给出方案与代码
- 结构化 JSON 输出，前端四区域联动渲染

## 项目结构

```
cursor/
├── backend/          # FastAPI 后端
│   └── app/
│       ├── api/routes.py
│       ├── schemas/ai_output.py
│       └── services/
│           ├── prompt_builder.py   # 提示词与演示数据
│           ├── llm_service.py      # 大模型调用
│           ├── post_processor.py   # JSON 解析与代码分析
│           └── history_service.py  # 对话历史
├── frontend/         # React + TypeScript 前端
│   └── src/components/   # 四区域 UI
└── reference_cursor/ # 需求文档
```

## 界面布局

| 区域 | 功能 |
|------|------|
| 左侧 | 逻辑方案（项目目标、模块划分、实现顺序等） |
| 中间 | 自然语言执行步骤 |
| 右侧 | Monaco 代码编辑器 |
| 下方 | 对话与苏格拉底式追问 |

## 快速开始

### 后端

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env    # 配置 LLM_API_KEY
uvicorn app.main:app --reload --port 8000
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

浏览器访问 http://localhost:5173

## API

- `POST /api/chat` — 发送对话（返回结构化 JSON）
- `GET /api/sessions` — 历史会话
- `GET /health` — 健康检查（含 `llm_configured`）

## 配置 LLM

在 `backend/.env` 中设置（OpenAI 兼容接口）：

```env
LLM_API_BASE=https://api.deepseek.com
LLM_API_KEY=sk-...
LLM_MODEL=deepseek-v4-flash
```

未配置 API Key 时使用离线演示模式（返回通用项目解析框架 + 引导性问题）。

## 技术栈

- 前端：React 18, TypeScript, Tailwind CSS, Monaco Editor
- 后端：FastAPI, Pydantic, SQLAlchemy, SQLite
- AI：OpenAI 兼容 API + 结构化 JSON 输出
