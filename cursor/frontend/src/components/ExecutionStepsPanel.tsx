import { useState } from 'react'
import type { OperationSubStep } from '../types'
import type { VisibleOperationGroup } from '../utils/operationSteps'

interface Props {
  visibleGroups: VisibleOperationGroup[]
  activeSubKey: string | null
  onSelectSubStep: (groupIndex: number, subId: number) => void
  totalSubStepCount?: number
  revealedSubStepCount?: number
  pendingHint?: string
  awaitingContent?: boolean
  waitingForQuestion?: boolean
}

function SubStepCard({
  sub,
  groupIndex,
  isActive,
  isExpanded,
  onToggle,
}: {
  sub: OperationSubStep
  groupIndex: number
  isActive: boolean
  isExpanded: boolean
  onToggle: () => void
}) {
  return (
    <div
      className={`rounded-lg border transition-colors ml-3 ${
        isActive ? 'border-pla-accent/60 bg-pla-accent/5' : 'border-pla-border/50'
      }`}
    >
      <button
        onClick={onToggle}
        className="w-full text-left p-2.5 flex items-start gap-2"
      >
        <span className="badge shrink-0 text-[10px]">
          {groupIndex + 1}.{sub.sub_id}
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{sub.title}</div>
          <div className="text-xs text-pla-muted mt-0.5">{sub.description}</div>
        </div>
        <span className="text-pla-muted text-xs shrink-0">{isExpanded ? '▼' : '▶'}</span>
      </button>
      {isExpanded && (
        <div className="px-2.5 pb-2.5 space-y-2 text-xs border-t border-pla-border/30 pt-2 mx-2.5">
          {sub.why && (
            <div>
              <span className="text-pla-accent font-medium">为什么：</span>
              {sub.why}
            </div>
          )}
          {sub.inputs && (
            <div>
              <span className="text-green-400 font-medium">输入：</span>
              {sub.inputs}
            </div>
          )}
          {sub.outputs && (
            <div>
              <span className="text-yellow-400 font-medium">输出：</span>
              {sub.outputs}
            </div>
          )}
          {sub.knowledge_points && sub.knowledge_points.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {sub.knowledge_points.map((kp) => (
                <span key={kp} className="badge">
                  {kp}
                </span>
              ))}
            </div>
          )}
          {sub.code_module && (
            <div className="text-pla-muted">
              代码设计阶段对应模块：{sub.code_module}
            </div>
          )}
          {sub.common_errors && sub.common_errors.length > 0 && (
            <div>
              <span className="text-red-400 font-medium">常见错误：</span>
              {sub.common_errors.join('；')}
            </div>
          )}
          {sub.next_hint && (
            <div className="text-pla-muted italic">→ {sub.next_hint}</div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ExecutionStepsPanel({
  visibleGroups,
  activeSubKey,
  onSelectSubStep,
  totalSubStepCount,
  revealedSubStepCount,
  pendingHint,
  awaitingContent,
  waitingForQuestion,
}: Props) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const total = totalSubStepCount ?? 0
  const revealed = revealedSubStepCount ?? 0
  const hasPending = total > revealed

  if (waitingForQuestion && revealed === 0 && visibleGroups.length > 0) {
    const firstGroup = visibleGroups[0]
    return (
      <div className="flex flex-col h-full">
        <div className="panel-header">
          <span>📝</span> 操作描述
          {total > 0 && (
            <span className="ml-auto text-xs text-pla-muted">0/{total} 小步骤</span>
          )}
        </div>
        <div className="panel-body space-y-3">
          <div className="rounded-lg border border-pla-accent/40 bg-pla-accent/5 p-4">
            <div className="text-[10px] uppercase tracking-wide text-pla-accent mb-1">当前大步骤</div>
            <div className="font-semibold text-base">{firstGroup.group.title}</div>
            {firstGroup.group.description && (
              <div className="text-xs text-pla-muted mt-1.5">{firstGroup.group.description}</div>
            )}
          </div>
          <div className="text-pla-muted text-sm text-center px-4 leading-relaxed">
            请先回答下方引导性问题，通过思考后才会逐步展示该大步骤下各小步骤的具体操作。
          </div>
        </div>
      </div>
    )
  }

  if (visibleGroups.length === 0 && !hasPending) {
    return (
      <div className="flex flex-col h-full">
        <div className="panel-header">
          <span>📝</span> 操作描述
        </div>
        <div className="panel-body text-pla-muted text-sm flex items-center justify-center text-center px-6 leading-relaxed">
          {awaitingContent
            ? '项目解析已完成。请回答下方引导性问题，AI 将按「大步骤 → 小步骤」用自然语言描述具体操作（本阶段不涉及写代码）。'
            : '项目解析完成后，此处将分大步骤呈现操作说明；每个大步骤下的小步骤需先完成引导性提问才会揭示。'}
        </div>
      </div>
    )
  }

  const toggle = (groupIndex: number, subId: number) => {
    const key = `${groupIndex}-${subId}`
    setExpandedKey(expandedKey === key ? null : key)
    onSelectSubStep(groupIndex, subId)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="panel-header">
        <span>📝</span> 操作描述
        {total > 0 && (
          <span className="ml-auto text-xs text-pla-muted">
            {revealed}/{total} 小步骤
          </span>
        )}
      </div>
      <div className="panel-body space-y-4">
        {visibleGroups.map(({ group, groupIndex, visibleSubSteps, totalSubSteps }) => (
          <section key={group.step_id} className="space-y-2">
            <div className="rounded-lg border border-pla-accent/40 bg-pla-accent/5 px-3 py-2.5">
              <div className="flex items-start gap-2">
                <span className="badge shrink-0">{group.step_id}</span>
                <div className="min-w-0">
                  <div className="font-semibold text-sm">{group.title}</div>
                  {group.description && (
                    <div className="text-xs text-pla-muted mt-0.5">{group.description}</div>
                  )}
                  {visibleSubSteps.length < totalSubSteps && (
                    <div className="text-[10px] text-pla-muted mt-1">
                      已揭示 {visibleSubSteps.length}/{totalSubSteps} 个小步骤
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              {visibleSubSteps.map((sub) => {
                const key = `${groupIndex}-${sub.sub_id}`
                return (
                  <SubStepCard
                    key={key}
                    sub={sub}
                    groupIndex={groupIndex}
                    isActive={activeSubKey === key}
                    isExpanded={expandedKey === key}
                    onToggle={() => toggle(groupIndex, sub.sub_id)}
                  />
                )
              })}
            </div>
          </section>
        ))}
        {hasPending && (
          <div className="rounded-lg border border-dashed border-pla-border/60 p-3 text-xs text-pla-muted text-center leading-relaxed">
            {pendingHint || '完成当前引导性提问后，将揭示下一个小步骤…'}
          </div>
        )}
      </div>
    </div>
  )
}
