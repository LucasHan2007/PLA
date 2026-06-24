import ast
import json
import re
from typing import Any

from app.schemas.ai_output import (
    AIStructuredOutput,
    CodeBlock,
    ExecutionStep,
    FollowUpQuestion,
    LogicPlanItem,
    OperationSubStep,
    TermDefinition,
)


def extract_json_from_text(text: str) -> dict[str, Any] | None:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            return None
    return None


def validate_python_syntax(code: str) -> tuple[bool, str | None]:
    try:
        ast.parse(code)
        return True, None
    except SyntaxError as e:
        return False, f"Line {e.lineno}: {e.msg}"


def extract_functions_and_classes(code: str) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return items
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef):
            items.append({"type": "function", "name": node.name, "line": str(node.lineno)})
        elif isinstance(node, ast.ClassDef):
            items.append({"type": "class", "name": node.name, "line": str(node.lineno)})
    return items


def enrich_code_blocks(blocks: list[CodeBlock]) -> list[CodeBlock]:
    enriched: list[CodeBlock] = []
    for block in blocks:
        valid, err = validate_python_syntax(block.code) if block.language == "python" else (True, None)
        symbols = extract_functions_and_classes(block.code) if block.language == "python" else []
        annotations = list(block.annotations)
        if not valid and err:
            annotations.append({"line": "0", "text": f"语法警告: {err}"})
        for sym in symbols[:5]:
            annotations.append({
                "line": sym["line"],
                "text": f"{sym['type']}: {sym['name']}",
            })
        enriched.append(block.model_copy(update={"annotations": annotations}))
    return enriched


def simplify_option_text(option: str) -> str:
    """Remove parenthetical explanations from choice labels, e.g. 仅手写数字（0-9）→ 仅手写数字."""
    text = re.sub(r"[（(][^）)]*[）)]", "", option.strip())
    return re.sub(r"\s+", " ", text).strip() or option.strip()


def normalize_follow_up_questions(raw: Any) -> list[FollowUpQuestion]:
    if not raw:
        return []
    items: list[FollowUpQuestion] = []
    for item in raw:
        if isinstance(item, str):
            items.append(FollowUpQuestion(question=item, answer_type="text"))
            continue
        if not isinstance(item, dict):
            continue
        question = str(item.get("question", "")).strip()
        if not question:
            continue
        answer_type = item.get("answer_type") or item.get("type") or "text"
        options = [
            simplify_option_text(str(o))
            for o in (item.get("options") or item.get("choices") or [])
            if str(o).strip()
        ]
        # dedupe while preserving order
        seen: set[str] = set()
        unique_options: list[str] = []
        for opt in options:
            if opt and opt not in seen:
                seen.add(opt)
                unique_options.append(opt)
        options = unique_options
        if answer_type == "choice" and len(options) >= 2:
            items.append(FollowUpQuestion(question=question, answer_type="choice", options=options))
        else:
            items.append(FollowUpQuestion(question=question, answer_type="text"))
    return items


def normalize_execution_steps(raw_items: list[Any]) -> list[ExecutionStep]:
    """Parse execution_steps; wrap legacy flat steps as single-sub-step groups."""
    steps: list[ExecutionStep] = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        step = ExecutionStep(**item)
        if not step.sub_steps:
            step = step.model_copy(
                update={
                    "sub_steps": [
                        OperationSubStep(
                            sub_id=1,
                            title=step.title,
                            description=step.description,
                            rationale=step.why or step.description,
                            why=step.why,
                            inputs=step.inputs,
                            outputs=step.outputs,
                            knowledge_points=list(step.knowledge_points),
                            code_module=step.code_module,
                            common_errors=list(step.common_errors),
                            next_hint=step.next_hint,
                        )
                    ]
                }
            )
        steps.append(step)
    return steps


def count_total_sub_steps(steps: list[ExecutionStep]) -> int:
    return sum(len(group.sub_steps) for group in steps)


def get_next_hidden_sub_step(
    steps: list[ExecutionStep], revealed_count: int
) -> tuple[ExecutionStep, OperationSubStep, int, int] | None:
    flat = 0
    for group_index, group in enumerate(steps):
        for sub_index, sub in enumerate(group.sub_steps):
            if flat == revealed_count:
                return group, sub, group_index, sub_index
            flat += 1
    return None


def ensure_follow_up_questions(questions: list[FollowUpQuestion]) -> list[FollowUpQuestion]:
    """Fallback when LLM omits follow_up_questions; at most one question per turn."""
    if questions:
        return questions[:1]
    return [
        FollowUpQuestion(
            question="你的项目主要处理什么类型的输入？",
            answer_type="choice",
            options=["图像/文件", "文本/结构化数据", "用户交互输入", "API/传感器数据", "其他"],
        ),
    ]


def parse_structured_output(raw: dict[str, Any] | None, fallback_text: str = "") -> AIStructuredOutput:
    if not raw:
        return AIStructuredOutput(
            assistant_message=fallback_text or "未能解析结构化输出，请重试。",
            socratic_mode=True,
        )

    logic_plan = [LogicPlanItem(**item) for item in raw.get("logic_plan", [])]
    execution_steps = normalize_execution_steps(raw.get("execution_steps", []))
    code_blocks = enrich_code_blocks([CodeBlock(**item) for item in raw.get("code_blocks", [])])
    terms = [TermDefinition(**item) for item in raw.get("terms", [])]
    raw_questions = (
        raw.get("follow_up_questions")
        or raw.get("followUpQuestions")
        or raw.get("socratic_questions")
        or []
    )
    follow_up_questions = ensure_follow_up_questions(normalize_follow_up_questions(raw_questions))[:1]

    return AIStructuredOutput(
        task_summary=raw.get("task_summary", ""),
        logic_plan=logic_plan,
        execution_steps=execution_steps,
        code_blocks=code_blocks,
        terms=terms,
        follow_up_questions=follow_up_questions,
        socratic_mode=raw.get("socratic_mode", True),
        assistant_message=raw.get("assistant_message", ""),
        analysis_complete=bool(raw.get("analysis_complete", False)),
        operations_complete=bool(raw.get("operations_complete", False)),
    )


def build_mindmap_data(logic_plan: list[LogicPlanItem]) -> dict:
    nodes = [{"id": str(item.id), "label": item.title, "content": item.content} for item in logic_plan]
    edges = [
        {"source": str(logic_plan[i].id), "target": str(logic_plan[i + 1].id)}
        for i in range(len(logic_plan) - 1)
    ]
    return {"nodes": nodes, "edges": edges}


def process_llm_response(raw_text: str) -> tuple[AIStructuredOutput, str | None]:
    parsed = extract_json_from_text(raw_text)
    if parsed:
        output = parse_structured_output(parsed)
        return output, None
    return parse_structured_output(None, raw_text), raw_text
