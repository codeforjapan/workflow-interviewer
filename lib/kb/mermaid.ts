import type {
  MermaidEdge,
  MermaidGraph,
  MermaidNode,
  MermaidSubgraph,
} from "./types";

const SUBGRAPH_OPEN = /^subgraph\s+(.+?)\s*$/;
const SUBGRAPH_CLOSE = /^end\s*$/;
const SKIP_PREFIX = /^(?:style|classDef|linkStyle|click)\b/;
const FLOWCHART_HEADER = /^flowchart\s+(?:TD|LR|TB|BT|RL)\b/;

const LABELLED_EDGE = /^(.+?)\s+--\s+([^-]+?)\s+-->\s+(.+?)\s*$/;
const DOTTED_EDGE = /^(.+?)\s*-\.->\s*(.+?)\s*$/;
const SOLID_EDGE = /^(.+?)\s*-->\s*(.+?)\s*$/;

const ID = "[A-Za-z_][A-Za-z0-9_]*";
const STADIUM_NODE = new RegExp(`^(${ID})\\(\\[([^\\]]+)\\]\\)$`);
const DIAMOND_NODE = new RegExp(`^(${ID})\\{([^}]+)\\}$`);
const RECT_NODE = new RegExp(`^(${ID})\\[([^\\]]+)\\]$`);
const BARE_ID = new RegExp(`^(${ID})$`);
// mermaid の `:::className` サフィックス (例: `G{社内承認ルート}:::condOr`)。
// 先に切り離してから形状判定する — 付いたまま渡すと上の形状正規表現が $ アンカーで一致しなくなり、
// ノードごと静かに消える (以前の挙動)。
const CLASS_SUFFIX = new RegExp(`^(.*):::(${ID})$`);

type SubgraphFrame = {
  title: string;
  nodeIds: Set<string>;
};

type ParseState = {
  nodes: Map<string, MermaidNode>;
  placeholders: Set<string>;
  edges: MermaidEdge[];
  subgraphs: MermaidSubgraph[];
  current: SubgraphFrame | null;
};

function registerNode(
  state: ParseState,
  node: MermaidNode,
  isPlaceholder: boolean,
) {
  const existing = state.nodes.get(node.id);
  if (!existing) {
    state.nodes.set(node.id, node);
    if (isPlaceholder) {
      state.placeholders.add(node.id);
    }
    return;
  }
  if (!isPlaceholder && state.placeholders.has(node.id)) {
    state.nodes.set(node.id, node);
    state.placeholders.delete(node.id);
  }
}

function trackInSubgraph(state: ParseState, id: string) {
  if (state.current) {
    state.current.nodeIds.add(id);
  }
}

function parseNodeRef(state: ParseState, raw: string): string | null {
  let text = raw.trim();
  if (!text) return null;

  let className: string | null = null;
  const classMatch = text.match(CLASS_SUFFIX);
  if (classMatch) {
    text = classMatch[1].trim();
    className = classMatch[2];
  }

  let m = text.match(STADIUM_NODE);
  if (m) {
    registerNode(state, { id: m[1], label: m[2], shape: "stadium", className }, false);
    trackInSubgraph(state, m[1]);
    return m[1];
  }
  m = text.match(DIAMOND_NODE);
  if (m) {
    registerNode(state, { id: m[1], label: m[2], shape: "diamond", className }, false);
    trackInSubgraph(state, m[1]);
    return m[1];
  }
  m = text.match(RECT_NODE);
  if (m) {
    registerNode(state, { id: m[1], label: m[2], shape: "rect", className }, false);
    trackInSubgraph(state, m[1]);
    return m[1];
  }
  m = text.match(BARE_ID);
  if (m) {
    registerNode(
      state,
      { id: m[1], label: m[1], shape: "rect", className },
      true,
    );
    trackInSubgraph(state, m[1]);
    return m[1];
  }
  return null;
}

function tryEdge(state: ParseState, line: string): boolean {
  let m = line.match(LABELLED_EDGE);
  if (m) {
    const from = parseNodeRef(state, m[1]);
    const to = parseNodeRef(state, m[3]);
    if (from && to) {
      state.edges.push({
        from,
        to,
        label: m[2].trim(),
        style: "solid",
      });
      return true;
    }
  }
  m = line.match(DOTTED_EDGE);
  if (m) {
    const from = parseNodeRef(state, m[1]);
    const to = parseNodeRef(state, m[2]);
    if (from && to) {
      state.edges.push({ from, to, label: null, style: "dotted" });
      return true;
    }
  }
  m = line.match(SOLID_EDGE);
  if (m) {
    const from = parseNodeRef(state, m[1]);
    const to = parseNodeRef(state, m[2]);
    if (from && to) {
      state.edges.push({ from, to, label: null, style: "solid" });
      return true;
    }
  }
  return false;
}

export function parseMermaidFlowchart(src: string): MermaidGraph {
  const state: ParseState = {
    nodes: new Map(),
    placeholders: new Set(),
    edges: [],
    subgraphs: [],
    current: null,
  };

  const lines = src.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("%%")) continue;
    if (FLOWCHART_HEADER.test(line)) continue;
    if (SKIP_PREFIX.test(line)) continue;

    const sub = line.match(SUBGRAPH_OPEN);
    if (sub) {
      state.current = { title: sub[1], nodeIds: new Set() };
      continue;
    }
    if (SUBGRAPH_CLOSE.test(line)) {
      if (state.current) {
        state.subgraphs.push({
          title: state.current.title,
          nodeIds: Array.from(state.current.nodeIds),
        });
        state.current = null;
      }
      continue;
    }

    if (tryEdge(state, line)) continue;
    parseNodeRef(state, line);
  }

  return {
    nodes: Array.from(state.nodes.values()),
    edges: state.edges,
    subgraphs: state.subgraphs,
  };
}
