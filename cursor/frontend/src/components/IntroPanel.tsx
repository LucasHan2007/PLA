import type { ProjectTemplate } from '../types'

interface Props {
  templates: ProjectTemplate[]
  selectedId: string | null
  customName: string
  customHint: string
  onSelect: (id: string) => void
  onCustomNameChange: (v: string) => void
  onCustomHintChange: (v: string) => void
  onStart: () => void
  canStart: boolean
  loading?: boolean
  error?: string | null
}

/** 页面 1：项目列表 + 项目名称/项目描述（线框中的「对话框」） */
export default function IntroPanel({
  templates,
  selectedId,
  customName,
  customHint,
  onSelect,
  onCustomNameChange,
  onCustomHintChange,
  onStart,
  canStart,
  loading = false,
  error = null,
}: Props) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-6 space-y-4 min-h-0">
        <div className="text-center space-y-1.5 pb-1">
          <h2 className="text-base font-medium text-pla-text">选择或创建项目</h2>
          <p className="text-xs text-pla-muted leading-relaxed">
            选择示例项目或输入自定义项目。确认后先完成项目解析并进入学习；通用图谱与代码蓝图在后台生成。
          </p>
        </div>

        <div className="space-y-2">
          {templates.map((t, i) => {
            const selected = selectedId === t.id && !customName.trim()
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelect(t.id)}
                onDoubleClick={() => !loading && onStart()}
                disabled={loading}
                className={`w-full text-left rounded-xl border p-4 transition-colors ${
                  selected
                    ? 'border-pla-accent bg-pla-accent/10 ring-1 ring-pla-accent/30'
                    : 'border-pla-border hover:border-pla-accent/40 hover:bg-pla-panel/80'
                }`}
              >
                <div className="font-medium text-sm">
                  项目 {i + 1}：{t.name}
                </div>
                <div className="text-xs text-pla-muted mt-1.5 leading-relaxed">{t.hint}</div>
              </button>
            )
          })}
        </div>
      </div>

      {/* 线框「对话框」= 项目名称 + 项目描述 */}
      <div className="shrink-0 px-6 py-4 border-t border-pla-border bg-pla-panel/60 space-y-3">
        <div className="text-xs text-pla-muted">自定义项目（可选）</div>
        <input
          type="text"
          value={customName}
          onChange={(e) => onCustomNameChange(e.target.value)}
          placeholder="项目名称"
          disabled={loading}
          className="w-full rounded-lg border border-pla-border bg-pla-bg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-pla-accent disabled:opacity-50"
        />
        <textarea
          value={customHint}
          onChange={(e) => onCustomHintChange(e.target.value)}
          placeholder="项目描述（可选）"
          rows={2}
          disabled={loading}
          className="w-full rounded-lg border border-pla-border bg-pla-bg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-pla-accent disabled:opacity-50"
        />
        {error && <p className="text-sm text-red-400 text-center">{error}</p>}
        <button
          type="button"
          onClick={onStart}
          disabled={!canStart || loading}
          className="w-full px-6 py-2.5 rounded-lg bg-pla-accent hover:bg-pla-accentHover disabled:opacity-40 text-sm font-medium transition-colors"
        >
          {loading ? '正在生成项目解析（图谱后台生成）…' : '开始学习'}
        </button>
      </div>
    </div>
  )
}
