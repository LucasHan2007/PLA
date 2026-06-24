# PLA 项目交接文档（当前版本）

> **用途**：供新对话快速接手，无需重读完整聊天历史。  
> **项目路径**：`d:\Docs\ProjectCode\PLA\cursor`  
> **最后更新**：2026-06-24  
> **当前主流程**：内置预设项目「手写数字识别」（MNIST + KNN）

---

## 一、产品定位

**PLA（Programming Learning Assistant）** 是一个分步编程学习助手。

当前形态：**首页选择预设项目**，解析 / 操作 / 代码内容全部内置，**不随对话动态改写**。学习流程仍为四步：

```
选择项目 → 项目解析 → 操作描述 → 代码设计
```

**核心原则**

- 预设完整项目方案（MNIST + KNN 手写数字识别）
- 项目解析阶段：**分步展示**（每步只显示当前一步，非累积列表）
- 项目解析阶段：**不用苏格拉底推进**，用「上一步 / 下一步」按钮
- 底部交互：项目解析时为 **「任务答疑」**（全宽），其余阶段为苏格拉底 + 自由对话
- 任务定位：用户为**完成内置项目**在该解析步骤下要做的宏观工作，**不是**向 AI 补充信息答题

---

## 二、四步工作流

| 阶段 | 枚举值 | 主内容区 | 底部交互 | 内容来源 |
|------|--------|----------|----------|----------|
| 选择项目 | `intro` | `IntroPanel` 项目卡片 | 无 | 预设项目列表 |
| 项目解析 | `project_analysis` | `ProjectAnalysisStepPanel` | **任务答疑**（AI） | 内置 `logic_plan` + `analysisTasks` |
| 操作描述 | `operation_desc` | `ExecutionStepsPanel` + 参考栏 | 苏格拉底 + 提交 | 内置 `execution_steps`（大步骤 + 隐藏小步骤） |
| 代码设计 | `code_design` | Monaco 编辑器 + 注解 + 参考栏 | 苏格拉底 + 提交 | 内置 `code_blocks` |

### 项目解析阶段推进

- 状态：`analysisStepIndex`（1-based，对应当前 `logic_plan` 项）
- 「下一步」：`advanceAnalysisNextStep()`，共 6 步
- 第 6 步完成后点「进入操作描述」→ `operation_desc`
- 「上一步」：`analysisStepIndex - 1`（不小于 1）
- **不使用** `analysisStepQuestions` 苏格拉底题推进（数据仍存在，供操作/代码阶段参考）

### 操作 / 代码阶段推进

- 仍用本地预设 + 苏格拉底提问（`handlePresetSubmit`）
- 操作：`revealedStepCount` 控制小步骤渐进揭示
- 代码：`revealedCodeCount` 控制代码块渐进揭示
- **未接 LLM**（纯本地逻辑）

---

## 三、项目解析界面结构

`ProjectAnalysisStepPanel.tsx` 每步展示：

```
┌─ 本步解析 ─────────────────────────────┐
│  logic_plan[i].title + content          │
└────────────────────────────────────────┘
┌─ 本步任务 ─────────────────────────────┐
│  task.title                             │
│  ┌ 专业版 ─────────────────────────┐   │
│  │  task.summary（规范术语表述）      │   │
│  └──────────────────────────────────┘   │
│  ┌ 生动版 ─────────────────────────┐   │
│  │  task.summaryVivid（比喻/场景）  │   │
│  └──────────────────────────────────┘   │
│  ┌ 比喻与专业术语对照 ─────────────┐   │
│  │  task.summaryBridge（独立板块）  │   │
│  └──────────────────────────────────┘   │
│  💡 术语说明（可折叠，默认收起）          │
│  □ 待完成工作（actions）                 │
│  本步产出（deliverables 标签）           │
└────────────────────────────────────────┘
```

**视觉区分**

| 板块 | 边框/背景色 |
|------|------------|
| 专业版 | 默认灰色 |
| 生动版 | amber |
| 比喻与专业术语对照 | violet |
| 术语说明 | 可折叠按钮，切换步骤时自动收起 |

---

## 四、任务数据模型

**类型定义**：`frontend/src/types/analysisTask.ts`

