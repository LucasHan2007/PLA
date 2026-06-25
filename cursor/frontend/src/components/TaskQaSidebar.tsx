import { useCallback, useEffect, useRef, useState } from 'react'
import InteractionPanel from './InteractionPanel'
import type { ChatMessage, FollowUpQuestion, TermDefinition } from '../types'

const MIN_WIDTH = 220
const COLLAPSED_WIDTH = 40

function getDefaultWidth() {
  return Math.round(window.innerWidth / 3)
}

function getMaxWidth() {
  return Math.max(MIN_WIDTH, Math.round(window.innerWidth * 0.55))
}

interface Props {
  questions: FollowUpQuestion[]
  socraticAnswers: string[]
  onSocraticAnswerChange: (index: number, value: string) => void
  onSkipQuestion?: () => void
  messages: ChatMessage[]
  terms: TermDefinition[]
  loading: boolean
  chatInput: string
  onChatInputChange: (v: string) => void
  onSubmit: () => void
  canSubmit: boolean
  onNextAnalysisStep?: () => void
  onPrevAnalysisStep?: () => void
  canPrevAnalysisStep?: boolean
  nextAnalysisStepLabel?: string
}

export default function TaskQaSidebar(props: Props) {
  const [expanded, setExpanded] = useState(true)
  const [width, setWidth] = useState(getDefaultWidth)
  const dragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(getDefaultWidth())

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragging.current = true
      startX.current = e.clientX
      startWidth.current = width
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [width],
  )

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const delta = startX.current - e.clientX
      const next = Math.min(getMaxWidth(), Math.max(MIN_WIDTH, startWidth.current + delta))
      setWidth(next)
    }

    const onUp = () => {
      if (!dragging.current) return
      dragging.current = false
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
  }, [])

  useEffect(() => {
    const clampWidth = () => {
      setWidth((w) => Math.min(getMaxWidth(), Math.max(MIN_WIDTH, w)))
    }
    window.addEventListener('resize', clampWidth)
    return () => window.removeEventListener('resize', clampWidth)
  }, [])

  if (!expanded) {
    return (
      <div
        className="shrink-0 flex flex-col h-full border-l border-pla-border bg-pla-panel/50"
        style={{ width: COLLAPSED_WIDTH }}
      >
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex-1 flex flex-col items-center justify-center gap-2 py-3 text-pla-muted hover:text-pla-accent hover:bg-pla-accent/10 transition-colors"
          title="展开任务答疑"
          aria-label="展开任务答疑"
        >
          <span aria-hidden>❓</span>
          <span
            className="text-[10px] tracking-wide"
            style={{ writingMode: 'vertical-rl' }}
          >
            任务答疑
          </span>
        </button>
      </div>
    )
  }

  return (
    <div
      className="shrink-0 flex h-full min-h-0 relative"
      style={{ width }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="调节任务答疑宽度"
        onMouseDown={handleResizeStart}
        className="absolute left-0 top-0 bottom-0 w-1.5 -translate-x-1/2 z-20 cursor-col-resize group"
        title="拖动调节宽度"
      >
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-pla-border group-hover:bg-pla-accent/70 group-active:bg-pla-accent transition-colors" />
      </div>

      <div className="flex flex-col h-full min-w-0 flex-1 overflow-hidden border-l border-pla-border">
        <InteractionPanel
          {...props}
          mode="analysis"
          layout="sidebar"
          collapseControl={{ onToggle: () => setExpanded(false) }}
        />
      </div>
    </div>
  )
}
