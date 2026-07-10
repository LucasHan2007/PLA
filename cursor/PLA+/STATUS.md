# PLA+ 项目状态

> **路径**：`d:\Docs\ProjectCode\PLA\cursor\PLA+`  
> **最后更新**：2026-07-10  
> **完整交接**：见 **[HANDOFF.md](./HANDOFF.md)**（新对话优先读此文件）  
> **参考架构图**：见 `docs/ARCHITECTURE.md`

---

## 当前阶段

**Phase 1 — 项目解析器**（已完成迁移）

- [x] 创建 `PLA+` 目录与模块划分
- [x] 架构文档与 STATUS 交接
- [x] 后端最小可运行骨架（FastAPI @ 8001）
- [x] 迁移项目解析器 → `modules/project_parser/`
- [x] `POST /api/project-parse` + 后台 `frameworks/{session_id}.json|.md`
- [x] 八段解析链（含迭代优化，较 v1 多一段）
- [x] 前端 Vite 工程（React + Tailwind @ 5174）
- [x] 迁移任务答疑（读 framework 文件）

### Phase 1 模块文件

| 文件 | 职责 |
|------|------|
| `modules/project_parser/schema.py` | 数据模型与 API DTO |
| `modules/project_parser/prompts.py` | Prompt 与 demo |
| `modules/project_parser/parser.py` | JSON → ProjectFramework |
| `modules/project_parser/store.py` | 后台文件读写 |
| `modules/project_parser/service.py` | `parse_and_save` |
| `core/llm_client.py` | LLM HTTP 调用 |
| `services/session_service.py` | 会话 ID |

---

## 模块路线图

### Phase 1 — 项目解析器（核心参考）

| 任务 | 状态 |
|------|------|
| 八段解析链（含迭代优化） | 已完成 |
| 后台 JSON + Markdown 参考文件 | 已完成 |
| `POST /api/project-parse` | 已完成 |
| 基础知识图谱（项目视角）结构定义 | 待做 |
| 按 session 关联解析文件 | 已完成 |

### Phase 2 — 用户画像 & 学习节点

| 任务 | 状态 |
|------|------|
| 宏观提问流程（项目理解 + 知识背景） | 待做 |
| Prompt → 用户画像 schema | 待做 |
| 项目层次 + 画像 → 学习节点建模 | 待做 |
| 输出「引导思考」而非直接给答案 | 待做 |

### Phase 3 — 教学策略引擎

| 任务 | 状态 |
|------|------|
| 九策略枚举与选用规则 | 待做 |
| Explain / Ground / Demonstrate / Ask / Hint / Challenge / Verify / Reflect / Advance | 待做 |
| 与任务答疑、苏格拉底流程整合 | 待做 |

### Phase 4 — 实现 & 代码辅助

| 任务 | 状态 |
|------|------|
| 具体实现方案生成 | 待做 |
| 理解型 vs 补全型代码辅助 | 待做 |
| 用户编码行为分析与动态建模 | 待做 |

### Phase 5 — 个人知识图谱

| 任务 | 状态 |
|------|------|
| 知识点节点与掌握状态 | 待做 |
| 学习推进时写入图谱 | 待做 |
| 前端可视化（可选 reactflow） | 待做 |

---

## 与 PLA v1 对照

| PLA v1 已有 | PLA+ 目标 |
|-------------|-----------|
| 预设项目四步流程 | 任意项目 + 个性化路径 |
| 项目解析器七段（后台文件） | 八段 + 基础知识图谱 |
| 任务答疑 `/api/task-qa` | 接入画像 + 教学策略 |
| 固定 6 步 analysisTasks | 动态学习节点 |
| mindmap API 未接前端 | 个人知识图谱 |

---

## 新对话接手话术

见 **[HANDOFF.md § 十一](./HANDOFF.md#十一新对话接手话术可复制)**（含可复制模板）。
