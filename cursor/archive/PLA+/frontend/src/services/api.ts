import type {
  CodeAssistMode,
  CodeDraft,
  GraphStatus,
  ImplementationPlan,
  ImplementationStatus,
  KnowledgeGraphNode,
  ProfileBuildResult,
  ProfileStatus,
  ProfilingReferenceStatus,
  ProjectKnowledgeGraph,
  ProjectParseResult,
  MacroQuestion,
} from '../types'

const API = '/api'
const PARSE_TIMEOUT_MS = 300_000
const QA_TIMEOUT_MS = 120_000
const PROFILE_BUILD_TIMEOUT_MS = 180_000

async function readError(res: Response): Promise<string> {
  const err = await res.json().catch(() => ({}))
  return typeof err.detail === 'string'
    ? err.detail
    : `请求失败 (${res.status})，请确认 PLA+ 后端已启动（端口 8001）`
}

export async function sendProjectParse(payload: {
  project_name: string
  project_hint?: string
  session_id?: string | null
  project_template_id?: string | null
}): Promise<ProjectParseResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PARSE_TIMEOUT_MS)
  try {
    const res = await fetch(`${API}/project-parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        project_name: payload.project_name,
        project_hint: payload.project_hint ?? '',
        session_id: payload.session_id ?? null,
        project_template_id: payload.project_template_id ?? null,
      }),
    })
    if (!res.ok) throw new Error(await readError(res))
    return res.json()
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('生成超时，请稍后重试')
    }
    if (err instanceof Error) throw err
    throw new Error('无法连接后端')
  } finally {
    clearTimeout(timer)
  }
}

export async function sendTaskQa(payload: {
  message: string
  session_id: string
  project_name: string
  learning_node_id?: string | null
}): Promise<{
  session_id: string
  answer: string
  strategy: string | null
  strategy_label: string | null
  learning_node_title: string | null
}> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), QA_TIMEOUT_MS)
  try {
    const res = await fetch(`${API}/task-qa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        message: payload.message,
        session_id: payload.session_id,
        project_name: payload.project_name,
        learning_node_id: payload.learning_node_id ?? null,
        step_index: 0,
        step_total: 0,
        plan_title: '',
        plan_content: '',
        task_title: '',
        task_summary: '',
      }),
    })
    if (!res.ok) throw new Error(await readError(res))
    return res.json()
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('请求超时')
    }
    if (err instanceof Error) throw err
    throw new Error('无法连接后端')
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchHealth(): Promise<{ llm_configured: boolean }> {
  const res = await fetch('/health')
  if (!res.ok) throw new Error('后端不可用')
  return res.json()
}

export async function fetchProfileStatus(sessionId: string): Promise<ProfileStatus> {
  const res = await fetch(`${API}/user-profile/${sessionId}/status`)
  if (!res.ok) throw new Error(await readError(res))
  return res.json()
}

export async function fetchProfileQuestions(sessionId: string): Promise<{
  session_id: string
  questions: MacroQuestion[]
  answers: Record<string, string>
}> {
  const res = await fetch(`${API}/user-profile/${sessionId}/questions`)
  if (!res.ok) throw new Error(await readError(res))
  return res.json()
}

export async function submitProfileAnswer(payload: {
  session_id: string
  question_id: string
  answer: string
}): Promise<{
  session_id: string
  questions_answered: number
  questions_total: number
  all_answered: boolean
  next_question_id: string | null
}> {
  const res = await fetch(`${API}/user-profile/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await readError(res))
  return res.json()
}

export async function buildUserProfile(sessionId: string): Promise<ProfileBuildResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROFILE_BUILD_TIMEOUT_MS)
  try {
    const res = await fetch(`${API}/user-profile/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ session_id: sessionId }),
    })
    if (!res.ok) throw new Error(await readError(res))
    return res.json()
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('画像生成超时，请稍后重试')
    }
    if (err instanceof Error) throw err
    throw new Error('无法连接后端')
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchProfilingReferenceStatus(
  sessionId: string,
): Promise<ProfilingReferenceStatus> {
  const res = await fetch(`${API}/user-profile/${sessionId}/reference-status`)
  if (!res.ok) throw new Error(await readError(res))
  return res.json()
}

