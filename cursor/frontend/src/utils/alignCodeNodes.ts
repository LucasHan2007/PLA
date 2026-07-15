import type { CodeNode, LearningNode } from '../types'

/**
 * 将代码蓝图节点对齐到学习节点（一一对应）。
 * 优先 related_learning_node_ids；未标注时按 order 顺序兜底。
 */
export function alignCodeNodesToLearningNodes(
  learningNodes: LearningNode[],
  codeNodes: CodeNode[],
): Map<string, CodeNode | null> {
  const sortedLN = [...learningNodes].sort((a, b) => a.order - b.order)
  const sortedCN = [...codeNodes].sort((a, b) => a.order - b.order)
  const map = new Map<string, CodeNode | null>()
  const claimed = new Set<string>()

  for (const ln of sortedLN) {
    const match = sortedCN.find(
      (cn) => (cn.related_learning_node_ids ?? []).includes(ln.id) && !claimed.has(cn.id),
    )
    if (match) {
      map.set(ln.id, match)
      claimed.add(match.id)
    }
  }

  const unclaimed = sortedCN.filter((cn) => !claimed.has(cn.id))
  let i = 0
  for (const ln of sortedLN) {
    if (map.has(ln.id)) continue
    map.set(ln.id, unclaimed[i++] ?? null)
  }

  return map
}
