import SocraticPanel from './SocraticPanel'
import ChatPanel from './ChatPanel'
import type { ChatMessage, FollowUpQuestion, TermDefinition } from '../types'

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
  mode?: 'intro' | 'split' | 'analysis'
  onNextAnalysisStep?: () => void
  onPrevAnalysisStep?: () => void
  canPrevAnalysisStep?: boolean
  nextAnalysisStepLabel?: string
}

function isSubmitShortcut(e: React.KeyboardEvent) {
  return e.key === 'Enter' && (e.ctrlKey || e.metaKey)
}

export default function InteractionPanel({
  questions,
  socraticAnswers,
  onSocraticAnswerChange,
  onSkipQuestion,
  messages,
  terms,
  loading,
  chatInput,
  onChatInputChange,
  onSubmit,
  canSubmit,
  mode = 'split',
  onNextAnalysisStep,
  onPrevAnalysisStep,
  canPrevAnalysisStep = false,
  nextAnalysisStepLabel = '下一步',
}: Props) {
  const handleSubmitShortcut = (e: React.KeyboardEvent) => {
    if (isSubmitShortcut(e)) {
      e.preventDefault()
      if (canSubmit && !loading) onSubmit()
    }
  }

  const isIntro = mode === 'intro'
  const isAnalysis = mode === 'analysis'

  return (
    <div
      className={`flex flex-col h-full bg-pla-bg ${
        isIntro ? '' : 'border-t border-pla-border'
      }`}
    >
      <div className="flex flex-1 min-h-0">
        {!isIntro && !isAnalysis && (
          <div className="w-1/2 border-r border-pla-border min-h-0 overflow-hidden">
            <SocraticPanel
              questions={questions}
              answers={socraticAnswers}
              onAnswerChange={onSocraticAnswerChange}
              onSkipQuestion={onSkipQuestion}
              onKeyDown={handleSubmitShortcut}
              loading={loading}
            />
          </div>
        )}
        <div className={`${isIntro || isAnalysis ? 'w-full' : 'w-1/2'} min-h-0 overflow-hidden`}>
          <ChatPanel
            messages={messages}
            terms={terms}
            loading={loading}
            input={chatInput}
            onInputChange={onChatInputChange}
            onKeyDown={handleSubmitShortcut}
            introMode={isIntro}
            variant={isAnalysis ? 'task-qa' : 'free'}
          />
        </div>
      </div>

      <div className="shrink-0 px-4 py-2.5 border-t border-pla-border bg-pla-panel/60 flex items-center justify-between gap-3">
        <span className="text-xs text-pla-muted hidden sm:inline text-center flex-1">
          {isIntro
            ? '描述你想学习的编程项目，按 Ctrl+Enter 提交'
            : isAnalysis
              ? '阅读上方本步任务；下方提问由 AI 解答，完成后点击「下一步」'
              : '编辑完成后点击提交，或在任意输入框按 Ctrl+Enter'}
        </span>
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {isAnalysis && canPrevAnalysisStep && onPrevAnalysisStep && (
            <button
              type="button"
              onClick={onPrevAnalysisStep}
              disabled={loading}
              className="px-4 py-2 rounded-lg border border-pla-border hover:border-pla-accent/50 hover:bg-pla-accent/10 disabled:opacity-40 text-sm font-medium transition-colors"
            >
              上一步
            </button>
          )}
          {isAnalysis && onNextAnalysisStep && (
            <button
              type="button"
              onClick={onNextAnalysisStep}
              disabled={loading}
              className="px-4 py-2 rounded-lg border border-pla-border hover:border-pla-accent/50 hover:bg-pla-accent/10 disabled:opacity-40 text-sm font-medium transition-colors"
            >
              {nextAnalysisStepLabel}
            </button>
          )}
          {!isAnalysis && (
            <button
              onClick={onSubmit}
              disabled={loading || !canSubmit}
              className="px-6 py-2 rounded-lg bg-pla-accent hover:bg-pla-accentHover disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors"
            >
              {loading ? '提交中...' : '提交 (Ctrl+Enter)'}
            </button>
          )}
          {isAnalysis && (
            <button
              onClick={onSubmit}
              disabled={loading || !canSubmit}
              className="px-6 py-2 rounded-lg bg-pla-accent hover:bg-pla-accentHover disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors"
            >
              {loading ? '回复中...' : '提问 (Ctrl+Enter)'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
