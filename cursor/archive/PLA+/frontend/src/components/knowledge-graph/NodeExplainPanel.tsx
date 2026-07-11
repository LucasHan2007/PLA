import type { ReactNode } from 'react'
import type { KnowledgeGraphEdge, KnowledgeGraphNode, ProjectKnowledgeGraph } from '../../types'
import {
  CATEGORY_FILL,
  CATEGORY_LABELS,
  IMPORTANCE_LABELS,
  PROJECT_HUB_ID,
  RELATION_LABELS,
  SECTION_TITLES,
} from './constants'

interface Props {
  graph: ProjectKnowledgeGraph
  selectedId: string | null
  onClear: () => void
  onSelectNode: (id: string) => void
}

export default function NodeExplainPanel({ graph, selectedId, onClear, onSelectNode }: Props) {
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]))
  const isHub = selectedId === PROJECT_HUB_ID
  const node = selectedId && !isHub ? nodeMap.get(selectedId) ?? null : null

  if (!selectedId) {
    return (
      <aside className="h-full flex flex-col border-l border-pla-border/60 bg-pla-panel/40 min-w-0">
        <div className="px-4 py-3 border-b border-pla-border/60 shrink-0">
          <h3 className="text-sm font-medium text-pla-text">解释栏</h3>
          <p className="text-[11px] text-pla-muted mt-1">单击图谱中的节点查看详情</p>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {graph.summary && (
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wide text-pla-muted">图谱摘要</div>
              <p className="text-xs text-pla-text leading-relaxed">{graph.summary}</p>
            </div>
          )}
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-wide text-pla-muted">图例</div>
            <ul className="space-y-1.5">
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <li key={key} className="flex items-center gap-2 text-xs text-pla-muted">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ background: CATEGORY_FILL[key] }}
                  />
                  {label}
                </li>
              ))}
              <li className="flex items-center gap-2 text-xs text-pla-muted">
                <span className="w-3 h-3 rounded-full shrink-0 bg-[#1e3a5f] border border-blue-400/40" />
                项目中心
              </li>
            </ul>
          </div>
          <div className="text-[11px] text-pla-muted leading-relaxed border-t border-pla-border/40 pt-3">
            边标签：<span className="text-pla-text">前置</span> 表示依赖，
            <span className="text-pla-text">相关</span> 表示关联。可拖拽节点、滚轮缩放。
          </div>
        </div>
      </aside>
    )
  }

  if (isHub) {
    return (
      <aside className="h-full flex flex-col border-l border-pla-border/60 bg-pla-panel/40 min-w-0">
        <Header title={graph.project_name} onClear={onClear} badge="项目" />
        <div className="flex-1 overflow-auto p-4 space-y-3">
          <p className="text-xs text-pla-text leading-relaxed">
            本图谱以「{graph.project_name}」为中心，向外辐射概念、技能、工具与实践节点。
          </p>
          {graph.summary && (
            <p className="text-xs text-pla-muted leading-relaxed">{graph.summary}</p>
          )}
          <StatRow label="节点数" value={String(graph.nodes.length)} />
          <StatRow label="关系数" value={String(graph.edges.length)} />
        </div>
      </aside>
    )
  }

  if (!node) {
    return (
      <aside className="h-full flex flex-col border-l border-pla-border/60 bg-pla-panel/40 min-w-0">
        <Header title="未知节点" onClear={onClear} />
        <div className="p-4 text-xs text-pla-muted">未找到该节点的详细信息。</div>
      </aside>
    )
  }

  const incoming = graph.edges.filter((e) => e.target === node.id)
  const outgoing = graph.edges.filter((e) => e.source === node.id)
  const prereqs = incoming.filter((e) => e.relation === 'requires')
  const relatedIn = incoming.filter((e) => e.relation === 'relates_to')
  const dependents = outgoing.filter((e) => e.relation === 'requires')
  const relatedOut = outgoing.filter((e) => e.relation === 'relates_to')

  return (
    <aside className="h-full flex flex-col border-l border-pla-border/60 bg-pla-panel/40 min-w-0">
      <Header
        title={node.label}
        onClear={onClear}
        badge={CATEGORY_LABELS[node.category] ?? node.category}
        badgeColor={CATEGORY_FILL[node.category]}
      />
      <div className="flex-1 overflow-auto p-4 space-y-4">
        <div className="flex flex-wrap gap-1.5">
          <span
            className="text-[10px] px-2 py-0.5 rounded-full border border-white/15 text-white"
            style={{ background: CATEGORY_FILL[node.category] ?? CATEGORY_FILL.concept }}
          >
            {CATEGORY_LABELS[node.category] ?? node.category}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-pla-border/60 text-pla-muted bg-pla-bg/50">
            {IMPORTANCE_LABELS[node.importance] ?? `重要度 ${node.importance}`}
          </span>
        </div>

        <Block title="说明">
          <p className="text-xs text-pla-text leading-relaxed">
            {node.description || '暂无描述'}
          </p>
        </Block>

        {node.related_sections.length > 0 && (
          <Block title="关联解析段落">
            <ul className="space-y-1">
              {node.related_sections.map((sid) => (
                <li key={sid} className="text-xs text-pla-muted">
                  · {SECTION_TITLES[sid] ?? sid}
                </li>
              ))}
            </ul>
          </Block>
        )}

        <EdgeGroup
          title="前置依赖"
          edges={prereqs}
          nodeMap={nodeMap}
          pick={(e) => e.source}
          onSelectNode={onSelectNode}
        />
        <EdgeGroup
          title="后续依赖本节点"
          edges={dependents}
          nodeMap={nodeMap}
          pick={(e) => e.target}
          onSelectNode={onSelectNode}
        />
        <EdgeGroup
          title="相关节点"
          edges={[...relatedIn, ...relatedOut]}
          nodeMap={nodeMap}
          pick={(e) => (e.source === node.id ? e.target : e.source)}
          onSelectNode={onSelectNode}
          relationHint
        />
      </div>
    </aside>
  )
}

