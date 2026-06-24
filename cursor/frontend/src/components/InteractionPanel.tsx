import SocraticPanel from './SocraticPanel'
import ChatPanel from './ChatPanel'
import type { ChatMessage, FollowUpQuestion, TermDefinition } from '../types'

interface Props {
  questions: FollowUpQuestion[]
  socraticAnswers: string[]
  onSocraticAnswerChange: (index: number, value: string) => void
  messages: ChatMessage[]
  terms: TermDefinition[]
  loading: boolean
  chatInput: string
  onChatInputChange: (v: string) => void
  onSubmit: () => void
  canSubmit: boolean
  mode?: 'intro' | 'split'
  skipSocratic?: boolean
}

function isSubmitShortcut(e: React.KeyboardEvent) {
  return e.key === 'Enter' && (e.ctrlKey || e.metaKey)
}

export default function InteractionPanel({
  questions,
  socraticAnswers,
  onSocraticAnswerChange,
  messages,
  terms,
  loading,
  chatInput,
  onChatInputChange,
  onSubmit,
  canSubmit,
  mode = 'split',
  skipSocratic = false,
}: Props) {
  const handleSubmitShortcut = (e: React.KeyboardEvent) => {
    if (isSubmitShortcut(e)) {
      e.preventDefault()
      if (canSubmit && !loading) onSubmit()
    }
  }

  const isIntro = mode === 'intro'

  return (
    <div
      className={`flex flex-col h-full bg-pla-bg ${
        isIntro ? '' : 'border-t border-pla-border'
      }`}
    >
      <div className="flex flex-1 min-h-0">
        {!isIntro && !skipSocratic && (
          <div className="w-1/2 border-r border-pla-border min-h-0 overflow-hidden">
            <SocraticPanel
              questions={questions}
              answers={socraticAnswers}
              onAnswerChange={onSocraticAnswerChange}
              onKeyDown={handleSubmitShortcut}
            />
          </div>
        )}
        <div
          className={`${
            isIntro || skipSocratic ? 'w-full' : 'w-1/2'
          } min-h-0 overflow-hidden`}
        >
          <ChatPanel
            messages={messages}
            terms={terms}
            loading={loading}
            input={chatInput}
            onInputChange={onChatInputChange}
            onKeyDown={handleSubmitShortcut}
            introMode={isIntro}
          />
        </div>
      </div>

      <div className="shrink-0 px-4 py-2.5 border-t border-pla-border bg-pla-panel/60 flex items-center justify-between gap-3">
        <span className="text-xs text-pla-muted hidden sm:inline text-center flex-1">
          {isIntro
            ? '描述你想学习的编程项目，按 Ctrl+Enter 提交'
            : skipSocratic
              ? '已开启跳过提问，直接点击提交继续'
              : '编辑完成后点击提交，或在任意输入框按 Ctrl+Enter'}
        </span>
        <button
          onClick={onSubmit}
          disabled={loading || !canSubmit}
          className={`${isIntro ? '' : 'ml-auto'} px-6 py-2 rounded-lg bg-pla-accent hover:bg-pla-accentHover disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors shrink-0`}
        >
          {loading ? '提交中...' : '提交 (Ctrl+Enter)'}
        </button>
      </div>
    </div>
  )
}
