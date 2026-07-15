import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  CodeAssistMode,
  CodeBlueprint,
  CodeNode,
  LearningNode,
} from '../types'
import {
  fetchCodeBlueprint,
  fetchImplementationStatus,
  fetchLearningNodesList,
  rebuildCodeBlueprint,
  requestCodeAssist,
  saveCodeDraft,
} from '../services/api'
import { alignCodeNodesToLearningNodes } from '../utils/alignCodeNodes'

const STATUS_LABEL: Record<LearningNode['status'], string> = {
  not_started: '未开始',
  in_progress: '进行中',
  completed: '已完成',
}

interface Props {
  sessionId: string | null
  frameworkReady: boolean
  profileReady: boolean
  projectName: string
  nodesReady: boolean
  selectedNodeId: string | null
  onSelectNode: (node: LearningNode) => void
}

/** 在栏内滚动到对应节点分栏（避免 scrollIntoView 带动整页滚动） */
function scrollColumnToNode(container: HTMLElement | null, nodeId: string) {
  if (!container) return
  const el = container.querySelector<HTMLElement>(`[data-align-node="${CSS.escape(nodeId)}"]`)
  if (!el) return
  const elRect = el.getBoundingClientRect()
  const boxRect = container.getBoundingClientRect()
  const top = elRect.top - boxRect.top + container.scrollTop - 8
  container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
}

