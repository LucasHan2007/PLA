import type { FollowUpQuestion } from '../types'

const SKIP_ANSWER = '[跳过]'

interface Props {
  questions: FollowUpQuestion[]
  answers: string[]
  onAnswerChange: (index: number, value: string) => void
  onSkipQuestion?: () => void
  onKeyDown?: (e: React.KeyboardEvent) => void
  loading?: boolean
}

function isOtherOption(option: string) {
  return option === '其他' || option.startsWith('其他')
}

function isOtherAnswer(answer: string) {
  return answer === '其他' || answer.startsWith('其他：') || answer.startsWith('其他:')
}

function otherDetail(answer: string) {
  if (answer.startsWith('其他：')) return answer.slice(3)
  if (answer.startsWith('其他:')) return answer.slice(3)
  return ''
}

function ChoiceOption({
  option,
  answer,
  onAnswerChange,
  onKeyDown,
}: {
  option: string
  answer: string
  onAnswerChange: (value: string) => void
  onKeyDown?: (e: React.KeyboardEvent) => void
}) {
  if (isOtherOption(option)) {
    const otherSelected = isOtherAnswer(answer)
    const detail = otherDetail(answer)

    const handleDetailChange = (value: string) => {
      onAnswerChange(value.trim() ? `其他：${value}` : '其他')
    }

    return (
      <div
        className={`rounded-md border px-2 py-2 transition-colors ${
          otherSelected ? 'bg-pla-accent/15 border-pla-accent/40' : 'border-transparent hover:bg-pla-border/30'
        }`}
      >
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input
            type="radio"
            name="socratic-q-0"
            checked={otherSelected}
            onChange={() => onAnswerChange(detail ? `其他：${detail}` : '其他')}
            className="accent-pla-accent shrink-0"
          />
          <span className="shrink-0">{option}</span>
          <input
            type="text"
            value={detail}
            onChange={(e) => {
              if (!otherSelected) onAnswerChange('其他')
              handleDetailChange(e.target.value)
            }}
            onFocus={() => {
              if (!otherSelected) onAnswerChange(detail ? `其他：${detail}` : '其他')
            }}
            onKeyDown={onKeyDown}
            placeholder="请描述..."
            className={`flex-1 min-w-0 rounded-md border px-2 py-1 text-sm focus:outline-none focus:border-pla-accent ${
              otherSelected
                ? 'bg-pla-bg border-pla-border'
                : 'bg-pla-bg/50 border-pla-border/50 text-pla-muted'
            }`}
          />
        </label>
      </div>
    )
  }

  const selected = answer === option
  return (
    <label
      className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-sm transition-colors ${
        selected ? 'bg-pla-accent/15 border border-pla-accent/40' : 'hover:bg-pla-border/30 border border-transparent'
      }`}
    >
      <input
        type="radio"
        name="socratic-q-0"
        checked={selected}
        onChange={() => onAnswerChange(option)}
        className="accent-pla-accent shrink-0"
      />
      <span>{option}</span>
    </label>
  )
}

export default function SocraticPanel({
  questions,
  answers,
  onAnswerChange,
  onSkipQuestion,
  onKeyDown,
  loading,
}: Props) {
  const item = questions[0]
  const answer = answers[0] ?? ''

  return (
    <div className="flex flex-col h-full bg-pla-bg">
      <div className="panel-header">
        <span>🎯</span> 苏格拉底式提问
        <span className="ml-auto text-xs text-pla-muted">每次一题</span>
      </div>

      <div className="flex-1 overflow-auto p-3 min-h-0">
        {!item ? (
          <div className="text-sm text-pla-muted text-center py-6 leading-relaxed">
            提交项目描述后，AI 将在此逐题生成引导性问题。
          </div>
        ) : (
          <div className="rounded-lg border border-pla-border/60 bg-pla-panel/40 p-3 space-y-3">
            <div className="flex gap-2 items-start">
              <span className="badge shrink-0">1</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm leading-relaxed">{item.question}</p>
                <span className="text-xs text-pla-muted mt-1 inline-block">
                  {item.answer_type === 'choice' ? '选择题' : '问答题'}
                </span>
              </div>
            </div>

            {item.answer_type === 'choice' && item.options.length > 0 ? (
              <div className="space-y-1.5 pl-1">
                {item.options.map((option) => (
                  <ChoiceOption
                    key={option}
                    option={option}
                    answer={answer}
                    onAnswerChange={(v) => onAnswerChange(0, v)}
                    onKeyDown={onKeyDown}
                  />
                ))}
              </div>
            ) : (
              <textarea
                value={answer}
                onChange={(e) => onAnswerChange(0, e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="在此填写你的回答（Ctrl+Enter 提交）..."
                rows={3}
                className="w-full resize-none rounded-lg bg-pla-bg border border-pla-border px-3 py-2 text-sm focus:outline-none focus:border-pla-accent"
              />
            )}

            {onSkipQuestion && (
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={onSkipQuestion}
                  disabled={loading}
                  className="text-xs px-3 py-1.5 rounded-md border border-pla-border/80 text-pla-muted hover:text-pla-text hover:border-pla-muted disabled:opacity-40 transition-colors"
                >
                  跳过此题
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export { SKIP_ANSWER }
