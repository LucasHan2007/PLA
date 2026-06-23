# PLA 项目交接概要（当前版本）

> 供新对话快速接手。项目路径：`d:\Docs\ProjectCode\PLA\cursor`  
> 原始需求：`reference_cursor/AI_prompt_pic.md`（以 CV 为例，但产品定位为**任意编程项目**的苏格拉底式学习助手）

---

## 一、产品定位

**PLA（Programming Learning Assistant）**：用户描述一个编程项目，AI 通过苏格拉底式提问帮助解析项目，并按分层结构呈现：

```
用户输入 → 苏格拉底追问 → 逻辑方案 → 执行步骤 → 模块代码 → 运行反馈
```

**已明确不做**：计算机各领域分类（曾有的 `domain_registry`、领域下拉已删除）。

---

## 二、界面布局（当前实现）

```
┌─────────────────────────────────────────────────────────────┐
│ 顶栏：PLA 编程项目学习助手                                      │
├──────────────┬──────────────┬─────────────────────────────────┤
│ 逻辑方案      │ 执行步骤      │ 代码模块（Monaco Editor）         │
│ LogicPlan    │ Execution    │ CodeEditor                       │
├──────────────┴──────────────┴─────────────────────────────────┤
│ 底部 InteractionPanel（高约 300px）                              │
│ ┌─────────────────────────┬───────────────────────────────┐ │
│ │ 左：苏格拉底式提问          │ 右：自由对话                      │ │
│ │ SocraticPanel            │ ChatPanel                        │ │
│ │ · choice 单选 + 其他输入框  │ · 历史消息 + 输入框               │ │
│ │ · text 问答题 textarea     │                                  │ │
│ └─────────────────────────┴───────────────────────────────┘ │
│                    [ 提交 (Ctrl+Enter) ]                        │
└─────────────────────────────────────────────────────────────┘
```

### 底部交互规则

- 左侧、右侧可**同时编辑**，统一点「提交」或 **Ctrl+Enter**（Mac：Cmd+Enter）
- 至少填一侧才可提交（自由对话 **或** 至少一个苏格拉底回答）
- 提交后：两侧草稿清空；AI 返回的新 `follow_up_questions` 刷新左侧题目

---

## 三、目录与核心文件

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
│   │       ├── prompt_builder.py   # 系统提示词、build_messages、演示数据
│   │       ├── llm_service.py      # 调 OpenAI 兼容 API
│   │       ├── post_processor.py   # JSON 解析、选项简化、问题兜底
│   │       └── history_service.py  # 会话与消息持久化（pla.db）
│   ├── requirements.txt
│   └── .env                        # LLM 密钥（勿提交 Git）
├── frontend/
│   └── src/
│       ├── App.tsx                 # 全局状态与提交逻辑
│       ├── types/index.ts          # TS 类型（与 ai_output.py 对齐）
│       ├── services/api.ts         # fetch 封装
│       └── components/
│           ├── LogicPlanPanel.tsx
│           ├── ExecutionStepsPanel.tsx
│           ├── CodeEditorPanel.tsx
│           ├── InteractionPanel.tsx  # 底部容器 + 提交按钮
│           ├── SocraticPanel.tsx       # 选择/问答题 UI
│           └── ChatPanel.tsx           # 自由对话 UI
├── start-backend.bat / start-backend.bat
├── README.md
└── STATUS.md                       # 本文件
```

---

## 四、数据流（一次提交）

1. `App.handleSubmit` 收集 `chatInput` + `socraticAnswers`
2. `POST /api/chat`  body：
   ```json
   {
     "message": "自由对话文本",
     "socratic_answers": [{"question": "...", "answer": "..."}],
     "session_id": "...",
     "step_id": null,
     "code_context": null
   }
   ```
3. `routes.py` → `format_user_submission()` 合并写入历史（单条 user 消息）
4. `llm_service.chat()` → `build_messages()`：
   - **若同时有自由对话和苏格拉底回答**：向 LLM 发**两条** user 消息 + system 提醒必须综合两部分
   - 否则：一条合并后的 user 消息
5. LLM 返回 JSON → `post_processor.parse_structured_output()`
6. 前端更新：`output` → 上三区 + 左侧新题目

---

## 五、AI 输出结构（`AIStructuredOutput`）

| 字段 | 说明 |
|------|------|
| `task_summary` | 项目一句话概括 |
| `logic_plan[]` | 左栏：id, title, content |
| `execution_steps[]` | 中栏：含 why/inputs/outputs/knowledge_points/code_module |
| `code_blocks[]` | 右栏：file_name, code, annotations |
| `terms[]` | 术语解释（ChatPanel 顶栏 badge） |
| `follow_up_questions[]` | 左下苏格拉底题目（见下） |
| `assistant_message` | 右下 AI 回复正文 |
| `socratic_mode` | 是否引导模式 |

### `FollowUpQuestion`（引导题）

```json
{
  "question": "你计划使用哪种语言？",
  "answer_type": "choice",
  "options": ["Python", "JavaScript", "Java", "其他"]
}
```

```json
{
  "question": "请补充项目约束",
  "answer_type": "text",
  "options": []
}
```

- `post_processor.simplify_option_text()`：去掉选项括号说明，如 `仅手写数字（0-9）` → `仅手写数字`
- `ensure_follow_up_questions()`：LLM 未返回题目时使用默认 3 题兜底

---

## 六、LLM 配置

文件：`backend/.env`（从 `.env.example` 复制）

```env
LLM_API_BASE=https://api.deepseek.com
LLM_API_KEY=sk-...
LLM_MODEL=deepseek-v4-flash
```

- 兼容 OpenAI 格式（OpenAI / DeepSeek / 通义等）
- 无有效 Key → **离线演示模式**（`prompt_builder.build_demo_output`）
- 健康检查：`GET /health` → `llm_configured: true/false`
- `config.py` 使用 `_BACKEND_DIR / ".env"`，**从任意目录启动 uvicorn 都能读到配置**

---

## 七、启动方式

```powershell
# 后端（8000）
cd d:\Docs\ProjectCode\PLA\cursor\backend
.venv\Scripts\uvicorn app.main:app --reload --port 8000

