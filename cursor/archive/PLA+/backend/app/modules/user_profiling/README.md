# 用户画像 & 学习节点

通过宏观提问与 LLM 分析，建立**用户画像**与**学习节点**后台参考文件（与八段解析相同：JSON + Markdown，前端不展示正文）。

## 后台文件（按 `session_id`）

| 类型 | 路径 | 说明 |
|------|------|------|
| 宏观问答进度 | `data/profiling_sessions/{session_id}.json` | 仅存 6 题回答 |
| 用户画像参考 | `data/user_profiles/{session_id}.json` + `.md` | 画像 JSON 与可读 Markdown |
| 学习节点参考 | `data/learning_nodes/{session_id}.json` + `.md` | 节点序列 JSON 与 Markdown |

## 模块文件

- `schema.py` — DTO；API 不返回画像/节点正文
- `session_store.py` — 宏观问答进度
- `profile_store.py` — 画像参考文件
- `nodes_store.py` — 学习节点参考文件
- `store.py` — 对外 facade（`get_profile`、`get_current_node` 等，供后端模块读参考文件）
- `question_bank.py` — 6 道宏观问题
- `profiler.py` / `node_planner.py` — LLM 生成
- `service.py` — HTTP 业务编排

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/user-profile/{session_id}/status` | 问答 + 参考文件进度（含摘要/当前节点标题） |
| GET | `/api/user-profile/{session_id}/questions` | 宏观问题与已答 |
| POST | `/api/user-profile/answer` | 提交单题回答 |
| POST | `/api/user-profile/build` | 生成并保存画像 + 节点参考文件 |
| GET | `/api/user-profile/{session_id}/reference-status` | 参考文件状态（无正文） |
| GET | `/api/user-profile/{session_id}/nodes` | 同上（兼容旧路径） |

## 原则

- 画像与学习节点为**后台参考文件**，前端仅显示状态与字段说明
- `guiding_question` 只引导思考，不直接给出任务答案
