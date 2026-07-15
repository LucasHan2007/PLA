import { useCallback, useEffect, useState } from 'react'
import type { LearningNode } from '../types'
import { fetchLearningNodesList } from '../services/api'

const STATUS_LABEL: Record<LearningNode['status'], string> = {
  not_started: '未开始',
  in_progress: '进行中',
  completed: '已完成',
}

interface Props {
  sessionId: string | null
  projectName: string
  nodesReady: boolean
  selectedNodeId: string | null
  onSelectNode: (node: LearningNode) => void
  onGoCode?: () => void
  onShowGraph?: () => void
  /** page = 页面3完整；sidebar = 代码页左侧节点栏 */
  variant?: 'page' | 'sidebar'
}

/** 页面 3：展示学习节点整理内容 */
export default function LearningNodesPanel({
  sessionId,
  projectName,
  nodesReady,
  selectedNodeId,
  onSelectNode,
  onGoCode,
  onShowGraph,
  variant = 'page',
}: Props) {
  const [nodes, setNodes] = useState<LearningNode[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!sessionId || !nodesReady) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetchLearningNodesList(sessionId)
      const sorted = [...res.nodes].sort((a, b) => a.order - b.order)
      setNodes(sorted)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载节点失败')
    } finally {
      setLoading(false)
    }
  }, [sessionId, nodesReady])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!selectedNodeId && nodes[0]) onSelectNode(nodes[0])
  }, [nodes, selectedNodeId, onSelectNode])

  const selected = nodes.find((n) => n.id === selectedNodeId) ?? null

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="panel-header">
        <span>📎</span>
        <span className="truncate">{projectName || '学习节点'}</span>
        <span className="ml-auto text-xs text-pla-muted">中间节点</span>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4 space-y-3">
        {error && <p className="text-sm text-red-400">{error}</p>}
        {loading && <p className="text-sm text-pla-muted">加载节点…</p>}

        {!nodesReady && (
          <p className="text-sm text-pla-muted leading-relaxed">
            请先在上一页完成引导问答并生成学习节点。
          </p>
        )}

        {nodes.map((node) => {
          const active = node.id === selectedNodeId
          return (
            <button
              key={node.id}
              type="button"
              onClick={() => onSelectNode(node)}
              className={`w-full text-left rounded-xl border p-4 transition-colors ${
                active
                  ? 'border-pla-accent bg-pla-accent/10'
                  : 'border-pla-border/60 bg-pla-panel/30 hover:border-pla-accent/40'
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="text-xs font-medium text-pla-text">
                  节点 {node.order} · {node.title}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded border border-pla-border/60 text-pla-muted">
                  {STATUS_LABEL[node.status]}
                </span>
              </div>
              <p className="text-xs text-pla-muted leading-relaxed line-clamp-2">{node.summary}</p>
            </button>
          )
        })}

        {selected && (
          <section className="rounded-xl border border-pla-accent/25 bg-pla-accent/5 p-4 space-y-2">
            <div className="text-sm font-medium text-pla-text">学到的整理内容</div>
            <p className="text-xs text-pla-text leading-relaxed">{selected.summary}</p>
            {selected.guiding_question && (
              <div className="text-xs text-pla-muted leading-relaxed pt-1 border-t border-pla-border/40">
                <span className="text-pla-text">引导思考：</span>
                {selected.guiding_question}
              </div>
            )}
            {selected.focus_skills.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {selected.focus_skills.map((s) => (
                  <span
                    key={s}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-pla-bg border border-pla-border/50 text-pla-muted"
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {variant === 'page' && (
        <div className="shrink-0 px-4 py-3 border-t border-pla-border flex gap-2 flex-wrap">
          {onShowGraph && (
            <button
              type="button"
              onClick={onShowGraph}
              className="text-xs text-pla-muted hover:text-pla-text px-3 py-2 rounded-lg border border-pla-border"
            >
              知识图谱
            </button>
          )}
          {onGoCode && (
            <button
              type="button"
              onClick={onGoCode}
              disabled={!nodesReady || nodes.length === 0}
              className="ml-auto px-4 py-2 rounded-lg bg-pla-accent hover:bg-pla-accentHover disabled:opacity-40 text-sm font-medium"
            >
              进入代码生成 →
            </button>
          )}
        </div>
      )}
    </div>
  )
}
