"""Enforce phase boundaries on structured AI output."""

from app.schemas.ai_output import AIStructuredOutput


def sanitize_output_for_phase(output: AIStructuredOutput, workflow_phase: str) -> AIStructuredOutput:
    """Strip fields that must not appear in the current learning phase."""
    updates: dict = {}

    if workflow_phase in ("intro", "project_analysis"):
        updates["code_blocks"] = []
        if not output.analysis_complete:
            updates["execution_steps"] = []
            updates["operations_complete"] = False
    elif workflow_phase == "operation_desc":
        updates["code_blocks"] = []
    # code_design: no stripping

    if workflow_phase != "operation_desc":
        updates["operations_complete"] = False

    if not updates:
        return output
    return output.model_copy(update=updates)
