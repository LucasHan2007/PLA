import { useEffect, useState } from 'react'
import Editor from '@monaco-editor/react'
import type { CodeBlock } from '../types'

interface Props {
  codeBlocks: CodeBlock[]
  activeStepId: number | null
  onCodeChange: (fileName: string, code: string) => void
  totalCount?: number
  pendingHint?: string
  awaitingContent?: boolean
}

export default function CodeEditorPanel({
  codeBlocks,
  activeStepId,
  onCodeChange,
  totalCount,
  pendingHint,
  awaitingContent,
}: Props) {
  const [activeFile, setActiveFile] = useState(0)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (activeFile >= codeBlocks.length) {
      setActiveFile(Math.max(0, codeBlocks.length - 1))
    }
  }, [codeBlocks.length, activeFile])

  const block = codeBlocks[activeFile]
  const total = totalCount ?? codeBlocks.length
  const hasPending = total > codeBlocks.length

  const handleCopy = async () => {
    if (!block) return
    await navigator.clipboard.writeText(block.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!codeBlocks.length && !hasPending) {
    return (
      <div className="flex flex-col h-full">
        <div className="panel-header">
          <span>💻</span> 代码设计
        </div>
        <div className="panel-body text-pla-muted text-sm flex items-center justify-center text-center px-6 leading-relaxed">
          {awaitingContent
            ? '操作描述已完成。请回答下方引导性问题并提交，系统将据此分块设计代码。'
            : '操作描述完成后，此处将按模块分块设计代码。每一块输出前需先完成引导性提问。'}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-w-0">
      <div className="panel-header">
        <span>💻</span> 代码设计
        {total > 0 && (
          <span className="text-xs text-pla-muted">
            {codeBlocks.length}/{total} 块
          </span>
        )}
        {activeStepId && <span className="badge ml-1">步骤 {activeStepId}</span>}
        <div className="ml-auto flex items-center gap-2">
          {block && (
            <button
              onClick={handleCopy}
              className="text-xs px-2 py-1 rounded bg-pla-border/50 hover:bg-pla-border transition-colors"
            >
              {copied ? '已复制' : '复制'}
            </button>
          )}
        </div>
      </div>
      {codeBlocks.length > 0 && (
        <>
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
        </>
      )}
      {hasPending && (
        <div className="border-t border-pla-border p-3 text-xs text-pla-muted text-center leading-relaxed">
          {pendingHint || '完成当前引导性提问后，将揭示下一块代码设计…'}
        </div>
      )}
    </div>
  )
}
