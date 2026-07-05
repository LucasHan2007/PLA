# LearnScaffold 知识图谱增强技术方案

> 基于代码审计（`app_server.py`、`app.js`、`project_graph.json`、`PLA.md`、`LearnScaffold.drawio`）及用户访谈生成。  
> 生成时间：2025-07-03  
> 结论前置：**不需要 GraphRAG，不需要 Vue**。在现有 Vanilla JS + JSON 图谱基础上增强 `edges` 关系网络，并引入 D3.js/Cytoscape.js 做交互式可视化即可。

---

## 1. 执行摘要

| 问题 | 结论 |
|---|---|
| 是否引入 GraphRAG？ | **否**。GraphRAG 是面向海量文档的实体抽取+检索引擎，与当前"学习者轨迹/状态图"的数据模型、使用场景均不匹配。 |
| 是否引入 Vue？ | **现阶段不需要**。当前前端仅约 800 行 Vanilla JS，新增一个可视化面板用原生 JS + D3.js 足够；若后续前端规模超过 3000 行或需复杂状态管理，再评估 Vue。 |
| 推荐方案 | **方案 B：原生增强**——保持现有 Python HTTP 后端 + Vanilla JS 前端，增强图谱数据结构，新增独立可视化面板。 |
| 预期工作量 | 1～2 人日（MVP 可视化面板）+ 2～3 人日（关系推导与交互优化）。 |

---

## 2. 现状诊断

### 2.1 技术栈现状（已去 Streamlit）

```
后端：Python 3.x + http.server.ThreadingHTTPServer（无框架）
前端：Vanilla JS + CSS + HTML（无框架，约 800 行 app.js）
存储：SQLite（用户/会话）+ JSON 文件（工作区、图谱）
编辑器：Monaco Editor（CDN）
```

### 2.2 知识图谱数据结构（project_graph.json）

```json
{
  "project_profile": {},        // 项目画像（当前为空）
  "pcg": {                      // Project Capability Graph（项目能力图）
    "nodes": [],                // 能力节点列表
    "edges": []                 // 能力节点关系（当前为空数组！）
  },
  "lkg": [                      // Learner Knowledge Graph（学习者知识图）
    {
      "name": "语义分割",
      "description": "给图像每个像素分类的任务...",
      "weight": 0.0,            // 掌握程度（0~1）
      "evidence": "用户询问...",
      "related_to": ["U-Net", "数据格式"],
      "next_recommendation": "..."
    }
  ],
  "latest": { ... }             // 最近学习状态快照
}
```

### 2.3 知识点记录链路

```
用户对话 → LLM 输出 JSON（含 knowledge_nodes）
            ↓
    parse_ai_reply() 提取 knowledge_nodes
            ↓
    update_scaffold_state() 合并入 lkg 数组
            ↓
    graph_context() 收集所有对话节点的 knowledge_points
            ↓
    作为 system prompt 上下文喂给下一轮 LLM
```

**问题发现**：
- `pcg.edges` 始终为空数组，项目能力图只有孤立的节点，没有结构关系。
- `lkg` 是扁平数组，知识点之间只有 `related_to`（字符串名数组），没有正式的图结构（无 edge ID、无权重、无类型）。
- 前端 `renderScaffold()` 仅以文本列表展示，无图可视化。

### 2.4 目标解析文件（project_plan.md）

- 由 LLM 在"LearnScaffold 项目规划"模式下生成。
- 纯 Markdown 格式，存储在 `learn_scaffold_state/project_plan.md`。
- 当前被读取后作为 system prompt 的一部分注入 LLM，供其"内部参考"。
- **可作为能力图谱（PCG）的文本载体**，但缺少结构化提取。

---

## 3. 技术评估：GraphRAG

### 3.1 GraphRAG 是什么

GraphRAG（Microsoft 开源）是一种**面向文档集合的检索增强生成技术**：
1. **索引阶段**：将大量文档分块 → LLM 抽取实体和关系 → 构建知识图谱 → 检测社区 → 生成社区摘要报告。
2. **查询阶段**：支持**全局查询**（跨文档摘要）和**局部查询**（实体级检索）。

### 3.2 为什么不适合 LearnScaffold

