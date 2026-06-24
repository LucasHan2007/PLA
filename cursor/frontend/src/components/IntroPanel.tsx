interface Props {
  projectName: string
  projectDescription: string
  onProjectNameChange: (v: string) => void
  onProjectDescriptionChange: (v: string) => void
  onSubmit: () => void
  canSubmit: boolean
  loading: boolean
}

function isSubmitShortcut(e: React.KeyboardEvent) {
  return e.key === 'Enter' && (e.ctrlKey || e.metaKey)
}

export default function IntroPanel({
  projectName,
  projectDescription,
  onProjectNameChange,
  onProjectDescriptionChange,
  onSubmit,
  canSubmit,
  loading,
}: Props) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isSubmitShortcut(e)) {
      e.preventDefault()
      if (canSubmit && !loading) onSubmit()
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-6 space-y-5 min-h-0">
        <div className="text-center space-y-2 pb-1">
          <div className="text-3xl">👋</div>
          <h2 className="text-base font-medium text-pla-text">欢迎使用 PLA</h2>
          <p className="text-sm text-pla-muted leading-relaxed">
            请填写项目名称；项目描述可选。提交后 AI 将为你做初步「项目解析」。
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="project-name" className="text-sm text-pla-text">
            项目名称
          </label>
          <input
            id="project-name"
            type="text"
            value={projectName}
            onChange={(e) => onProjectNameChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="例如：手写数字识别"
            disabled={loading}
            className="w-full rounded-lg bg-pla-panel border border-pla-border px-3 py-2 text-sm focus:outline-none focus:border-pla-accent disabled:opacity-60"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="project-desc" className="text-sm text-pla-text">
            项目描述<span className="text-pla-muted font-normal">（可选）</span>
          </label>
          <textarea
            id="project-desc"
            value={projectDescription}
            onChange={(e) => onProjectDescriptionChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="可补充项目目标、技术栈、约束等；留空则仅根据项目名称解析…"
            rows={5}
            disabled={loading}
            className="w-full resize-none rounded-lg bg-pla-panel border border-pla-border px-3 py-2 text-sm focus:outline-none focus:border-pla-accent disabled:opacity-60"
          />
        </div>
      </div>

      <div className="shrink-0 px-6 py-4 border-t border-pla-border bg-pla-panel/60 flex flex-col sm:flex-row items-center justify-between gap-3">
        <span className="text-xs text-pla-muted text-center sm:text-left">
          项目名称必填，描述可选；Ctrl+Enter 提交
        </span>
        <button
          type="button"
          onClick={onSubmit}
          disabled={loading || !canSubmit}
          className="w-full sm:w-auto px-6 py-2 rounded-lg bg-pla-accent hover:bg-pla-accentHover disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors shrink-0"
        >
          {loading ? '提交中...' : '开始解析 (Ctrl+Enter)'}
        </button>
      </div>
    </div>
  )
}

export function formatIntroMessage(projectName: string, projectDescription: string) {
  const name = projectName.trim()
  const desc = projectDescription.trim()
  if (desc) {
    return `项目名称：${name}\n项目描述：${desc}`
  }
  return `项目名称：${name}`
}
