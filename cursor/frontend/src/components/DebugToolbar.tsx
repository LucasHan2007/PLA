import type { WorkflowPhase } from '../types'

interface Props {
  phase: WorkflowPhase
  onSkipPhase: (target: WorkflowPhase) => void
  loading: boolean
}

export default function DebugToolbar({ phase, onSkipPhase, loading }: Props) {
  return (
    <div className="flex items-center gap-2 ml-auto flex-wrap justify-end">
      <span className="text-[10px] uppercase tracking-wide text-amber-400/80">调试</span>
      {phase === 'project_analysis' && (
        <button
          type="button"
          disabled={loading}
          onClick={() => onSkipPhase('operation_desc')}
          className="text-xs px-2 py-0.5 rounded border border-amber-500/40 text-amber-400/90 hover:bg-amber-500/10 disabled:opacity-40"
        >
          跳过项目解析
        </button>
      )}
      {phase === 'operation_desc' && (
        <button
          type="button"
          disabled={loading}
          onClick={() => onSkipPhase('code_design')}
          className="text-xs px-2 py-0.5 rounded border border-amber-500/40 text-amber-400/90 hover:bg-amber-500/10 disabled:opacity-40"
        >
          跳过操作描述
        </button>
      )}
    </div>
  )
}
