export interface ProjectParseResult {
  session_id: string
  project_name: string
  summary: string
}

export const PROJECT_PARSE_SECTION_LABELS: Record<string, string> = {
  project_goal: '项目目标',
  problem_definition: '问题定义',
  data_flow: '数据输入、输出流与数据模型及约束',
  task_decomposition: '任务分解',
  knowledge_skills: '所涉及的知识与技能',
  implementation_plan: '实现方案',
  run_verify_debug: '代码的运行、验证与调试',
}
