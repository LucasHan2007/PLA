import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '../types'

interface Props {
  messages: ChatMessage[]
  loading: boolean
  chatInput: string
  onChatInputChange: (v: string) => void
  onSubmit: () => void
  canSubmit: boolean
  onCollapse?: () => void
  currentNodeTitle?: string | null
  pedagogyEnabled?: boolean
}

const MIN_INPUT = 72
const DEFAULT_INPUT = 96

export default function ChatPanel({
  messages,
  loading,
  chatInput,
  onChatInputChange,
  onSubmit,
  canSubmit,
  onCollapse,
  currentNodeTitle,
  pedagogyEnabled,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [inputHeight, setInputHeight] = useState(DEFAULT_INPUT)
  const dragging = useRef(false)
  const startY = useRef(0)
  const startH = useRef(DEFAULT_INPUT)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const maxInput = useCallback(() => {
    const el = containerRef.current
    if (!el) return 280
    return Math.max(MIN_INPUT, el.clientHeight - 44 - 6 - 100)
  }, [])

  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    startY.current = e.clientY
    startH.current = inputHeight
    document.body.style.cursor = 'ns-resize'
    document.body.style.userSelect = 'none'
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const delta = e.clientY - startY.current
      setInputHeight(Math.min(maxInput(), Math.max(MIN_INPUT, startH.current - delta)))
    }
    const onUp = () => {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [maxInput, inputHeight])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canSubmit && !loading) {
      e.preventDefault()
      onSubmit()
    }
  }

  return (
    <div ref={containerRef} className="flex flex-col h-full bg-pla-bg">
      <div className="panel-header">
        <span>❓</span> 任务答疑
        {pedagogyEnabled && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-pla-accent/10 text-pla-accent ml-1">
            策略引擎
          </span>
        )}
        {currentNodeTitle && (
          <span className="text-[10px] text-pla-muted truncate max-w-[140px] ml-1" title={currentNodeTitle}>
            · {currentNodeTitle}
          </span>
        )}
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            className="ml-auto text-xs text-pla-muted hover:text-pla-text px-2 py-0.5 rounded"
          >
            收起 ◂
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto min-h-0 p-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-pla-muted text-center py-4 px-2 leading-relaxed">
            生成参考文件后可在此提问。
            {pedagogyEnabled
              ? '已接入教学策略引擎，将结合你的画像与当前学习节点选用 Explain / Hint / Ask 等策略。'
              : '完成用户画像后，答疑将自动个性化。'}
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[90%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-pla-accent text-white'
                  : 'bg-pla-panel border border-pla-border'
              }`}
            >
              {msg.role === 'assistant' && msg.strategyLabel && (
                <div className="text-[10px] text-pla-accent mb-1.5 font-medium">
                  策略：{msg.strategyLabel}
                  {msg.learningNodeTitle ? ` · ${msg.learningNodeTitle}` : ''}
                </div>
              )}
              {msg.chatPart ?? msg.content}
            </div>
          </div>
        ))}
        {loading && <div className="text-sm text-pla-muted animate-pulse">PLA 正在解答…</div>}
        <div ref={bottomRef} />
      </div>

      <div
        role="separator"
        onMouseDown={onResizeStart}
        className="shrink-0 h-1.5 cursor-ns-resize group relative"
      >
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-pla-border group-hover:bg-pla-accent/70" />
      </div>

      <div className="shrink-0 px-3 pb-3 flex flex-col" style={{ height: inputHeight }}>
        <textarea
          value={chatInput}
          onChange={(e) => onChatInputChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="请输入您的疑问…"
          className="flex-1 min-h-0 w-full resize-none rounded-lg bg-pla-panel border border-pla-border px-3 py-2 text-sm focus:outline-none focus:border-pla-accent"
        />
      </div>

      <div className="shrink-0 px-3 py-2.5 border-t border-pla-border bg-pla-panel/60">
        <button
          type="button"
          onClick={onSubmit}
          disabled={loading || !canSubmit}
          className="w-full px-4 py-2 rounded-lg bg-pla-accent hover:bg-pla-accentHover disabled:opacity-40 text-sm font-medium"
        >
          {loading ? '回复中…' : '提问 (Ctrl+Enter)'}
        </button>
      </div>
    </div>
  )
}
