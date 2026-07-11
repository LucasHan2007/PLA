import { useState } from 'react'

const SECTION_LABELS = [
  '项目目标',
  '问题定义',
  '数据输入、输出流与数据模型及约束',
  '任务分解',
  '所涉及的知识与技能',
  '实现方案',
  '代码的运行、验证与调试',
  '迭代优化',
]

interface Props {
  projectName: string
  projectHint: string
  onProjectNameChange: (value: string) => void
  onProjectHintChange: (value: string) => void
  frameworkReady: boolean
  loading: boolean
  error: string | null
  onGenerate: () => void
}

export default function ProjectParserPanel({
  projectName,
  projectHint,
  onProjectNameChange,
  onProjectHintChange,
  frameworkReady,
  loading,
  error,
  onGenerate,
}: Props) {
  const [hintExpanded, setHintExpanded] = useState(false)

  return (
    <div className="flex flex-col h-full">
      <div className="panel-header">
        <span>🔍</span> 项目解析
        <span className="ml-auto text-xs text-pla-muted">后台八段体系</span>
      </div>

      <div className="panel-body space-y-4 overflow-auto min-h-0">
        <section className="rounded-xl border border-pla-border/60 bg-pla-panel/30 p-4 space-y-3">
          <p className="text-sm text-pla-muted leading-relaxed">
            项目解析已在选择项目时完成，参考体系保存于后台。内容不在此展示，可用于答疑与后续模块。
          </p>
          <label className="block space-y-1.5">
            <span className="text-xs text-pla-text">项目名称</span>
            <input
              type="text"
              value={projectName}
              onChange={(e) => onProjectNameChange(e.target.value)}
              disabled={loading}
              className="w-full rounded-lg border border-pla-border bg-pla-bg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-pla-accent disabled:opacity-50"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs text-pla-text">补充说明（可选）</span>
            <textarea
              value={projectHint}
              onChange={(e) => onProjectHintChange(e.target.value)}
              rows={2}
              disabled={loading}
              className="w-full rounded-lg border border-pla-border bg-pla-bg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-pla-accent disabled:opacity-50"
            />
          </label>
          <button
            type="button"
            onClick={onGenerate}
            disabled={loading || !projectName.trim()}
            className="px-5 py-2 rounded-lg bg-pla-accent hover:bg-pla-accentHover disabled:opacity-40 text-sm font-medium transition-colors"
          >
            {loading ? '正在重新生成…' : '重新生成参考文件'}
          </button>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </section>

        {frameworkReady && (
          <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2">
            <div className="text-sm font-medium text-emerald-300">✓ 参考文件已保存至后台</div>
            <p className="text-sm text-pla-muted">
              「{projectName}」的八段解析体系已就绪，基础知识图谱将同步生成。可查看「知识图谱」或进行「用户画像」。
            </p>
            <button
              type="button"
              onClick={() => setHintExpanded((v) => !v)}
              className="text-xs text-pla-accent hover:underline"
            >
              {hintExpanded ? '收起' : '文件包含哪些章节？'}
            </button>
            {hintExpanded && (
              <ol className="text-xs text-pla-muted space-y-1 pt-1 list-decimal list-inside">
                {SECTION_LABELS.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ol>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
