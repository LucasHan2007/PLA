# PLA — Programming Learning Assistant

项目制学习编排：**四页流程** — 选项目 → 引导思考 → 学习节点 → 代码生成。

## 主链路

```
页面1：项目列表 + 项目名称/项目描述
  → 自动八段解析 + 基础知识图谱
页面2：引导问答（意图识别）+ 对话式答疑
  → 用户画像 + 学习节点
页面3：节点整理内容 + 对话式
页面4：左节点 | 中伪代码方案 | 右代码生成 + 对话式
```

> 页面1 线框中的「对话框」即 **项目名称** 与 **项目描述** 输入区。

**端口**：前端 **5173** · 后端 **8000**  
历史 PLA+：[`archive/PLA+/`](archive/PLA+/)

## 快速开始

```powershell
cd d:\Docs\ProjectCode\PLA\cursor
.\start-backend.bat
.\start-frontend.bat
```

浏览器：http://localhost:5173 · 健康检查：http://localhost:8000/health

## 配置 LLM

`backend/.env`（参考 `.env.example`）：

```env
LLM_API_BASE=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_API_KEY=your-api-key-here
LLM_MODEL=qwen-flash
```

详情见 [`HANDOFF.md`](HANDOFF.md)。
