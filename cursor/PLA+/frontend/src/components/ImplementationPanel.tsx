import { useCallback, useEffect, useState } from 'react'
import type { CodeAssistMode, ImplementationPlan, LearningNode } from '../types'
import {
  fetchImplementationPlan,
  fetchImplementationStatus,
  generateImplementationPlan,
  requestCodeAssist,
  saveCodeDraft,
} from '../services/api'

const DEFAULT_CODE = `# 在此编写项目代码
# 可使用「理解型」解释含义，或「补全型」获取练习式骨架

def main():
    pass

if __name__ == "__main__":
    main()
`

interface Props {
  sessionId: string | null
  frameworkReady: boolean
  profileReady: boolean
  currentNode: Pick<LearningNode, 'id' | 'title'> | null
}

export default function ImplementationPanel({
  sessionId,
  frameworkReady,
  profileReady,
  currentNode,
}: Props) {
  const [status, setStatus] = useState({
    nodesReady: false,
    planReady: false,
  })
  const [plan, setPlan] = useState<ImplementationPlan | null>(null)
  const [fileName, setFileName] = useState('main.py')
  const [code, setCode] = useState(DEFAULT_CODE)
  const [assistMode, setAssistMode] = useState<CodeAssistMode>('understand')
  const [assistInput, setAssistInput] = useState('')
  const [assistAnswer, setAssistAnswer] = useState<string | null>(null)
  const [behaviorNote, setBehaviorNote] = useState<string | null>(null)
  const [planLoading, setPlanLoading] = useState(false)
  const [assistLoading, setAssistLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [planExpanded, setPlanExpanded] = useState(true)

  const refresh = useCallback(async () => {
    if (!sessionId || !frameworkReady) return
    setError(null)
    try {
      const [st, pl] = await Promise.all([
        fetchImplementationStatus(sessionId),
        fetchImplementationPlan(sessionId),
      ])
      setStatus({ nodesReady: st.nodes_ready, planReady: st.plan_ready })
      setPlan(pl.plan)
      const draft = pl.drafts.find((d) => d.file_name === fileName) ?? pl.drafts[0]
      if (draft?.content) {
        setCode(draft.content)
        setFileName(draft.file_name)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    }
  }, [sessionId, frameworkReady, fileName])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleGeneratePlan = useCallback(async () => {
    if (!sessionId || planLoading) return
    setPlanLoading(true)
    setError(null)
    try {
      const res = await generateImplementationPlan(sessionId)
      setPlan(res.plan)
      setStatus((s) => ({ ...s, planReady: true }))
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败')
    } finally {
      setPlanLoading(false)
    }
  }, [sessionId, planLoading])

  const handleAssist = useCallback(async () => {
    if (!sessionId || !assistInput.trim() || assistLoading) return
    setAssistLoading(true)
    setError(null)
    try {
      await saveCodeDraft({
        session_id: sessionId,
        file_name: fileName,
        language: 'python',
        content: code,
      })
      const res = await requestCodeAssist({
        session_id: sessionId,
        mode: assistMode,
        code,
        message: assistInput.trim(),
        file_name: fileName,
        learning_node_id: currentNode?.id ?? null,
      })
      setAssistAnswer(res.answer)
      setBehaviorNote(res.behavior_note)
      setAssistInput('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '辅助失败')
    } finally {
      setAssistLoading(false)
    }
  }, [sessionId, assistInput, assistLoading, assistMode, code, fileName, currentNode])

  if (!frameworkReady || !sessionId) {
    return (
      <div className="flex flex-col h-full">
        <div className="panel-header">
          <span>💻</span> 代码辅助
        </div>
        <div className="panel-body flex items-center justify-center p-6">
          <p className="text-sm text-pla-muted text-center">请先生成项目解析参考文件。</p>
        </div>
      </div>
    )
  }

  if (!profileReady || !status.nodesReady) {
    return (
      <div className="flex flex-col h-full">
        <div className="panel-header">
          <span>💻</span> 代码辅助
        </div>
        <div className="panel-body flex items-center justify-center p-6">
          <p className="text-sm text-pla-muted text-center leading-relaxed">
            请先在「用户画像」中完成宏观问答并生成学习节点，再生成具体实现方案。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="panel-header">
        <span>💻</span> 代码辅助
        <span className="ml-auto text-xs text-pla-muted">
          {status.planReady ? '方案已就绪' : '待生成方案'}
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-auto panel-body space-y-4">
        {error && <p className="text-sm text-red-400">{error}</p>}

        <section className="rounded-xl border border-pla-border/60 bg-pla-panel/30 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-pla-text">实现方案</h3>
            <button
              type="button"
              onClick={() => setPlanExpanded((v) => !v)}
              className="text-xs text-pla-muted hover:text-pla-text"
            >
              {planExpanded ? '收起' : '展开'}
            </button>
          </div>
          {!status.planReady && (
            <p className="text-xs text-pla-muted">
              基于学习节点、画像与知识图谱生成模块边界与里程碑。
            </p>
          )}
          <button
            type="button"
            onClick={() => void handleGeneratePlan()}
            disabled={planLoading}
            className="px-4 py-2 rounded-lg bg-pla-accent hover:bg-pla-accentHover disabled:opacity-40 text-sm font-medium"
          >
            {planLoading ? '生成中…' : status.planReady ? '重新生成方案' : '生成实现方案'}
          </button>
          {planExpanded && plan && (
            <div className="space-y-3 text-sm">
              <p className="text-pla-text leading-relaxed">{plan.overview}</p>
              {plan.tech_stack.length > 0 && (
                <p className="text-xs text-pla-muted">技术栈：{plan.tech_stack.join('、')}</p>
              )}
              <ol className="space-y-2">
                {plan.modules.map((mod) => (
                  <li key={mod.id} className="rounded-lg border border-pla-border/50 p-3">
                    <div className="font-medium text-pla-text">{mod.name}</div>
                    <p className="text-xs text-pla-muted mt-1">{mod.responsibility}</p>
                    {mod.files.length > 0 && (
                      <p className="text-[10px] text-pla-accent mt-1">{mod.files.join(', ')}</p>
                    )}
                  </li>
                ))}
              </ol>
              {plan.milestones.length > 0 && (
                <ul className="text-xs text-pla-muted list-disc list-inside space-y-0.5">
                  {plan.milestones.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs text-pla-text">文件</label>
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              className="rounded border border-pla-border bg-pla-bg px-2 py-1 text-xs w-32"
            />
            {currentNode && (
              <span className="text-[10px] text-pla-muted truncate max-w-[180px]">
                节点：{currentNode.title}
              </span>
            )}
          </div>
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            className="w-full h-48 font-mono text-xs leading-relaxed rounded-lg border border-pla-border bg-[#1a1f2e] text-pla-text px-3 py-2 resize-y focus:outline-none focus:ring-1 focus:ring-pla-accent"
          />
        </section>

        <section className="rounded-xl border border-pla-border/60 bg-pla-panel/30 p-4 space-y-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAssistMode('understand')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                assistMode === 'understand'
                  ? 'bg-pla-accent text-white'
                  : 'bg-pla-bg border border-pla-border text-pla-muted'
              }`}
            >
              理解型
            </button>
            <button
              type="button"
              onClick={() => setAssistMode('completion')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                assistMode === 'completion'
                  ? 'bg-pla-accent text-white'
                  : 'bg-pla-bg border border-pla-border text-pla-muted'
              }`}
            >
              补全型
            </button>
          </div>
          <p className="text-[10px] text-pla-muted leading-relaxed">
            {assistMode === 'understand'
              ? '解释代码含义与原理，不直接给完整答案。'
              : '提供骨架与 TODO，练习式推进，每次一小步。'}
          </p>
          <textarea
            value={assistInput}
            onChange={(e) => setAssistInput(e.target.value)}
            rows={2}
            placeholder={
              assistMode === 'understand'
                ? '例如：这段 import 和数据加载在做什么？'
                : '例如：帮我写数据加载函数的第一步骨架'
            }
            className="w-full rounded-lg border border-pla-border bg-pla-bg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-pla-accent"
          />
          <button
            type="button"
            onClick={() => void handleAssist()}
            disabled={assistLoading || !assistInput.trim()}
            className="px-4 py-2 rounded-lg bg-pla-accent hover:bg-pla-accentHover disabled:opacity-40 text-sm font-medium"
          >
            {assistLoading ? '处理中…' : '获取代码辅助'}
          </button>
        </section>

        {assistAnswer && (
          <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2">
            <div className="text-xs font-medium text-emerald-300">
              {assistMode === 'understand' ? '理解型回复' : '补全型回复'}
            </div>
            <pre className="text-sm text-pla-text whitespace-pre-wrap font-sans leading-relaxed">
              {assistAnswer}
            </pre>
            {behaviorNote && (
              <p className="text-[10px] text-pla-muted">编码行为：{behaviorNote}</p>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
