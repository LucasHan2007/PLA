import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { CATEGORY_FILL, CATEGORY_RING, PROJECT_HUB_ID, hubRadius, nodeRadius } from './constants'

export type GraphCircleNodeData = {
  label: string
  category: string
  importance: number
  isHub?: boolean
  selected?: boolean
}

function GraphCircleNode({ id, data, selected }: NodeProps<GraphCircleNodeData>) {
  const isHub = data.isHub || id === PROJECT_HUB_ID
  const r = isHub ? hubRadius(data.label) : nodeRadius(data.importance)
  const fill = isHub ? '#1e3a5f' : CATEGORY_FILL[data.category] ?? CATEGORY_FILL.concept
  const ring = isHub ? '#60a5fa' : CATEGORY_RING[data.category] ?? CATEGORY_RING.concept
  const size = r * 2
  const maxChars = isHub ? 10 : r >= 26 ? 8 : 6

  return (
    <div
      className="relative flex items-center justify-center select-none"
      style={{ width: size, height: size }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-1 !h-1 !bg-transparent !border-0 !opacity-0"
      />
      <div
        className="rounded-full flex items-center justify-center text-center px-1 transition-shadow duration-200"
        style={{
          width: size,
          height: size,
          background: fill,
          boxShadow: selected
            ? `0 0 0 2px ${ring}, 0 0 12px ${fill}88`
            : `0 1px 6px ${fill}44`,
          border: selected ? `2px solid ${ring}` : '1.5px solid rgba(255,255,255,0.18)',
        }}
        title={data.label}
      >
        <span
          className="text-white font-medium leading-tight break-words"
          style={{
            fontSize: isHub ? 10 : r >= 26 ? 9 : 8,
            maxWidth: size - 6,
          }}
        >
          {data.label.length > maxChars ? `${data.label.slice(0, maxChars - 1)}…` : data.label}
        </span>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-1.5 !h-1.5 !bg-transparent !border-0 !opacity-0"
      />
    </div>
  )
}

export default memo(GraphCircleNode)
