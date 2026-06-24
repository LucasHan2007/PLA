import type { ExecutionStep, OperationSubStep } from '../types'

export interface HiddenSubStepTarget {
  groupIndex: number
  subIndex: number
  group: ExecutionStep
  subStep: OperationSubStep
}

export interface VisibleOperationGroup {
  group: ExecutionStep
  groupIndex: number
  titleVisible: boolean
  visibleSubSteps: OperationSubStep[]
  totalSubSteps: number
}

/** 所有大步骤内小步骤的总数（扁平计数，用于 revealed_step_count）。 */
export function countTotalSubSteps(groups: ExecutionStep[]): number {
  return groups.reduce((sum, group) => sum + (group.sub_steps?.length ?? 0), 0)
}

export function cumulativeSubStepsBefore(groups: ExecutionStep[], groupIndex: number): number {
  return groups.slice(0, groupIndex).reduce((sum, group) => sum + (group.sub_steps?.length ?? 0), 0)
}

export function isGroupTitleVisible(groups: ExecutionStep[], groupIndex: number, revealedCount: number): boolean {
  if (groupIndex === 0) return groups.length > 0
  return revealedCount >= cumulativeSubStepsBefore(groups, groupIndex)
}

export function getVisibleSubStepCountInGroup(
  groups: ExecutionStep[],
  groupIndex: number,
  revealedCount: number,
): number {
  const before = cumulativeSubStepsBefore(groups, groupIndex)
  const inGroup = revealedCount - before
  const total = groups[groupIndex]?.sub_steps?.length ?? 0
  return Math.max(0, Math.min(inGroup, total))
}

/** 下一个尚未揭示的小步骤（AI 引导目标）。 */
export function getNextHiddenSubStep(
  groups: ExecutionStep[],
  revealedCount: number,
): HiddenSubStepTarget | null {
  let flat = 0
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    const group = groups[groupIndex]
    for (let subIndex = 0; subIndex < (group.sub_steps?.length ?? 0); subIndex++) {
      if (flat === revealedCount) {
        return { groupIndex, subIndex, group, subStep: group.sub_steps![subIndex] }
      }
      flat++
    }
  }
  return null
}

/** 构建操作描述面板的可见层级视图。 */
export function buildVisibleOperationView(
  groups: ExecutionStep[],
  revealedCount: number,
): VisibleOperationGroup[] {
  return groups
    .map((group, groupIndex) => ({
      group,
      groupIndex,
      titleVisible: isGroupTitleVisible(groups, groupIndex, revealedCount),
      visibleSubSteps: (group.sub_steps ?? []).slice(
        0,
        getVisibleSubStepCountInGroup(groups, groupIndex, revealedCount),
      ),
      totalSubSteps: group.sub_steps?.length ?? 0,
    }))
    .filter((item) => item.titleVisible)
}
