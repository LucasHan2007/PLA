import { useRef, useEffect } from 'react'
import type { ChatMessage, TermDefinition } from '../types'

interface Props {
  messages: ChatMessage[]
  terms: TermDefinition[]
  loading: boolean
  input: string
  onInputChange: (v: string) => void
  onKeyDown?: (e: React.KeyboardEvent) => void
  introMode?: boolean
  variant?: 'free' | 'task-qa'
}

export default function ChatPanel({
  messages,
  terms,
  loading,
  input,
  onInputChange,
  onKeyDown,
  introMode = false,
  variant = 'free',
}: Props) {
  const isTaskQa = variant === 'task-qa'
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  return (
    <div className={`flex flex-col h-full ${introMode ? 'bg-transparent' : 'bg-pla-bg'}`}>
      {!introMode && (
        <div className="panel-header">
          <span>{isTaskQa ? '❓' : '💬'}</span>{' '}
          {isTaskQa ? '任务答疑' : '自由对话'}
          {terms.length > 0 && !isTaskQa && (
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
      )}

      <div className={`flex-1 overflow-auto min-h-0 ${introMode ? 'p-4' : 'p-3 space-y-3'}`}>
        {introMode && messages.length === 0 && (
          <div className="text-center space-y-3 pb-2">
            <div className="text-3xl">👋</div>
            <h2 className="text-base font-medium text-pla-text">欢迎使用 PLA</h2>
            <p className="text-sm text-pla-muted leading-relaxed">
              请描述你想学习或实现的编程项目，例如「手写数字识别」或「Todo 应用该怎么设计」。
              我会先做初步解析，再通过提问与你一起完善方案。
            </p>
          </div>
        )}
        {!introMode && messages.length === 0 && (
          <div className="text-sm text-pla-muted text-center py-4 leading-relaxed px-2">
            {isTaskQa
              ? '阅读左侧本步内容，在此输入问题并提问'
              : '在此与 AI 自由交流：补充想法、提问、粘贴报错等'}
          </div>
        )}
        <div className={introMode ? 'space-y-3' : ''}>
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
        </div>
        {loading && !introMode && (
          <div className="text-sm text-pla-muted animate-pulse">
            {isTaskQa ? 'PLA 正在解答…' : 'AI 导师正在思考...'}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className={`border-t border-pla-border shrink-0 ${introMode ? 'p-4 pt-2' : 'p-3'}`}>
        <textarea
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            introMode
              ? '例如：我想做一个手写数字识别项目…'
              : isTaskQa
                ? '例如：什么是监督学习？MNIST 为什么要分训练集和测试集？（Ctrl+Enter 提问）'
                : '输入想对 AI 说的话（Ctrl+Enter 提交）...'
          }
          rows={introMode ? 4 : 3}
          className="w-full resize-none rounded-lg bg-pla-panel border border-pla-border px-3 py-2 text-sm focus:outline-none focus:border-pla-accent"
        />
      </div>
    </div>
  )
}
