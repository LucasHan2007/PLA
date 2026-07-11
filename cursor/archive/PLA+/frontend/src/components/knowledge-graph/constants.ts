export const CATEGORY_LABELS: Record<string, string> = {
  concept: '概念',
  skill: '技能',
  tool: '工具',
  practice: '实践',
}

/** 圆形节点填充色（参考经典知识图谱配色） */
export const CATEGORY_FILL: Record<string, string> = {
  concept: '#3b82f6',
  skill: '#a855f7',
  tool: '#f59e0b',
  practice: '#f97316',
}

export const CATEGORY_RING: Record<string, string> = {
  concept: '#93c5fd',
  skill: '#d8b4fe',
  tool: '#fcd34d',
  practice: '#fdba74',
}

export const PROJECT_HUB_ID = '__project_hub__'

export const SECTION_TITLES: Record<string, string> = {
  project_goal: '项目目标',
  problem_definition: '问题定义',
  data_flow: '数据输入、输出流与数据模型及约束',
  task_decomposition: '任务分解',
  knowledge_skills: '所涉及的知识与技能',
  implementation_plan: '实现方案',
  run_verify_debug: '代码的运行、验证与调试',
  iterative_optimization: '迭代优化',
}

export const RELATION_LABELS: Record<string, string> = {
  requires: '前置',
  relates_to: '相关',
}

export const IMPORTANCE_LABELS: Record<number, string> = {
  1: '必会',
  2: '重要',
  3: '一般',
}

export function nodeRadius(importance: number): number {
  if (importance <= 1) return 28
  if (importance === 2) return 24
  return 20
}

export function hubRadius(label: string): number {
  return Math.max(30, Math.min(38, 22 + label.length * 0.7))
}
