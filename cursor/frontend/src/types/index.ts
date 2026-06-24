export type WorkflowPhase = 'intro' | 'project_analysis' | 'operation_desc' | 'code_design'

export interface LogicPlanItem {
  id: number
  title: string
  content: string
  children?: LogicPlanItem[]
}

export interface ExecutionStep {
  step_id: number
  title: string
  description: string
  why?: string
  inputs?: string
  outputs?: string
  knowledge_points?: string[]
  code_module?: string
  common_errors?: string[]
  next_hint?: string
}

export interface CodeBlock {
  file_name: string
  language: string
  code: string
  annotations?: { line: string; text: string }[]
}

export interface TermDefinition {
  term: string
  definition: string
}

export interface FollowUpQuestion {
  question: string
  answer_type: 'choice' | 'text'
  options: string[]
}

export interface AIStructuredOutput {
  task_summary: string
  logic_plan: LogicPlanItem[]
  execution_steps: ExecutionStep[]
  code_blocks: CodeBlock[]
  terms: TermDefinition[]
  follow_up_questions: FollowUpQuestion[]
  socratic_mode: boolean
  assistant_message: string
  analysis_complete?: boolean
  operations_complete?: boolean
}

export interface SocraticAnswer {
  question: string
  answer: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  chatPart?: string
  socraticPart?: SocraticAnswer[]
  output?: AIStructuredOutput
}

export interface SessionSummary {
  id: string
  title: string
  created_at: string
  updated_at: string
  message_count: number
}
