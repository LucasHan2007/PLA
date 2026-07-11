import type { KnowledgeGraphNode } from '../../types'
import { PROJECT_HUB_ID, hubRadius, nodeRadius } from './constants'

export interface LayoutPoint {
  x: number
  y: number
}

/**
 * 以项目为中心的紧凑径向分层布局。
 * 层间距随层数自适应，避免图谱占满过大画布。
 */
export function computeRadialLayout(
  layers: KnowledgeGraphNode[][],
  projectName: string,
): Map<string, LayoutPoint> {
  const positions = new Map<string, LayoutPoint>()
  const cx = 320
  const cy = 240
  const hubR = hubRadius(projectName)

  positions.set(PROJECT_HUB_ID, { x: cx - hubR, y: cy - hubR })

  if (layers.length === 0) return positions

  const layerCount = layers.length
  const ringGap = layerCount <= 3 ? 88 : layerCount <= 5 ? 72 : 60
  const baseRadius = 78

  layers.forEach((layer, li) => {
    const n = layer.length
    if (n === 0) return

    // 同层节点多时略微外扩，减少重叠
    const densityBoost = n > 6 ? Math.min(28, (n - 6) * 4) : 0
    const radius = baseRadius + li * ringGap + densityBoost
    const angleOffset = (li % 2 === 0 ? 0 : Math.PI / n) - Math.PI / 2

    layer.forEach((node, i) => {
      const angle = angleOffset + (2 * Math.PI * i) / n
      const r = nodeRadius(node.importance)
      positions.set(node.id, {
        x: cx + radius * Math.cos(angle) - r,
        y: cy + radius * Math.sin(angle) - r,
      })
    })
  })

  return positions
}