| 维度 | GraphRAG | LearnScaffold 的需求 |
|---|---|---|
| **输入数据** | 海量非结构化文档（PDF、网页、论文） | 结构化/半结构化数据：LLM 输出的 JSON 知识点、用户对话、项目规划 Markdown |
| **图谱语义** | 实体-关系-社区（如"CNN → 应用于 → 图像分类"） | 学习者掌握状态图（如"用户已理解 U-Net → 下一步应学 Dice Loss"） |
| **核心能力** | 从文档中自动发现未知关联 | 根据已知教学体系引导学习路径 |
| **数据量要求** | 需要大量文档才能体现优势 | 当前仅几十个知识点，后期即使有教材也属轻量 |
| **运维成本** | 需构建索引管道、存储向量+图、定期更新 | 仅需读写 JSON 文件 |
| **与现有架构匹配度** | 低。需引入 Neo4j/NetworkX、向量数据库、额外的索引服务 | 现有 JSON 文件即可表达，零额外依赖 |

### 3.3 如果未来需要外部文档检索

若后期确实需要让学生上传教材/论文并做知识检索：
- **轻量方案**：ChromaDB / FAISS + 简单 Embedding RAG（足以应对百级文档）
- **重量方案**：GraphRAG（仅当文档规模达千级以上且需跨文档全局摘要时才考虑）

**结论**：当前阶段以及可预见的短期未来，GraphRAG 都是过度设计。

---

## 4. 技术评估：Vue

### 4.1 当前前端复杂度

- `app.js`：约 800 行，涵盖登录、工作区管理、对话渲染、代码编辑器集成、文件上传、SSE 流式处理。
- `index.html`：120 行，三栏布局（侧边栏 / 编辑器 / 对话）。
- 状态管理：全局 `state` 对象，手动触发 `renderAll()`。

### 4.2 引入 Vue 的收益与成本

| 方面 | 收益 | 成本 |
|---|---|---|
| **组件化** | 图谱面板、对话区、编辑器可拆分为独立组件 | 需搭建 Vite 构建流程，与现有无构建体系冲突 |
| **状态管理** | Pinia 可规范状态流 | 当前状态并不复杂，全局对象足够 |
| **响应式** | 自动更新 DOM | 当前手动 `renderAll()` 已工作良好 |
| **生态** | D3/Vue 绑定库、UI 组件库 | 当前仅需一个 D3.js 即可画图 |
| **学习成本** | — | 团队成员需熟悉 Vue 生态 |

### 4.3 决策矩阵

| 场景 | 建议 |
|---|---|
| 仅新增一个"知识图谱可视化"面板 | **不需要 Vue**，Vanilla JS + D3.js 足够，预计新增 300～500 行 JS |
| 重构整个前端为多模块 SPA | 可以考虑 Vue，但建议与后端迁移到 FastAPI 同步进行 |
| 前端代码规模 > 3000 行 | 评估引入 Vue 或 React |

**结论**：现阶段保持 Vanilla JS，在 `index.html` 中新增一个图谱面板（Tab 或弹窗），使用 D3.js 或 Cytoscape.js 渲染即可。

---

## 5. 推荐方案：原生增强（方案 B）

### 5.1 核心思路

不引入新框架、不引入新数据库，在现有 JSON 文件 + Vanilla JS 架构上：
1. **增强数据结构**：为 `lkg` 和 `pcg` 建立正式的图结构（nodes + typed edges）。
2. **关系自动推导**：由 LLM 在输出知识点时同时输出知识点间的关联关系（prerequisite、related、next、belongs_to）。
3. **可视化面板**：前端新增"知识图谱"标签页，用 D3.js 渲染力导向图。
4. **交互功能**：点击节点查看详情、高亮关联路径、筛选已掌握/未掌握节点。

### 5.2 数据结构调整

#### 5.2.1 增强 project_graph.json