/** @deprecated 使用 fetchProfilingReferenceStatus；保留兼容旧路径 */
export async function fetchLearningNodes(sessionId: string): Promise<ProfilingReferenceStatus> {
  const res = await fetch(`${API}/user-profile/${sessionId}/nodes`)
  if (!res.ok) throw new Error(await readError(res))
  return res.json()
}

export async function fetchGraphStatus(sessionId: string): Promise<GraphStatus> {
  const res = await fetch(`${API}/knowledge-graph/${sessionId}/status`)
  if (!res.ok) throw new Error(await readError(res))
  return res.json()
}

export async function fetchKnowledgeGraph(sessionId: string): Promise<{
  session_id: string
  graph: ProjectKnowledgeGraph | null
}> {
  const res = await fetch(`${API}/knowledge-graph/${sessionId}`)
  if (!res.ok) throw new Error(await readError(res))
  return res.json()
}

export async function fetchKnowledgeGraphLayers(sessionId: string): Promise<{
  session_id: string
  layers: KnowledgeGraphNode[][]
}> {
  const res = await fetch(`${API}/knowledge-graph/${sessionId}/layers`)
  if (!res.ok) throw new Error(await readError(res))
  return res.json()
}

export async function rebuildKnowledgeGraph(sessionId: string): Promise<{
  session_id: string
  graph: ProjectKnowledgeGraph
}> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PARSE_TIMEOUT_MS)
  try {
    const res = await fetch(`${API}/knowledge-graph/${sessionId}/build`, {
      method: 'POST',
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(await readError(res))
    return res.json()
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('图谱生成超时')
    }
    if (err instanceof Error) throw err
    throw new Error('无法连接后端')
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchImplementationStatus(sessionId: string): Promise<ImplementationStatus> {
  const res = await fetch(`${API}/implementation/${sessionId}/status`)
  if (!res.ok) throw new Error(await readError(res))
  return res.json()
}

export async function fetchImplementationPlan(sessionId: string): Promise<{
  session_id: string
  plan: ImplementationPlan | null
  drafts: CodeDraft[]
}> {
  const res = await fetch(`${API}/implementation/${sessionId}/plan`)
  if (!res.ok) throw new Error(await readError(res))
  return res.json()
}

export async function generateImplementationPlan(sessionId: string): Promise<{
  session_id: string
  plan: ImplementationPlan
  message: string
}> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PARSE_TIMEOUT_MS)
  try {
    const res = await fetch(`${API}/implementation/${sessionId}/generate-plan`, {
      method: 'POST',
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(await readError(res))
    return res.json()
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('方案生成超时')
    }
    if (err instanceof Error) throw err
    throw new Error('无法连接后端')
  } finally {
    clearTimeout(timer)
  }
}

export async function saveCodeDraft(payload: {
  session_id: string
  file_name: string
  language: string
  content: string
}): Promise<void> {
  const res = await fetch(`${API}/implementation/save-draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await readError(res))
}

export async function requestCodeAssist(payload: {
  session_id: string
  mode: CodeAssistMode
  code: string
  message: string
  file_name: string
  learning_node_id?: string | null
}): Promise<{
  session_id: string
  mode: CodeAssistMode
  answer: string
  behavior_note: string | null
}> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), QA_TIMEOUT_MS)
  try {
    const res = await fetch(`${API}/implementation/code-assist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        session_id: payload.session_id,
        mode: payload.mode,
        code: payload.code,
        message: payload.message,
        file_name: payload.file_name,
        learning_node_id: payload.learning_node_id ?? null,
      }),
    })
    if (!res.ok) throw new Error(await readError(res))
    return res.json()
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('代码辅助超时')
    }
    if (err instanceof Error) throw err
    throw new Error('无法连接后端')
  } finally {
    clearTimeout(timer)
  }
}
