import type { WorkflowPhase } from '../types'

interface Props {
  phase: WorkflowPhase
  skipSocratic: boolean
  onSkipSocraticChange: (v: boolean) => void
  onSkipPhase: (target: WorkflowPhase) => void
  loading: boolean
  hasOutput: boolean
}

export default function DebugToolbar({
  phase,
  skipSocratic,
  onSkipSocraticChange,
  onSkipPhase,
  loading,
  hasOutput,
}: Props) {
  return (
    <div className="flex items-center gap-2 ml-auto flex-wrap justify-end">
      <span className="text-[10px] uppercase tracking-wide text-amber-400/80">调试</span>
      <label className="flex items-center gap-1.5 text-xs text-pla-muted cursor-pointer select-none">
        <input
          type="checkbox"
          checked={skipSocratic}
          onChange={(e) => onSkipSocraticChange(e.target.checked)}
          className="accent-amber-500"
        />
        跳过提问
      </label>
      {(phase === 'project_analysis' || (phase === 'intro' && hasOutput)) && (
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
