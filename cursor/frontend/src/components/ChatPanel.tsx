import { useCallback, useEffect, useRef, useState } from 'react'
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
  onCollapse?: () => void
}

const DEFAULT_INPUT_HEIGHT = 96
const MIN_INPUT_HEIGHT = 72
const MIN_MESSAGE_HEIGHT = 100
const HEADER_HEIGHT = 44
const RESIZE_HANDLE_HEIGHT = 6

export default function ChatPanel({
  messages,
  terms,
  loading,
  input,
  onInputChange,
  onKeyDown,
  introMode = false,
  variant = 'free',
  onCollapse,
}: Props) {
  const isTaskQa = variant === 'task-qa'
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [inputSectionHeight, setInputSectionHeight] = useState(DEFAULT_INPUT_HEIGHT)
  const heightDragging = useRef(false)
  const startY = useRef(0)
  const startHeight = useRef(DEFAULT_INPUT_HEIGHT)

  const getMaxInputHeight = useCallback(() => {
    const el = containerRef.current
    if (!el) return 280
    return Math.max(
      MIN_INPUT_HEIGHT,
      el.clientHeight - HEADER_HEIGHT - RESIZE_HANDLE_HEIGHT - MIN_MESSAGE_HEIGHT,
    )
  }, [])

  const clampInputHeight = useCallback(() => {
    setInputSectionHeight((h) =>
      Math.min(getMaxInputHeight(), Math.max(MIN_INPUT_HEIGHT, h)),
    )
  }, [getMaxInputHeight])

  useEffect(() => {
    clampInputHeight()
    window.addEventListener('resize', clampInputHeight)
    return () => window.removeEventListener('resize', clampInputHeight)
  }, [clampInputHeight])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const handleInputResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      heightDragging.current = true
      startY.current = e.clientY
      startHeight.current = inputSectionHeight
      document.body.style.cursor = 'ns-resize'
      document.body.style.userSelect = 'none'
    },
    [inputSectionHeight],
  )

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!heightDragging.current) return
      const delta = e.clientY - startY.current
      const next = Math.min(
        getMaxInputHeight(),
        Math.max(MIN_INPUT_HEIGHT, startHeight.current - delta),
      )
      setInputSectionHeight(next)
    }

    const onUp = () => {
      if (!heightDragging.current) return
      heightDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [getMaxInputHeight])

  const messageList = (
    <>
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
            ? '请输入您的疑问，PLA内置的AI助手将会给您答复...'
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
                        <div
                          key={j}
                          className="border-t border-white/20 pt-1 first:border-0 first:pt-0"
                        >
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
    </>
  )

  const renderInputArea = (resizable: boolean) => (
    <div
      className={`shrink-0 ${
        resizable ? 'px-3 pb-3 flex flex-col min-h-0' : `border-t border-pla-border ${introMode ? 'p-4 pt-2' : 'p-3'}`
      }`}
      style={resizable ? { height: inputSectionHeight } : undefined}
    >
      <textarea
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={
          introMode
            ? '例如：我想做一个手写数字识别项目…'
            : isTaskQa
              ? '请输入您的疑问，PLA内置的AI助手将会给您答复...'
              : '输入想对 AI 说的话（Ctrl+Enter 提交）...'
        }
        rows={resizable ? undefined : introMode ? 4 : 3}
        className={`w-full resize-none rounded-lg bg-pla-panel border border-pla-border px-3 py-2 text-sm focus:outline-none focus:border-pla-accent ${resizable ? 'flex-1 min-h-0' : ''}`}
      />
    </div>
  )

  return (
    <div
      ref={containerRef}
      className={`flex flex-col h-full ${introMode ? 'bg-transparent' : 'bg-pla-bg'}`}
    >
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
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              className="ml-auto text-xs text-pla-muted hover:text-pla-text px-2 py-0.5 rounded hover:bg-pla-bg/60 transition-colors shrink-0"
              title="收起任务答疑"
              aria-label="收起任务答疑"
            >
              收起 ◂
            </button>
          )}
        </div>
      )}

      {isTaskQa && !introMode ? (
        <>
          <div className="flex-1 overflow-auto min-h-0 p-3 space-y-3">{messageList}</div>
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="调节输入框高度"
            onMouseDown={handleInputResizeStart}
            className="shrink-0 relative h-1.5 cursor-ns-resize group z-10"
            title="拖动调节输入框高度"
          >
            <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-pla-border group-hover:bg-pla-accent/70 group-active:bg-pla-accent transition-colors" />
          </div>
          {renderInputArea(true)}
        </>
      ) : (
        <>
          <div
            className={`flex-1 overflow-auto min-h-0 ${introMode ? 'p-4' : 'p-3 space-y-3'}`}
          >
            {messageList}
          </div>
          {renderInputArea(false)}
        </>
      )}
    </div>
  )
}
