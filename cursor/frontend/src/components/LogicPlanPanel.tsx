import type { LogicPlanItem } from '../types'

interface Props {
  taskSummary: string
  logicPlan: LogicPlanItem[]
  activeId: number | null
  onSelect: (id: number) => void
  totalCount?: number
  pendingHint?: string
  dynamicMode?: boolean
  loading?: boolean
}

export default function LogicPlanPanel({
  taskSummary,
  logicPlan,
  activeId,
  onSelect,
  totalCount,
  pendingHint,
  dynamicMode,
  loading,
}: Props) {
  const total = totalCount ?? logicPlan.length
  const hasPending = !dynamicMode && total > logicPlan.length

  if (!logicPlan.length && !hasPending) {
    return (
      <div className="flex flex-col h-full">
        <div className="panel-header">
          <span>📋</span> 项目解析
        </div>
        <div className="panel-body text-pla-muted text-sm flex items-center justify-center text-center px-6 leading-relaxed">
          {loading
            ? 'AI 正在根据你的项目描述做初步解析…'
            : '提交项目描述后，AI 将在此展示初步解析，并随你的反馈动态更新。'}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="panel-header">
        <span>📋</span> 项目解析
        {dynamicMode ? (
          <span className="ml-auto text-xs text-pla-muted">
            {loading ? '更新中…' : `${logicPlan.length} 项 · 动态方案`}
          </span>
        ) : (
          total > 0 && (
            <span className="ml-auto text-xs text-pla-muted">
              {logicPlan.length}/{total} 项
            </span>
          )
        )}
      </div>
      {taskSummary && (
        <div className="px-4 py-2 text-xs text-pla-muted border-b border-pla-border bg-pla-bg/50">
          {taskSummary}
        </div>
      )}
      {dynamicMode && logicPlan.length > 0 && (
        <div className="px-4 py-1.5 text-[11px] text-pla-accent/90 border-b border-pla-border/50 bg-pla-accent/5">
          以下为 AI 基于当前信息的解析草案；回答下方问题或补充对话后，条目会增删改以贴合你的项目。
        </div>
      )}
      <div className="panel-body space-y-1">
        {logicPlan.map((item, idx) => (
          <button
            key={`${item.id}-${item.title}`}
            onClick={() => onSelect(item.id)}
            className={`w-full text-left rounded-lg p-3 transition-colors border ${
              activeId === item.id
                ? 'border-pla-accent bg-pla-accent/10'
                : 'border-transparent hover:bg-pla-border/30'
            } ${loading ? 'opacity-80' : ''}`}
          >
            <div className="flex items-start gap-2">
              <span className="badge shrink-0">{idx + 1}</span>
              <div>
                <div className="font-medium text-sm">{item.title}</div>
                <div className="text-xs text-pla-muted mt-1 leading-relaxed">{item.content}</div>
              </div>
            </div>
          </button>
        ))}
        {hasPending && (
          <div className="rounded-lg border border-dashed border-pla-border/60 p-3 text-xs text-pla-muted text-center leading-relaxed">
            {pendingHint || '完成当前引导性提问后，将揭示下一项项目解析…'}
          </div>
        )}
      </div>
    </div>
  )
}
