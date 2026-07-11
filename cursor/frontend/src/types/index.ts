export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  chatPart?: string
  strategyLabel?: string
  learningNodeTitle?: string
}

export interface ProjectTemplate {
  id: string
  name: string
  hint: string
}

export interface ProjectParseResult {
  session_id: string
  project_name: string
  summary: string
  framework_ready: boolean
  graph_ready?: boolean
  graph_node_count?: number
}

export interface KnowledgeGraphNode {
  id: string
  label: string
  description: string
  category: 'concept' | 'skill' | 'tool' | 'practice'
  related_sections: string[]
  importance: number
}

export interface KnowledgeGraphEdge {
  id: string
  source: string
  target: string
  relation: 'requires' | 'relates_to'
}

export interface ProjectKnowledgeGraph {
  session_id: string
  project_name: string
  summary: string
  nodes: KnowledgeGraphNode[]
  edges: KnowledgeGraphEdge[]
}

export interface GraphStatus {
  session_id: string
  framework_ready: boolean
  graph_ready: boolean
  node_count: number
  edge_count: number
  project_name: string | null
  summary: string | null
}

export interface MacroQuestion {
  id: string
  category: string
  question: string
  hint: string
  placeholder: string
}

export interface UserProfile {
  experience_level: 'beginner' | 'intermediate' | 'advanced'
  project_understanding: string
  prior_knowledge: string[]
  knowledge_gaps: string[]
  learning_preferences: string[]
  learning_goals: string[]
  concerns: string[]
  summary: string
}

export interface LearningNode {
  id: string
  order: number
  title: string
  summary: string
  guiding_question: string
  focus_skills: string[]
  related_sections: string[]
  status: 'not_started' | 'in_progress' | 'completed'
}

export interface ProfileStatus {
  session_id: string
  framework_ready: boolean
  questions_total: number
  questions_answered: number
  all_answered: boolean
  profile_ready: boolean
  nodes_ready: boolean
  profile_summary: string | null
  node_count: number
  current_node_id: string | null
  current_node_title: string | null
  next_question_id: string | null
}

export interface ProfilingReferenceStatus {
  session_id: string
  profile_ready: boolean
  nodes_ready: boolean
  profile_summary: string | null
  node_count: number
  current_node_id: string | null
  current_node_title: string | null
}

export interface ProfileBuildResult {
  session_id: string
  profile_ready: boolean
  nodes_ready: boolean
  profile_summary: string
  node_count: number
  current_node_id: string | null
  current_node_title: string | null
  message: string
}

export interface ImplementationModule {
  id: string
  name: string
  responsibility: string
  files: string[]
  depends_on: string[]
}

export interface ImplementationPlan {
  session_id: string
  project_name: string
  overview: string
  tech_stack: string[]
  modules: ImplementationModule[]
  milestones: string[]
}

export interface CodeDraft {
  file_name: string
  language: string
  content: string
}

export interface ImplementationStatus {
  session_id: string
  framework_ready: boolean
  profile_ready: boolean
  nodes_ready: boolean
  plan_ready: boolean
  project_name: string | null
}

export type CodeAssistMode = 'understand' | 'completion'
