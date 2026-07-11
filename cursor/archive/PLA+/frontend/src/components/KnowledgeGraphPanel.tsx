import { useCallback, useEffect, useState } from 'react'
import type { KnowledgeGraphNode, ProjectKnowledgeGraph } from '../types'
import {
  fetchGraphStatus,
  fetchKnowledgeGraph,
  fetchKnowledgeGraphLayers,
  rebuildKnowledgeGraph,
} from '../services/api'
import KnowledgeGraphCanvas from './knowledge-graph/KnowledgeGraphCanvas'
import NodeExplainPanel from './knowledge-graph/NodeExplainPanel'

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
  const [rebuilding, setRebuilding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

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
      setSelectedId(null)
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
      setSelectedId(null)
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
    <div className="flex flex-col h-full min-h-0">
      <div className="panel-header">
        <span>🧠</span> 基础知识图谱
        <span className="ml-auto text-xs text-pla-muted flex items-center gap-3">
          {status.graphReady ? `${status.nodeCount} 节点 · ${status.edgeCount} 依赖` : '生成中…'}
          <button
            type="button"
            onClick={() => void handleRebuild()}
            disabled={rebuilding}
            className="text-pla-accent hover:underline disabled:opacity-40"
          >
            {rebuilding ? '重建中…' : '重新抽取'}
          </button>
        </span>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {error && (
          <p className="text-sm text-red-400 px-3 py-2 shrink-0 border-b border-pla-border/40">{error}</p>
        )}

        {graph && graph.nodes.length > 0 ? (
          <div className="flex-1 min-h-0 flex">
            <div className="flex-1 min-w-0 min-h-0 p-1.5">
              <KnowledgeGraphCanvas
                graph={graph}
                layers={layers}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </div>
            <div className="w-[240px] shrink-0 min-h-0">
              <NodeExplainPanel
                graph={graph}
                selectedId={selectedId}
                onClear={() => setSelectedId(null)}
                onSelectNode={setSelectedId}
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center space-y-2 max-w-sm">
              <p className="text-sm text-pla-muted">
                {status.graphReady
                  ? '图谱暂无节点。'
                  : '图谱尚未就绪，请重新生成参考文件或点击「重新抽取」。'}
              </p>
              {!status.graphReady && status.summary && (
                <p className="text-xs text-pla-muted">{status.summary}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