/** 中间栏：自然语言说明 + 伪代码/模板（只读教材式） */
function BlueprintLane({ node }: { node: CodeNode | null }) {
  if (!node) {
    return (
      <p className="text-xs text-pla-muted leading-relaxed py-2">
        暂无与该学习节点对应的代码蓝图说明。
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-pla-muted font-mono">#{node.order} · {node.title}</div>
      {node.segments.map((seg, i) =>
        seg.type === 'code' ? (
          <div key={i} className="rounded-lg border border-pla-border/50 overflow-hidden">
            <div className="px-2.5 py-1 text-[10px] text-pla-muted bg-pla-bg/80 border-b border-pla-border/40 flex gap-2">
              <span>{seg.label || '伪代码 / 模板'}</span>
              {seg.language && <span className="opacity-60">{seg.language}</span>}
            </div>
            <pre className="px-2.5 py-2 text-[11px] font-mono leading-relaxed text-sky-200/85 bg-[#121820] overflow-x-auto whitespace-pre">
              {seg.content}
            </pre>
          </div>
        ) : (
          <p key={i} className="text-sm text-pla-text leading-relaxed">
            {seg.content}
          </p>
        ),
      )}
    </div>
  )
}

/** 右侧栏：该节点的详细代码（可编辑练习） */
function CodeLane({
  node,
  draft,
  onDraftChange,
}: {
  node: CodeNode | null
  draft: string
  onDraftChange: (v: string) => void
}) {
  if (!node) {
    return (
      <p className="text-xs text-pla-muted leading-relaxed py-2">
        暂无对应详细代码。
      </p>
    )
  }

  const codeParts = node.segments.filter((s) => s.type === 'code')

  return (
    <div className="space-y-3">
      <div className="text-xs text-pla-muted font-mono">#{node.order} · {node.title}</div>
      {codeParts.length === 0 ? (
        <p className="text-xs text-pla-muted">该节点尚无代码段。</p>
      ) : (
        codeParts.map((seg, i) => (
          <div key={i} className="rounded-lg border border-pla-border/50 overflow-hidden">
            <div className="px-2.5 py-1 text-[10px] text-pla-muted bg-pla-bg/80 border-b border-pla-border/40 flex gap-2">
              <span>{seg.label || '详细代码'}</span>
              {seg.language && <span className="opacity-60">{seg.language}</span>}
            </div>
            <pre className="px-2.5 py-2 text-[11px] font-mono leading-relaxed text-emerald-200/90 bg-[#0d1218] overflow-x-auto whitespace-pre">
              {seg.content}
            </pre>
          </div>
        ))
      )}
      <div className="rounded-lg border border-dashed border-pla-border/50 overflow-hidden">
        <div className="px-2.5 py-1 text-[10px] text-pla-muted bg-pla-bg/60 border-b border-pla-border/40">
          练习编辑 · 对照上方编写
        </div>
        <textarea
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          spellCheck={false}
          rows={8}
          className="w-full font-mono text-[11px] leading-relaxed bg-[#1a1f2e] text-pla-text px-2.5 py-2 resize-y focus:outline-none focus:ring-1 focus:ring-pla-accent border-0"
          placeholder="# 在此对照伪代码编写本节点代码…"
        />
      </div>
    </div>
  )
}

export default function ImplementationPanel({
  sessionId,
  frameworkReady,
  profileReady,
  projectName,
  nodesReady,
  selectedNodeId,
  onSelectNode,
}: Props) {
  const [learningNodes, setLearningNodes] = useState<LearningNode[]>([])
  const [blueprint, setBlueprint] = useState<CodeBlueprint | null>(null)
  const [status, setStatus] = useState({
    blueprintReady: false,
    blueprintPending: false,
    codeNodeCount: 0,
  })
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [assistMode, setAssistMode] = useState<CodeAssistMode>('understand')
  const [assistInput, setAssistInput] = useState('')
  const [assistAnswer, setAssistAnswer] = useState<string | null>(null)
  const [assistLoading, setAssistLoading] = useState(false)
  const [blueprintLoading, setBlueprintLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nodesLoading, setNodesLoading] = useState(false)

  const leftRef = useRef<HTMLDivElement>(null)
  const midRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    if (!sessionId || !frameworkReady) return
    setError(null)
    try {
      const tasks: Promise<unknown>[] = [
        fetchImplementationStatus(sessionId),
        fetchCodeBlueprint(sessionId),
      ]
      if (nodesReady) {
        setNodesLoading(true)
        tasks.push(fetchLearningNodesList(sessionId))
      }
      const results = await Promise.all(tasks)
      const st = results[0] as Awaited<ReturnType<typeof fetchImplementationStatus>>
      const bp = results[1] as Awaited<ReturnType<typeof fetchCodeBlueprint>>
      setStatus({
        blueprintReady: !!st.code_blueprint_ready,
        blueprintPending: !!st.code_blueprint_pending,
        codeNodeCount: st.code_node_count ?? 0,
      })
      setBlueprint(bp.blueprint)
      if (nodesReady && results[2]) {
        const ln = results[2] as Awaited<ReturnType<typeof fetchLearningNodesList>>
        const sorted = [...ln.nodes].sort((a, b) => a.order - b.order)
        setLearningNodes(sorted)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setNodesLoading(false)
    }
  }, [sessionId, frameworkReady, nodesReady])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!sessionId || !frameworkReady || status.blueprintReady || !status.blueprintPending) return
    const id = window.setInterval(() => void refresh(), 3000)
    return () => window.clearInterval(id)
  }, [sessionId, frameworkReady, status.blueprintReady, status.blueprintPending, refresh])

  useEffect(() => {
    if (!selectedNodeId && learningNodes[0]) onSelectNode(learningNodes[0])
  }, [learningNodes, selectedNodeId, onSelectNode])

  const alignment = useMemo(
    () => alignCodeNodesToLearningNodes(learningNodes, blueprint?.code_nodes ?? []),
    [learningNodes, blueprint],
  )

  /** 点击节点 → 三栏对齐；在中/右栏点击时，点击处分栏滚到该栏顶部 */
  const jumpToNode = useCallback((nodeId: string, source: 'left' | 'mid' | 'right' = 'left') => {
    requestAnimationFrame(() => {
      // 左侧点选：只滚中、右；中/右点选：三栏都滚，且点击栏本身顶对齐
      if (source === 'left') {
        scrollColumnToNode(midRef.current, nodeId)
        scrollColumnToNode(rightRef.current, nodeId)
      } else {
        scrollColumnToNode(leftRef.current, nodeId)
        scrollColumnToNode(midRef.current, nodeId)
        scrollColumnToNode(rightRef.current, nodeId)
      }
    })
  }, [])

  const handleSelect = useCallback(
    (node: LearningNode, source: 'left' | 'mid' | 'right' = 'left') => {
      onSelectNode(node)
      jumpToNode(node.id, source)
    },
    [onSelectNode, jumpToNode],
  )

  const handleRebuildBlueprint = useCallback(async () => {
    if (!sessionId || blueprintLoading) return
    setBlueprintLoading(true)
    setError(null)
    try {
      const res = await rebuildCodeBlueprint(sessionId)
      setBlueprint(res.blueprint)
      setStatus((s) => ({
        ...s,
        blueprintReady: !!res.blueprint,
        codeNodeCount: res.blueprint?.code_nodes.length ?? 0,
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : '蓝图重建失败')
    } finally {
      setBlueprintLoading(false)
    }
  }, [sessionId, blueprintLoading])

  const selectedCodeNode = selectedNodeId ? alignment.get(selectedNodeId) ?? null : null
  const selectedDraft =
    (selectedNodeId && drafts[selectedNodeId]) ||
    selectedCodeNode?.segments
      .filter((s) => s.type === 'code')
      .map((s) => s.content)
      .join('\n\n') ||
    ''

  const handleAssist = useCallback(async () => {
    if (!sessionId || !assistInput.trim() || assistLoading) return
    setAssistLoading(true)
    setError(null)
    try {
      const fileName = selectedNodeId ? `${selectedNodeId}.py` : 'main.py'
      await saveCodeDraft({
        session_id: sessionId,
        file_name: fileName,
        language: 'python',
        content: selectedDraft,
      })
      const res = await requestCodeAssist({
        session_id: sessionId,
        mode: assistMode,
        code: selectedDraft,
        message: assistInput.trim(),
        file_name: fileName,
        learning_node_id: selectedNodeId,
      })
      setAssistAnswer(res.answer)
      setAssistInput('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '辅助失败')
    } finally {
      setAssistLoading(false)
    }
  }, [
    sessionId,
    assistInput,
    assistLoading,
    assistMode,
    selectedDraft,
    selectedNodeId,
  ])

  if (!frameworkReady || !sessionId) {
    return (
      <div className="flex flex-col h-full">
        <div className="panel-header">
          <span>💻</span> 代码模块
        </div>
        <div className="panel-body flex items-center justify-center p-6">
          <p className="text-sm text-pla-muted text-center">
            请先完成项目解析；解析时会自动拆解代码节点与伪代码模板。
          </p>
        </div>
      </div>
    )
  }

  const codeNodes = blueprint?.code_nodes ?? []
  const rows =
    learningNodes.length > 0
      ? learningNodes
      : codeNodes.map(
          (cn, idx): LearningNode => ({
            id: cn.id,
            order: cn.order || idx + 1,
            title: cn.title,
            summary: '学习节点尚未生成，暂以代码蓝图节点展示。',
            guiding_question: '',
            focus_skills: [],
            related_sections: cn.related_sections,
            status: 'not_started',
          }),
        )

  // 无学习节点时用代码节点自身做对齐
  const effectiveAlignment =
    learningNodes.length > 0
      ? alignment
      : new Map(rows.map((r) => [r.id, codeNodes.find((c) => c.id === r.id) ?? null]))

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="panel-header gap-2 flex-wrap">
        <span>💻</span>
        <span>代码模块</span>
        <span className="text-xs text-pla-muted truncate max-w-[220px]">
          {blueprint?.project_name || projectName}
        </span>
        <span className="ml-auto text-xs text-pla-muted">
          {status.blueprintReady
            ? `${status.codeNodeCount || codeNodes.length} 个代码节点 · 与学习节点对齐`
            : status.blueprintPending
              ? '蓝图后台生成中…'
              : '蓝图未就绪'}
        </span>
        <button
          type="button"
          onClick={() => void handleRebuildBlueprint()}
          disabled={blueprintLoading}
          className="text-xs text-pla-accent hover:underline disabled:opacity-40"
        >
          {blueprintLoading ? '重建中…' : '重新抽取'}
        </button>
      </div>

      {error && (
        <p className="px-4 py-2 text-sm text-red-400 border-b border-pla-border/40 shrink-0">{error}</p>
      )}

      {!status.blueprintReady && codeNodes.length === 0 && (
        <div className="mx-4 mt-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2 shrink-0">
          <p className="text-sm text-pla-text">
            {status.blueprintPending
              ? '代码蓝图正在后台生成，请稍候…完成后将自动刷新。'
              : '当前会话尚无代码蓝图。'}
          </p>
          {!status.blueprintPending && (
            <button
              type="button"
              onClick={() => void handleRebuildBlueprint()}
              disabled={blueprintLoading}
              className="px-4 py-2 rounded-lg bg-pla-accent hover:bg-pla-accentHover disabled:opacity-40 text-sm font-medium"
            >
              {blueprintLoading ? '生成中…' : '现在生成代码蓝图'}
            </button>
          )}
        </div>
      )}

      {/* 三栏：左学习节点 · 中自然语言+伪代码 · 右详细代码 — 按节点一一对应 */}
      <div className="flex-1 min-h-0 flex border-t border-pla-border/40">
        {/* 左：项目名 + 学习节点及内容 */}
        <aside className="w-[260px] shrink-0 border-r border-pla-border/60 flex flex-col min-h-0 bg-pla-panel/20">
          <div className="px-3 py-2.5 border-b border-pla-border/50 shrink-0">
            <div className="text-[10px] text-pla-muted uppercase tracking-wide">项目</div>
            <div className="text-sm font-semibold text-pla-text truncate mt-0.5">
              {projectName || blueprint?.project_name || '未命名项目'}
            </div>
          </div>
          <div ref={leftRef} className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
            {nodesLoading && <p className="text-xs text-pla-muted px-1">加载学习节点…</p>}
            {!nodesReady && learningNodes.length === 0 && (
              <p className="text-xs text-pla-muted leading-relaxed px-1 py-2">
                尚未生成学习节点时，左侧暂以代码蓝图节点列表展示；完成引导问答后将与学习节点对齐。
              </p>
            )}
            {rows.map((node) => {
              const active = node.id === selectedNodeId
              return (
                <button
                  key={node.id}
                  type="button"
                  data-align-node={node.id}
                  onClick={() => handleSelect(node, 'left')}
                  className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                    active
                      ? 'border-pla-accent bg-pla-accent/10'
                      : 'border-pla-border/50 bg-pla-bg/40 hover:border-pla-accent/40'
                  }`}
                >
                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                    <span className="text-[10px] font-mono text-pla-muted">N{node.order}</span>
                    <span className="text-xs font-medium text-pla-text">{node.title}</span>
                    {learningNodes.length > 0 && (
                      <span className="text-[9px] px-1 py-0.5 rounded border border-pla-border/50 text-pla-muted">
                        {STATUS_LABEL[node.status]}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-pla-muted leading-relaxed line-clamp-3">
                    {node.summary}
                  </p>
                  {active && node.guiding_question && (
                    <p className="text-[10px] text-pla-text/80 leading-relaxed mt-1.5 pt-1.5 border-t border-pla-border/40">
                      <span className="text-pla-muted">引导：</span>
                      {node.guiding_question}
                    </p>
                  )}
                  {active && node.focus_skills.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {node.focus_skills.map((s) => (
                        <span
                          key={s}
                          className="text-[9px] px-1 py-0.5 rounded bg-pla-bg border border-pla-border/40 text-pla-muted"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </aside>

        {/* 中：自然语言描述 + 伪代码 */}
        <section className="flex-1 min-w-0 flex flex-col border-r border-pla-border/60 min-h-0">
          <div className="px-3 py-2 border-b border-pla-border/50 shrink-0 flex items-center gap-2">
            <span className="text-xs font-medium text-pla-text">自然语言 · 伪代码</span>
            <span className="text-[10px] text-pla-muted">按学习节点分栏</span>
          </div>
          <div ref={midRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4">
            {blueprint?.summary && (
              <p className="text-xs text-pla-muted leading-relaxed rounded-lg border border-pla-border/40 bg-pla-bg/40 px-3 py-2">
                {blueprint.summary}
              </p>
            )}
            {rows.map((ln) => {
              const cn = effectiveAlignment.get(ln.id) ?? null
              const active = ln.id === selectedNodeId
              return (
                <article
                  key={ln.id}
                  data-align-node={ln.id}
                  onClick={() => handleSelect(ln, 'mid')}
                  className={`rounded-xl border p-3 cursor-pointer transition-colors ${
                    active
                      ? 'border-pla-accent/50 bg-pla-accent/5'
                      : 'border-pla-border/50 bg-pla-panel/20 hover:border-pla-accent/30'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-mono text-pla-muted">N{ln.order}</span>
                    <h3 className="text-sm font-medium text-pla-text">{ln.title}</h3>
                  </div>
                  <BlueprintLane node={cn} />
                </article>
              )
            })}
          </div>
        </section>

        {/* 右：详细代码 */}
        <section className="flex-1 min-w-0 flex flex-col min-h-0">
          <div className="px-3 py-2 border-b border-pla-border/50 shrink-0 flex items-center gap-2">
            <span className="text-xs font-medium text-pla-text">详细代码</span>
            <span className="text-[10px] text-pla-muted">与左侧节点一一对应</span>
          </div>
          <div ref={rightRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4">
            {rows.map((ln) => {
              const cn = effectiveAlignment.get(ln.id) ?? null
              const active = ln.id === selectedNodeId
              const draft =
                drafts[ln.id] ??
                cn?.segments
                  .filter((s) => s.type === 'code')
                  .map((s) => s.content)
                  .join('\n\n') ??
                ''
              return (
                <article
                  key={ln.id}
                  data-align-node={ln.id}
                  onClick={() => handleSelect(ln, 'right')}
                  className={`rounded-xl border p-3 transition-colors ${
                    active
                      ? 'border-emerald-500/40 bg-emerald-500/5'
                      : 'border-pla-border/50 bg-pla-panel/20 hover:border-emerald-500/25'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-mono text-pla-muted">N{ln.order}</span>
                    <h3 className="text-sm font-medium text-pla-text">{ln.title}</h3>
                  </div>
                  <CodeLane
                    node={cn}
                    draft={draft}
                    onDraftChange={(v) => {
                      setDrafts((prev) => ({ ...prev, [ln.id]: v }))
                    }}
                  />
                </article>
              )
            })}
          </div>
        </section>
      </div>

      {/* 底部：当前节点代码辅助（画像就绪后） */}
      {profileReady && nodesReady && selectedNodeId && (
        <div className="shrink-0 border-t border-pla-border/60 px-3 py-2.5 bg-pla-panel/40 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-pla-muted">代码辅助 · 当前节点</span>
            <button
              type="button"
              onClick={() => setAssistMode('understand')}
              className={`px-2 py-1 rounded text-[10px] font-medium ${
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
              className={`px-2 py-1 rounded text-[10px] font-medium ${
                assistMode === 'completion'
                  ? 'bg-pla-accent text-white'
                  : 'bg-pla-bg border border-pla-border text-pla-muted'
              }`}
            >
              补全型
            </button>
            <input
              type="text"
              value={assistInput}
              onChange={(e) => setAssistInput(e.target.value)}
              placeholder={
                assistMode === 'understand'
                  ? '例如：这段数据加载在做什么？'
                  : '例如：帮我写归一化的第一步骨架'
              }
              className="flex-1 min-w-[160px] rounded border border-pla-border bg-pla-bg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-pla-accent"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleAssist()
              }}
            />
            <button
              type="button"
              onClick={() => void handleAssist()}
              disabled={assistLoading || !assistInput.trim()}
              className="px-3 py-1 rounded bg-pla-accent hover:bg-pla-accentHover disabled:opacity-40 text-xs font-medium"
            >
              {assistLoading ? '处理中…' : '获取辅助'}
            </button>
          </div>
          {assistAnswer && (
            <pre className="text-xs text-pla-text whitespace-pre-wrap font-sans leading-relaxed max-h-24 overflow-y-auto rounded border border-emerald-500/25 bg-emerald-500/5 px-2 py-1.5">
              {assistAnswer}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
