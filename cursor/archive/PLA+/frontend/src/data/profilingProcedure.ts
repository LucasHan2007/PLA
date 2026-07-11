export type ProcedureStepStatus = 'pending' | 'active' | 'done'

export interface ProcedureStep {
  id: string
  title: string
  description: string
  status: ProcedureStepStatus
}

export const PROFILING_PROCEDURE_META = {
  title: '用户画像规程',
  subtitle: '宏观提问 → Prompt 分析 → 学习节点',
  principle: '输出引导思考，不直接给出任务答案。',
} as const

export const PROFILING_STEP_DEFS = [
  {
    id: 'framework',
    title: '前置：项目解析',
    description: '八段 framework 已存后台，作为画像与学习节点规划的参考上下文。',
  },
  {
    id: 'macro_qa',
    title: '宏观问答',
    description: '依次回答 6 道宏观问题（项目理解、编程背景、领域知识、目标、偏好、顾虑）。',
  },
  {
    id: 'profile',
    title: '生成用户画像',
    description: 'LLM 结合 framework 与你的回答，归纳水平、盲区、偏好与学习目标。',
  },
  {
    id: 'nodes',
    title: '规划学习节点',
    description: '按画像个性化排序能力点；每节点附带 guiding_question 引导独立思考。',
  },
] as const

export function buildProfilingSteps(state: {
  frameworkReady: boolean
  allAnswered: boolean
  profileReady: boolean
  nodesReady: boolean
  answering: boolean
  building: boolean
}): ProcedureStep[] {
  const statuses: Record<string, ProcedureStepStatus> = {
    framework: state.frameworkReady ? 'done' : 'pending',
    macro_qa: 'pending',
    profile: 'pending',
    nodes: 'pending',
  }

  if (state.frameworkReady) {
    if (state.profileReady) {
      statuses.macro_qa = 'done'
      statuses.profile = 'done'
      statuses.nodes = state.nodesReady ? 'done' : 'active'
    } else if (state.building) {
      statuses.macro_qa = 'done'
      statuses.profile = 'active'
    } else if (state.allAnswered) {
      statuses.macro_qa = 'done'
      statuses.profile = 'active'
    } else if (state.answering) {
      statuses.macro_qa = 'active'
    } else {
      statuses.macro_qa = 'active'
    }
  }

  return PROFILING_STEP_DEFS.map((def) => ({
    ...def,
    status: statuses[def.id],
  }))
}
