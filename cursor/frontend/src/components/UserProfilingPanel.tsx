import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MacroQuestion } from '../types'
import {
  DEBUG_PROFILE_ANSWER_ORDER,
  MNIST_DEBUG_PROFILE_ANSWERS,
} from '../data/debugProfileAnswers'
import {
  buildUserProfile,
  fetchProfileQuestions,
  fetchProfileStatus,
  submitProfileAnswer,
} from '../services/api'

interface Props {
  sessionId: string | null
  frameworkReady: boolean
  projectName?: string
  onNodesReady?: () => void
}

export default function UserProfilingPanel({
  sessionId,
  frameworkReady,
  projectName,
  onNodesReady,
}: Props) {
  const [questions, setQuestions] = useState<MacroQuestion[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState({
    answered: 0,
    total: 0,
    allAnswered: false,
    profileReady: false,
    nodesReady: false,
    nodeCount: 0,
    profileSummary: null as string | null,
  })
  const [loading, setLoading] = useState(false)
  const [building, setBuilding] = useState(false)
  const [debugging, setDebugging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currentQuestion = useMemo(
    () => questions.find((q) => q.id === currentId) ?? null,
    [questions, currentId],
  )

  const refresh = useCallback(async () => {
    if (!sessionId || !frameworkReady) return
    setError(null)
    try {
      const [st, qs] = await Promise.all([
        fetchProfileStatus(sessionId),
        fetchProfileQuestions(sessionId),
      ])
      setQuestions(qs.questions)
      setAnswers(qs.answers)
      setCurrentId(st.next_question_id ?? qs.questions[0]?.id ?? null)
      setStatus({
        answered: st.questions_answered,
        total: st.questions_total,
        allAnswered: st.all_answered,
        profileReady: st.profile_ready,
        nodesReady: st.nodes_ready,
        nodeCount: st.node_count,
        profileSummary: st.profile_summary,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    }
  }, [sessionId, frameworkReady])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (currentId && answers[currentId]) {
      setDraft(answers[currentId])
    } else {
      setDraft('')
    }
  }, [currentId, answers])

  const handleSubmitAnswer = useCallback(async () => {
    if (!sessionId || !currentId || !draft.trim() || loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await submitProfileAnswer({
        session_id: sessionId,
        question_id: currentId,
        answer: draft.trim(),
      })
      setAnswers((prev) => ({ ...prev, [currentId]: draft.trim() }))
      setStatus((prev) => ({
        ...prev,
        answered: res.questions_answered,
        total: res.questions_total,
        allAnswered: res.all_answered,
      }))
      setCurrentId(res.next_question_id)
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败')
    } finally {
      setLoading(false)
    }
  }, [sessionId, currentId, draft, loading])

  const handleBuild = useCallback(async (forceRegenerate = false) => {
    if (!sessionId || building) return
    setBuilding(true)
    setError(null)
    try {
      const res = await buildUserProfile(sessionId, forceRegenerate)
      setStatus((prev) => ({
        ...prev,
        profileReady: res.profile_ready,
        nodesReady: res.nodes_ready,
        nodeCount: res.node_count,
        profileSummary: res.profile_summary,
      }))
      if (res.profile_ready && res.nodes_ready) onNodesReady?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败')
    } finally {
      setBuilding(false)
    }
  }, [sessionId, building, onNodesReady])

  /** 调试：自动填入 MNIST 预设答案 → 生成画像/节点 → 进入节点页 */
  const handleDebugSkip = useCallback(async () => {
    if (!sessionId || debugging || building) return
    setDebugging(true)
    setError(null)
    try {
      const filled: Record<string, string> = { ...answers }
      for (const qid of DEBUG_PROFILE_ANSWER_ORDER) {
        const text = MNIST_DEBUG_PROFILE_ANSWERS[qid]
        if (!text) continue
        await submitProfileAnswer({
          session_id: sessionId,
          question_id: qid,
          answer: text,
        })
        filled[qid] = text
      }
      setAnswers(filled)
      setStatus((prev) => ({
        ...prev,
        answered: DEBUG_PROFILE_ANSWER_ORDER.length,
        total: DEBUG_PROFILE_ANSWER_ORDER.length,
        allAnswered: true,
      }))
      setCurrentId(null)

      setBuilding(true)
      // 有则复用；无则按刚填入的答案生成
      const res = await buildUserProfile(sessionId, false)
      setStatus((prev) => ({
        ...prev,
        profileReady: res.profile_ready,
        nodesReady: res.nodes_ready,
        nodeCount: res.node_count,
        profileSummary: res.profile_summary,
      }))
      if (res.profile_ready && res.nodes_ready) onNodesReady?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : '调试跳过失败')
      await refresh()
    } finally {
      setBuilding(false)
      setDebugging(false)
    }
  }, [sessionId, debugging, building, answers, onNodesReady, refresh])

  if (!frameworkReady || !sessionId) {
    return (
      <div className="flex flex-col h-full">
        <div className="panel-header">
          <span>👤</span> 用户画像
          <span className="ml-auto text-xs text-pla-muted">宏观提问 → 学习节点</span>
        </div>
        <div className="panel-body flex items-center justify-center p-6">
          <p className="text-sm text-pla-muted text-center leading-relaxed">
            请先在「项目解析」中生成并保存参考文件，再开始用户画像问答。
          </p>
        </div>
      </div>
    )
  }

  const busy = loading || building || debugging

  return (
    <div className="flex flex-col h-full">
      <div className="panel-header">
        <span>💡</span> {projectName ? projectName : '引导思考'}
        <span className="ml-auto text-xs text-pla-muted flex items-center gap-2">
          {status.profileReady && status.nodesReady
            ? '节点已生成'
            : `宏观问答 ${status.answered}/${status.total}`}
          {!status.profileReady && (
            <button
              type="button"
              onClick={() => void handleDebugSkip()}
              disabled={busy}
              title="自动填入 MNIST 调试答案并生成画像/节点"
              className="text-[10px] px-2 py-0.5 rounded border border-amber-500/40 text-amber-300/90 hover:bg-amber-500/10 disabled:opacity-40"
            >
              {debugging || building ? '调试跳过中…' : '调试跳过问答'}
            </button>
          )}
        </span>
      </div>

      <div className="panel-body space-y-4 overflow-auto min-h-0">
        {error && <p className="text-sm text-red-400">{error}</p>}

        <section className="rounded-xl border border-pla-border/60 bg-pla-panel/30 p-4 space-y-2">
          <p className="text-sm text-pla-muted leading-relaxed">
            通过一系列问题启发有序思考：系统将识别你的意图，并生成用户画像与学习节点，增强学习记忆。
          </p>
          {!status.profileReady && (
            <p className="text-[11px] text-amber-300/80 leading-relaxed">
              调试：可点「调试跳过问答」，自动填入手写数字识别预设答案并生成节点。
            </p>
          )}
        </section>

        {!status.profileReady && currentQuestion && (
          <section className="rounded-xl border border-pla-border/60 bg-pla-panel/30 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 rounded-full bg-pla-accent/15 text-pla-accent">
                {currentQuestion.category}
              </span>
              <span className="text-xs text-pla-muted">
                第 {status.answered + 1} / {status.total} 题
              </span>
            </div>
            <p className="text-sm text-pla-text leading-relaxed">{currentQuestion.question}</p>
            {currentQuestion.hint && (
              <p className="text-xs text-pla-muted">{currentQuestion.hint}</p>
            )}
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              placeholder={currentQuestion.placeholder}
              disabled={busy}
              className="w-full rounded-lg border border-pla-border bg-pla-bg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-pla-accent disabled:opacity-50"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleSubmitAnswer()}
                disabled={busy || !draft.trim()}
                className="px-5 py-2 rounded-lg bg-pla-accent hover:bg-pla-accentHover disabled:opacity-40 text-sm font-medium transition-colors"
              >
                {loading ? '保存中…' : '保存并下一题'}
              </button>
              <button
                type="button"
                onClick={() => void handleDebugSkip()}
                disabled={busy}
                className="px-4 py-2 rounded-lg border border-amber-500/40 text-amber-300 text-sm hover:bg-amber-500/10 disabled:opacity-40"
              >
                {debugging || building ? '正在跳过…' : '调试：填入预设答案并跳过'}
              </button>
            </div>
          </section>
        )}

        {status.allAnswered && !status.profileReady && (
          <section className="rounded-xl border border-pla-accent/30 bg-pla-accent/5 p-4 space-y-3">
            <p className="text-sm text-pla-text">
              宏观问答已完成。点击下方按钮，结合项目解析体系与你的回答生成画像与学习节点参考文件。
            </p>
            <button
              type="button"
              onClick={() => void handleBuild()}
              disabled={building || debugging}
              className="px-5 py-2 rounded-lg bg-pla-accent hover:bg-pla-accentHover disabled:opacity-40 text-sm font-medium transition-colors"
            >
              {building ? '正在生成参考文件…' : '生成画像与学习节点参考文件'}
            </button>
          </section>
        )}

        {status.profileReady && status.nodesReady && (
          <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
            <div className="text-sm font-medium text-emerald-300">✓ 画像与学习节点已生成</div>
            <p className="text-sm text-pla-muted leading-relaxed">
              共 {status.nodeCount} 个学习节点。可在右侧继续对话式提问，或进入下一页查看节点整理内容。
            </p>
            {onNodesReady && (
              <button
                type="button"
                onClick={onNodesReady}
                className="px-4 py-2 rounded-lg bg-pla-accent hover:bg-pla-accentHover text-sm font-medium"
              >
                查看学习节点 →
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleBuild(true)}
              disabled={building || debugging}
              className="block text-xs text-pla-accent hover:underline disabled:opacity-40"
            >
              {building ? '重新生成中…' : '重新生成参考文件'}
            </button>
          </section>
        )}
      </div>
    </div>
  )
}
