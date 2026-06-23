import type { LogicPlanItem } from '../types'

interface Props {
  taskSummary: string
  logicPlan: LogicPlanItem[]
  activeId: number | null
  onSelect: (id: number) => void
}

export default function LogicPlanPanel({ taskSummary, logicPlan, activeId, onSelect }: Props) {
  if (!logicPlan.length) {
    return (
      <div className="flex flex-col h-full">
        <div className="panel-header">
          <span>📋</span> 逻辑方案
        </div>
        <div className="panel-body text-pla-muted text-sm flex items-center justify-center">
          发送问题后，AI 将在此展示项目宏观设计
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="panel-header">
        <span>📋</span> 逻辑方案
      </div>
      {taskSummary && (
        <div className="px-4 py-2 text-xs text-pla-muted border-b border-pla-border bg-pla-bg/50">
          {taskSummary}
        </div>
      )}
      <div className="panel-body space-y-1">
        {logicPlan.map((item, idx) => (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            className={`w-full text-left rounded-lg p-3 transition-colors border ${
              activeId === item.id
                ? 'border-pla-accent bg-pla-accent/10'
                : 'border-transparent hover:bg-pla-border/30'
            }`}
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
      </div>
    </div>
  )
}