```typescript
interface AnalysisStepTask {
  title: string
  summary: string           // 专业版
  summaryVivid: string      // 生动版
  summaryBridge: string     // 比喻与专业术语对照
  termNotes: { term: string; note: string }[]
  actions: string[]         // 待完成工作（每步 4 条）
  deliverables: string[]    // 本步产出
  faq: { keywords: string[]; answer: string }[]  // 已废弃，不再用于答疑
}
```

**数据位置**：`frontend/src/data/mnistDigitProject.ts` → `analysisTasks[]`（6 项，与 `logic_plan` 一一对应）

| 步 | title | 要点 |
|----|-------|------|
| 1 | 明确项目目标 | I/O 规格、Inference 边界、Top-1 Accuracy |
| 2 | 确定任务类型 | 图像分类、监督学习、数据泄漏 |
| 3 | 确定数据方案 | MNIST、784 维、class balance |
| 4 | 确定模型方案 | KNN、欧氏距离、lazy learning |
| 5 | 确定评估方式 | Accuracy、混淆矩阵、peeking |
| 6 | 划分项目模块 | 五模块流水线、数据流 |

---

## 五、任务答疑（AI）

项目解析阶段底部 **「任务答疑」** 将用户问题发给 AI，**不使用预置 FAQ**。

### 前端

- `App.tsx` → `handleAnalysisQuestion()` → `sendTaskQa()`
- `sessionId` 状态：`useState<string | null>(null)`，开始学习时重置
- 传入上下文：`project_name`、`step_index`、`plan_title/content`、`task_title/summary`
- `InteractionPanel` 在 `mode='analysis'` 时全宽显示 `ChatPanel`（`variant='task-qa'`）

### 后端

- `POST /api/task-qa`（`routes.py`）
- Schema：`TaskQaRequest` / `TaskQaResponse`（`schemas/ai_output.py`）
- `llm_service.task_qa()` + `_call_api_plain()`（纯文本，非 JSON）
- `prompt_builder.build_task_qa_messages()` + `TASK_QA_SYSTEM_PROMPT`
- 未配置 `LLM_API_KEY` → `build_task_qa_demo_answer()` 离线提示

### 已删除

- `presetWorkflow.answerAnalysisTaskQuestion()`（关键词匹配 FAQ，已移除）

---

## 六、预设项目数据概览

**入口**：`frontend/src/data/presetProjects.ts` → `getPresetProject(id)`

**当前唯一项目**：`mnist-digit`（`mnistDigitProject.ts`）

| 数据 | 数量 | 说明 |
|------|------|------|
| `logic_plan` | 6 | 项目解析每步内容 |
| `analysisTasks` | 6 | 本步任务（专业/生动/对照/术语/待办/产出） |
| `execution_steps` | 3 大步骤 | 含 `sub_steps` 嵌套小步骤 |
| `code_blocks` | 5 | config / load_data / preprocess / train_knn / evaluate |
| `analysisStepQuestions` | 6 | 解析阶段已弃用 |
| `operationStepQuestions` | N | N = 小步骤总数 |
| `codeStepQuestions` | 5 | 按代码块顺序 |

---

## 七、目录与核心文件

```
cursor/
├── STATUS.md                           # 本文件（项目交接）
├── README.md                           # 启动说明（简略）
├── frontend/src/
│   ├── App.tsx                         # 工作流主逻辑、任务答疑、预设提交
│   ├── types/
│   │   ├── index.ts                    # 通用类型
│   │   └── analysisTask.ts             # 本步任务类型
│   ├── data/
│   │   ├── presetProjects.ts           # 预设项目注册
│   │   └── mnistDigitProject.ts        # MNIST 完整数据（★ 改任务文案在这里）
│   ├── services/
│   │   ├── api.ts                      # sendTaskQa()、sendChat()
│   │   └── presetWorkflow.ts           # 预设阶段消息与推进逻辑
│   ├── utils/operationSteps.ts         # 大步骤/小步骤工具
│   └── components/
│       ├── IntroPanel.tsx              # 首页选项目
│       ├── ProjectAnalysisStepPanel.tsx # 项目解析主区（★ 任务 UI）
│       ├── InteractionPanel.tsx        # 底部交互（analysis / split 模式）
│       ├── ChatPanel.tsx               # 任务答疑 / 自由对话
│       ├── ExecutionStepsPanel.tsx     # 操作描述
│       ├── CodeEditorPanel.tsx         # 代码设计
│       ├── ReferenceSidebar.tsx        # 第三/四步参考栏
│       ├── SocraticPanel.tsx           # 苏格拉底（操作/代码阶段）
│       └── CurrentTaskPanel.tsx        # 旧组件，主流程未使用
├── backend/app/
│   ├── api/routes.py                   # /api/chat、/api/task-qa
│   ├── schemas/ai_output.py            # 含 TaskQaRequest/Response
│   └── services/
│       ├── prompt_builder.py           # 含 TASK_QA 相关 prompt
│       └── llm_service.py              # task_qa()
└── backend/.env                        # LLM_API_KEY 等
```

