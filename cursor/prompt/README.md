# PLA 提示词目录（唯一来源）

本目录存放全部 LLM 系统提示词。**请只在此编辑**；后端通过 `app/core/prompt_loader.py` 的 `load_module_prompt()` 直接读取。

改 `.md` 后**重启后端**生效（import 时加载，无热重载）。

## 目录结构

```
prompt/
├── project_parser/          # 项目解析器（八段 framework）
│   ├── system.md            # 系统提示：八段 JSON 生成规则
│   └── user.md              # 用户侧自检指令（与项目名/补充说明拼接）
├── knowledge_graph/         # 基础知识图谱抽取
│   └── extract_system.md
├── user_profiling/          # 用户画像 & 学习节点
│   ├── profile_system.md    # 宏观问答 → 画像 JSON
│   └── node_planner_system.md
├── pedagogy/                # 教学策略（任务答疑主路径）
│   ├── base_system.md
│   └── strategy_*.md        # explain / ground / ask / hint … 共 9 种
├── implementation/          # 实现方案 & 代码辅助
│   ├── plan_system.md
│   ├── understand_system.md
│   └── completion_system.md
└── task_qa/                 # 遗留答疑 prompt（当前走 pedagogy）
    └── system.md
```

## 与代码的对应关系

| 提示词文件 | 加载位置 |
|------------|----------|
| `project_parser/*.md` | `modules/project_parser/prompts.py` |
| `knowledge_graph/*.md` | `modules/knowledge_graph/prompts.py` |
| `user_profiling/*.md` | `modules/user_profiling/prompts.py` |
| `pedagogy/*.md` | `modules/pedagogy/prompts.py` |
| `implementation/*.md` | `modules/implementation/prompts.py` |
| `task_qa/*.md` | `modules/task_qa/prompts.py` |

各模块 `prompts.py` 仅负责 **拼装 messages**（动态 user 上下文、history 等仍在 Python 中）。

## 迭代约定

1. **编辑**：只改 `PLA+/prompt/` 下对应 `.md`
2. **不要**在 `backend/app/modules/*/prompt_texts/` 留副本（已废弃）
3. **验证**：重启后端 → 触发对应 API（如 `POST /api/project-parse`）
4. **新增提示词**：在本目录建文件 → 在对应模块 `prompts.py` 增加 `load_module_prompt("模块名", "文件名.md")`
