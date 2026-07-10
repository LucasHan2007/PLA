import { useCallback, useEffect, useMemo, useState } from 'react'
import type { KnowledgeGraphEdge, KnowledgeGraphNode, ProjectKnowledgeGraph } from '../types'
import {
  fetchGraphStatus,
  fetchKnowledgeGraph,
  fetchKnowledgeGraphLayers,
  rebuildKnowledgeGraph,
} from '../services/api'

const CATEGORY_LABELS: Record<string, string> = {
  concept: '概念',
  skill: '技能',
  tool: '工具',
  practice: '实践',
}

const CATEGORY_COLORS: Record<string, string> = {
  concept: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  skill: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  tool: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  practice: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
}

interface Props {
  sessionId: string | null
  frameworkReady: boolean
}

export default function KnowledgeGraphPanel({ sessionId, frameworkReady }: Props) {
  const [status, setStatus] = useState({
    graphReady: false,
    nodeCount: 0,
    edgeCount: 0,
    summary: '' as string | null,
  })
  const [graph, setGraph] = useState<ProjectKnowledgeGraph | null>(null)
  const [layers, setLayers] = useState<KnowledgeGraphNode[][]>([])
  const [loading, setLoading] = useState(false)
  const [rebuilding, setRebuilding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const nodeMap = useMemo(() => {
    const m = new Map<string, KnowledgeGraphNode>()
    graph?.nodes.forEach((n) => m.set(n.id, n))
    return m
  }, [graph])

  const selectedNode = selectedId ? nodeMap.get(selectedId) ?? null : null

  const incomingEdges = useMemo(() => {
    if (!selectedId || !graph) return [] as KnowledgeGraphEdge[]
    return graph.edges.filter((e) => e.target === selectedId)
  }, [graph, selectedId])

  const refresh = useCallback(async () => {
    if (!sessionId || !frameworkReady) return
    setError(null)
    try {
      const [st, gr, ly] = await Promise.all([
        fetchGraphStatus(sessionId),
        fetchKnowledgeGraph(sessionId),
        fetchKnowledgeGraphLayers(sessionId),
      ])
      setStatus({
        graphReady: st.graph_ready,
        nodeCount: st.node_count,
        edgeCount: st.edge_count,
        summary: st.summary,
      })
      setGraph(gr.graph)
      setLayers(ly.layers)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    }
  }, [sessionId, frameworkReady])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleRebuild = useCallback(async () => {
    if (!sessionId || rebuilding) return
    setRebuilding(true)
    setError(null)
    try {
      const res = await rebuildKnowledgeGraph(sessionId)
      setGraph(res.graph)
      const ly = await fetchKnowledgeGraphLayers(sessionId)
      setLayers(ly.layers)
      setStatus({
        graphReady: true,
        nodeCount: res.graph.nodes.length,
        edgeCount: res.graph.edges.length,
        summary: res.graph.summary,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '重建失败')
    } finally {
      setRebuilding(false)
    }
  }, [sessionId, rebuilding])

  if (!frameworkReady || !sessionId) {
    return (
      <div className="flex flex-col h-full">
        <div className="panel-header">
          <span>🧠</span> 基础知识图谱
          <span className="ml-auto text-xs text-pla-muted">项目视角 · 概念依赖</span>
        </div>
        <div className="panel-body flex items-center justify-center p-6">
          <p className="text-sm text-pla-muted text-center leading-relaxed">
            请先在「项目解析器」中生成参考文件，系统将自动从八段体系抽取基础知识图谱。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="panel-header">
        <span>🧠</span> 基础知识图谱
        <span className="ml-auto text-xs text-pla-muted">
          {status.graphReady ? `${status.nodeCount} 节点 · ${status.edgeCount} 依赖` : '生成中…'}
        </span>
      </div>

      <div className="panel-body space-y-4 overflow-auto min-h-0">
        {error && <p className="text-sm text-red-400">{error}</p>}

        <section className="rounded-xl border border-pla-border/60 bg-pla-panel/30 p-4 space-y-2">
          <p className="text-xs text-pla-muted leading-relaxed">
            项目视角图谱：从八段解析体系抽取概念/技能节点及前置依赖，供用户画像与学习路径参考。
          </p>
          {status.summary && (
            <p className="text-sm text-pla-text leading-relaxed">{status.summary}</p>
          )}
          <button
            type="button"
            onClick={() => void handleRebuild()}
            disabled={rebuilding}
            className="text-xs text-pla-accent hover:underline disabled:opacity-40"
          >
            {rebuilding ? '正在重建图谱…' : '重新从 framework 抽取'}
          </button>
        </section>

        {layers.length > 0 && (
          <section className="space-y-4">
            <h3 className="text-sm font-medium text-pla-text">依赖层次（由基础到进阶）</h3>
            {layers.map((layer, li) => (
              <div key={li} className="space-y-2">
                <div className="text-[10px] text-pla-muted font-mono">L{li + 1}</div>
                <div className="flex flex-wrap gap-2">
                  {layer.map((node) => (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => setSelectedId(node.id === selectedId ? null : node.id)}
                      className={`text-left rounded-lg border px-3 py-2 max-w-[220px] transition-colors ${
                        selectedId === node.id
                          ? 'border-pla-accent bg-pla-accent/10'
                          : 'border-pla-border/60 bg-pla-bg hover:border-pla-accent/40'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded border ${
                            CATEGORY_COLORS[node.category] ?? CATEGORY_COLORS.concept
                          }`}
                        >
                          {CATEGORY_LABELS[node.category] ?? node.category}
                        </span>
                        {node.importance === 1 && (
                          <span className="text-[10px] text-amber-400">必会</span>
                        )}
                      </div>
                      <div className="text-xs font-medium text-pla-text">{node.label}</div>
                    </button>
                  ))}
                </div>
                {li < layers.length - 1 && (
                  <div className="text-center text-pla-muted text-xs py-0.5">↓ 前置完成后</div>
                )}
              </div>
            ))}
          </section>
        )}

        {selectedNode && (
          <section className="rounded-xl border border-pla-accent/30 bg-pla-accent/5 p-4 space-y-2">
            <div className="text-sm font-medium text-pla-text">{selectedNode.label}</div>
            <p className="text-xs text-pla-muted leading-relaxed">{selectedNode.description}</p>
            {incomingEdges.length > 0 && (
              <div className="text-xs text-pla-muted">
                <span className="text-pla-text">前置：</span>
                {incomingEdges
                  .map((e) => nodeMap.get(e.source)?.label ?? e.source)
                  .join('、')}
              </div>
            )}
          </section>
        )}

        {graph && graph.edges.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-medium text-pla-text">依赖关系</h3>
            <ul className="text-xs text-pla-muted space-y-1 max-h-40 overflow-auto">
              {graph.edges.map((edge) => (
                <li key={edge.id} className="font-mono">
                  {nodeMap.get(edge.source)?.label ?? edge.source}
                  <span className="text-pla-accent mx-1">→</span>
                  {nodeMap.get(edge.target)?.label ?? edge.target}
                  {edge.relation === 'relates_to' && (
                    <span className="ml-1 text-[10px]">(相关)</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {!status.graphReady && !loading && (
          <p className="text-sm text-pla-muted">图谱尚未就绪，请重新生成参考文件或点击重建。</p>
        )}
      </div>
    </div>
  )
}