---

## 八、已修复 Bug

| 问题 | 原因 | 修复 |
|------|------|------|
| 网页打开白屏 | `App.tsx` 使用 `sessionId` 但未 `useState` 声明 | 增加 `const [sessionId, setSessionId] = useState<string \| null>(null)` |
| 任务答疑用预置 FAQ | 本地关键词匹配 | 改为 `POST /api/task-qa` 调 LLM |

---

## 九、启动方式

```powershell
# 后端（8000）
cd d:\Docs\ProjectCode\PLA\cursor\backend
.venv\Scripts\uvicorn app.main:app --reload --port 8000

# 前端（5173）
cd d:\Docs\ProjectCode\PLA\cursor\frontend
npm run dev
```

浏览器：http://localhost:5173

**LLM 配置**（`backend/.env`）：

```env
LLM_API_BASE=https://api.deepseek.com
LLM_API_KEY=sk-...
LLM_MODEL=deepseek-chat
```

任务答疑依赖 LLM；操作/代码阶段当前不依赖。

---

## 十、可选清理 / 待办

- [ ] 删除 `analysisTasks[].faq` 无用字段，或从类型中移除
- [ ] 删除未使用的 `CurrentTaskPanel.tsx`、`LogicPlanPanel.tsx`（若确认无引用）
- [ ] 任务答疑 prompt 可扩展传入 `summaryVivid` / `termNotes` 以增强 AI 上下文
- [ ] 操作描述 / 代码设计阶段是否也接 AI（用户未要求）
- [ ] 新增第二个预设项目时的数据结构与注册方式

---

## 十一、API 一览

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/task-qa` | 项目解析任务答疑（纯文本回答） |
| POST | `/api/chat` | 通用对话（操作/代码阶段暂未使用） |
| GET | `/health` | 健康检查 + `llm_configured` |
| GET | `/api/sessions` | 会话列表 |
| GET | `/api/sessions/{id}/messages` | 会话消息 |
| GET | `/api/sessions/{id}/mindmap` | 思维导图数据（前端未接） |

---

## 十二、新对话接手话术（可复制）

```
继续开发 PLA 项目。请先阅读：
- cursor/STATUS.md（本交接文档）
- frontend/src/data/mnistDigitProject.ts（预设数据与本步任务文案）
- frontend/src/components/ProjectAnalysisStepPanel.tsx（项目解析 UI）
- frontend/src/App.tsx（工作流与任务答疑）
- backend/app/api/routes.py（/api/task-qa）

当前已实现：
· 首页选择内置项目「手写数字识别」
· 项目解析 6 步分步展示（解析 + 本步任务）
· 本步任务：专业版 / 生动版 / 比喻与专业术语对照 / 可折叠术语说明 / 待办 / 产出
· 底部「任务答疑」接 LLM，不用预置 FAQ
· 操作/代码阶段仍为内置内容 + 本地苏格拉底

我要做：<在此填写具体任务>
```

---

## 十三、近期演进摘要

1. 任务答疑：从预置 FAQ → 调 AI（`/api/task-qa`）
2. 修复白屏：`sessionId` 未声明
3. 本步任务：宏观 → 专业详细文案
4. 增加 `termNotes` 术语说明（后改为可折叠）
5. 双轨说明：`summary`（专业）+ `summaryVivid`（生动）
6. 增加 `summaryBridge`，UI 独立板块，命名为「比喻与专业术语对照」

---

## 十四、技术栈

- **前端**：React 18、TypeScript、Vite、Tailwind CSS、Monaco Editor
- **后端**：FastAPI、Pydantic v2、SQLAlchemy、SQLite（`backend/pla.db`）
- **AI**：OpenAI 兼容 Chat Completions（任务答疑为纯文本；`/api/chat` 为 JSON 结构化输出）
