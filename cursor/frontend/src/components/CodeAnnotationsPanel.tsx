import { useState } from 'react'
import type { CodeBlock } from '../types'

interface Props {
  codeBlocks: CodeBlock[]
}

export default function CodeAnnotationsPanel({ codeBlocks }: Props) {
  const [collapsed, setCollapsed] = useState(false)

  const blocksWithAnnotations = codeBlocks.filter(
    (b) => b.annotations && b.annotations.length > 0,
  )

  if (collapsed) {
    return (
      <div className="flex flex-col h-full border-l border-pla-border bg-pla-bg/80">
        <button
          onClick={() => setCollapsed(false)}
          className="panel-header text-xs justify-center hover:bg-pla-panel transition-colors"
          title="展开代码注解"
        >
          ◀ 代码注解
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full border-l border-pla-border bg-pla-bg/80 min-w-0">
      <div className="panel-header text-xs">
        <span>📖</span> 代码注解
        <button
          onClick={() => setCollapsed(true)}
          className="ml-auto text-pla-muted hover:text-pla-text text-xs px-1"
          title="折叠"
        >
          ▶
        </button>
      </div>
      <div className="flex-1 overflow-auto p-2 space-y-3 min-h-0">
        {blocksWithAnnotations.length === 0 ? (
          <div className="text-xs text-pla-muted text-center py-6 leading-relaxed">
            代码设计输出后，此处将同步展示已设计代码的行级注解。
          </div>
        ) : (
          blocksWithAnnotations.map((block) => (
            <div key={block.file_name} className="rounded-lg border border-pla-border/50 overflow-hidden">
              <div className="px-2 py-1.5 text-xs font-medium bg-pla-panel/60 border-b border-pla-border/40">
                {block.file_name}
              </div>
              <div className="p-2 space-y-1.5">
                {block.annotations!.map((a, i) => (
                  <div key={i} className="text-xs leading-relaxed">
                    <span className="text-pla-accent font-mono">L{a.line}</span>
                    <span className="text-pla-muted ml-1.5">{a.text}</span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
