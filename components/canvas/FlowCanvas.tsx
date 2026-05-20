"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  type NodeMouseHandler,
  Panel,
  ReactFlow,
  reconnectEdge,
  type Connection as RfConnection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import {
  ConnectionExternalNode,
  GroupBoxNode,
  StepNode,
} from "./CustomNodes";
import { GapDialog } from "./GapDialog";
import {
  buildGraph,
  GROUP_NODE_PREFIX,
  isGroupNodeId,
  pickWorkflowLevelGaps,
} from "./graph";
import type { FlowLayout, SessionExtractedData } from "@/lib/db/schema";
import type { ExtractedGap } from "@/lib/server/interview/schema";

const nodeTypes = {
  step: StepNode,
  connectionExternal: ConnectionExternalNode,
  groupBox: GroupBoxNode,
};

export function FlowCanvas({
  extracted,
  flowLayout,
  onFlowChange,
  onNodeSelect,
  readonly = false,
}: {
  extracted: SessionExtractedData;
  flowLayout: FlowLayout;
  onFlowChange?: (layout: FlowLayout) => void;
  onNodeSelect?: (nodeId: string) => void;
  readonly?: boolean;
}) {
  const [nodes, setNodes, onNodesChangeBase] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState<Edge>([]);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [activeGap, setActiveGap] = useState<ExtractedGap | null>(null);

  const handleGapClick = useCallback((gap: ExtractedGap) => {
    setActiveGap(gap);
  }, []);

  useEffect(() => {
    const merged = buildGraph(extracted, flowLayout);
    // step ノードに onGapClick ハンドラを注入する (graph.ts は pure に保つ)
    const decorated = merged.nodes.map((node) =>
      node.type === "step"
        ? { ...node, data: { ...node.data, onGapClick: handleGapClick } }
        : node,
    );
    if (!areNodesEqual(nodes, decorated)) setNodes(decorated);
    if (!areEdgesEqual(edges, merged.edges)) setEdges(merged.edges);
  }, [edges, extracted, flowLayout, handleGapClick, nodes, setEdges, setNodes]);

  const workflowGaps = useMemo(() => pickWorkflowLevelGaps(extracted), [extracted]);

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
    (oldEdge: Edge, newConnection: RfConnection) => {
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
    <div className="relative h-full w-full">
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
                setSelectedNodeIds((prev) =>
                  areStringArraysEqual(prev, nextIds) ? prev : nextIds,
                );
              }
        }
      >
        {!readonly && (
          <Panel position="top-left">
            <Button
              variant="outline"
              size="sm"
              disabled={!canCreateGroup}
              onClick={handleCreateGroup}
            >
              選択ノードをグループ化
            </Button>
          </Panel>
        )}
        {workflowGaps.length > 0 && (
          <Panel position="top-right">
            <div className="rounded-md border bg-card p-2 text-xs shadow-sm">
              <div className="mb-1 font-medium">
                ワークフロー全体のギャップ ({workflowGaps.length})
              </div>
              <div className="flex max-w-[260px] flex-wrap gap-1">
                {workflowGaps.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setActiveGap(g)}
                    className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                    title={g.reason}
                  >
                    {g.kind}
                    {g.matchedKnownGap ? ` · ${g.matchedKnownGap}` : ""}
                  </button>
                ))}
              </div>
            </div>
          </Panel>
        )}
        <Background />
        <Controls />
      </ReactFlow>

      <GapDialog gap={activeGap} onOpenChange={(open) => !open && setActiveGap(null)} />
    </div>
  );
}

function applyNodeChanges(nodes: Node[], changes: NodeChange<Node>[]) {
  const removeIds = new Set(
    changes.filter((change) => change.type === "remove").map((change) => change.id),
  );
  const positionById = new Map(
    changes
      .filter(
        (change): change is NodeChange<Node> & { type: "position"; position: { x: number; y: number } } =>
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
