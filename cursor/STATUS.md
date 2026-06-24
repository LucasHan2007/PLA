# PLA 项目交接文档（当前版本）

> **用途**：供新对话快速接手，无需重读完整聊天历史。  
> **项目路径**：`d:\Docs\ProjectCode\PLA\cursor`  
> **原始需求参考**：`reference_cursor/AI_prompt_pic.md`（以 CV 为例，但产品定位为**任意编程项目**的苏格拉底式学习助手）  
> **最后更新**：2026-06-24

---

## 一、产品定位

**PLA（Programming Learning Assistant，编程项目学习助手）**

用户描述一个编程项目，AI 通过**苏格拉底式提问**引导思考，并按四步分层呈现：

```
填写项目 → 项目解析 → 操作描述 → 代码设计 → （后续）运行反馈
```

**核心原则**

- 不预设技术领域分类（已删除 `domain_registry`、领域下拉等）
- 先引导思考，再给出方案与代码
- 结构化 JSON 输出，前端按阶段渐进展示
- 每轮最多 **1 道**苏格拉底追问（前后端均限制）

---

## 二、四步工作流（WorkflowPhase）

| 阶段 | 枚举值 | 界面主内容 | AI 允许输出 |
|------|--------|-----------|-------------|
| 第一步 · 填写项目 | `intro` | 居中卡片：项目名称 + 项目描述 | 无（用户填写后提交） |
| 第二步 · 项目解析 | `project_analysis` | 上方「项目解析」+ 底部交互 | 仅 `logic_plan`；`execution_steps` / `code_blocks` 为空 |
| 第三步 · 操作描述 | `operation_desc` | 左侧参考栏 + 操作步骤 + 底部交互 | 仅 `execution_steps`（纯自然语言）；`code_blocks` 为空 |
| 第四步 · 代码设计 | `code_design` | 左侧参考栏 + Monaco 代码 + 代码注解 + 底部交互 | `code_blocks` + 完整 `logic_plan` / `execution_steps` |

### 阶段推进条件（前端 `App.tsx` → `advanceWorkflow`）

| 从 | 到 | 触发条件 |
|----|-----|---------|
| `intro` | `project_analysis` | 用户提交项目名称（描述可选） |
| `project_analysis` | `operation_desc` | AI 返回 `analysis_complete: true`，且用户本轮有苏格拉底回答或自由对话 |
| `operation_desc` | `code_design` | AI 返回 `operations_complete: true`，且用户本轮有苏格拉底回答或自由对话 |

### 渐进揭示（先提问、后展示）

| 阶段 | 揭示规则 |
|------|---------|
| 项目解析 | **不**渐进揭示——始终展示 AI 当前完整 `logic_plan`（可随对话动态增删改） |
| 操作描述 | `revealedStepCount` 控制可见步骤；进入阶段时为 0；每回答一题 +1 |
| 代码设计 | `revealedCodeCount` 控制可见代码块；进入阶段时为 0；每回答一题 +1 |

AI 在 JSON 中仍输出完整 `execution_steps` / `code_blocks` 列表，前端按揭示进度切片展示。

---

## 三、界面布局（按阶段）

### 第一步 `intro`

```
┌────────────────────────────────────────┐
│  顶栏：PLA · 第一步 · 填写项目           │
├────────────────────────────────────────┤
│           居中 IntroPanel 卡片           │
│   · 项目名称（必填）                      │
│   · 项目描述（可选）                      │
│   · [开始解析]  Ctrl+Enter               │
│   · 第一步不显示「AI 导师正在思考…」       │
│     仅按钮显示「提交中...」                │
└────────────────────────────────────────┘
```

**提交格式**（`IntroPanel.formatIntroMessage`）：

- 有描述：`项目名称：xxx\n项目描述：yyy`
- 无描述：`项目名称：xxx`

### 第二～四步（非 intro）

```
┌──────────────────────────────────────────────────────────────────┐
│ 顶栏：PLA · 当前阶段标签 · [调试] 跳过按钮（非 intro 时显示）        │
├────────┬─────────────────────────────────────────────────────────┤
│ 参考栏  │  主内容区（随阶段变化）                                     │
│ (3/4步) │  · 第二步：LogicPlanPanel（项目解析）                        │
│        │  · 第三步：ExecutionStepsPanel（操作描述，渐进揭示）          │
│        │  · 第四步：CodeEditorPanel + CodeAnnotationsPanel          │
├────────┴─────────────────────────────────────────────────────────┤
│ InteractionPanel（高 300px）                                       │
│  左：SocraticPanel（单题 + 跳过此题）  │  右：ChatPanel（自由对话）    │
│                    [ 提交 Ctrl+Enter ]                             │
└──────────────────────────────────────────────────────────────────┘
```

**底部交互规则**

