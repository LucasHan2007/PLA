# 实现方案 & 代码辅助

## 已实现

### 实现方案生成

学习节点就绪后，结合 framework、画像、知识图谱生成：
- 模块边界（`modules`）
- 技术栈（`tech_stack`）
- 可验证里程碑（`milestones`）

存储：`data/implementation/{session_id}.json`

### 代码辅助（双模式）

| 模式 | 说明 |
|------|------|
| **理解型** `understand` | 解释代码含义、原理、数据流；不给完整替代代码 |
| **补全型** `completion` | 练习式骨架 / TODO / 分步提示；每次一小步 |

### 编码行为分析

每次代码辅助时记录：`code_lines`、是否含 import/def/TODO 等，写入 `behavior_log`。

## 模块文件

- `schema.py` — 数据模型与 API DTO
- `prompts.py` — 方案生成与双模式 prompt
- `plan_generator.py` — LLM 生成实现方案
- `code_assist.py` — 双模式代码辅助
- `behavior_analyzer.py` — 轻量行为分析
- `store.py` — 持久化
- `service.py` — 业务编排

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/implementation/{session_id}/status` | 前置条件与方案状态 |
| GET | `/api/implementation/{session_id}/plan` | 方案 + 代码草稿 |
| POST | `/api/implementation/{session_id}/generate-plan` | 生成实现方案 |
| POST | `/api/implementation/save-draft` | 保存代码草稿 |
| POST | `/api/implementation/code-assist` | 理解型/补全型辅助 |

## 前置条件

生成实现方案需：framework ✓ + 用户画像 ✓ + 学习节点 ✓
