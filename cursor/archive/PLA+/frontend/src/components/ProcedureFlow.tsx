import type { ProcedureStep, ProcedureStepStatus } from '../data/profilingProcedure'

interface Props {
  title: string
  subtitle?: string
  principle?: string
  steps: ProcedureStep[]
  compact?: boolean
  defaultExpanded?: boolean
}

const STATUS_STYLES: Record<ProcedureStepStatus, string> = {
  pending: 'border-pla-border/50 bg-pla-panel/20 text-pla-muted',
  active: 'border-pla-accent/50 bg-pla-accent/10 text-pla-accent',
  done: 'border-emerald-500/40 bg-emerald-500/5 text-emerald-300',
}

const DOT_STYLES: Record<ProcedureStepStatus, string> = {
  pending: 'bg-pla-border text-pla-muted',
  active: 'bg-pla-accent text-white ring-2 ring-pla-accent/30',
  done: 'bg-emerald-500/80 text-white',
}

export default function ProcedureFlow({
  title,
  subtitle,
  principle,
  steps,
  compact = false,
}: Props) {
  return (
    <section className="rounded-xl border border-pla-border/60 bg-pla-panel/25 overflow-hidden">
      <div className={`${compact ? 'px-3 py-2' : 'px-4 py-3'} border-b border-pla-border/40`}>
        <div className="text-xs font-medium text-pla-text">{title}</div>
        {subtitle && <div className="text-[10px] text-pla-muted mt-0.5">{subtitle}</div>}
        {principle && (
          <div className="text-[10px] text-pla-accent/80 mt-1 leading-relaxed">{principle}</div>
        )}
      </div>
      <ol className={`${compact ? 'p-2 space-y-1' : 'p-3 space-y-2'}`}>
        {steps.map((step, i) => (
          <li key={step.id} className="flex gap-2 min-w-0">
            <div className="flex flex-col items-center shrink-0">
              <span
                className={`flex items-center justify-center rounded-full text-[10px] font-medium ${
                  compact ? 'w-5 h-5' : 'w-6 h-6'
                } ${DOT_STYLES[step.status]}`}
              >
                {step.status === 'done' ? '✓' : i + 1}
              </span>
              {i < steps.length - 1 && (
                <span className="w-px flex-1 min-h-[8px] bg-pla-border/60 my-0.5" />
              )}
            </div>
            <div
              className={`flex-1 min-w-0 rounded-lg border px-2.5 py-1.5 ${
                compact ? 'py-1' : 'py-2'
              } ${STATUS_STYLES[step.status]}`}
            >
              <div className={`font-medium ${compact ? 'text-[10px]' : 'text-xs'}`}>
                {step.title}
                {step.status === 'active' && (
                  <span className="ml-1.5 opacity-80">← 当前</span>
                )}
              </div>
              {!compact && (
                <p className="text-[10px] mt-0.5 leading-relaxed opacity-90">{step.description}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
