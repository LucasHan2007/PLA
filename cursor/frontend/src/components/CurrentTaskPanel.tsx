import type { AnalysisStepTask } from '../types/analysisTask'

interface Props {
  task: AnalysisStepTask | null
  stepIndex: number
  stepTotal: number
  planTitle?: string
}

export default function CurrentTaskPanel({ task, stepIndex, stepTotal, planTitle }: Props) {
  return (
    <div className="flex flex-col h-full bg-pla-bg">
      <div className="panel-header">
        <span>📌</span> 本步任务
        {stepTotal > 0 && (
          <span className="ml-auto text-xs text-pla-muted">
            第 {stepIndex}/{stepTotal} 步
          </span>
        )}
      </div>

      <div className="flex-1 overflow-auto p-3 min-h-0">
        {!task ? (
          <div className="text-sm text-pla-muted text-center py-6 leading-relaxed">
            选择项目并开始学习后，此处将展示本步需完成的项目工作。
          </div>
        ) : (
          <div className="rounded-lg border border-pla-accent/40 bg-pla-accent/5 p-3 space-y-3">
            {planTitle && (
              <div className="text-[10px] uppercase tracking-wide text-pla-accent">
                对应解析 · {planTitle}
              </div>
            )}
            <div>
              <div className="font-medium text-sm">{task.title}</div>
              <p className="text-xs text-pla-muted mt-1.5 leading-relaxed">{task.summary}</p>
            </div>

            <div>
              <div className="text-xs font-medium text-pla-text mb-1.5">待完成工作</div>
              <ul className="space-y-1.5">
                {task.actions.map((item) => (
                  <li key={item} className="flex gap-2 text-xs text-pla-muted leading-relaxed">
                    <span className="text-pla-accent shrink-0">□</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-md bg-pla-bg/60 border border-pla-border/50 px-2.5 py-2">
              <div className="text-[10px] text-pla-muted mb-1">本步产出</div>
              <div className="flex flex-wrap gap-1">
                {task.deliverables.map((point) => (
                  <span key={point} className="badge text-[10px]">
                    {point}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
