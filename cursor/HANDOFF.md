# PLA 项目交接文档

> **用途**：供新对话快速接手（读完本文即可开工）。  
> **项目路径**：`d:\Docs\ProjectCode\PLA\cursor`  
> **端口**：前端 **5173** · 后端 **8000**（勿用 archive 里的 5174/8001）  
> **最后更新**：2026-07-16  
> **说明**：原 PLA+ 已合并；历史快照仅在 `archive/PLA+/`，日常只改主工程。

---

## 一、产品定位

**PLA** = 项目制学习编排（Programming Learning Assistant）。

用户带着一个编程项目意图进入，系统依次：

1. 解析项目 → 八段参考体系 + 通用知识图谱 + 代码蓝图  
2. 宏观问答 → 用户画像 + 学习节点  
3. 按节点学习 + 对话式答疑（教学策略）  
4. 按代码蓝图实现（自然语言节点穿插伪代码）+ 代码辅助  

**核心原则**

- 三类「参考文件」存盘（JSON + 部分 Markdown），前端主要展示**状态/列表/蓝图 UI**，不整篇展示八段正文。  
- **凡已有后台文件一律复用**，不重复调 LLM；只有显式 `force_regenerate=true`（或 UI「重新生成 / 重新抽取」）才覆盖。  
- 示例项目用稳定 session：`template-{id}`（`mnist` / `lung-seg` / `todo`）。自定义项目每次新 UUID。

---

## 二、四页 UI 流程

按产品线框：**页面1 → 2 → 3 → 4**；**TaskQaSidebar（对话式答疑）贯穿 2–4**。

```
页面1 IntroPanel
  项目列表 + 项目名称 + 项目描述（线框里的「对话框」= 这两个输入框）
  「开始学习」→ POST /api/project-parse
       · 同步：只等八段 framework
       · 异步：通用图谱 + 代码蓝图（background_jobs）
  → 进入页面2

页面2 UserProfilingPanel + TaskQaSidebar
  宏观问答 → 生成画像 + 学习节点
  调试：MNIST 可点「调试：填入预设答案并跳过」（frontend/src/data/debugProfileAnswers.ts）

页面3 LearningNodesPanel + 答疑
  可切换查看 KnowledgeGraphPanel（径向 React Flow + 右侧解释栏）

页面4 代码模块三栏（按学习节点一一对齐）
     左：项目名称 + LearningNodes（节点及内容）
     中：ImplementationPanel 自然语言说明 + 伪代码（按节点分栏）
     右：详细代码内容（按节点分栏，可对照练习）
     答疑侧栏在本页收起，贯穿页面 2–3；页内底部保留代码辅助
```

入口编排：`frontend/src/App.tsx`。

---

## 三、后台文件复用（重要）

| 产物 | 目录 | 默认 | 强制重写 |
|------|------|------|----------|
| 八段 framework | `backend/data/frameworks/` | 有则复用 | `force_regenerate` on `/project-parse` |
| 知识图谱 | `backend/data/knowledge_graph/` | 有则复用 | `?force_regenerate=true` on graph build；新解析后后台任务会 force |
| 代码蓝图 | `backend/data/code_blueprint/` | 有则复用 | 同上 / blueprint build |
| 用户画像 | `backend/data/user_profiles/` | 有则复用 | `force_regenerate` on `/user-profile/build` |
| 学习节点 | `backend/data/learning_nodes/` | 有则复用 | 同上（与画像一起） |
| 实现方案等 | `backend/data/implementation/` | 有则复用 | `?force_regenerate=true` on generate-plan |
| 问答进度 | `backend/data/profiling_sessions/` | 随 session 保留 | 仅 `force` 重解析时随派生数据清空 |

**「开始学习」**：若该 session 已有 framework → **不删**图谱/蓝图/画像/方案，直接复用；缺图谱或蓝图才后台补齐。  
**强制重解析**（`force_regenerate=true`）或首次无 framework：先 `clear_derived_session_data`，再生成。

实现入口：

- `project_parser/service.py` → `parse_and_save(..., force_regenerate=)`  
- `project_parser/background_jobs.py` → 新解析 `force=True`；补缺 `force=False`  
- `knowledge_graph/service.py`、`implementation/code_blueprint_extractor.py`  
- `user_profiling/service.py`、`implementation/service.py`  
- `project_parser/templates.py` → `clear_derived_session_data`

---

## 四、后端模块（:8000）

