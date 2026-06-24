import { useState } from 'react'
import type { ExecutionStep } from '../types'

interface Props {
  steps: ExecutionStep[]
  activeStepId: number | null
  onSelectStep: (stepId: number) => void
  totalCount?: number
  pendingHint?: string
  awaitingContent?: boolean
  waitingForQuestion?: boolean
}

export default function ExecutionStepsPanel({
  steps,
  activeStepId,
  onSelectStep,
  totalCount,
  pendingHint,
  awaitingContent,
  waitingForQuestion,
}: Props) {
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const total = totalCount ?? steps.length
  const hasPending = total > steps.length

  if (waitingForQuestion && steps.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="panel-header">
          <span>📝</span> 操作描述
          {total > 0 && (
            <span className="ml-auto text-xs text-pla-muted">0/{total} 步</span>
          )}
        </div>
        <div className="panel-body text-pla-muted text-sm flex items-center justify-center text-center px-6 leading-relaxed">
          操作步骤已规划（共 {total} 步）。请先回答下方引导性问题，思考通过后才会逐步展示各步的具体内容。
        </div>
      </div>
    )
  }

  if (!steps.length && !hasPending) {
    return (
      <div className="flex flex-col h-full">
        <div className="panel-header">
          <span>📝</span> 操作描述
        </div>
        <div className="panel-body text-pla-muted text-sm flex items-center justify-center text-center px-6 leading-relaxed">
          {awaitingContent
            ? '项目解析已完成。请回答下方引导性问题，AI 将用自然语言描述各步骤的具体操作（本阶段不涉及写代码）。'
            : '项目解析完成后，此处将分步呈现自然语言操作说明。每一步输出前需先完成引导性提问。'}
        </div>
      </div>
    )
  }

  const toggle = (id: number) => {
    setExpandedId(expandedId === id ? null : id)
    onSelectStep(id)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="panel-header">
        <span>📝</span> 操作描述
        {total > 0 && (
          <span className="ml-auto text-xs text-pla-muted">
            {steps.length}/{total} 步
          </span>
        )}
      </div>
      <div className="panel-body space-y-2">
        {steps.map((step) => {
          const isActive = activeStepId === step.step_id
          const isExpanded = expandedId === step.step_id
          return (
            <div
              key={step.step_id}
              className={`rounded-lg border transition-colors ${
                isActive ? 'border-pla-accent/60 bg-pla-accent/5' : 'border-pla-border/50'
              }`}
            >
              <button
                onClick={() => toggle(step.step_id)}
                className="w-full text-left p-3 flex items-start gap-2"
              >
                <span className="badge shrink-0">{step.step_id}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{step.title}</div>
                  <div className="text-xs text-pla-muted mt-0.5">{step.description}</div>
                </div>
                <span className="text-pla-muted text-xs shrink-0">{isExpanded ? '▼' : '▶'}</span>
              </button>
              {isExpanded && (
                <div className="px-3 pb-3 space-y-2 text-xs border-t border-pla-border/30 pt-2 mx-3">
                  {step.why && (
                    <div>
                      <span className="text-pla-accent font-medium">为什么：</span>
                      {step.why}
                    </div>
                  )}
                  {step.inputs && (
                    <div>
                      <span className="text-green-400 font-medium">输入：</span>
                      {step.inputs}
                    </div>
                  )}
                  {step.outputs && (
                    <div>
                      <span className="text-yellow-400 font-medium">输出：</span>
                      {step.outputs}
                    </div>
                  )}
                  {step.knowledge_points && step.knowledge_points.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {step.knowledge_points.map((kp) => (
                        <span key={kp} className="badge">
                          {kp}
                        </span>
                      ))}
                    </div>
                  )}
                  {step.code_module && (
                    <div className="text-pla-muted">
                      代码设计阶段对应模块：{step.code_module}
                    </div>
                  )}
                  {step.common_errors && step.common_errors.length > 0 && (
                    <div>
                      <span className="text-red-400 font-medium">常见错误：</span>
                      {step.common_errors.join('；')}
                    </div>
                  )}
                  {step.next_hint && (
                    <div className="text-pla-muted italic">→ {step.next_hint}</div>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {hasPending && (
          <div className="rounded-lg border border-dashed border-pla-border/60 p-3 text-xs text-pla-muted text-center leading-relaxed">
            {pendingHint || '完成当前引导性提问后，将揭示下一步操作描述…'}
          </div>
        )}
      </div>
    </div>
  )
}
