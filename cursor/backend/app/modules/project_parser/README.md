# 项目解析器

已迁移自 PLA v1，并扩展为**八段**（新增「迭代优化」）。

## 文件

- `schema.py` — `ProjectFramework`、`FrameworkSection`
- `prompts.py` — LLM system prompt、demo 数据
- `parser.py` — 解析 LLM JSON
- `store.py` — `backend/data/frameworks/{session_id}.json|.md`
- `templates.py` — 示例项目稳定 session（`template-{id}`）与覆盖解析时清理衍生数据
- `service.py` — `parse_and_save(session_id, name, hint)`

## API

```http
POST /api/project-parse
Content-Type: application/json

{
  "project_name": "MNIST 手写数字识别",
  "project_hint": "KNN 分类",
  "session_id": null
}
```

响应（不含 sections 正文）：

```json
{
  "session_id": "...",
  "project_name": "...",
  "summary": "...",
  "framework_ready": true
}
```

```http
GET /api/framework/{session_id}/status
```

## 迁移来源（PLA v1）

| v1 | PLA+ |
|----|------|
| `services/framework_store.py` | `store.py` |
| `prompt_builder.py` PROJECT_PARSE_* | `prompts.py` |
| `post_processor.parse_project_parse_document` | `parser.py` |
| `llm_service.parse_project` | `service.py` + `core/llm_client.py` |
