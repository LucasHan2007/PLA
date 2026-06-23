import type { AIStructuredOutput, SessionSummary, SocraticAnswer } from '../types'

const API = '/api'

export async function sendChat(payload: {
  message?: string
  socratic_answers?: SocraticAnswer[]
  session_id?: string | null
  step_id?: number | null
  code_context?: string | null
  error_context?: string | null
}): Promise<{ session_id: string; output: AIStructuredOutput }> {
  const res = await fetch(`${API}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: payload.message ?? '',
      socratic_answers: payload.socratic_answers ?? [],
      session_id: payload.session_id ?? null,
      step_id: payload.step_id ?? null,
      code_context: payload.code_context ?? null,
      error_context: payload.error_context ?? null,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Chat failed: ${res.statusText}`)
  }
  return res.json()
}

export async function fetchSessions(): Promise<SessionSummary[]> {
  const res = await fetch(`${API}/sessions`)
  const data = await res.json()
  return data.sessions
}