function Header({
  title,
  onClear,
  badge,
  badgeColor,
}: {
  title: string
  onClear: () => void
  badge?: string
  badgeColor?: string
}) {
  return (
    <div className="px-4 py-3 border-b border-pla-border/60 shrink-0 flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] text-pla-muted mb-0.5">解释栏</div>
        <h3 className="text-sm font-medium text-pla-text leading-snug break-words">{title}</h3>
        {badge && (
          <span
            className="inline-block mt-1.5 text-[10px] px-1.5 py-0.5 rounded text-white/95"
            style={{ background: badgeColor ?? '#334155' }}
          >
            {badge}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onClear}
        className="text-[11px] text-pla-muted hover:text-pla-text shrink-0 mt-0.5"
      >
        清除
      </button>
    </div>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-wide text-pla-muted">{title}</div>
      {children}
    </div>
  )
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs border-b border-pla-border/30 py-1.5">
      <span className="text-pla-muted">{label}</span>
      <span className="text-pla-text font-mono">{value}</span>
    </div>
  )
}

function EdgeGroup({
  title,
  edges,
  nodeMap,
  pick,
  onSelectNode,
  relationHint,
}: {
  title: string
  edges: KnowledgeGraphEdge[]
  nodeMap: Map<string, KnowledgeGraphNode>
  pick: (e: KnowledgeGraphEdge) => string
  onSelectNode: (id: string) => void
  relationHint?: boolean
}) {
  if (edges.length === 0) return null

  const seen = new Set<string>()
  const items = edges.filter((e) => {
    const id = pick(e)
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })

  return (
    <Block title={title}>
      <ul className="space-y-1">
        {items.map((e) => {
          const id = pick(e)
          const n = nodeMap.get(id)
          return (
            <li key={`${e.id}-${id}`}>
              <button
                type="button"
                onClick={() => onSelectNode(id)}
                className="text-xs text-pla-accent hover:underline text-left"
              >
                {n?.label ?? id}
              </button>
              {relationHint && (
                <span className="text-[10px] text-pla-muted ml-1">
                  ({RELATION_LABELS[e.relation] ?? e.relation})
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </Block>
  )
}
