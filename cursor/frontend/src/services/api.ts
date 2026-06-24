import type { AIStructuredOutput, SessionSummary, SocraticAnswer, WorkflowPhase } from '../types'

const API = '/api'
const CHAT_TIMEOUT_MS = 120_000

export async function sendChat(payload: {
  message?: string
  socratic_answers?: SocraticAnswer[]
  session_id?: string | null
  step_id?: number | null
  code_context?: string | null
  error_context?: string | null
  workflow_phase?: WorkflowPhase
  revealed_plan_count?: number
  revealed_step_count?: number
  revealed_code_count?: number
  debug_skip_to_phase?: WorkflowPhase | null
}): Promise<{ session_id: string; output: AIStructuredOutput }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(`${API}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        message: payload.message ?? '',
        socratic_answers: payload.socratic_answers ?? [],
        session_id: payload.session_id ?? null,
        step_id: payload.step_id ?? null,
        code_context: payload.code_context ?? null,
        error_context: payload.error_context ?? null,
        workflow_phase: payload.workflow_phase ?? 'intro',
        revealed_plan_count: payload.revealed_plan_count ?? 0,
        revealed_step_count: payload.revealed_step_count ?? 0,
        revealed_code_count: payload.revealed_code_count ?? 0,
        debug_skip_to_phase: payload.debug_skip_to_phase ?? null,
      }),
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('请求超时，请确认后端已启动（端口 8000）并重试')
    }
    throw new Error('无法连接后端，请确认已运行 start-backend.bat 或 uvicorn')
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(
      typeof err.detail === 'string'
        ? err.detail
        : `请求失败 (${res.status})，请检查后端是否正常运行`,
    )
  }
  return res.json()
}

export async function fetchSessions(): Promise<SessionSummary[]> {
  const res = await fetch(`${API}/sessions`)
  const data = await res.json()
  return data.sessions
}
