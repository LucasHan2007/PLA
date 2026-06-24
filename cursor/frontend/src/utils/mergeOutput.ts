import type { AIStructuredOutput } from '../types'

interface MergeOptions {
  /** 项目解析阶段：用最新 logic_plan 覆盖，支持动态增删改 */
  replaceLogicPlan?: boolean
  /** 操作描述阶段：用最新 execution_steps 覆盖 */
  replaceExecutionSteps?: boolean
}

/** Keep the richest structured data across turns while refreshing conversational fields. */
export function mergeOutput(
  prev: AIStructuredOutput | null,
  next: AIStructuredOutput,
  options?: MergeOptions,
): AIStructuredOutput {
  if (!prev) return next

  const pickLonger = <T>(a: T[], b: T[]) => (b.length >= a.length ? b : a)

  const logicPlan =
    options?.replaceLogicPlan && next.logic_plan.length > 0
      ? next.logic_plan
      : pickLonger(prev.logic_plan, next.logic_plan)

  const executionSteps =
    options?.replaceExecutionSteps && next.execution_steps.length > 0
      ? next.execution_steps
      : pickLonger(prev.execution_steps, next.execution_steps)

  return {
    task_summary: next.task_summary || prev.task_summary,
    logic_plan: logicPlan,
    execution_steps: executionSteps,
    code_blocks: pickLonger(prev.code_blocks, next.code_blocks),
    terms: next.terms.length ? next.terms : prev.terms,
    follow_up_questions: next.follow_up_questions,
    socratic_mode: next.socratic_mode,
    assistant_message: next.assistant_message,
    analysis_complete: next.analysis_complete ?? prev.analysis_complete,
    operations_complete: next.operations_complete ?? prev.operations_complete,
  }
}
