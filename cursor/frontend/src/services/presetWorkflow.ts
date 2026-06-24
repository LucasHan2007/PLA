import type { PresetProject } from '../data/mnistDigitProject'
import type { AnalysisStepTask } from '../types/analysisTask'
import type { FollowUpQuestion, WorkflowPhase } from '../types'
import { countTotalSubSteps } from '../utils/operationSteps'

export function getCurrentAnalysisTask(
  project: PresetProject,
  revealedPlanCount: number,
): AnalysisStepTask | null {
  if (revealedPlanCount <= 0) return null
  return project.analysisTasks[revealedPlanCount - 1] ?? null
}

export function advanceAnalysisNextStep(
  revealedPlanCount: number,
  planTotal: number,
): { revealedPlanCount: number; enterOperationDesc: boolean } {
  if (revealedPlanCount < planTotal) {
    return { revealedPlanCount: revealedPlanCount + 1, enterOperationDesc: false }
  }
  return { revealedPlanCount, enterOperationDesc: true }
}

export function presetAnalysisIntroMessage(_project: PresetProject): string {
  return (
    '1. 阅读左侧「本步解析」与「本步任务」，并按「本步任务」完成手写数字识别项目在本步的待办工作。\n' +
    '2. 有疑问在此提问。\n' +
    '3. 完成后点击「下一步」。'
  )
}

export function presetAnalysisStepMessage(
  stepIndex: number,
  planTitle: string,
  planTotal: number,
): string {
  if (stepIndex >= planTotal) {
    return '全部解析步骤已完成。点击「进入操作描述」继续学习。'
  }
  return `已进入第 ${stepIndex} 步「${planTitle}」。`
}

export function getPresetAnalysisQuestion(
  project: PresetProject,
  revealedPlanCount: number,
): FollowUpQuestion[] {
  const total = project.output.logic_plan.length
  if (revealedPlanCount < total) {
    const q = project.analysisStepQuestions[revealedPlanCount - 1]
    return q ? [q] : []
  }
  if (revealedPlanCount >= total) {
    return [project.analysisCompleteQuestion]
  }
  return []
}

export function getPresetOperationQuestion(
  project: PresetProject,
  revealedSubStepCount: number,
): FollowUpQuestion[] {
  const total = countTotalSubSteps(project.output.execution_steps)
  if (revealedSubStepCount < total) {
    const q = project.operationStepQuestions[revealedSubStepCount]
    return q ? [q] : []
  }
  if (revealedSubStepCount >= total) {
    return [project.operationCompleteQuestion]
  }
  return []
}

export function getPresetCodeQuestion(
  project: PresetProject,
  revealedCodeCount: number,
): FollowUpQuestion[] {
  const total = project.output.code_blocks.length
  if (revealedCodeCount < total) {
    const q = project.codeStepQuestions[revealedCodeCount]
    return q ? [q] : []
  }
  return []
}

export function presetAssistantAfterAnalysisStep(
  revealedPlanCount: number,
  total: number,
): string {
  if (revealedPlanCount >= total) {
    return '全部项目解析项已揭示。请点击「进入操作描述」继续。'
  }
  return `已展示 ${revealedPlanCount}/${total} 项解析。请阅读当前任务，完成后点击「下一步」。`
}

export function presetOperationIntroMessage(project: PresetProject): string {
  const firstGroup = project.output.execution_steps[0]
  return (
    `项目解析已完成。进入操作描述阶段。` +
    `第一个操作大步骤是「${firstGroup?.title ?? ''}」。` +
    `请先回答下方引导性问题，思考通过后才会逐步展示各小步骤的具体操作。`
  )
}

export function presetCodeIntroMessage(project: PresetProject): string {
  return (
    `操作描述已完成。进入代码设计阶段。` +
    `共 ${project.output.code_blocks.length} 个代码模块，将按引导性提问逐步揭示。`
  )
}

export function presetAssistantAfterOperationStep(
  revealed: number,
  total: number,
): string {
  if (revealed >= total) {
    return '全部操作小步骤已揭示。请确认是否进入代码设计阶段。'
  }
  return `很好，已展示 ${revealed}/${total} 个小步骤。请继续思考并回答下方问题。`
}

export function presetAssistantAfterCodeStep(revealed: number, total: number): string {
  if (revealed >= total) {
    return '全部代码模块已揭示。你可以阅读、修改代码并尝试运行。'
  }
  return `很好，已展示 ${revealed}/${total} 个代码模块。请继续回答下方问题。`
}

export function isPresetConfirmAnswer(answer: string, confirmPhrases: string[]): boolean {
  const normalized = answer.trim()
  if (normalized === '[跳过]') return true
  return confirmPhrases.some((p) => normalized.includes(p))
}

export function advancePresetPhase(
  phase: WorkflowPhase,
  revealedPlanCount: number,
  revealedSubStepCount: number,
  revealedCodeCount: number,
  project: PresetProject,
  hadSocratic: boolean,
  socraticAnswer: string,
): {
  phase: WorkflowPhase
  revealedPlanCount: number
  revealedSubStepCount: number
  revealedCodeCount: number
} {
  const planTotal = project.output.logic_plan.length
  const opTotal = countTotalSubSteps(project.output.execution_steps)
  const codeTotal = project.output.code_blocks.length

  let nextPhase = phase
  let nextPlan = revealedPlanCount
  let nextOp = revealedSubStepCount
  let nextCode = revealedCodeCount

  if (phase === 'project_analysis') {
    // 项目解析阶段通过「下一步」按钮推进，不在此处理
  } else if (phase === 'operation_desc' && hadSocratic) {
    if (nextOp < opTotal) {
      nextOp += 1
    } else if (
      isPresetConfirmAnswer(socraticAnswer, ['确认', '进入代码设计'])
    ) {
      nextPhase = 'code_design'
      nextCode = 0
    }
  } else if (phase === 'code_design' && hadSocratic && nextCode < codeTotal) {
    nextCode += 1
  }

  return {
    phase: nextPhase,
    revealedPlanCount: nextPlan,
    revealedSubStepCount: nextOp,
    revealedCodeCount: nextCode,
  }
}
