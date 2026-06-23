import { useState } from 'react'
import type { ExecutionStep } from '../types'

interface Props {
  steps: ExecutionStep[]
  activeStepId: number | null
  onSelectStep: (stepId: number) => void
}

export default function ExecutionStepsPanel({ steps, activeStepId, onSelectStep }: Props) {
  const [expandedId, setExpandedId] = useState<number | null>(null)

  if (!steps.length) {
    return (
      <div className="flex flex-col h-full">
        <div className="panel-header">
          <span>📝</span> 执行步骤
        </div>
        <div className="panel-body text-pla-muted text-sm flex items-center justify-center">
          逻辑方案确定后，此处展示可逐步完成的操作说明
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
        <span>📝</span> 执行步骤
        <span className="ml-auto text-xs text-pla-muted">{steps.length} 步</span>
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
                        <span key={kp} className="badge">{kp}</span>
                      ))}
                    </div>
                  )}
                  {step.code_module && (
                    <div className="text-pla-muted">对应模块：{step.code_module}</div>
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
      </div>
    </div>
  )
}
