# PLA 项目交接文档（当前版本）

> **用途**：供新对话快速接手，无需重读完整聊天历史。  
> **项目路径**：`d:\Docs\ProjectCode\PLA\cursor`  
> **最后更新**：2026-07-07  
> **当前主流程**：首页选择内置预设项目 → 四步学习（解析 / 操作 / 代码）

---

## 一、产品定位

**PLA（Programming Learning Assistant）** 是一个分步编程学习助手。

当前形态：**首页选择预设项目**，解析 / 操作 / 代码内容全部内置，**不随对话动态改写**。学习流程为四步：

```
选择项目 → 项目解析 → 操作描述 → 代码设计
```

**核心原则**

- 预设完整项目方案（当前 2 个内置项目，见第六节）
- 项目解析阶段：**分步展示**（每步只显示当前一步，非累积列表）
- 项目解析阶段：**不用苏格拉底推进**，用「上一步 / 下一步」按钮
- 项目解析阶段交互：**右侧「任务答疑」侧栏**（接 LLM）；操作 / 代码阶段为底部苏格拉底 + 自由对话
- 任务定位：用户为**完成内置项目**在该解析步骤下要做的宏观工作，**不是**向 AI 提交任务答案

---

## 二、四步工作流

| 阶段 | 枚举值 | 主内容区 | 交互区 | 内容来源 | LLM |
|------|--------|----------|--------|----------|-----|
| 选择项目 | `intro` | `IntroPanel` 项目卡片 | 无 | `presetProjects.ts` | 否 |
| 项目解析 | `project_analysis` | 见下表（解析器 → 分步解析） | 右侧 `TaskQaSidebar` | 解析器 LLM + 预设 `logic_plan` | **是** |
| 操作描述 | `operation_desc` | `ExecutionStepsPanel` + 参考栏 | 底部 `InteractionPanel` | `execution_steps` | 否 |
| 代码设计 | `code_design` | Monaco + 注解 + 参考栏 | 底部 `InteractionPanel` | `code_blocks` | 否 |

### 项目解析阶段（`project_analysis`）

| 主区 | 说明 |
|------|------|
| `ProjectAnalysisStepPanel` | 内置 6 步 `logic_plan` 分步呈现 + 本步任务；右侧任务答疑 |

**说明**：LLM **七段解析器**（`ProjectParserPanel`、`POST /api/project-parse`）为 PLA+ 能力，**已从 PLA v1 前端移除**。v1 项目解析内容来自预设 `logic_plan`，任务答疑结合当前步骤与可选的后台 framework（若曾通过 API 生成）。

### 七段参考文件（后端 API 保留，非 v1 主流程）

1. 项目目标  
2. 问题定义  
3. 数据输入、输出流与数据模型及约束  
4. 任务分解  
5. 所涉及的知识与技能  
6. 实现方案  
7. 代码的运行、验证与调试  

生成后作为**解读该项目的核心参考**，贯穿任务答疑与分步解析；任务答疑请求可携带 `framework_context`。

### 项目解析阶段布局

```
┌──────────────────────────────┬─────────────────┐
│  本步解析 + 本步任务（左侧）    │  任务答疑侧栏    │
│  flex-1，占剩余宽度            │  初始宽 = 视口 1/3 │
│                              │  可折叠 / 可调宽  │
│                              │  输入框高度可调   │
└──────────────────────────────┴─────────────────┘
```

**TaskQaSidebar 交互**

| 能力 | 说明 |
|------|------|
| 初始宽度 | `window.innerWidth / 3` |
| 调宽 | 拖动侧栏**左边框**（`col-resize`），最小 220px，最大约视口 55% |
| 折叠 | 标题栏「收起 ◂」→ 右侧窄条（40px），点击展开 |
| 输入区高度 | 拖动**输入框上边缘**分隔线（`ns-resize`），消息区自动伸缩 |

### 项目解析阶段推进

- 状态：`analysisStepIndex`（1-based，对应当前 `logic_plan` 项）
- 「下一步」：`advanceAnalysisNextStep()`，共 6 步
- 第 6 步完成后点「进入操作描述」→ `operation_desc`
- 「上一步」：`analysisStepIndex - 1`（不小于 1）
- **不使用** `analysisStepQuestions` 苏格拉底题推进（数据仍存在，供操作/代码阶段参考）
- `announcedAnalysisSteps`（`Set<number>`）：每步「已进入第 N 步…」提示**只追加一次**；上一步退回再前进不重复

### 操作 / 代码阶段推进

- 仍用本地预设 + 苏格拉底提问（`handlePresetSubmit`）
- 操作：`revealedStepCount` 控制小步骤渐进揭示
- 代码：`revealedCodeCount` 控制代码块渐进揭示
- **未接 LLM**（纯本地逻辑）

### 选择项目

- **单击**项目卡片：选中
- **双击**项目卡片：直接开始学习（等同点「开始学习」）
- `Ctrl+Enter`：快捷开始

---

## 三、项目解析界面结构

