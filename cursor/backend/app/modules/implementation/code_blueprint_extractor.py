from app.config import settings
from app.core.json_utils import extract_json_from_text
from app.core.llm_client import llm_client
from app.core.prompt_loader import load_module_prompt
from app.modules.implementation.code_blueprint_store import (
    has_blueprint,
    load_blueprint,
    save_blueprint,
)
from app.modules.implementation.schema import (
    CodeBlueprint,
    CodeNode,
    CodeSegment,
    CodeSegmentType,
)

_SYSTEM = load_module_prompt("implementation", "code_blueprint_system.md")


def _parse_blueprint(raw: dict, session_id: str, project_name: str) -> CodeBlueprint:
    language = str(raw.get("language") or "python")
    nodes: list[CodeNode] = []
    for i, item in enumerate(raw.get("code_nodes") or []):
        if not isinstance(item, dict):
            continue
        segs: list[CodeSegment] = []
        for s in item.get("segments") or []:
            if not isinstance(s, dict):
                continue
            st = s.get("type", "prose")
            if st not in ("prose", "code"):
                st = "prose"
            content = str(s.get("content") or "").strip()
            if not content:
                continue
            segs.append(
                CodeSegment(
                    type=CodeSegmentType(st),
                    content=content,
                    language=str(s.get("language") or language),
                    label=str(s.get("label") or ("模板" if st == "code" else "")),
                )
            )
        if not segs:
            continue
        nodes.append(
            CodeNode(
                id=str(item.get("id") or f"code_node_{i+1}"),
                order=int(item.get("order") or i + 1),
                title=str(item.get("title") or f"代码节点 {i+1}"),
                related_sections=[str(x) for x in (item.get("related_sections") or [])],
                related_learning_node_ids=[
                    str(x) for x in (item.get("related_learning_node_ids") or [])
                ],
                segments=segs,
            )
        )
    nodes.sort(key=lambda n: n.order)
    return CodeBlueprint(
        session_id=session_id,
        project_name=project_name,
        summary=str(raw.get("summary") or ""),
        language=language,
        code_nodes=nodes,
    )


def build_demo_blueprint(session_id: str, project_name: str) -> CodeBlueprint:
    """离线演示：MNIST 风格代码节点 + 穿插伪代码。"""
    return CodeBlueprint(
        session_id=session_id,
        project_name=project_name,
        summary="离线演示蓝图：数据加载 → 预处理 → 划分 → 训练 → 评估（配置 LLM 后按解析动态生成）。",
        language="python",
        code_nodes=[
            CodeNode(
                id="load_data",
                order=1,
                title="加载数据",
                related_sections=["data_flow", "task_decomposition"],
                segments=[
                    CodeSegment(
                        type=CodeSegmentType.prose,
                        content="先把数据集读入内存。对分类项目，通常得到特征矩阵 X 与标签 y；加载后立刻检查形状，确认样本数与特征维度符合预期。",
                    ),
                    CodeSegment(
                        type=CodeSegmentType.code,
                        language="python",
                        label="模板",
                        content=(
                            "from sklearn.datasets import fetch_openml\n\n"
                            "# TODO: 按项目替换数据源\n"
                            "X, y = fetch_openml('mnist_784', version=1, return_X_y=True, as_frame=False)\n"
                            "print(X.shape, y.shape)  # 期望约 (70000, 784)"
                        ),
                    ),
                ],
            ),
            CodeNode(
                id="preprocess",
                order=2,
                title="预处理与归一化",
                related_sections=["data_flow", "knowledge_skills"],
                segments=[
                    CodeSegment(
                        type=CodeSegmentType.prose,
                        content="像素值或数值特征通常需要缩放到相近量级，便于距离类算法或神经网络收敛。可用简单除法或 StandardScaler。",
                    ),
                    CodeSegment(
                        type=CodeSegmentType.code,
                        language="python",
                        label="伪代码",
                        content=(
                            "# 将特征缩放到 [0, 1]\n"
                            "X = X.astype('float32') / 255.0\n"
                            "# TODO: 如需类别编码，处理 y 的类型"
                        ),
                    ),
                ],
            ),
            CodeNode(
                id="split",
                order=3,
                title="划分训练/测试集",
                related_sections=["data_flow", "task_decomposition"],
                segments=[
                    CodeSegment(
                        type=CodeSegmentType.prose,
                        content="用固定随机种子划分，保证实验可复现。常见比例为 8:2 或官方建议的前 N 条作训练。",
                    ),
                    CodeSegment(
                        type=CodeSegmentType.code,
                        language="python",
                        label="模板",
                        content=(
                            "from sklearn.model_selection import train_test_split\n\n"
                            "X_train, X_test, y_train, y_test = train_test_split(\n"
                            "    X, y, test_size=0.2, random_state=42\n"
                            ")"
                        ),
                    ),
                ],
            ),
            CodeNode(
                id="train",
                order=4,
                title="训练分类模型",
                related_sections=["implementation_plan", "knowledge_skills"],
                segments=[
                    CodeSegment(
                        type=CodeSegmentType.prose,
                        content="选择 baseline（如 KNN 或 MLPClassifier），在训练集上 fit。先跑通，再谈调参。",
                    ),
                    CodeSegment(
                        type=CodeSegmentType.code,
                        language="python",
                        label="模板",
                        content=(
                            "from sklearn.neighbors import KNeighborsClassifier\n\n"
                            "clf = KNeighborsClassifier(n_neighbors=3)\n"
                            "clf.fit(X_train, y_train)\n"
                            "# TODO: 也可尝试 MLPClassifier"
                        ),
                    ),
                ],
            ),
            CodeNode(
                id="evaluate",
                order=5,
                title="评估与简单调参",
                related_sections=["run_verify_debug", "iterative_optimization"],
                segments=[
                    CodeSegment(
                        type=CodeSegmentType.prose,
                        content="在测试集上计算准确率，观察误差来源。再小范围调整关键超参（如 K 值），避免一次改太多。",
                    ),
                    CodeSegment(
                        type=CodeSegmentType.code,
                        language="python",
                        label="伪代码",
                        content=(
                            "from sklearn.metrics import accuracy_score\n\n"
                            "y_pred = clf.predict(X_test)\n"
                            "print('acc =', accuracy_score(y_test, y_pred))\n"
                            "# TODO: 尝试不同 n_neighbors 并记录结果"
                        ),
                    ),
                ],
            ),
        ],
    )


