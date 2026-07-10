import { useCallback, useEffect, useRef, useState } from 'react'
import ChatPanel from './ChatPanel'
import type { ChatMessage } from '../types'

const MIN_WIDTH = 220
const COLLAPSED = 40

interface Props {
  messages: ChatMessage[]
  loading: boolean
  chatInput: string
  onChatInputChange: (v: string) => void
  onSubmit: () => void
  canSubmit: boolean
  currentNodeTitle?: string | null
  pedagogyEnabled?: boolean
}

export default function TaskQaSidebar(props: Props) {
  const [expanded, setExpanded] = useState(true)
  const [width, setWidth] = useState(() => Math.round(window.innerWidth / 3))
  const dragging = useRef(false)
  const startX = useRef(0)
  const startW = useRef(width)

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragging.current = true
      startX.current = e.clientX
      startW.current = width
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [width],
  )

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const max = Math.max(MIN_WIDTH, Math.round(window.innerWidth * 0.55))
      const next = Math.min(max, Math.max(MIN_WIDTH, startW.current + (startX.current - e.clientX)))
      setWidth(next)
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
  }, [])

  if (!expanded) {
    return (
      <div
        className="shrink-0 flex flex-col h-full border-l border-pla-border bg-pla-panel/50"
        style={{ width: COLLAPSED }}
      >
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex-1 flex flex-col items-center justify-center gap-2 py-3 text-pla-muted hover:text-pla-accent"
          title="展开任务答疑"
        >
          <span>❓</span>
          <span className="text-[10px]" style={{ writingMode: 'vertical-rl' }}>
            任务答疑
          </span>
        </button>
      </div>
    )
  }

  return (
    <div className="shrink-0 flex h-full min-h-0 relative" style={{ width }}>
      <div
        role="separator"
        onMouseDown={onResizeStart}
        className="absolute left-0 top-0 bottom-0 w-1.5 -translate-x-1/2 z-20 cursor-col-resize group"
      >
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-pla-border group-hover:bg-pla-accent/70" />
      </div>
      <div className="flex flex-col h-full min-w-0 flex-1 overflow-hidden border-l border-pla-border">
        <ChatPanel
          {...props}
          onCollapse={() => setExpanded(false)}
          currentNodeTitle={props.currentNodeTitle}
          pedagogyEnabled={props.pedagogyEnabled}
        />
      </div>
    </div>
  )
}