`ProjectAnalysisStepPanel.tsx` 每步展示：

```
┌─ 本步解析 ─────────────────────────────┐
│  logic_plan[i].title + content          │
└────────────────────────────────────────┘
┌─ 本步任务 ─────────────────────────────┐
│  task.title                             │
│  ┌ 任务说明--专业版 ─────────────────┐   │
│  │  task.summary                      │   │
│  └──────────────────────────────────┘   │
│  ┌ 任务说明--生动版 ─────────────────┐   │
│  │  task.summaryVivid                 │   │
│  └──────────────────────────────────┘   │
│  ┌ 对照 ────────────────────────────┐   │
│  │  task.summaryBridge（中文正文，     │   │
│  │  英文术语仅括号对照）               │   │
│  └──────────────────────────────────┘   │
│  💡 术语说明（可折叠，默认收起）          │
│  待完成工作（可折叠，默认收起）           │
│  本步产出（deliverables 标签）           │
└────────────────────────────────────────┘
```

**视觉区分**

| 板块 | 边框/背景色 |
|------|------------|
| 任务说明--专业版 | 默认灰色 |
| 任务说明--生动版 | amber |
| 对照 | violet |
| 术语说明 / 待完成工作 | 可折叠，切换步骤时自动收起 |

---

## 四、任务数据模型

**类型定义**：`frontend/src/types/analysisTask.ts`

```typescript
interface AnalysisStepTask {
  title: string
  summary: string           // 任务说明--专业版
  summaryVivid: string      // 任务说明--生动版
  summaryBridge: string     // 对照
  termNotes: { term: string; note: string }[]
  actions: string[]         // 待完成工作
  deliverables: string[]    // 本步产出
  faq: { keywords: string[]; answer: string }[]  // 已废弃
}
```

**数据文件**

| 项目 ID | 文件 | 技术路线 |
|---------|------|----------|
| `mnist-digit` | `mnistDigitProject.ts` | MNIST + KNN 手写数字分类 |
| `lung-lesion-seg` | `lungLesionSegmentationProject.ts` | 胸部 CT + U-Net 肺部病灶语义分割 |

两项目均为 6 步 `logic_plan`、6 项 `analysisTasks`、3 大操作步骤（6 小步）、5 个代码模块。

---

## 五、任务答疑（AI）

项目解析阶段**右侧侧栏**「任务答疑」将用户问题发给 AI，**不使用预置 FAQ**。

### 前端

- `App.tsx` → `handleAnalysisQuestion()` → `sendTaskQa()`
- 容器：`TaskQaSidebar` → `InteractionPanel`（`mode='analysis'`, `layout='sidebar'`）→ `ChatPanel`（`variant='task-qa'`）
- `sessionId`：开始学习时重置；跨轮次保持
- 传入上下文：`project_name`、`step_index`、`plan_title/content`、`task_title/summary`

### 对话文案

**初始助手消息**（`presetAnalysisIntroMessage`，含操作教程，无后台说明）：

```
1. 阅读左侧「本步解析」与「本步任务」，并按「本步任务」完成{项目名}项目在本步的待办工作。
2. 有疑问在此提问。
3. 完成后点击「下一步」。
```

**切换步骤**（`presetAnalysisStepMessage`）：仅 `已进入第 N 步「标题」。`（教程已在初始消息中，不重复；每步只提示一次）

**输入框占位**：`请输入您的疑问，PLA内置的AI助手将会给您答复...`

### 后端

- `POST /api/task-qa`（`routes.py`）
- `llm_service.task_qa()` + `prompt_builder.build_task_qa_messages()`
- 未配置 `LLM_API_KEY` → `build_task_qa_demo_answer()` 离线提示

---

## 六、预设项目数据概览

**入口**：`frontend/src/data/presetProjects.ts` → `getPresetProject(id)`

### 手写数字识别（`mnist-digit`）

| 数据 | 数量 | 说明 |
|------|------|------|
| `logic_plan` / `analysisTasks` | 6 | 分类任务解析 |
| `execution_steps` | 3 大 / 6 小 | 环境、MNIST、KNN 训练 |
| `code_blocks` | 5 | config / load_data / preprocess / train_knn / evaluate |

### 肺部病灶分割（`lung-lesion-seg`）

| 数据 | 数量 | 说明 |
|------|------|------|
| `logic_plan` / `analysisTasks` | 6 | 语义分割任务解析 |
| `execution_steps` | 3 大 / 6 小 | 环境、数据、U-Net 训练评估 |
| `code_blocks` | 5 | config / load_data / preprocess / train_unet / evaluate |

---

## 七、目录与核心文件

