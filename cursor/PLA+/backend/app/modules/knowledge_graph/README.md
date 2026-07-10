# 知识图谱

## 已实现：基础知识图谱（项目视角）

从八段项目解析体系自动抽取概念/技能节点及前置依赖，存于 `data/knowledge_graph/{session_id}.json`。

### 模块文件

- `schema.py` — `GraphNode`、`GraphEdge`、`ProjectKnowledgeGraph`
- `prompts.py` — LLM 抽取 Prompt + 离线演示 + `format_graph_context`
- `extractor.py` — 从 framework 抽取图谱
- `project_graph_store.py` — 读写 JSON
- `queries.py` — 拓扑分层、前置查询
- `service.py` — 业务编排

### API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/knowledge-graph/{session_id}/status` | 图谱状态 |
| GET | `/api/knowledge-graph/{session_id}` | 完整图谱 |
| GET | `/api/knowledge-graph/{session_id}/layers` | 按依赖分层（前端展示） |
| POST | `/api/knowledge-graph/{session_id}/build` | 手动重建 |

### 触发时机

`POST /api/project-parse` 保存 framework 后**自动**抽取并保存图谱。

### 集成

- **用户画像**：生成画像与学习节点时纳入图谱上下文
- **任务答疑**：策略引擎读取图谱辅助回答

## 待做：个人知识图谱

记录用户已掌握/进行中/未开始，随学习事件更新。
