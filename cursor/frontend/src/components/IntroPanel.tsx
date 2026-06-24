import type { PresetProject } from '../data/mnistDigitProject'

interface Props {
  projects: PresetProject[]
  selectedId: string | null
  onSelect: (id: string) => void
  onStart: () => void
  canStart: boolean
}

export default function IntroPanel({
  projects,
  selectedId,
  onSelect,
  onStart,
  canStart,
}: Props) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canStart) {
      e.preventDefault()
      onStart()
    }
  }

  return (
    <div className="flex flex-col h-full" onKeyDown={handleKeyDown}>
      <div className="flex-1 overflow-auto p-6 space-y-5 min-h-0">
        <div className="text-center space-y-2 pb-1">
          <div className="text-3xl">👋</div>
          <h2 className="text-base font-medium text-pla-text">欢迎使用 PLA</h2>
          <p className="text-sm text-pla-muted leading-relaxed">
            请选择一个预设学习项目。项目解析、操作描述与代码设计内容已内置，将分步引导学习。
          </p>
        </div>

        <div className="space-y-2">
          <div className="text-sm text-pla-text">可选项目</div>
          <div className="space-y-2">
            {projects.map((project) => {
              const selected = selectedId === project.id
              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => onSelect(project.id)}
                  className={`w-full text-left rounded-xl border p-4 transition-colors ${
                    selected
                      ? 'border-pla-accent bg-pla-accent/10 ring-1 ring-pla-accent/30'
                      : 'border-pla-border hover:border-pla-accent/40 hover:bg-pla-panel/80'
                  }`}
                >
                  <div className="font-medium text-sm text-pla-text">{project.name}</div>
                  <div className="text-xs text-pla-muted mt-1.5 leading-relaxed">
                    {project.shortDescription}
                  </div>
                  <div className="text-[10px] text-pla-accent/80 mt-2">
                    {project.output.logic_plan.length} 项解析 ·{' '}
                    {project.output.execution_steps.length} 个大步骤 ·{' '}
                    {project.output.code_blocks.length} 个代码模块
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="shrink-0 px-6 py-4 border-t border-pla-border bg-pla-panel/60 flex flex-col sm:flex-row items-center justify-between gap-3">
        <span className="text-xs text-pla-muted text-center sm:text-left">
          选择项目后点击开始；Ctrl+Enter 快捷开始
        </span>
        <button
          type="button"
          onClick={onStart}
          disabled={!canStart}
          className="w-full sm:w-auto px-6 py-2 rounded-lg bg-pla-accent hover:bg-pla-accentHover disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors shrink-0"
        >
          开始学习
        </button>
      </div>
    </div>
  )
}
