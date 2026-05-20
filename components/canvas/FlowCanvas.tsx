"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  type NodeMouseHandler,
  type NodeProps,
  Panel,
  ReactFlow,
  reconnectEdge,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { ExtractedBusinessInfo, FlowLayout } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";

const NODE_GAP_Y = 100;
const NODE_X = 80;
const GROUP_NODE_PREFIX = "group:";
const NODE_WIDTH = 220;
const NODE_HEIGHT = 44;
const GROUP_PADDING = 24;
const nodeTypes = { groupBox: GroupBoxNode };

export function FlowCanvas({
  extracted,
  flowLayout,
  onFlowChange,
  onNodeSelect,
  readonly = false,
}: {
  extracted: ExtractedBusinessInfo;
  flowLayout: FlowLayout;
  onFlowChange?: (layout: FlowLayout) => void;
  onNodeSelect?: (nodeId: string) => void;
  readonly?: boolean;
}) {
  const [nodes, setNodes, onNodesChangeBase] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState<Edge>([]);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);

  useEffect(() => {
    const merged = buildGraph(extracted, flowLayout);
    if (!areNodesEqual(nodes, merged.nodes)) {
      setNodes(merged.nodes);
    }
    if (!areEdgesEqual(edges, merged.edges)) {
      setEdges(merged.edges);
    }
  }, [edges, extracted, flowLayout, nodes, setEdges, setNodes]);

  const emitFlowChange = useCallback(
    (nextNodes: Node[], nextEdges: Edge[]) => {
      if (!onFlowChange) return;
      const layout: FlowLayout = {
        nodes: nextNodes
          .filter((node) => !isGroupNodeId(node.id))
          .map((node) => ({
            id: node.id,
            x: node.position.x,
            y: node.position.y,
          })),
        edges: nextEdges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
        })),
        groups: flowLayout.groups ?? [],
      };
      onFlowChange(layout);
    },
    [flowLayout.groups, onFlowChange],
  );

  const canCreateGroup = useMemo(() => selectedNodeIds.length >= 2, [selectedNodeIds]);

  const handleCreateGroup = useCallback(() => {
    if (selectedNodeIds.length < 2) return;
    const label = window.prompt("グループ名を入力してください", "新しいグループ");
    if (!label) return;
    const nextGroups = [
      ...(flowLayout.groups ?? []),
      {
        id: `g-${Date.now()}`,
        label,
        nodeIds: selectedNodeIds,
      },
    ];
    onFlowChange?.({
      nodes: flowLayout.nodes,
      edges: flowLayout.edges,
      groups: nextGroups,
    });
  }, [flowLayout.edges, flowLayout.groups, flowLayout.nodes, onFlowChange, selectedNodeIds]);

  const onNodesChange = useCallback(
    (changes: NodeChange<Node>[]) => {
      onNodesChangeBase(changes);
      const hasPositionChange = changes.some((change) => change.type === "position");
      if (hasPositionChange) {
        const nextNodes = applyNodeChanges(nodes, changes);
        emitFlowChange(nextNodes, edges);
      }
    },
    [edges, emitFlowChange, nodes, onNodesChangeBase],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      onEdgesChangeBase(changes);
      const hasRemoval = changes.some((change) => change.type === "remove");
      if (hasRemoval) {
        const nextEdges = applyEdgeRemovals(edges, changes);
        emitFlowChange(nodes, nextEdges);
      }
    },
    [edges, emitFlowChange, nodes, onEdgesChangeBase],
  );

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      setEdges((current) => {
        const nextEdges = reconnectEdge(oldEdge, newConnection, current);
        emitFlowChange(nodes, nextEdges);
        return nextEdges;
      });
    },
    [emitFlowChange, nodes, setEdges],
  );

  const onNodeDoubleClick = useCallback<NodeMouseHandler<Node>>(
    (_event, node) => {
      if (!isGroupNodeId(node.id)) return;
      const groupId = node.id.slice(GROUP_NODE_PREFIX.length);
      const current = (flowLayout.groups ?? []).find((group) => group.id === groupId);
      if (!current) return;
      const nextLabel = window.prompt("グループ名を編集", current.label);
      if (!nextLabel || nextLabel === current.label) return;
      const nextGroups = (flowLayout.groups ?? []).map((group) =>
        group.id === groupId ? { ...group, label: nextLabel } : group,
      );
      onFlowChange?.({
        nodes: flowLayout.nodes,
        edges: flowLayout.edges,
        groups: nextGroups,
      });
    },
    [flowLayout.edges, flowLayout.groups, flowLayout.nodes, onFlowChange],
  );
  const onNodeClick = useCallback<NodeMouseHandler<Node>>(
    (_event, node) => {
      if (!onNodeSelect) return;
      onNodeSelect(node.id);
    },
    [onNodeSelect],
  );

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        nodesDraggable={!readonly}
        edgesReconnectable={!readonly}
        elementsSelectable={!readonly}
        onNodesChange={readonly ? undefined : onNodesChange}
        onEdgesChange={readonly ? undefined : onEdgesChange}
        onReconnect={readonly ? undefined : onReconnect}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={readonly ? undefined : onNodeDoubleClick}
        onSelectionChange={
          readonly
            ? undefined
            : (selection) => {
                const nextIds = (selection.nodes ?? [])
                  .map((node) => node.id)
                  .filter((id) => !isGroupNodeId(id));
                setSelectedNodeIds((prev) => (areStringArraysEqual(prev, nextIds) ? prev : nextIds));
              }
        }
      >
        {!readonly && (
          <Panel position="top-left">
            <Button variant="outline" size="sm" disabled={!canCreateGroup} onClick={handleCreateGroup}>
              選択ノードをグループ化
            </Button>
          </Panel>
        )}
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}