- 左侧苏格拉底 + 右侧自由对话可同时编辑，统一提交
- 至少填一侧才可提交（自由对话 **或** 至少一个苏格拉底回答）
- `[跳过]` 作为跳过当前题的答案（`SocraticPanel.SKIP_ANSWER`）
- 提交后两侧草稿清空；新 `follow_up_questions` 刷新左侧（取第 1 题）

---

## 四、目录与核心文件

```
cursor/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI 入口、CORS、/health
│   │   ├── config.py               # 读 backend/.env（绝对路径）
│   │   ├── database.py             # SQLite：Session、Message
│   │   ├── api/routes.py           # POST /api/chat 等
│   │   ├── schemas/ai_output.py    # 前后端 JSON 契约（重要）
│   │   └── services/
│   │       ├── prompt_builder.py   # 系统提示词、阶段上下文、演示数据
│   │       ├── llm_service.py      # 调 OpenAI 兼容 API
│   │       ├── post_processor.py   # JSON 解析、选项简化、问题兜底
│   │       ├── phase_guard.py      # 按阶段过滤 AI 输出字段
│   │       └── history_service.py  # 会话与消息持久化（pla.db）
│   ├── requirements.txt
│   └── .env                        # LLM 密钥（勿提交 Git）
├── frontend/
│   └── src/
│       ├── App.tsx                 # 工作流状态机、提交、阶段推进
│       ├── types/index.ts          # TS 类型（与 ai_output.py 对齐）
│       ├── services/api.ts         # fetch 封装（含 workflow 参数）
│       ├── utils/mergeOutput.ts    # 多轮结构化输出合并
│       └── components/
│           ├── IntroPanel.tsx          # 第一步：项目名称/描述
│           ├── LogicPlanPanel.tsx      # 项目解析（dynamicMode）
│           ├── ExecutionStepsPanel.tsx # 操作描述（渐进揭示）
│           ├── CodeEditorPanel.tsx     # Monaco 代码编辑
│           ├── CodeAnnotationsPanel.tsx# 右侧代码注解
│           ├── ReferenceSidebar.tsx    # 第三/四步左侧参考栏
│           ├── InteractionPanel.tsx    # 底部容器 + 提交
│           ├── SocraticPanel.tsx       # 单题 + 跳过此题
│           ├── ChatPanel.tsx           # 自由对话
│           └── DebugToolbar.tsx        # 调试：跳过大步骤
├── README.md                       # 启动说明（简略）
└── STATUS.md                       # 本文件（详细交接）
```

---

## 五、数据流（一次提交）

```
用户操作
  ↓
App.executeChat / handleIntroSubmit / handleSkipPhase
  ↓
POST /api/chat
  ↓
routes.py
  · format_user_submission() 合并自由对话 + 苏格拉底回答 → 写入历史
  · llm_service.chat() → build_messages() + 调 LLM
  · sanitize_output_for_phase() 按阶段裁剪字段
  ↓
ChatResponse { session_id, output, raw_fallback? }
  ↓
前端 mergeOutput() 合并多轮结构化数据
  ↓
advanceWorkflow() 更新 workflowPhase / revealedStepCount / revealedCodeCount
  ↓
各 Panel 渲染
```

### `POST /api/chat` 请求体

```json
{
  "message": "自由对话文本",
  "socratic_answers": [{ "question": "...", "answer": "..." }],
  "session_id": "uuid 或 null",
  "step_id": null,
  "code_context": null,
  "error_context": null,
  "workflow_phase": "project_analysis",
  "revealed_plan_count": 0,
  "revealed_step_count": 0,
  "revealed_code_count": 0,
  "debug_skip_to_phase": null
}
```

### `mergeOutput` 合并策略（`frontend/src/utils/mergeOutput.ts`）

| 选项 | 行为 |
|------|------|
| `replaceLogicPlan: true` | 项目解析阶段：用最新 `logic_plan` 覆盖（支持动态增删改） |
| `replaceExecutionSteps: true` | 操作描述阶段：用最新 `execution_steps` 覆盖 |
| 默认 | 各数组取较长者；对话字段（`follow_up_questions`、`assistant_message` 等）取最新 |

---

## 六、AI 输出结构（`AIStructuredOutput`）

定义：`backend/app/schemas/ai_output.py` ↔ `frontend/src/types/index.ts`

| 字段 | 说明 |
|------|------|
| `task_summary` | 项目一句话概括 |
| `logic_plan[]` | 项目解析：`id`, `title`, `content`, `children?` |
| `execution_steps[]` | 操作描述：含 `why`, `inputs`, `outputs`, `knowledge_points`, `code_module` 等 |
| `code_blocks[]` | 代码设计：`file_name`, `language`, `code`, `annotations[]` |
| `terms[]` | 术语解释 |
| `follow_up_questions[]` | 苏格拉底题目（每轮 0 或 1 题） |
| `assistant_message` | 面向用户的自然语言回复 |
| `socratic_mode` | 是否引导模式 |
| `analysis_complete` | 项目解析是否完成 → 可进入操作描述 |
| `operations_complete` | 操作描述是否完成 → 可进入代码设计 |