```json
{
  "project_profile": {
    "goal": "手写数字识别",
    "domain": "计算机视觉 / 图像分类",
    "difficulty": "初级",
    "prerequisites": ["Python 基础", "NumPy"]
  },
  "pcg": {
    "nodes": [
      { "id": "task-def", "name": "任务定义", "type": "phase", "order": 1 },
      { "id": "data-prep", "name": "数据预处理", "type": "phase", "order": 2 },
      { "id": "model-build", "name": "模型构建", "type": "phase", "order": 3 }
    ],
    "edges": [
      { "source": "task-def", "target": "data-prep", "type": "precedes" },
      { "source": "data-prep", "target": "model-build", "type": "precedes" }
    ]
  },
  "lkg": {
    "nodes": [
      {
        "id": "kp-001",
        "name": "CNN",
        "description": "卷积神经网络...",
        "type": "concept",
        "weight": 0.7,
        "status": "learning",
        "evidence": "用户询问 CNN 结构"
      }
    ],
    "edges": [
      { "source": "kp-001", "target": "kp-002", "type": "prerequisite", "strength": 0.9 }
    ]
  },
  "latest": { ... }
}
```

#### 5.2.2 LLM 输出格式调整

当前 `parse_ai_reply()` 已支持提取 `knowledge_nodes`。扩展为：

```json
{
  "reply": "...",
  "knowledge_nodes": [
    {
      "name": "CrossEntropyLoss",
      "description": "分类任务常用损失函数",
      "type": "concept"
    }
  ],
  "knowledge_edges": [
    {
      "source": "CNN",
      "target": "CrossEntropyLoss",
      "type": "used_in",
      "description": "CNN 分类器通常使用交叉熵损失"
    }
  ],
  "lkg_updates": [ ... ]
}
```

### 5.3 前端可视化设计

#### 5.3.1 界面位置

在现有侧边栏新增第四个 Tab：

```
[Explorer] [Project] [Knowledge Graph] [Settings]
```

或放在 `Project` 面板下方作为一个独立区块。

#### 5.3.2 可视化库选择

| 库 | 优点 | 缺点 | 推荐度 |
|---|---|---|---|
| **D3.js** | 极度灵活、力导向图成熟、社区庞大 | 学习曲线陡、需手写较多代码 | ⭐⭐⭐⭐ |
| **Cytoscape.js** | 专为图可视化设计、API 简洁、性能优 | 定制性略低于 D3 | ⭐⭐⭐⭐⭐ |
| **vis-network** | 开箱即用、美观 | 项目维护活跃度下降 | ⭐⭐⭐ |

**推荐 Cytoscape.js**：专为网络图设计，API 更简洁，与当前"图"的语义天然匹配。

#### 5.3.3 可视化要素

- **节点**：
  - 颜色：按 `type` 区分（概念=蓝、技能=绿、工具=橙）
  - 大小：按 `weight`（掌握程度）缩放
  - 边框：已掌握 = 实线，学习中 = 虚线，未开始 = 灰色
- **边**：
  - 线型：`prerequisite` = 实线箭头，`related` = 虚线，`next` = 点线
  - 颜色：按 `strength` 渐变
- **交互**：
  - 点击节点：右侧面板显示详情（description、evidence、关联知识点）
  - 悬停节点：高亮其一跳邻居
  - 双击节点：以该知识点创建对话分支
  - 拖拽：手动调整布局
  - 缩放/平移：浏览大图

### 5.4 后端调整（最小化）

`app_server.py` 中：

1. `update_scaffold_state()`：
   - 解析 `knowledge_edges` 并合并到 `lkg.edges`
   - 为每个新节点自动生成 `id`（如 `kp-{hash}`）
   - 去重：基于 `source+target+type` 去重

2. 新增 API（可选）：
   - `GET /api/graph`：返回完整图谱数据（供前端可视化直接使用）
   - `POST /api/graph/node`：手动添加/编辑节点
   - `POST /api/graph/edge`：手动添加/编辑关系

### 5.5 与 drawio 流程的对齐

```
项目解析器生成 project_plan.md ──→ 结构化提取为 pcg.nodes + pcg.edges
            ↓
用户对话中 LLM 提取 knowledge_nodes ──→ 沉淀为 lkg.nodes
            ↓
LLM 推导知识点关系 knowledge_edges ──→ 沉淀为 lkg.edges
            ↓
    前端 Cytoscape.js 渲染交互式网络图
            ↓
    用户点击节点 → 创建分支 / 查看详情 / 标记掌握度
```

---

## 6. 实施路线图

### Stage 1：数据结构增强（0.5 天）

