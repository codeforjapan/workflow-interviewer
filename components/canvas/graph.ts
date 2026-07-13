import type { Edge, Node } from "@xyflow/react";
import type {
  FlowLayout,
  SessionExtractedData,
} from "@/lib/db/schema";
import type { ExtractedGap } from "@/lib/server/interview/schema";

export const NODE_GAP_Y = 100;
export const STEP_NODE_X = 80;
export const CONNECTION_NODE_X = 520;
export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 44;
export const GROUP_PADDING = 24;
export const GROUP_NODE_PREFIX = "group:";
export const CONNECTION_NODE_PREFIX = "conn:";

export type StepNodeData = {
  label: string;
  order: number;
  /** この step に紐づく gaps (actualStepRef が一致) */
  gaps: ExtractedGap[];
  /** この step に紐づく exceptions の数 (relatedStepId が一致) */
  exceptionCount: number;
};

export type ConnectionNodeData = {
  label: string;
  targetType: "workflow" | "department" | "external" | "system";
  note: string | null;
  ref: string | null;
};

export function isGroupNodeId(id: string) {
  return id.startsWith(GROUP_NODE_PREFIX);
}

export function isConnectionNodeId(id: string) {
  return id.startsWith(CONNECTION_NODE_PREFIX);
}

function connectionNodeId(connId: string): string {
  return `${CONNECTION_NODE_PREFIX}${connId}`;
}

/**
 * SessionExtractedData から ReactFlow の Node/Edge を組み立てる。
 *
 * レイアウト:
 * - 左カラム (STEP_NODE_X): task header → steps を縦に並べる
 * - 右カラム (CONNECTION_NODE_X): connections を縦に並べる
 *   - fromStepId が set されている connection はその step の Y に揃える
 *   - fromStepId=null (KB seed 由来の workflow-level link) は task header に揃える
 *
 * gaps は対応する step.id に actualStepRef が一致するもののみ
 * StepNode の data.gaps に格納する。workflow-level な gap は panel で扱う (UI 側責務)。
 */
/**
 * 既存 DB に重複 id の gaps が混入していた場合に React の key 衝突を
 * 防ぐための防御的 dedup。同じ id があれば最初に現れたものだけを残す。
 */
function dedupeGaps(gaps: ExtractedGap[]): ExtractedGap[] {
  const seen = new Set<string>();
  const out: ExtractedGap[] = [];
  for (const g of gaps) {
    if (seen.has(g.id)) continue;
    seen.add(g.id);
    out.push(g);
  }
  return out;
}

export function buildBaseGraph(
  data: SessionExtractedData,
): { nodes: Node[]; edges: Edge[] } {
  const sorted = [...data.steps].sort((a, b) => a.order - b.order);
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const dedupedGaps = dedupeGaps(data.gaps);

  // 概要ノード (業務名)
  let hasTaskNode = false;
  if (data.taskName) {
    hasTaskNode = true;
    nodes.push({
      id: "task",
      type: "input",
      position: { x: STEP_NODE_X, y: 0 },
      data: { label: data.taskName },
    });
  }

  const stepIdToOrder = new Map<string, number>();
  const stepIdToY = new Map<string, number>();
  sorted.forEach((step, i) => {
    const yOffset = (hasTaskNode ? 1 : 0) + i;
    const y = yOffset * NODE_GAP_Y;
    stepIdToOrder.set(step.id, i);
    stepIdToY.set(step.id, y);

    const stepGaps = dedupedGaps.filter((g) => g.actualStepRef === step.id);
    const stepExceptionCount = data.exceptions.filter(
      (e) => e.relatedStepId === step.id,
    ).length;

    const stepData: StepNodeData = {
      label: `${i + 1}. ${step.label}`,
      order: step.order,
      gaps: stepGaps,
      exceptionCount: stepExceptionCount,
    };
    nodes.push({
      id: step.id,
      type: "step",
      position: { x: STEP_NODE_X, y },
      data: stepData as unknown as Record<string, unknown>,
    });
    if (i === 0 && hasTaskNode) {
      edges.push({ id: `e-task-${step.id}`, source: "task", target: step.id });
    }
    if (i > 0) {
      const prev = sorted[i - 1];
      edges.push({
        id: `e-${prev.id}-${step.id}`,
        source: prev.id,
        target: step.id,
      });
    }
  });

  // connection ノード
  data.connections.forEach((conn, i) => {
    const id = connectionNodeId(conn.id);
    const anchorY = conn.fromStepId && stepIdToY.has(conn.fromStepId)
      ? stepIdToY.get(conn.fromStepId)!
      : (hasTaskNode ? 0 : i * NODE_GAP_Y);
    // 同じ step に複数 connection がぶら下がる場合は少しずらす
    const stagger = i * 12;
    const data_: ConnectionNodeData = {
      label: conn.target.label,
      targetType: conn.target.type,
      note: conn.note,
      ref: conn.target.ref,
    };
    nodes.push({
      id,
      type: "connectionExternal",
      position: { x: CONNECTION_NODE_X, y: anchorY + stagger },
      data: data_ as unknown as Record<string, unknown>,
    });
    const source = conn.fromStepId && stepIdToY.has(conn.fromStepId)
      ? conn.fromStepId
      : (hasTaskNode ? "task" : null);
    if (source) {
      edges.push({
        id: `e-${source}-${id}`,
        source,
        target: id,
        animated: false,
        style: { strokeDasharray: "5 5", stroke: "#71717a" },
      });
    }
  });

  return { nodes, edges };
}

/**
 * 永続化された FlowLayout (手動編集された座標・接続) を base graph にマージする。
 */
export function buildGraph(
  data: SessionExtractedData,
  layout: FlowLayout,
): { nodes: Node[]; edges: Edge[] } {
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
  // 永続化された edges を採用するときも、connection 由来の dashed style は base から拾い直す
  const baseEdgeById = new Map(base.edges.map((e) => [e.id, e]));
  const edges: Edge[] =
    persistedEdges.length > 0
      ? persistedEdges.map((edge) => {
          const fromBase = baseEdgeById.get(edge.id);
          return {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            style: fromBase?.style,
            animated: fromBase?.animated ?? false,
          };
        })
      : base.edges;

  const groupNodes = buildGroupNodes(contentNodes, layout.groups ?? []);
  const nodes = [...groupNodes, ...contentNodes];

  return { nodes, edges };
}

export function buildGroupNodes(
  nodes: Node[],
  groups: FlowLayout["groups"],
): Node[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const groupNodes: Node[] = [];
  for (const group of groups) {
    const members = group.nodeIds
      .map((id) => nodesById.get(id))
      .filter((node): node is Node => !!node);
    if (members.length < 2) continue;

    const minX = Math.min(...members.map((n) => n.position.x)) - GROUP_PADDING;
    const minY = Math.min(...members.map((n) => n.position.y)) - GROUP_PADDING;
    const maxX =
      Math.max(...members.map((n) => n.position.x + NODE_WIDTH)) + GROUP_PADDING;
    const maxY =
      Math.max(...members.map((n) => n.position.y + NODE_HEIGHT)) + GROUP_PADDING;

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

/**
 * workflow-level gaps (step に紐づかない gaps) を返す。
 * UI panel で表示する想定。
 */
export function pickWorkflowLevelGaps(
  data: SessionExtractedData,
): ExtractedGap[] {
  const stepIds = new Set(data.steps.map((s) => s.id));
  return dedupeGaps(data.gaps).filter((g) => {
    if (!g.actualStepRef) return true;
    return !stepIds.has(g.actualStepRef);
  });
}
