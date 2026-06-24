# workspace — VS Code 式 IDE 新版

本目录为 **独立新版**，外层 `ai_new_branch_newest_one/` 根目录文件不做修改。

## 启动新版

```powershell
cd workspace
streamlit run navigator.py
```

## 启动旧版（外层）

```powershell
cd ..
streamlit run navigator.py
```

## 目录说明

| 路径 | 说明 |
|------|------|
| `navigator.py` | 新版入口 |
| `pages/page1.py` | 简洁聊天模式 |
| `pages/ide.py` | IDE 主界面（Phase 1 起） |
| `static/editor/` | Monaco 代码编辑器 |
| `code_bridge.py` | Streamlit ↔ Monaco 桥接 |

## 开发阶段

- Phase 0：复制核心文件，验证聊天可用
- Phase 1：Monaco + `pages/ide.py`
- Phase 2：VS Code 侧边栏
- Phase 3：语法诊断
- Phase 4：AI 读写代码
