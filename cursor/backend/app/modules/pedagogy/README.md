# 教学策略引擎

实现架构图中的九种教学动作，并按学习节点与上下文选用策略。

## 已实现

| 策略 | 英文 | 典型触发 |
|------|------|----------|
| 解释 | Explain | 「什么是…」「解释一下」 |
| 落地 | Ground | 「在本项目中…」 |
| 演示 | Demonstrate | 「举个例子」 |
| 提问 | Ask | 初学者 + 开放性问题 |
| 提示 | Hint | 「卡住了」「给点提示」 |
| 挑战 | Challenge | 「如果我…」 |
| 验证 | Verify | 「对不对」「检查一下」 |
| 反思 | Reflect | 「为什么」「怎么理解」 |
| 推进 | Advance | 「下一步」「接下来」 |

## 模块文件

- `strategies.py` — 策略枚举与关键词选用规则
- `prompts.py` — 各策略 system prompt 片段
- `orchestrator.py` — `pick_strategy` + `build_messages`

## 集成

`task_qa` 自动读取用户画像与当前学习节点（`in_progress`），选用策略并返回到 `TaskQaResponse.strategy_label`。
