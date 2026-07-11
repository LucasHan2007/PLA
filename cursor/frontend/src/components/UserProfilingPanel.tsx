import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MacroQuestion } from '../types'
import {
  buildUserProfile,
  fetchProfileQuestions,
  fetchProfileStatus,
  submitProfileAnswer,
} from '../services/api'

const REFERENCE_FIELDS = [
  'experience_level — 水平（初学者/进阶/高级）',
  'project_understanding — 项目理解',
  'prior_knowledge / knowledge_gaps — 已掌握与待补强',
  'learning_preferences / learning_goals — 偏好与目标',
  'concerns — 顾虑与难点',
  'summary — 画像摘要',
]

const NODE_FIELDS = [
  'order / title — 节点序号与标题',
  'summary — 本步要建立的能力或理解',
  'guiding_question — 引导思考问题（不给答案）',
  'focus_skills — 相关技能',
  'related_sections — 关联八段解析 id',
  'status — 进度（未开始/进行中/已完成）',
]

interface Props {
  sessionId: string | null
  frameworkReady: boolean
}

export default function UserProfilingPanel({ sessionId, frameworkReady }: Props) {
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
  const [error, setError] = useState<string | null>(null)
  const [fieldsExpanded, setFieldsExpanded] = useState(false)

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

  const handleBuild = useCallback(async () => {
    if (!sessionId || building) return
    setBuilding(true)
    setError(null)
    try {
      const res = await buildUserProfile(sessionId)
      setStatus((prev) => ({
        ...prev,
        profileReady: res.profile_ready,
        nodesReady: res.nodes_ready,
        nodeCount: res.node_count,
        profileSummary: res.profile_summary,
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败')
    } finally {
      setBuilding(false)
    }
  }, [sessionId, building])

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

  return (
    <div className="flex flex-col h-full">
      <div className="panel-header">
        <span>👤</span> 用户画像
        <span className="ml-auto text-xs text-pla-muted">
          {status.profileReady && status.nodesReady
            ? '参考文件已就绪'
            : `宏观问答 ${status.answered}/${status.total}`}
        </span>
      </div>

      <div className="panel-body space-y-4 overflow-auto min-h-0">
        {error && <p className="text-sm text-red-400">{error}</p>}

        <section className="rounded-xl border border-pla-border/60 bg-pla-panel/30 p-4 space-y-2">
          <p className="text-sm text-pla-muted leading-relaxed">
            完成宏观问答后，系统将生成<strong className="text-pla-text font-normal">用户画像</strong>
            与<strong className="text-pla-text font-normal">学习节点</strong>
            两份后台参考文件（JSON + Markdown），内容不在此展示，供答疑与代码辅助使用。
          </p>
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
              disabled={loading}
              className="w-full rounded-lg border border-pla-border bg-pla-bg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-pla-accent disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void handleSubmitAnswer()}
              disabled={loading || !draft.trim()}
              className="px-5 py-2 rounded-lg bg-pla-accent hover:bg-pla-accentHover disabled:opacity-40 text-sm font-medium transition-colors"
            >
              {loading ? '保存中…' : '保存并下一题'}
            </button>
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
              disabled={building}
              className="px-5 py-2 rounded-lg bg-pla-accent hover:bg-pla-accentHover disabled:opacity-40 text-sm font-medium transition-colors"
            >
              {building ? '正在生成参考文件…' : '生成画像与学习节点参考文件'}
            </button>
          </section>
        )}

        {status.profileReady && status.nodesReady && (
          <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
            <div className="text-sm font-medium text-emerald-300">✓ 参考文件已保存至后台</div>
            <p className="text-sm text-pla-muted leading-relaxed">
              用户画像与学习节点（共 {status.nodeCount} 个节点）已就绪，可用于任务答疑与代码辅助。
            </p>
            <button
              type="button"
              onClick={() => void handleBuild()}
              disabled={building}
              className="text-xs text-pla-accent hover:underline disabled:opacity-40"
            >
              {building ? '重新生成中…' : '重新生成参考文件'}
            </button>
            <button
              type="button"
              onClick={() => setFieldsExpanded((v) => !v)}
              className="block text-xs text-pla-accent hover:underline"
            >
              {fieldsExpanded ? '收起' : '参考文件包含哪些字段？'}
            </button>
            {fieldsExpanded && (
              <div className="grid gap-3 pt-1 sm:grid-cols-2">
                <div>
                  <div className="text-xs font-medium text-pla-text mb-1">用户画像</div>
                  <ul className="text-xs text-pla-muted space-y-1 list-disc list-inside">
                    {REFERENCE_FIELDS.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-xs font-medium text-pla-text mb-1">学习节点（每节点）</div>
                  <ul className="text-xs text-pla-muted space-y-1 list-disc list-inside">
                    {NODE_FIELDS.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
