export interface PedagogyStrategyInfo {
  id: string
  label: string
  english: string
  purpose: string
  triggers: string[]
}

export const PEDAGOGY_PROCEDURE_META = {
  title: '教学策略规程',
  subtitle: '上下文加载 → 策略选用 → 策略化回答',
  principle: '按场景选用九种教学动作之一，结合画像与当前学习节点个性化答疑。',
} as const

export const PEDAGOGY_STEP_DEFS = [
  {
    id: 'context',
    title: '加载上下文',
    description: '读取后台八段 framework、用户画像、当前 in_progress 学习节点。',
  },
  {
    id: 'select',
    title: '选用策略',
    description: '分析用户问题关键词；初学者开放性问题倾向 Ask，默认 Explain。',
  },
  {
    id: 'respond',
    title: '策略化回答',
    description: '将策略指令写入 system prompt，按 Explain / Hint / Ground 等风格生成回复。',
  },
  {
    id: 'annotate',
    title: '标注返回',
    description: '响应附带 strategy_label 与 learning_node_title，前端显式展示所用策略。',
  },
] as const

export const PEDAGOGY_STRATEGIES: PedagogyStrategyInfo[] = [
  {
    id: 'explain',
    label: '解释',
    english: 'Explain',
    purpose: '定义概念，先结论后展开',
    triggers: ['什么是', '解释', '定义', '什么意思'],
  },
  {
    id: 'ground',
    label: '落地',
    english: 'Ground',
    purpose: '绑定当前项目的具体场景与模块',
    triggers: ['在这个项目', '本项目', '结合项目'],
  },
  {
    id: 'demonstrate',
    label: '演示',
    english: 'Demonstrate',
    purpose: '给出最小可理解示例',
    triggers: ['举个例子', '示例', '演示一下'],
  },
  {
    id: 'ask',
    label: '提问',
    english: 'Ask',
    purpose: '引导性问题促思考，非直接给答案',
    triggers: ['你觉得', '你怎么看', '（初学者短问句）'],
  },
  {
    id: 'hint',
    label: '提示',
    english: 'Hint',
    purpose: '分层线索，不一次性给完整解法',
    triggers: ['提示', '卡住了', '没思路', '给点线索'],
  },
  {
    id: 'challenge',
    label: '挑战',
    english: 'Challenge',
    purpose: '预测、修改或设计类邀请',
    triggers: ['如果我', '假设', '预测', '试着改'],
  },
  {
    id: 'verify',
    label: '验证',
    english: 'Verify',
    purpose: '帮助自检理解或方案',
    triggers: ['对不对', '检查一下', '验证', '正确吗'],
  },
  {
    id: 'reflect',
    label: '反思',
    english: 'Reflect',
    purpose: '总结因果链与设计取舍',
    triggers: ['为什么', '怎么理解', '本质', '原因'],
  },
  {
    id: 'advance',
    label: '推进',
    english: 'Advance',
    purpose: '肯定进展并指出下一学习节点',
    triggers: ['下一步', '接下来', '然后呢', '推进'],
  },
]

export type PedagogyStepStatus = 'pending' | 'active' | 'done'

export interface PedagogyProcedureStep {
  id: string
  title: string
  description: string
  status: PedagogyStepStatus
}

export function buildPedagogySteps(state: {
  enabled: boolean
  loading: boolean
  lastStrategyId?: string | null
}): PedagogyProcedureStep[] {
  if (!state.enabled) {
    return PEDAGOGY_STEP_DEFS.map((def) => ({ ...def, status: 'pending' as const }))
  }

  const statuses: Record<string, PedagogyStepStatus> = {
    context: 'done',
    select: state.loading ? 'active' : state.lastStrategyId ? 'done' : 'active',
    respond: state.loading ? 'active' : state.lastStrategyId ? 'done' : 'pending',
    annotate: state.lastStrategyId && !state.loading ? 'done' : 'pending',
  }

  return PEDAGOGY_STEP_DEFS.map((def) => ({
    ...def,
    status: statuses[def.id],
  }))
}
