import { useEffect, useState } from 'react'
import type { AnalysisStepTask } from '../types/analysisTask'
import type { LogicPlanItem } from '../types'

interface Props {
  taskSummary: string
  planItem: LogicPlanItem | null
  task: AnalysisStepTask | null
  stepIndex: number
  stepTotal: number
}

export default function ProjectAnalysisStepPanel({
  taskSummary,
  planItem,
  task,
  stepIndex,
  stepTotal,
}: Props) {
  const [termsExpanded, setTermsExpanded] = useState(false)
  const [actionsExpanded, setActionsExpanded] = useState(false)

  useEffect(() => {
    setTermsExpanded(false)
    setActionsExpanded(false)
  }, [stepIndex])

  if (!planItem || !task) {
    return (
      <div className="flex flex-col h-full">
        <div className="panel-header">
          <span>📋</span> 项目解析
        </div>
        <div className="panel-body text-pla-muted text-sm flex items-center justify-center text-center px-6">
          选择内置项目并开始学习后，此处将分步展示解析内容与对应的项目任务。
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="panel-header">
        <span>📋</span> 项目解析
        <span className="ml-auto text-xs text-pla-muted">
          第 {stepIndex}/{stepTotal} 步
        </span>
      </div>

      {taskSummary && (
        <div className="px-4 py-2 text-xs text-pla-muted border-b border-pla-border bg-pla-bg/50 shrink-0">
          {taskSummary}
        </div>
      )}

      <div className="panel-body space-y-4 overflow-auto min-h-0">
        <section className="rounded-xl border border-pla-border/60 bg-pla-panel/30 p-4">
          <div className="text-[10px] uppercase tracking-wide text-pla-muted mb-2">本步解析</div>
          <div className="flex items-start gap-3">
            <span className="badge shrink-0">{stepIndex}</span>
            <div className="min-w-0">
              <h3 className="font-semibold text-base text-pla-text">{planItem.title}</h3>
              <p className="text-sm text-pla-muted mt-2 leading-relaxed">{planItem.content}</p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-pla-accent/40 bg-pla-accent/5 p-4">
          <div className="text-[10px] uppercase tracking-wide text-pla-accent mb-2">本步任务</div>
          <h3 className="font-semibold text-base text-pla-text">{task.title}</h3>

          <div className="mt-3 space-y-3">
            <div className="rounded-lg border border-pla-border/50 bg-pla-bg/30 px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-wide text-pla-muted mb-1.5">
                任务说明--专业版
              </div>
              <p className="text-sm text-pla-text leading-relaxed">{task.summary}</p>
            </div>

            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-wide text-amber-400/90 mb-1.5">
                任务说明--生动版
              </div>
              <p className="text-sm text-pla-text leading-relaxed">{task.summaryVivid}</p>
            </div>

            <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-wide text-violet-400/90 mb-1.5">
                对照
              </div>
              <p className="text-sm text-pla-text leading-relaxed">{task.summaryBridge}</p>
            </div>
          </div>

          {task.termNotes.length > 0 && (
            <div className="mt-3 rounded-lg border border-pla-border/60 bg-pla-bg/40 overflow-hidden">
              <button
                type="button"
                onClick={() => setTermsExpanded((v) => !v)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-pla-bg/60 transition-colors"
                aria-expanded={termsExpanded}
              >
                <span className="text-xs font-medium text-pla-text">
                  💡 术语说明
                  <span className="text-pla-muted font-normal ml-1.5">
                    （{task.termNotes.length} 项，点击{termsExpanded ? '收起' : '展开'}）
                  </span>
                </span>
                <span
                  className={`text-pla-muted text-xs shrink-0 transition-transform ${termsExpanded ? 'rotate-180' : ''}`}
                  aria-hidden
                >
                  ▼
                </span>
              </button>
              {termsExpanded && (
                <ul className="px-3 pb-3 pt-0 space-y-2 border-t border-pla-border/40">
                  {task.termNotes.map(({ term, note }) => (
                    <li key={term} className="text-sm leading-relaxed pt-2 first:pt-3">
                      <span className="text-pla-accent font-medium">{term}</span>
                      <span className="text-pla-muted"> — {note}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {task.actions.length > 0 && (
            <div className="mt-4 rounded-lg border border-pla-border/60 bg-pla-bg/40 overflow-hidden">
              <button
                type="button"
                onClick={() => setActionsExpanded((v) => !v)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-pla-bg/60 transition-colors"
                aria-expanded={actionsExpanded}
              >
                <span className="text-xs font-medium text-pla-text">
                  待完成工作
                  <span className="text-pla-muted font-normal ml-1.5">
                    （{task.actions.length} 项，点击{actionsExpanded ? '收起' : '展开'}）
                  </span>
                </span>
                <span
                  className={`text-pla-muted text-xs shrink-0 transition-transform ${actionsExpanded ? 'rotate-180' : ''}`}
                  aria-hidden
                >
                  ▼
                </span>
              </button>
              {actionsExpanded && (
                <ul className="px-3 pb-3 pt-0 space-y-2 border-t border-pla-border/40">
                  {task.actions.map((item) => (
                    <li key={item} className="flex gap-2 text-sm text-pla-muted leading-relaxed pt-2 first:pt-3">
                      <span className="text-pla-accent shrink-0 mt-0.5">□</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="mt-4 rounded-lg bg-pla-bg/60 border border-pla-border/50 px-3 py-2.5">
            <div className="text-[10px] text-pla-muted mb-1.5">本步产出</div>
            <div className="flex flex-wrap gap-1.5">
              {task.deliverables.map((point) => (
                <span key={point} className="badge text-[10px]">
                  {point}
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
