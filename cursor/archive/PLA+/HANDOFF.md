# PLA+ 项目交接文档

> **用途**：供新对话快速接手，无需重读完整聊天历史。  
> **项目路径**：`d:\Docs\ProjectCode\PLA\cursor\PLA+`  
> **兄弟项目**：PLA v1 在 `d:\Docs\ProjectCode\PLA\cursor\`（端口 **8000/5173**，勿混用）  
> **最后更新**：2026-07-10

---

## 一、产品定位

**PLA+** 是 PLA 的下一代 **项目制学习编排系统**（PBL），目标架构见 `docs/ARCHITECTURE.md`。

主链路（当前实现进度）：

```
用户项目意图
  → 项目解析器（八段参考文件 + 基础知识图谱）     ✅
  → 用户画像 & 学习节点（宏观问答 → 后台参考文件）  ✅
  → 教学策略引擎（Explain / Ask / Hint / Verify …）✅
  → 实现方案 & 代码辅助（理解型 / 补全型）         ✅
  → 个人知识图谱                                   ⏳ Phase 5
```

**核心原则**

- **三类后台参考文件**均存 JSON + Markdown，**前端不展示正文**（仅状态、进度、答疑）：
  - 八段项目解析（framework）
  - 用户画像（user_profiles）
  - 学习节点（learning_nodes）
- 同一示例项目重复「开始学习」→ **覆盖**同一套解析文件（稳定 session，见下文）
- 自定义项目仍为每次新 UUID session（暂不讨论用户自定义项目的覆盖策略）
- PLA+ 与 PLA v1 **并行开发**；改 PLA+ 代码请在 `PLA+/` 内进行

---

## 二、当前已实现（Phase 1–4）

### 用户流程

| 步骤 | 行为 |
|------|------|
| 首页 | 选**示例模板**（mnist / lung-seg / todo）或**自定义**项目名 |
| 点「开始学习」 | **自动** `POST /api/project-parse`（示例项目带 `project_template_id`） |
| 解析成功 | 进入工作区，**默认打开「用户画像」** |
| 「项目解析」标签 | 仅状态 +「重新生成参考文件」（不展示八段正文） |
| 用户画像 | 6 道宏观问答 →「生成画像与学习节点参考文件」→ 后台保存，**不展示正文** |
| 任务答疑 | 右侧侧栏；读 framework + 画像 + 当前节点 + 教学策略 |

**「开始学习」耗时**：一次解析 = **2 次串行 LLM**（八段 + 基础知识图谱），通常 **30 秒～2 分钟**；前端超时 `PARSE_TIMEOUT_MS = 300_000`（5 分钟）。

### 示例项目解析文件覆盖

| 示例 id | 稳定 `session_id` | 说明 |
|---------|-------------------|------|
| `mnist` | `template-mnist` | 每次从首页选 MNIST 再解析 → **覆盖** `frameworks/`、`knowledge_graph/` 等同 id 文件 |
| `lung-seg` | `template-lung-seg` | 同上 |
| `todo` | `template-todo` | 同上 |

- 请求体字段：`project_template_id`（仅示例项目；自定义不传）
- 从首页重新开始（`session_id: null`）时，还会清除该 session 的画像/节点/实现数据（`clear_derived_session_data`）
- 工作区内「重新生成参考文件」：保留已有画像，只覆盖 framework + 图谱

实现：`modules/project_parser/templates.py`；前端 `App.tsx` 在选模板时传 `project_template_id`。

### 前端工作区标签（从左到右）

`项目解析` | `知识图谱` | `代码辅助` | `用户画像`  
右侧常驻：**任务答疑**侧栏（可调宽、可折叠，显示教学策略标签）

**知识图谱 UI（2026-07-10）**

- 放射状圆形节点图（React Flow）：项目中心节点 + 按依赖层径向排布
- 节点按类别着色：概念(蓝) / 技能(紫) / 工具(琥珀) / 实践(橙)
- 边标签：`前置`（requires）/ `相关`（relates_to）；支持拖拽、缩放、小地图
- **解释栏**（右侧固定宽）：单击节点展示说明、重要度、关联八段段落、前置/后续/相关节点；空白处单击清除选中
- 实现：`components/KnowledgeGraphPanel.tsx` + `components/knowledge-graph/*`

### 后端模块（FastAPI @ **8001**）

| 模块 | 路径 | 说明 |
|------|------|------|
| 项目解析器 | `modules/project_parser/` | 八段 → `data/frameworks/` |
| 基础知识图谱 | `modules/knowledge_graph/` | 解析后自动抽取；失败**不拖垮**整次解析 |
| 用户画像 | `modules/user_profiling/` | 宏观问答 → 画像 & 节点**分文件**存储 |
| 教学策略 | `modules/pedagogy/` | 9 种策略；**task-qa 主路径** |
| 代码辅助 | `modules/implementation/` | 实现方案、理解型/补全型辅助 |
| 任务答疑 | `modules/task_qa/` | 编排入口；实际 prompt 走 `pedagogy` |

### 八段解析链（较 PLA v1 多「迭代优化」）

1. 项目目标  
2. 问题定义  
3. 数据输入、输出流与数据模型及约束  
4. 任务分解  
5. 所涉及的知识与技能  
6. 实现方案  
7. 代码的运行、验证与调试  
8. 迭代优化  

### 后台数据文件（按 `session_id`）

| 类型 | 路径 | 前端是否展示正文 |
|------|------|------------------|
| 八段 framework | `data/frameworks/{session_id}.json` + `.md` | 否 |
| 基础知识图谱 | `data/knowledge_graph/{session_id}.json` | 图谱标签可展示节点 |
| 宏观问答进度 | `data/profiling_sessions/{session_id}.json` | 仅问答 UI |
| 用户画像参考 | `data/user_profiles/{session_id}.json` + `.md` | 否 |
| 学习节点参考 | `data/learning_nodes/{session_id}.json` + `.md` | 否 |
| 实现方案 & 草稿 | `data/implementation/{session_id}.json` | 方案摘要可展示 |
| 会话消息 | SQLite `pla_plus.db` | — |

> 旧路径 `data/profiles/` **已废弃**，勿再写入。

### 用户画像生成逻辑（简记）

1. 前置：已有 framework；完成 6 道宏观题（存 `profiling_sessions/`）
2. `POST /api/user-profile/build` → **2 次串行 LLM**：
   - 画像 JSON → `user_profiles/{session_id}.*`
   - 学习节点 JSON → `learning_nodes/{session_id}.*`
3. API **不返回**画像/节点正文；前端只显示「参考文件已就绪」
4. `guiding_question` 只引导思考，禁止直接给任务答案（prompt 约束）
5. 下游（task-qa、implementation）通过 `store.py` / `profile_store` / `nodes_store` 读后台文件

### 关键业务规则（简记）

- **教学策略**：`explain / ground / demonstrate / ask / hint / challenge / verify / reflect / advance`，关键词匹配（`pedagogy/strategies.py`）
- **代码辅助**：需画像 + 学习节点就绪；编辑器为 **textarea**（非 Monaco）
- **提示词**：只改 `PLA+/prompt/` 下 `.md`，重启后端生效

---

## 三、尚未实现（路线图）

| Phase | 模块 | 状态 |
|-------|------|------|
| 5 | 个人知识图谱 + 可视化 | 待做 |
| — | 学习节点状态自动推进 | 待做 |
| — | 知识图谱异步生成（先返回 framework） | 待做 |
| — | Monaco 代码编辑器 | 待做 |
| — | 分步解析 UI（v1 式 6 步 logic_plan） | 未接入 PLA+ |
| — | 自定义项目的解析文件覆盖策略 | 未做 |

**建议下一步（任选其一）**

1. **Phase 5**：个人知识图谱 schema + 掌握状态 + 前端可视化（reactflow）  
2. **异步图谱**：`project-parse` 先返回 `framework_ready`，图谱后台生成  
3. **节点推进**：答疑/代码行为自动更新 `learning_nodes` 中节点 `status`  
4. **提示词迭代**：继续优化 `prompt/project_parser/`、`prompt/user_profiling/` 等

---

## 四、提示词工程

全部 LLM **系统提示词**集中在 **`PLA+/prompt/`**（唯一来源）；各模块 `prompts.py` 通过 `load_module_prompt()` 加载，仅负责 **拼装 messages**。

| 模块 | `prompt/` 子目录 | 主要文件 |
|------|------------------|----------|
| 项目解析器 | `project_parser/` | `system.md`（已优化）、`user.md` |
| 基础知识图谱 | `knowledge_graph/` | `extract_system.md` |
| 用户画像 | `user_profiling/` | `profile_system.md`、`node_planner_system.md` |
| 教学策略 | `pedagogy/` | `base_system.md`、`strategy_*.md`（9 种） |
| 代码辅助 | `implementation/` | `plan_system.md`、`understand_system.md`、`completion_system.md` |
| 任务答疑（遗留） | `task_qa/` | `system.md`（答疑走 pedagogy，此文件供对照） |

**加载**：`app/core/prompt_loader.py` → `PROMPT_DIR = PLA+/prompt/`  
**约定**：改 `.md` 后**重启后端**；详见 `prompt/README.md`

---

## 五、目录与核心文件

```
PLA+/
├── HANDOFF.md                 # 本文件（交接首选）
├── prompt/                    # ★ 全部 LLM 提示词
├── STATUS.md                  # 精简进度（可能滞后，以本文件为准）
├── README.md
├── docs/ARCHITECTURE.md
├── start-backend.bat          # 8001
├── start-frontend.bat         # 5174
├── backend/
│   ├── .env                   # LLM 配置（勿提交）
│   ├── data/
│   │   ├── frameworks/
│   │   ├── knowledge_graph/
│   │   ├── profiling_sessions/   # 宏观问答进度
│   │   ├── user_profiles/        # 画像参考文件
│   │   ├── learning_nodes/       # 学习节点参考文件
│   │   └── implementation/
│   └── app/
│       ├── api/routes.py
│       ├── core/
│       │   ├── llm_client.py     # 3 次重试 + trust_env
│       │   ├── prompt_loader.py
│       │   └── json_utils.py
│       └── modules/
│           ├── project_parser/   # templates.py：示例项目稳定 session
│           ├── knowledge_graph/
│           ├── user_profiling/   # session_store / profile_store / nodes_store
│           ├── pedagogy/
│           ├── implementation/
│           └── task_qa/
└── frontend/src/
    ├── App.tsx
    ├── components/
    │   ├── IntroPanel.tsx        # 「开始学习」→ 自动 project-parse
    │   ├── ProjectParserPanel.tsx
    │   ├── UserProfilingPanel.tsx  # 问答 + 状态，不展示参考文件正文
│   ├── KnowledgeGraphPanel.tsx
│   ├── knowledge-graph/          # 圆形节点图 + 解释栏
│   │   ├── KnowledgeGraphCanvas.tsx
│   │   ├── GraphCircleNode.tsx
│   │   ├── NodeExplainPanel.tsx
│   │   ├── graphLayout.ts
│   │   └── constants.ts
│   ├── ImplementationPanel.tsx
│   └── TaskQaSidebar.tsx
    ├── data/projectTemplates.ts  # id 须与 templates.py KNOWN_TEMPLATE_IDS 一致
    └── services/api.ts           # PARSE_TIMEOUT_MS = 300_000
```

---

## 六、API 一览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 + `llm_configured` + `llm_model` |
| GET | `/api/version` | 版本与模块列表 |
| POST | `/api/project-parse` | 八段 + 图谱（2 次 LLM） |
| GET | `/api/framework/{session_id}/status` | framework 是否就绪 |
| POST | `/api/task-qa` | 任务答疑（策略 + 上下文） |
| GET | `/api/user-profile/{session_id}/status` | 问答 + 参考文件进度 |
| GET | `/api/user-profile/{session_id}/questions` | 宏观问题与已答 |
| POST | `/api/user-profile/answer` | 提交单题 |
| POST | `/api/user-profile/build` | 生成画像 + 节点参考文件（**响应无正文**） |
| GET | `/api/user-profile/{session_id}/reference-status` | 画像/节点参考文件状态 |
| GET | `/api/user-profile/{session_id}/nodes` | 同 reference-status（兼容旧路径） |
| GET | `/api/knowledge-graph/{session_id}/status` | 图谱状态 |
| GET | `/api/knowledge-graph/{session_id}` | 图谱数据 |
| GET | `/api/knowledge-graph/{session_id}/layers` | 分层视图 |
| POST | `/api/knowledge-graph/{session_id}/build` | 手动重建图谱 |
| GET | `/api/implementation/{session_id}/status` | 实现模块状态 |
| GET | `/api/implementation/{session_id}/plan` | 实现方案 |
| POST | `/api/implementation/{session_id}/generate-plan` | 生成实现方案 |
| POST | `/api/implementation/save-draft` | 保存代码草稿 |
| POST | `/api/implementation/code-assist` | 理解型 / 补全型 |

### `POST /api/project-parse`

```json
{
  "project_name": "MNIST 手写数字识别",
  "project_hint": "KNN 分类",
  "session_id": null,
  "project_template_id": "mnist"
}
```

- 示例项目：传 `project_template_id` → session 固定为 `template-{id}`，覆盖旧文件  
- 自定义项目：不传 `project_template_id` → 新 UUID session  

响应（**不含 sections 正文**）：

```json
{
  "session_id": "template-mnist",
  "project_name": "...",
  "summary": "...",
  "framework_ready": true,
  "graph_ready": true,
  "graph_node_count": 14
}
```

### `POST /api/user-profile/build`

响应（**不含 profile/nodes 正文**）：

```json
{
  "session_id": "...",
  "profile_ready": true,
  "nodes_ready": true,
  "profile_summary": "一句话摘要（状态提示用）",
  "node_count": 6,
  "current_node_id": "node_1",
  "current_node_title": "建立问题边界",
  "message": "..."
}
```

---

## 七、LLM 配置（千问 / 百炼）

文件：`PLA+/backend/.env`

```env
LLM_API_BASE=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_API_KEY=your-api-key-here
LLM_MODEL=qwen-flash
```

**注意**

- `LLM_API_BASE` 必须含 `/compatible-mode/v1`
- 模型示例：`qwen-flash`（快）、`qwen-plus`（质量更高）
- 改 `.env` 后须**完全重启后端**
- `GET /health` 确认 `llm_model` 与 `.env` 一致

### 常见 LLM 报错

| 报错 | 处理 |
|------|------|
| `无法连接 LLM 服务` | 查网络/代理；`llm_client` 已 3 次重试 |
| `LLM 请求超时` | 换 `qwen-flash` 或增大 timeout |
| `LLM 调用失败 (400)` | 检查 `LLM_MODEL` 拼写 |

**自测**：

```powershell
Set-Location "d:\Docs\ProjectCode\PLA\cursor\PLA+\backend"
.\.venv\Scripts\python.exe -c "import asyncio; from app.core.llm_client import llm_client; print(asyncio.run(llm_client.chat_plain([{'role':'user','content':'hi'}], timeout=60)))"
```

---

## 八、启动方式

```powershell
# 终端 1 — PLA+ 后端
cd d:\Docs\ProjectCode\PLA\cursor\PLA+
.\start-backend.bat

# 终端 2 — PLA+ 前端
.\start-frontend.bat
```

| 项目 | 前端 | 后端 health |
|------|------|-------------|
| **PLA+** | http://localhost:5174 | http://localhost:8001/health |
| PLA v1 | http://localhost:5173 | http://localhost:8000/health |

**勿混用**端口与 `vite.config.ts` 代理。

---

## 九、与 PLA v1 的关系

| 项目 | 路径 | 端口 | 主流程 |
|------|------|------|--------|
| PLA v1 | `cursor/` | 8000 / 5173 | **预设项目**四步：内置 logic_plan 分步解析 → 操作 → 代码 |
| PLA+ | `cursor/PLA+/` | 8001 / 5174 | LLM 八段解析 + 图谱 + 画像 + 策略 + 代码辅助 |

**功能边界（2026-07-10 已理清）**

- v1 **无**「项目解析器」面板（`ProjectParserPanel` 已从 v1 移除）；v1 解析内容来自**内置预设**，不是 LLM 八段生成
- PLA+ 的「项目解析器 / 用户画像 / 知识图谱」等**仅存在于 PLA+**
- v1 后端仍保留 `POST /api/project-parse`（七段），但 v1 前端不调用
- 新增示例项目时：**两处同步** — `frontend/src/data/projectTemplates.ts` 与 `project_parser/templates.py` 的 `KNOWN_TEMPLATE_IDS`

---

## 十、近期演进摘要

1. Phase 2–4 闭环：画像、策略、基础知识图谱、代码辅助  
2. 首页「开始学习」自动 project-parse；工作区默认「用户画像」  
3. **提示词工程**：集中至 `PLA+/prompt/`；项目解析器 `system.md` + `user.md` 已优化  
4. **示例项目解析覆盖**：`template-{id}` 稳定 session + `project_template_id`  
5. **画像 & 学习节点**：拆为后台参考文件（`user_profiles/`、`learning_nodes/`），API/前端不返回正文  
6. **数据目录清理**：废弃 `data/profiles/`；宏观问答改存 `profiling_sessions/`  
7. **PLA / PLA+ 解串**：v1 恢复预设分步解析流程；HANDOFF 明确端口与职责  
8. `llm_client`：ConnectError/Timeout 处理、3 次重试、`trust_env=True`
9. **知识图谱可视化**：放射状圆形节点图（React Flow）+ 右侧解释栏（单击节点展示详情）

---

## 十一、已知问题 / 待办

- [ ] Phase 5 个人知识图谱未实现  
- [ ] 学习节点 `status` 不会随学习进度自动推进  
- [ ] `project-parse` 两次 LLM 串行，首屏等待较长  
- [ ] 代码编辑器为 textarea，非 Monaco  
- [ ] 到 `dashscope.aliyuncs.com` 可能间歇性 ConnectError（网络/代理）  
- [ ] `backend/.env` 含密钥，**勿提交 Git**  
- [ ] 新增示例项目需同步改 `projectTemplates.ts` + `templates.py`

---

## 十二、新对话接手话术（可复制）

```
继续开发 PLA+ 项目。请先阅读：
- PLA+/HANDOFF.md（本交接文档）
- PLA+/docs/ARCHITECTURE.md（目标架构）
- PLA+/prompt/README.md（提示词目录，改 prompt 只改此处）

当前已完成（Phase 1–4）：
· 八段解析 → data/frameworks/{session_id}.json|.md（前端不展示正文）
· 基础知识图谱 → data/knowledge_graph/{session_id}.json
· 示例项目（mnist/lung-seg/todo）→ 稳定 session template-{id}，重复解析覆盖旧文件
· 用户画像：6 题宏观问答 → user_profiles/ + learning_nodes/ 后台参考文件（API 不返正文）
· 教学策略 9 种，task-qa 侧栏展示策略标签
· 代码辅助：实现方案 + 理解型/补全型（需画像+节点就绪）
· 前端：5174 / 后端：8001；选项目 →「开始学习」自动解析 → 四标签 + 答疑侧栏

与 PLA v1 区分：
· v1 在 cursor/，端口 5173/8000，预设分步解析，无 PLA+ 解析器/画像模块
· 勿在 v1 目录改 PLA+ 功能，反之亦然

待做：Phase 5 个人知识图谱、节点自动推进、图谱异步、Monaco、自定义项目覆盖策略

LLM（改 .env 后须重启后端）：
  LLM_API_BASE=https://dashscope.aliyuncs.com/compatible-mode/v1
  LLM_MODEL=qwen-flash

我要做：<在此填写具体任务>
```

---

## 十三、快速验证清单

- [ ] `GET http://localhost:8001/health` → `llm_configured: true`
- [ ] http://localhost:5174 → 选 MNIST →「开始学习」→ 等待解析（约 1～2 分钟）
- [ ] `data/frameworks/template-mnist.json` 与 `knowledge_graph/template-mnist.json` 存在/更新
- [ ] 工作区「用户画像」→ 答完 6 题 → 生成参考文件 → `user_profiles/`、`learning_nodes/` 出现文件
- [ ] 「知识图谱」标签可见节点；「代码辅助」在画像完成后可用
- [ ] 任务答疑有回复且显示策略标签
- [ ] 确认 **5173** 打开的是 v1（无「八段自动解析 + 四标签工作区」的 PLA+ UI）