```
cursor/
├── STATUS.md                              # 本文件
├── PLA_1_6.24_intro.md                    # 功能与运行逻辑说明（面向阅读）
├── README.md
├── frontend/src/
│   ├── App.tsx                            # 工作流、任务答疑、announcedAnalysisSteps
│   ├── types/analysisTask.ts
│   ├── data/
│   │   ├── presetProjects.ts              # 预设项目注册
│   │   ├── mnistDigitProject.ts           # ★ MNIST 文案与数据
│   │   └── lungLesionSegmentationProject.ts # ★ 肺部分割文案与数据
│   ├── services/
│   │   ├── api.ts                         # sendTaskQa()
│   │   └── presetWorkflow.ts              # 阶段推进、初始/步骤消息
│   └── components/
│       ├── IntroPanel.tsx                 # 选项目（单击选 / 双击开始）
│       ├── ProjectParserPanel.tsx         # ★ 项目解析器（七段参考文件）
│       ├── ProjectAnalysisStepPanel.tsx   # ★ 分步项目解析主区
│       ├── TaskQaSidebar.tsx              # ★ 任务答疑侧栏（宽/折叠）
│       ├── InteractionPanel.tsx           # 解析侧栏 / 底部 split
│       ├── ChatPanel.tsx                  # 对话 + 输入区高度调节
│       ├── ExecutionStepsPanel.tsx
│       ├── CodeEditorPanel.tsx
│       └── ReferenceSidebar.tsx
└── backend/app/
    ├── api/routes.py                      # /api/task-qa, /api/project-parse
    └── services/prompt_builder.py         # TASK_QA prompt
```

---

## 八、已修复 Bug

| 问题 | 原因 | 修复 |
|------|------|------|
| 网页打开白屏 | `sessionId` 未 `useState` 声明 | 已补声明 |
| 任务答疑用预置 FAQ | 本地关键词匹配 | 改为 `/api/task-qa` |
| 切换步骤重复冗长提示 | 每步都追加完整教程 | 教程并入初始消息；步骤仅简短提示 |
| 退回再前进重复步骤提示 | 无去重 | `announcedAnalysisSteps` 记录已提示步骤 |

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

任务答疑依赖 LLM；操作/代码阶段不依赖。

---

## 十、可选清理 / 待办

- [ ] 项目解析体系持久化（localStorage / 后端会话）
- [ ] 删除 `analysisTasks[].faq` 无用字段，或从类型中移除
- [ ] 删除未使用的 `CurrentTaskPanel.tsx`、`LogicPlanPanel.tsx`（若确认无引用）
- [ ] 任务答疑 prompt 可扩展传入 `summaryVivid` / `termNotes` / `summaryBridge`
- [ ] 操作描述 / 代码设计阶段是否也接 AI
- [ ] 侧栏宽度 / 输入高度偏好是否持久化（localStorage）
- [ ] 新增第三个预设项目时的数据模板与注册方式

---

## 十一、API 一览

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/project-parse` | 项目解析器：根据项目名生成七段参考体系（JSON） |
| POST | `/api/task-qa` | 项目解析任务答疑（纯文本，可带 framework_context） |
| POST | `/api/chat` | 通用对话（主流程未接） |
| GET | `/health` | 健康检查 + `llm_configured` |
| GET | `/api/sessions` | 会话列表 |
| GET | `/api/sessions/{id}/messages` | 会话消息 |
| GET | `/api/sessions/{id}/mindmap` | 思维导图（前端未接） |

---

## 十二、新对话接手话术（可复制）

```
继续开发 PLA 项目。请先阅读：
- cursor/STATUS.md
- frontend/src/data/presetProjects.ts
- frontend/src/components/ProjectAnalysisStepPanel.tsx
- frontend/src/components/TaskQaSidebar.tsx
- frontend/src/App.tsx
- backend/app/api/routes.py（/api/task-qa）

当前已实现：
· 两个内置项目：手写数字识别、肺部病灶分割
· 首页单击选项目、双击直接开始
· 项目解析：左侧本步内容 + 右侧任务答疑侧栏（1/3 宽、可折叠、可调宽/输入高）
· 本步任务：任务说明--专业版 / 生动版 / 对照 / 可折叠术语与待办 / 产出
· 任务答疑接 LLM；步骤提示去重；初始消息为简明操作教程
· 操作/代码阶段：内置内容 + 本地苏格拉底

我要做：<在此填写具体任务>
```

---

## 十三、近期演进摘要

1. 任务答疑：预置 FAQ → `/api/task-qa` 调 LLM
2. 本步任务 UI：专业/生动版重命名；「对照」板块；术语与待办可折叠
3. 任务答疑布局：底部全宽 → **右侧侧栏**（`TaskQaSidebar`）
4. 侧栏：可折叠、左边框调宽、输入框上边缘调输入区高度
5. 对话体验：初始教程消息、步骤提示精简与去重、占位文案优化
6. 预设项目：新增「肺部病灶分割」；Intro 支持双击开始
7. 「对照」文案：正文纯中文，英文仅作括号术语对照

---

## 十四、技术栈

- **前端**：React 18、TypeScript、Vite、Tailwind CSS、Monaco Editor
- **后端**：FastAPI、Pydantic v2、SQLAlchemy、SQLite（`backend/pla.db`）
- **AI**：OpenAI 兼容 Chat Completions（任务答疑纯文本；`/api/chat` 为 JSON 结构化输出）