class CodeBlueprintExtractor:
    async def build_after_parse(
        self,
        session_id: str,
        framework,  # ProjectFramework — 避免循环 import
        framework_context: str | None = None,
        *,
        force_regenerate: bool = False,
    ) -> CodeBlueprint:
        from app.modules.project_parser.prompts import format_framework_context

        if not force_regenerate and has_blueprint(session_id):
            existing = load_blueprint(session_id)
            if existing is not None and existing.code_nodes:
                return existing

        ctx = framework_context or format_framework_context(framework.model_dump())
        if not settings.llm_configured:
            bp = build_demo_blueprint(session_id, framework.project_name)
            save_blueprint(bp)
            return bp

        messages = [
            {"role": "system", "content": _SYSTEM},
            {
                "role": "user",
                "content": (
                    f"【项目】{framework.project_name}\n\n{ctx}\n\n"
                    "请抽取代码蓝图 JSON（自然语言节点中穿插代码模板/伪代码）。"
                ),
            },
        ]
        raw_text = await llm_client.chat_plain(messages, temperature=0.35, timeout=180.0)
        parsed = extract_json_from_text(raw_text)
        if not isinstance(parsed, dict):
            raise RuntimeError("代码蓝图返回非 JSON 对象")
        bp = _parse_blueprint(parsed, session_id, framework.project_name)
        if not bp.code_nodes:
            bp = build_demo_blueprint(session_id, framework.project_name)
        save_blueprint(bp)
        return bp

    async def build_from_session(
        self,
        session_id: str,
        *,
        force_regenerate: bool = False,
    ) -> CodeBlueprint:
        from app.modules.project_parser.prompts import format_framework_context
        from app.modules.project_parser.store import load_framework

        if not force_regenerate and has_blueprint(session_id):
            existing = load_blueprint(session_id)
            if existing is not None and existing.code_nodes:
                return existing

        doc = load_framework(session_id)
        if not doc:
            raise ValueError("请先生成并保存项目解析参考文件")
        return await self.build_after_parse(
            session_id,
            doc,
            format_framework_context(doc.model_dump()),
            force_regenerate=force_regenerate,
        )


code_blueprint_extractor = CodeBlueprintExtractor()