function buildGraph(data: ExtractedBusinessInfo, layout: FlowLayout): { nodes: Node[]; edges: Edge[] } {
  const base = buildBaseGraph(data);
  const knownNodeIds = new Set(base.nodes.map((node) => node.id));
  const layoutNodes = new Map(layout.nodes.map((node) => [node.id, node]));
  const contentNodes = base.nodes.map((node) => {
    const saved = layoutNodes.get(node.id);
    return saved
      ? { ...node, position: { x: saved.x, y: saved.y } }
      : node;
  });

  const persistedEdges = layout.edges.filter(
    (edge) => knownNodeIds.has(edge.source) && knownNodeIds.has(edge.target),
  );
  const edges: Edge[] =
    persistedEdges.length > 0
      ? persistedEdges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
        }))
      : base.edges;

  const groupNodes = buildGroupNodes(contentNodes, layout.groups ?? []);
  const nodes = [...groupNodes, ...contentNodes];

  return { nodes, edges };
}

function buildBaseGraph(data: ExtractedBusinessInfo): { nodes: Node[]; edges: Edge[] } {
  const sorted = [...data.steps].sort((a, b) => a.order - b.order);
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // 概要ノード（業務名）
  if (data.taskName) {
    nodes.push({
      id: "task",
      type: "input",
      position: { x: NODE_X, y: 0 },
      data: { label: data.taskName },
    });
  }

  sorted.forEach((step, i) => {
    const yOffset = (data.taskName ? 1 : 0) + i;
    nodes.push({
      id: step.id,
      position: { x: NODE_X, y: yOffset * NODE_GAP_Y },
      data: { label: `${i + 1}. ${step.label}` },
    });
    if (i === 0 && data.taskName) {
      edges.push({ id: `e-task-${step.id}`, source: "task", target: step.id });
    }
    if (i > 0) {
      const prev = sorted[i - 1];
      edges.push({ id: `e-${prev.id}-${step.id}`, source: prev.id, target: step.id });
    }
  });

  return { nodes, edges };
}

function applyNodeChanges(nodes: Node[], changes: NodeChange<Node>[]) {
  const removeIds = new Set(
    changes.filter((change) => change.type === "remove").map((change) => change.id),
  );
  const positionById = new Map(
    changes
      .filter((change): change is NodeChange<Node> & { type: "position"; position: { x: number; y: number } } =>
        change.type === "position" && !!change.position,
      )
      .map((change) => [change.id, change.position]),
  );
  return nodes
    .filter((node) => !removeIds.has(node.id))
    .map((node) => {
      const position = positionById.get(node.id);
      return position ? { ...node, position } : node;
    });
}

function applyEdgeRemovals(edges: Edge[], changes: EdgeChange<Edge>[]) {
  const removeIds = new Set(
    changes.filter((change) => change.type === "remove").map((change) => change.id),
  );
  return edges.filter((edge) => !removeIds.has(edge.id));
}

function isGroupNodeId(id: string) {
  return id.startsWith(GROUP_NODE_PREFIX);
}

function buildGroupNodes(nodes: Node[], groups: FlowLayout["groups"]): Node[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const groupNodes: Node[] = [];
  for (const group of groups) {
    const members = group.nodeIds
      .map((id) => nodesById.get(id))
      .filter((node): node is Node => !!node);
    if (members.length < 2) continue;

    const minX = Math.min(...members.map((n) => n.position.x)) - GROUP_PADDING;
    const minY = Math.min(...members.map((n) => n.position.y)) - GROUP_PADDING;
    const maxX = Math.max(...members.map((n) => n.position.x + NODE_WIDTH)) + GROUP_PADDING;
    const maxY = Math.max(...members.map((n) => n.position.y + NODE_HEIGHT)) + GROUP_PADDING;

    groupNodes.push({
      id: `${GROUP_NODE_PREFIX}${group.id}`,
      type: "groupBox",
      position: { x: minX, y: minY },
      data: { label: group.label },
      draggable: false,
      selectable: false,
      style: {
        width: Math.max(200, maxX - minX),
        height: Math.max(120, maxY - minY),
        borderRadius: 12,
        border: "1px dashed #a1a1aa",
        background: "rgba(161, 161, 170, 0.08)",
        pointerEvents: "none",
        zIndex: -1,
        padding: 8,
        fontSize: 12,
        color: "#52525b",
      },
    });
  }
  return groupNodes;
}

function GroupBoxNode({ data }: NodeProps<Node<{ label?: string }>>) {
  return (
    <div className="h-full w-full rounded-xl border border-dashed border-zinc-400/80 bg-zinc-400/10">
      <div className="px-2 py-1 text-xs font-medium text-zinc-700 dark:text-zinc-200">
        {data.label ?? "グループ"}
      </div>
    </div>
  );
}

function areNodesEqual(a: Node[], b: Node[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const an = a[i];
    const bn = b[i];
    if (!bn) return false;
    if (an.id !== bn.id) return false;
    if (an.type !== bn.type) return false;
    if (an.position.x !== bn.position.x || an.position.y !== bn.position.y) return false;
    if (String(an.data?.label ?? "") !== String(bn.data?.label ?? "")) return false;
  }
  return true;
}

function areEdgesEqual(a: Edge[], b: Edge[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const ae = a[i];
    const be = b[i];
    if (!be) return false;
    if (ae.id !== be.id) return false;
    if (ae.source !== be.source || ae.target !== be.target) return false;
  }
  return true;
}

function areStringArraysEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
