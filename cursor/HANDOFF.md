# PLA 项目交接文档

> **用途**：供新对话快速接手。  
> **项目路径**：`d:\Docs\ProjectCode\PLA\cursor`  
> **端口**：前端 **5173** · 后端 **8000**  
> **最后更新**：2026-07-10  
> **说明**：原 PLA+ 能力已合并入本仓库；历史快照在 `archive/PLA+/`

---

## 一、产品定位

**PLA** 是 **项目制学习编排系统**（PBL）。

```
用户项目意图
  → 项目解析器（八段参考文件 + 基础知识图谱）     ✅
  → 用户画像 & 学习节点（宏观问答 → 后台参考文件）  ✅
  → 教学策略引擎（Explain / Ask / Hint / Verify …）✅
  → 实现方案 & 代码辅助（理解型 / 补全型）         ✅
  → 个人知识图谱                                   ⏳ Phase 5
```

**核心原则**

- 三类后台参考文件存 JSON + Markdown，**前端不展示正文**（仅状态、进度、答疑）：
  - 八段项目解析（`frameworks/`）
  - 用户画像（`user_profiles/`）
  - 学习节点（`learning_nodes/`）
- 示例项目重复「开始学习」→ **覆盖**同一套解析文件（稳定 `template-{id}` session）
- 自定义项目每次新 UUID session

---

## 二、用户流程

| 步骤 | 行为 |
|------|------|
| 首页 | 选示例（mnist / lung-seg / todo）或自定义项目名 |
| 「开始学习」 | 自动 `POST /api/project-parse` |
| 解析成功 | 进入工作区，默认「用户画像」 |
| 标签 | `项目解析` \| `知识图谱` \| `代码辅助` \| `用户画像` |
| 任务答疑 | 右侧侧栏；读 framework + 画像 + 当前节点 + 教学策略 |

解析耗时约 30 秒～2 分钟（2 次串行 LLM）；前端超时 `PARSE_TIMEOUT_MS = 300_000`。

### 稳定 session

| 示例 id | session_id |
|---------|------------|
| `mnist` | `template-mnist` |
| `lung-seg` | `template-lung-seg` |
| `todo` | `template-todo` |

### 知识图谱 UI

- 放射状圆形节点图（React Flow）+ 右侧**解释栏**（单击节点展示详情）
- 实现：`frontend/src/components/KnowledgeGraphPanel.tsx` + `knowledge-graph/*`

---

## 三、后端模块（FastAPI @ 8000）

| 模块 | 路径 |
|------|------|
| 项目解析器 | `backend/app/modules/project_parser/` |
| 基础知识图谱 | `backend/app/modules/knowledge_graph/` |
| 用户画像 | `backend/app/modules/user_profiling/` |
| 教学策略 | `backend/app/modules/pedagogy/` |
| 代码辅助 | `backend/app/modules/implementation/` |
| 任务答疑 | `backend/app/modules/task_qa/` |

提示词唯一来源：根目录 [`prompt/`](prompt/)（经 `app/core/prompt_loader.py` 加载）。

数据目录：`backend/data/{frameworks,knowledge_graph,profiling_sessions,user_profiles,learning_nodes,implementation}/`

---

## 四、启动

```powershell
cd d:\Docs\ProjectCode\PLA\cursor
.\start-backend.bat   # :8000
.\start-frontend.bat  # :5173
```

LLM：`backend/.env`（`LLM_API_BASE` 须含 `/compatible-mode/v1`）。改后重启后端。

---

## 五、API 摘要

| 方法 | 路径 |
|------|------|
| POST | `/api/project-parse` |
| GET | `/api/framework/{session_id}/status` |
| GET/POST | `/api/user-profile/*` |
| GET/POST | `/api/knowledge-graph/*` |
| POST | `/api/task-qa` |
| GET/POST | `/api/implementation/*` |

---

## 六、待办

- [ ] Phase 5 个人知识图谱
- [ ] 学习节点 status 自动推进
- [ ] 图谱异步生成（缩短首屏等待）
- [ ] Monaco 代码编辑器（当前 textarea）
- [ ] 自定义项目解析覆盖策略

---

## 七、新对话接手话术

```
继续开发 PLA 项目。请先阅读：
- HANDOFF.md
- prompt/README.md（改 prompt 只改此处）

当前：八段解析 + 知识图谱 + 用户画像/学习节点 + 教学策略答疑 + 代码辅助
前端 5173 / 后端 8000；标签工作区 + 答疑侧栏
历史 PLA+ 在 archive/PLA+/，勿再并行开发

我要做：<具体任务>
```
