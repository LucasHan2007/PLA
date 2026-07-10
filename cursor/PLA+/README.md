# PLA+ — Programming Learning Assistant (Next Generation)

PLA+ 是 PLA 的下一代版本，基于**项目制学习编排**架构：项目解析 → 用户画像 → 学习节点 → 教学策略 → 实现与代码 → 个人知识图谱。

与同级目录中的 PLA（v1）关系：

| | PLA (v1) | PLA+ |
|---|----------|------|
| 路径 | `../`（cursor 根目录） | `PLA+/` |
| 定位 | 预设项目 + 分步学习 MVP | 完整 PBL 编排系统 |
| 后端端口 | 8000 | **8001** |
| 前端端口 | 5173 | **5174** |

## 架构概览

```
用户项目意图
    ↓
项目解析器 → 后台参考文件 + 基础知识图谱
    ↓
用户画像 & 学习节点建模（宏观提问 + Prompt 分析）
    ↓
教学策略引擎（Explain / Ask / Hint / Verify …）
    ↓
实现方案 → 代码辅助（理解型 / 补全型）→ 动态行为分析
    ↓
个人知识图谱（持久化掌握状态）
```

详细说明见 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)。  
**新对话交接**见 [HANDOFF.md](./HANDOFF.md)。

## 目录结构

```
PLA+/
├── docs/                    # 架构与设计文档
├── backend/
│   └── app/
│       ├── api/             # HTTP 路由
│       └── modules/
│           ├── project_parser/      # 项目解析器
│           ├── user_profiling/      # 用户画像 & 学习节点
│           ├── pedagogy/            # 九种教学策略
│           ├── knowledge_graph/     # 项目图谱 + 个人图谱
│           └── implementation/      # 实现方案 & 代码辅助
└── frontend/                # React 前端（待初始化）
```

## 快速启动（后端）

```powershell
cd d:\Docs\ProjectCode\PLA\cursor\PLA+\backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
copy .env.example .env
# 编辑 .env，填入 LLM 配置（可参考 ../backend/.env）
.venv\Scripts\uvicorn app.main:app --reload --port 8001
```

健康检查：http://localhost:8001/health

### 启动（后端 + 前端）

```powershell
# 终端 1 — 后端 8001
cd d:\Docs\ProjectCode\PLA\cursor\PLA+
.\start-backend.bat

# 终端 2 — 前端 5174
.\start-frontend.bat
```

浏览器：http://localhost:5174

## 开发约定

- 新功能在 `PLA+/` 内开发，不直接修改 PLA v1，除非明确迁移。
- 项目解析体系**存后台文件**，不在前端展示完整内容（继承 v1 约定）。
- 模块间通过明确的 service 接口通信，避免跨模块直接读文件。