- [ ] 修改 `update_scaffold_state()` 支持 `knowledge_edges` 解析与合并
- [ ] 为 `lkg` 引入正式的 `nodes` + `edges` 结构（与现有扁平数组兼容迁移）
- [ ] 更新 `parse_ai_reply()` 提取 `knowledge_edges`
- [ ] 更新 prompt（`promt_list.py`），指示 LLM 在输出知识点时同时输出关系

### Stage 2：可视化面板 MVP（1 天）

- [ ] 引入 Cytoscape.js CDN
- [ ] 在 `index.html` 新增 Knowledge Graph 面板（或 Project 子面板）
- [ ] 实现基础力导向图渲染（节点+边）
- [ ] 节点样式：按 type/weight/status 着色、定大小
- [ ] 边样式：按 type 定线型

### Stage 3：交互功能（0.5～1 天）

- [ ] 点击节点显示详情面板（name, description, weight, evidence）
- [ ] 悬停高亮邻居
- [ ] 双击节点触发 `createBranch()`
- [ ] 图谱缩放/平移/布局切换（力导向 / 层次布局）

### Stage 4：关系推导优化（1～2 天）

- [ ] 优化 prompt，让 LLM 更准确地推导知识点关系
- [ ] 增加关系类型枚举：prerequisite、related、used_in、leads_to、belongs_to
- [ ] 后端增加简单规则引擎：如"如果 A 是 B 的 prerequisite 且 B weight > 0.8，则 A 自动标记为掌握"

### Stage 5：项目能力图可视化（0.5 天）

- [ ] 将 `pcg` 也接入同一可视化组件
- [ ] 支持切换视图："学习者知识图" / "项目能力图"

---

## 7. 替代方案速览

| 方案 | 描述 | 工作量 | 适用条件 |
|---|---|---|---|
| **A. 最小改动** | 不改数据结构，仅在前端用 Cytoscape.js 可视化现有 `lkg` 列表（按 `related_to` 隐式建边） | 0.5 天 | 快速验证可视化效果，但不解决 edges 缺失问题 |
| **B. 原生增强（推荐）** | 增强 JSON 结构 + LLM 关系输出 + Cytoscape.js 可视化 | 2～3 天 | 当前最优平衡 |
| **C. 引入 Vue** | 前端重构为 Vue 3 + Vite，图谱作为 Vue 组件 | 3～5 天 | 计划大规模前端重构时采用 |
| **D. 引入 GraphRAG** | 接入 Microsoft GraphRAG 做文档级知识检索 | 5～10 天 | 有海量教材文档且需全局摘要时 |

---

## 8. 风险与注意事项

1. **LLM 关系抽取质量**：LLM 可能输出不准确的知识点关系。建议：
   - 限定 `type` 枚举值，减少幻觉
   - 后端做简单的冲突检测（如 A→B prerequisite 与 B→A prerequisite 同时存在时告警）

2. **图谱规模**：当前知识点数量少（20～50 个），Cytoscape.js 性能无忧。若未来超过 500 个节点，需考虑：
   - 分层渲染（只显示当前项目相关的子图）
   - 或切换到更高效的渲染方案（WebGL-based，如 `cosmograph`）

3. **数据迁移**：若从扁平 `lkg` 数组迁移到 `nodes + edges` 结构，需写一次性迁移脚本，将 `related_to` 隐式转换为显式 edges。

4. **向后兼容**：`app_server.py` 中的 `read_json_file` 和 `update_scaffold_state` 需要兼容旧格式数据，避免已有用户的图谱损坏。

---

## 9. 下一步行动

1. **确认本方案**：用户确认采用"方案 B：原生增强"。
2. **细化 Stage 1**：提供 `update_scaffold_state()` 和 `parse_ai_reply()` 的具体代码修改 diff。
3. **提供 prompt 模板**：提供让 LLM 输出 `knowledge_edges` 的 prompt 示例。
4. **实现可视化原型**：提供 `index.html` + `app.js` 中新增 Cytoscape.js 面板的代码。

---

*本计划由 Orchestrator 基于代码审计与用户访谈生成，所有技术判断均可在 `app_server.py:394-441`、`app.js:277-306`、`project_graph.json` 及 `LearnScaffold.drawio` 中溯源验证。*
