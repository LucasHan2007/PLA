import { useRef, useEffect } from 'react'
import type { ChatMessage, TermDefinition } from '../types'

interface Props {
  messages: ChatMessage[]
  terms: TermDefinition[]
  loading: boolean
  input: string
  onInputChange: (v: string) => void
  onKeyDown?: (e: React.KeyboardEvent) => void
}

export default function ChatPanel({
  messages,
  terms,
  loading,
  input,
  onInputChange,
  onKeyDown,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  return (
    <div className="flex flex-col h-full bg-pla-bg">
      <div className="panel-header">
        <span>💬</span> 自由对话
        {terms.length > 0 && (
          <div className="ml-2 flex gap-1 overflow-x-auto max-w-[200px]">
            {terms.slice(0, 3).map((t) => (
              <span
                key={t.term}
                title={t.definition}
                className="badge cursor-help whitespace-nowrap"
              >
                {t.term}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="text-sm text-pla-muted text-center py-4">
            在此与 AI 自由交流：补充想法、提问、粘贴报错等
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i}>
            {msg.role === 'user' ? (
              <div className="space-y-2">
                {msg.chatPart && (
                  <div className="flex justify-end">
                    <div className="max-w-[90%] rounded-lg px-3 py-2 text-sm bg-pla-accent text-white">
                      {msg.chatPart}
                    </div>
                  </div>
                )}
                {msg.socraticPart && msg.socraticPart.length > 0 && (
                  <div className="flex justify-end">
                    <div className="max-w-[90%] rounded-lg px-3 py-2 text-sm bg-pla-accent/80 text-white space-y-2">
                      <div className="text-xs opacity-80">引导性问题回答</div>
                      {msg.socraticPart.map((item, j) => (
                        <div key={j} className="border-t border-white/20 pt-1 first:border-0 first:pt-0">
                          <div className="text-xs opacity-90">Q: {item.question}</div>
                          <div>A: {item.answer}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex justify-start">
                <div className="max-w-[90%] rounded-lg px-3 py-2 text-sm bg-pla-panel border border-pla-border">
                  {msg.content}
                </div>
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="text-sm text-pla-muted animate-pulse">AI 导师正在思考...</div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t border-pla-border shrink-0">
        <textarea
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="输入想对 AI 说的话（Ctrl+Enter 提交）..."
          rows={3}
          className="w-full resize-none rounded-lg bg-pla-panel border border-pla-border px-3 py-2 text-sm focus:outline-none focus:border-pla-accent"
        />
      </div>
    </div>
  )
}
