import { useCallback, useEffect, useMemo } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from 'reactflow'
import 'reactflow/dist/style.css'
import type { KnowledgeGraphNode, ProjectKnowledgeGraph } from '../../types'
import GraphCircleNode, { type GraphCircleNodeData } from './GraphCircleNode'
import {
  CATEGORY_FILL,
  PROJECT_HUB_ID,
  RELATION_LABELS,
} from './constants'
import { computeRadialLayout } from './graphLayout'

const nodeTypes = { circle: GraphCircleNode }

interface Props {
  graph: ProjectKnowledgeGraph
  layers: KnowledgeGraphNode[][]
  selectedId: string | null
  onSelect: (id: string | null) => void
}

function buildFlowElements(
  graph: ProjectKnowledgeGraph,
  layers: KnowledgeGraphNode[][],
  selectedId: string | null,
): { nodes: Node<GraphCircleNodeData>[]; edges: Edge[] } {
  const positions = computeRadialLayout(layers, graph.project_name)
  const rootIds = new Set((layers[0] ?? []).map((n) => n.id))

  const nodes: Node<GraphCircleNodeData>[] = [
    {
      id: PROJECT_HUB_ID,
      type: 'circle',
      position: positions.get(PROJECT_HUB_ID) ?? { x: 400, y: 300 },
      data: {
        label: graph.project_name,
        category: 'concept',
        importance: 1,
        isHub: true,
      },
      selected: selectedId === PROJECT_HUB_ID,
    },
    ...graph.nodes.map((n) => ({
      id: n.id,
      type: 'circle' as const,
      position: positions.get(n.id) ?? { x: 0, y: 0 },
      data: {
        label: n.label,
        category: n.category,
        importance: n.importance,
      },
      selected: selectedId === n.id,
    })),
  ]

  const edges: Edge[] = [
    ...[...rootIds].map((rid) => ({
      id: `hub-${rid}`,
      source: PROJECT_HUB_ID,
      target: rid,
      type: 'default' as const,
      label: '项目',
      labelStyle: { fill: '#64748b', fontSize: 9 },
      labelBgStyle: { fill: '#0f1419', fillOpacity: 0.85 },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 3,
      style: { stroke: '#475569', strokeWidth: 1.2, strokeDasharray: '4 3' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#475569', width: 14, height: 14 },
    })),
    ...graph.edges.map((e) => {
      const isRequires = e.relation === 'requires'
      const color = isRequires ? '#94a3b8' : '#64748b'
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'default' as const,
        label: RELATION_LABELS[e.relation] ?? e.relation,
        labelStyle: { fill: '#94a3b8', fontSize: 9 },
        labelBgStyle: { fill: '#0f1419', fillOpacity: 0.85 },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 3,
        style: {
          stroke: color,
          strokeWidth: isRequires ? 1.6 : 1.2,
          strokeDasharray: isRequires ? undefined : '5 4',
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color,
          width: 14,
          height: 14,
        },
      }
    }),
  ]

  return { nodes, edges }
}

export default function KnowledgeGraphCanvas({ graph, layers, selectedId, onSelect }: Props) {
  const initial = useMemo(() => buildFlowElements(graph, layers, null), [graph, layers])

  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges)

  useEffect(() => {
    const next = buildFlowElements(graph, layers, null)
    setNodes(next.nodes)
    setEdges(next.edges)
  }, [graph, layers, setNodes, setEdges])

  useEffect(() => {
    setNodes((prev) =>
      prev.map((n) => ({
        ...n,
        selected: n.id === selectedId,
      })),
    )
  }, [selectedId, setNodes])

  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      onSelect(node.id === selectedId ? null : node.id)
    },
    [onSelect, selectedId],
  )

  const onPaneClick = useCallback(() => {
    onSelect(null)
  }, [onSelect])

  return (
    <div className="h-full w-full min-h-0 bg-[#0c1219] rounded-lg overflow-hidden border border-pla-border/40">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.08, maxZoom: 1.15 }}
        minZoom={0.35}
        maxZoom={1.6}
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: 'default' }}
      >
        <Background color="#2d3a4f" gap={18} size={1} />
        <Controls
          showInteractive={false}
          className="!bg-pla-panel !border-pla-border !shadow-none !scale-90 [&>button]:!bg-pla-panel [&>button]:!border-pla-border [&>button]:!fill-pla-muted"
        />
        <MiniMap
          nodeColor={(n) => {
            if (n.id === PROJECT_HUB_ID) return '#1e3a5f'
            const cat = (n.data as GraphCircleNodeData | undefined)?.category
            return CATEGORY_FILL[cat ?? 'concept'] ?? '#3b82f6'
          }}
          maskColor="rgba(15,20,25,0.7)"
          pannable
          zoomable
          className="!bg-pla-panel/90 !border-pla-border !w-[100px] !h-[70px]"
        />
      </ReactFlow>
    </div>
  )
}
