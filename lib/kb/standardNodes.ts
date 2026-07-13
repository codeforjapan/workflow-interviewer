import type { FlowStandardMermaidBlock, MermaidNode, ParsedFlowStandard } from "./types";

const LABEL_NEWLINE = /\\n|\n/g;

export type StandardNodeRef = {
  /** "block-2/CheckProxy" のような mermaid ブロックを含むユニークキー */
  id: string;
  /** mermaid ノード id (例: "CheckProxy") */
  rawId: string;
  label: string;
  subgraph: string | null;
  blockIndex: number;
  shape: MermaidNode["shape"];
  /** このノードが属する標準フロー (直前の `## ` 見出し)。無ければ null。 */
  flowTitle: string | null;
};

/**
 * 標準フロー (複数 mermaid ブロック) の全ノードをフラット化する。
 * 同名ノードが異なるブロックに出てきても別エントリとして扱う (block-N プレフィックス)。
 */
export function flattenStandardNodes(
  flowStandard: ParsedFlowStandard,
): StandardNodeRef[] {
  const out: StandardNodeRef[] = [];
  flowStandard.mermaid.forEach((graph: FlowStandardMermaidBlock, blockIndex: number) => {
    const subgraphByNode = new Map<string, string>();
    for (const sg of graph.subgraphs) {
      for (const nid of sg.nodeIds) subgraphByNode.set(nid, sg.title);
    }
    for (const node of graph.nodes) {
      // ノードラベルの \n を空白に潰す (LLM に渡しやすくする)
      const cleanLabel = (node.label || node.id).replace(LABEL_NEWLINE, " ").trim();
      out.push({
        id: `block-${blockIndex + 1}/${node.id}`,
        rawId: node.id,
        label: cleanLabel,
        subgraph: subgraphByNode.get(node.id) ?? null,
        blockIndex,
        shape: node.shape,
        flowTitle: graph.flowTitle,
      });
    }
  });
  return out;
}
