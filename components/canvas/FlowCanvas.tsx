"use client";

import { useMemo } from "react";
import {
  Background,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { ExtractedBusinessInfo } from "@/lib/db/schema";

const NODE_GAP_Y = 100;
const NODE_X = 80;

export function FlowCanvas({ extracted }: { extracted: ExtractedBusinessInfo }) {
  const { nodes, edges } = useMemo(() => buildGraph(extracted), [extracted]);

  return (
    <div className="h-full w-full">
      <ReactFlow nodes={nodes} edges={edges} fitView fitViewOptions={{ padding: 0.3 }}>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}

function buildGraph(data: ExtractedBusinessInfo): { nodes: Node[]; edges: Edge[] } {
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