### `FollowUpQuestion`

```json
{ "question": "...", "answer_type": "choice", "options": ["A", "B", "其他"] }
{ "question": "...", "answer_type": "text", "options": [] }
```

---

## 七、后端阶段约束

### 提示词（`prompt_builder.py` → `SYSTEM_PROMPT`）

- 项目解析：`logic_plan` 动态生成，随对话修订；信息充分时 `analysis_complete=true`
- 操作描述：纯自然语言，**禁止代码**；`follow_up_questions` 针对「尚未揭示的第 N 步」
- 代码设计：才输出 `code_blocks`；`annotations` 与代码同步

### 阶段守卫（`phase_guard.py` → `sanitize_output_for_phase`）

| 阶段 | 强制清空 |
|------|---------|
| `intro` / `project_analysis` | `code_blocks`；未完成时清空 `execution_steps` |
| `operation_desc` | `code_blocks` |
| `code_design` | 无裁剪 |

---

## 八、调试功能（DebugToolbar）

顶栏右侧（非 intro 阶段）：

| 当前阶段 | 按钮 | 效果 |
|---------|------|------|
| `project_analysis` | 跳过项目解析 | 跳转 `operation_desc`，`debug_skip_to_phase` 通知 LLM |
| `operation_desc` | 跳过操作描述 | 跳转 `code_design` |

跳过时会重置 `revealedStepCount` / `revealedCodeCount` 并重新请求 AI 生成该阶段内容。

---

## 九、LLM 配置与启动

### 配置（`backend/.env`）

```env
LLM_API_BASE=https://api.deepseek.com
LLM_API_KEY=sk-...
LLM_MODEL=deepseek-v4-flash
```

- OpenAI 兼容格式（OpenAI / DeepSeek / 通义等）
- 无有效 Key → **离线演示模式**（`prompt_builder.build_demo_output`）
- `GET /health` → `{ llm_configured, llm_model }`
- `config.py` 使用绝对路径读 `.env`，任意 cwd 启动均可

### 启动

```powershell
# 后端（8000）
cd d:\Docs\ProjectCode\PLA\cursor\backend
.venv\Scripts\uvicorn app.main:app --reload --port 8000

# 前端（5173，代理 /api → 8000）
cd d:\Docs\ProjectCode\PLA\cursor\frontend
npm run dev
```

浏览器：http://localhost:5173

---

## 十、已修复的重要 Bug（勿回退）

| 问题 | 原因 | 修复位置 |
|------|------|----------|
| 苏格拉底区无题目 | validator 丢弃已解析的 `FollowUpQuestion` | `schemas/ai_output.py` |
| 同时提交只识别问答 | 合并单条消息时 LLM 忽略自由对话 | `prompt_builder.build_messages` 双 user 消息 |
| `.env` 不生效 | 相对路径依赖 cwd | `config.py` 绝对路径 |
| 后端 500 / NameError | `ai_output.py` 缩进错误、`format_user_submission` import 缺失 | 已修复 |

---

## 十一、尚未实现

- [ ] 会话历史 UI、我的项目 / 错题本
- [ ] 图像预处理可视化、训练曲线（ECharts）
- [ ] WebSocket 流式输出
- [ ] 报错粘贴专用通道（`error_context` 已有字段，UI 未单独做）
- [ ] 思维导图渲染（`GET /api/sessions/{id}/mindmap` 已有，前端未接）
- [ ] 用户登录与多用户

---

## 十二、API 一览

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/chat` | 主接口 |
| GET | `/api/sessions` | 会话列表 |
| GET | `/api/sessions/{id}/messages` | 会话消息 |
| GET | `/api/sessions/{id}/mindmap` | 逻辑方案思维导图数据 |
| GET | `/health` | 健康检查 |

---

## 十三、新对话接手话术（可复制）

```
继续开发 PLA 项目。请先阅读：
- cursor/STATUS.md（本交接文档，含四步工作流与当前实现）
- cursor/README.md（启动说明）
- backend/app/schemas/ai_output.py（数据结构）
- backend/app/services/prompt_builder.py（提示词与阶段规则）
- frontend/src/App.tsx（工作流状态机）

当前版本已实现：
· 四步渐进式 UI（填写项目 → 项目解析 → 操作描述 → 代码设计）
· 项目名称必填、项目描述可选
· 项目解析动态 logic_plan；操作描述/代码设计渐进揭示
· 苏格拉底单题 + 跳过此题；DebugToolbar 跳过大步骤

我要做：<在此填写具体任务>
```

---

## 十四、技术栈

- **前端**：React 18、TypeScript、Vite、Tailwind CSS、Monaco Editor
- **后端**：FastAPI、Pydantic v2、SQLAlchemy、SQLite（`backend/pla.db`）
- **AI**：OpenAI 兼容 Chat Completions + `response_format: json_object`
