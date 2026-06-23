import { useState } from 'react'
import Editor from '@monaco-editor/react'
import type { CodeBlock } from '../types'

interface Props {
  codeBlocks: CodeBlock[]
  activeStepId: number | null
  onCodeChange: (fileName: string, code: string) => void
}

export default function CodeEditorPanel({ codeBlocks, activeStepId, onCodeChange }: Props) {
  const [activeFile, setActiveFile] = useState(0)
  const [copied, setCopied] = useState(false)

  const block = codeBlocks[activeFile]

  const handleCopy = async () => {
    if (!block) return
    await navigator.clipboard.writeText(block.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!codeBlocks.length) {
    return (
      <div className="flex flex-col h-full">
        <div className="panel-header">
          <span>💻</span> 代码模块
        </div>
        <div className="panel-body text-pla-muted text-sm flex items-center justify-center">
          点击执行步骤后，此处展示对应模块代码
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="panel-header">
        <span>💻</span> 代码模块
        {activeStepId && <span className="badge ml-1">步骤 {activeStepId}</span>}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="text-xs px-2 py-1 rounded bg-pla-border/50 hover:bg-pla-border transition-colors"
          >
            {copied ? '已复制' : '复制'}
          </button>
        </div>
      </div>
      <div className="flex border-b border-pla-border shrink-0 overflow-x-auto">
        {codeBlocks.map((b, i) => (
          <button
            key={b.file_name}
            onClick={() => setActiveFile(i)}
            className={`px-3 py-1.5 text-xs whitespace-nowrap border-b-2 transition-colors ${
              activeFile === i
                ? 'border-pla-accent text-pla-accent'
                : 'border-transparent text-pla-muted hover:text-pla-text'
            }`}
          >
            {b.file_name}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language={block?.language || 'python'}
          value={block?.code || ''}
          theme="vs-dark"
          options={{
            fontSize: 13,
            minimap: { enabled: false },
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            padding: { top: 8 },
          }}
          onChange={(val) => {
            if (block && val !== undefined) onCodeChange(block.file_name, val)
          }}
        />
      </div>
      {block?.annotations && block.annotations.length > 0 && (
        <div className="border-t border-pla-border p-2 max-h-24 overflow-auto shrink-0">
          <div className="text-xs text-pla-muted mb-1">代码注解</div>
          {block.annotations.map((a, i) => (
            <div key={i} className="text-xs text-pla-muted">
              <span className="text-pla-accent">L{a.line}</span> {a.text}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