| 模块 | 路径 | 职责 |
|------|------|------|
| 项目解析 | `backend/app/modules/project_parser/` | 八段 framework；调度异步图谱/蓝图 |
| 知识图谱 | `backend/app/modules/knowledge_graph/` | 从 framework 抽概念依赖图 |
| 用户画像 | `backend/app/modules/user_profiling/` | 宏观问答、画像、学习节点 |
| 教学策略 | `backend/app/modules/pedagogy/` | Explain / Ask / Hint / Verify… |
| 代码辅助 | `backend/app/modules/implementation/` | 代码蓝图、实现方案、补全/理解辅助 |
| 任务答疑 | `backend/app/modules/task_qa/` | 侧栏对话，挂策略引擎 |

其它：

- 路由：`backend/app/api/routes.py`  
- LLM：`backend/app/core/llm_client.py` + `backend/.env`  
- 提示词：**根目录** `prompt/`（经 `core/prompt_loader.py` 加载）  
- Session：`backend/app/services/session_service.py`

### 关键 API（节选）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/project-parse` | body 可含 `force_regenerate`；同步 framework，异步图谱+蓝图 |
| GET | `/api/framework/{session_id}/status` | framework 是否就绪 |
| GET/POST | `/api/knowledge-graph/{session_id}` / `.../build` | 读图 / 重建（query `force_regenerate`） |
| POST | `/api/user-profile/build` | 画像+节点；`force_regenerate` |
| GET | `/api/user-profile/{id}/learning-nodes` | 节点列表（页 3/4） |
| GET/POST | `/api/implementation/.../code-blueprint` / `.../build` | 蓝图 |
| POST | `/api/implementation/{id}/generate-plan` | 实现方案 |
| POST | `/api/task-qa` | 侧栏答疑 |

健康检查：`GET /health` · 版本：`GET /api/version`。

---

## 五、前端要点（:5173）

| 区域 | 文件 |
|------|------|
| 流程编排 | `frontend/src/App.tsx` |
| 页1 | `components/IntroPanel.tsx` |
| 页2 | `components/UserProfilingPanel.tsx` |
| 页3 | `components/LearningNodesPanel.tsx`、`KnowledgeGraphPanel.tsx` |
| 页4 | `ImplementationPanel.tsx`（左节点 · 中伪代码 · 右详细代码，按学习节点对齐） |
| 答疑侧栏 | `TaskQaSidebar.tsx` → `ChatPanel.tsx` |
| 图谱画布 | `components/knowledge-graph/*`（React Flow 径向 + `NodeExplainPanel`） |
| API | `services/api.ts`（各 rebuild 默认带 force；首次生成不带） |
| 模板 | `data/projectTemplates.ts` |
| MNIST 调试答案 | `data/debugProfileAnswers.ts` |

`ProjectParserPanel.tsx` 仍在仓库中，当前四页流**未挂入** App（解析已在页1自动完成）。

---

## 六、启动与配置

```powershell
cd d:\Docs\ProjectCode\PLA\cursor
.\start-backend.bat    # http://127.0.0.1:8000
.\start-frontend.bat   # http://localhost:5173
```

LLM：`backend/.env`（参考 `.env.example`）

```env
LLM_API_BASE=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_API_KEY=...
LLM_MODEL=qwen-flash
```

未配置 LLM 时各模块走 demo/本地占位，便于联调 UI。

---

## 七、近期已完成（交接相关）

1. PLA+ → PLA 合并并归档  
2. 四页线框流程（页1=名称+描述）  
3. 解析同步只等 framework；图谱 + 代码蓝图异步生成并前端轮询  
4. 代码蓝图：代码节点内 prose / 伪代码穿插，存 `code_blueprint/`，页4展示  
5. **全量后台文件「有则复用 / force 才重写」**（framework、图谱、蓝图、画像、节点、实现方案）  
6. MNIST 调试跳过问答  
7. 知识图谱径向布局 + 节点点击解释栏  
8. **页4 代码模块三栏**：学习节点 | 自然语言+伪代码 | 详细代码，按节点一一对齐  

---

## 八、待办 / 未做

- [ ] Phase 5 个人知识图谱（与「项目通用图谱」区分）  
- [ ] 学习节点 `status` 随学习自动推进  
- [ ] Monaco（或更好的）代码编辑器  
- [x] 页4 伪代码与真实代码列按学习节点一一对齐 UI  
- [ ] 自定义项目跨次进入时的 session 续接（当前自定义每次新 UUID，不易复用旧文件）  
- [ ] 页4 答疑侧栏与三栏代码布局的并存/折叠体验  

---

## 九、新对话注意

1. **只改** `d:\Docs\ProjectCode\PLA\cursor` 主工程；不要复活 `archive/PLA+/`。  
2. 端口固定 **5173 / 8000**。  
3. 改生成逻辑时默认保持「有文件就复用」；覆盖必须走 `force_regenerate`。  
4. 提示词改 `prompt/`，不要把长 prompt 硬编码进 Python。  
5. 详细进度摘要可对照 [`STATUS.md`](STATUS.md)；以本文为准。  
