import type { ExecutionStep, LogicPlanItem } from '../types'

interface Props {
  taskSummary: string
  logicPlan: LogicPlanItem[]
  executionSteps: ExecutionStep[]
  showSteps: boolean
}

export default function ReferenceSidebar({
  taskSummary,
  logicPlan,
  executionSteps,
  showSteps,
}: Props) {
  return (
    <div className="flex flex-col h-full bg-pla-bg/80">
      <div className="panel-header text-xs">
        <span>📎</span> 参考
      </div>
      {taskSummary && (
        <div className="px-2 py-1.5 text-[10px] text-pla-muted border-b border-pla-border leading-snug">
          {taskSummary}
        </div>
      )}
      <div className="flex-1 overflow-auto p-2 space-y-3 min-h-0">
        <section>
          <div className="text-[10px] uppercase tracking-wide text-pla-accent mb-1.5">项目解析</div>
          <div className="space-y-1.5">
            {logicPlan.map((item, idx) => (
              <div key={item.id} className="rounded border border-pla-border/40 px-2 py-1.5">
                <div className="flex items-start gap-1.5">
                  <span className="text-[10px] text-pla-accent shrink-0">{idx + 1}</span>
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium leading-tight">{item.title}</div>
                    <div className="text-[10px] text-pla-muted mt-0.5 leading-snug">{item.content}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {showSteps && executionSteps.length > 0 && (
          <section>
            <div className="text-[10px] uppercase tracking-wide text-pla-accent mb-1.5">操作描述</div>
            <div className="space-y-2">
              {executionSteps.map((group) => (
                <div key={group.step_id} className="rounded border border-pla-border/40 px-2 py-1.5">
                  <div className="flex items-start gap-1.5">
                    <span className="text-[10px] text-pla-accent shrink-0">{group.step_id}</span>
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium leading-tight">{group.title}</div>
                      {(group.sub_steps ?? []).length > 0 && (
                        <div className="mt-1 space-y-1">
                          {(group.sub_steps ?? []).map((sub) => (
                            <div key={sub.sub_id} className="text-[10px] text-pla-muted leading-snug pl-2 border-l border-pla-border/40">
                              {sub.title}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