# 前端（5173，代理 /api → 8000）
cd d:\Docs\ProjectCode\PLA\cursor\frontend
npm run dev
```

或双击 `start-backend.bat`、`start-frontend.bat`。

**注意**：8000 端口被占用会报 `WinError 10013`，需结束旧 python 进程或换端口。

---

## 八、已修复的重要 Bug（勿回退）

| 问题 | 原因 | 修复位置 |
|------|------|----------|
| 苏格拉底区无题目 | `AIStructuredOutput` 的 validator 丢弃已解析的 `FollowUpQuestion` 对象 | `schemas/ai_output.py` |
| 同时提交只识别问答 | 合并单条消息时 LLM 忽略自由对话 | `prompt_builder.build_messages` 双 user 消息 + system 提醒 |
| `.env` 不生效 | 相对路径 `.env` 依赖启动 cwd | `config.py` 绝对路径 |
| 演示模式不切换 | Key 未写入 `.env` 而写在 `.env.example` | 文档说明 |

---

## 九、API 一览

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/chat` | 主接口 |
| GET | `/api/sessions` | 会话列表（前端暂未做 UI） |
| GET | `/api/sessions/{id}/messages` | 会话消息 |
| GET | `/health` | 健康检查 |

---

## 十、尚未实现（原需求迭代路线）

- [ ] 会话历史 UI、我的项目 / 错题本
- [ ] 图像预处理可视化、训练曲线（ECharts）
- [ ] WebSocket 流式输出
- [ ] 报错粘贴专用通道（`error_context` 已有字段，UI 未单独做）
- [ ] 思维导图渲染（`/mindmap` 接口已有，前端未接 React Flow）
- [ ] 用户登录与多用户

---

## 十一、新对话接手话术（可复制）

```
继续开发 PLA 项目。请先阅读：
- cursor/STATUS.md（交接概要）
- cursor/README.md（启动说明）
- backend/app/schemas/ai_output.py（数据结构）
- backend/app/services/prompt_builder.py（提示词）

当前版本已实现四区域 UI + 底部分栏（苏格拉底/自由对话）+ 统一提交。
我要做：<在此填写具体任务>
```

---

## 十二、技术栈

- **前端**：React 18、TypeScript、Vite、Tailwind CSS、Monaco Editor  
- **后端**：FastAPI、Pydantic v2、SQLAlchemy、SQLite（`backend/pla.db`）  
- **AI**：OpenAI 兼容 Chat Completions + `response_format: json_object`

---

*最后更新：2026-06-23，对应当前 cursor/ 工作区 MVP 第一阶段。*
