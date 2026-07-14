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
  /** mermaid の `:::className` サフィックス。無ければ null。"condOr" は fork-group の分岐元を示す。 */
  className: string | null;
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
        className: node.className,
        flowTitle: graph.flowTitle,
      });
    }
  });
  return out;
}

export type ForkGroup = {
  /** 分岐元ノードの StandardNodeRef.id ("block-1/G")。デバッグ用。 */
  id: string;
  /** 現状 "or" のみ。排他的な代替パス (どれか1つ確認できればグループ全体を確認済みとみなす)。
   *  AND (全枝必須) は特別な印を付けないデフォルト挙動 (各ノードを個別に必須として扱う) と同じなので
   *  グループ化する必要がない。 */
  type: "or";
  /** 分岐先ノードの StandardNodeRef.id 一覧 (flattenStandardNodes と同じ id 形式)。 */
  memberIds: string[];
};

/**
 * mermaid 上で `:::condOr` が付いた分岐ノードから、直接の分岐先を1つの OR グループとして抽出する。
 * 例: `G{社内承認ルート}:::condOr` --> G1/G2/G3 は「どれか1つの経路を使う」排他的な代替パスであり、
 * 標準フローの全ノードを一律必須とする nodeCoverage の既定挙動ではどれか1つしか実際に使われない
 * 枝が永遠に未確認のまま残ってしまう (issue: board 承認の質問が無限に繰り返される)。
 * `:::condOr` で明示されたノードだけをグループ化対象とし、それ以外の分岐 (AND や単純な Yes/No 判定) は
 * 従来通り個別ノードとして扱う。
 */
export function computeForkGroups(flowStandard: ParsedFlowStandard): ForkGroup[] {
  const groups: ForkGroup[] = [];
  flowStandard.mermaid.forEach((graph: FlowStandardMermaidBlock, blockIndex: number) => {
    const toId = (rawId: string) => `block-${blockIndex + 1}/${rawId}`;
    for (const node of graph.nodes) {
      if (node.className !== "condOr") continue;
      const memberIds = graph.edges
        .filter((edge) => edge.from === node.id)
        .map((edge) => toId(edge.to));
      if (memberIds.length < 2) continue;
      groups.push({ id: toId(node.id), type: "or", memberIds });
    }
  });
  return groups;
}
