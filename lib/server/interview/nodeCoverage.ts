import { loadWorkflowBySlug } from "@/lib/kb/loader";
import { flattenStandardNodes, type StandardNodeRef } from "@/lib/kb/standardNodes";
import type { SessionExtractedData } from "@/lib/db/schema";
import { isMinimumFilled } from "./slots";

/**
 * 標準フローの「本筋ノード」1件あたりの照合結果。
 */
export type NodeCoverageItem = {
  /** StandardNodeRef.id ("block-1/CalcValue")。セッション横断で安定。 */
  nodeId: string;
  rawId: string;
  label: string;
  subgraph: string | null;
  status: "confirmed" | "unconfirmed";
  /** 確認済みなら根拠となった steps[].id (最高スコアの1件)。 */
  matchedStepId: string | null;
  score: number;
};

export type NodeCoverageResult = {
  slug: string;
  totalNodes: number;
  confirmedNodes: number;
  coverageRatio: number;
  /** KB 宣言順 (block-0 の出現順)。 */
  items: NodeCoverageItem[];
  nextUnconfirmed: NodeCoverageItem | null;
};

/**
 * ステップ⇔ノードの一致とみなす Dice 係数の閾値。
 * 抵当権のような枝葉フレーズでも 0.12 程度に留まる一方、
 * 真陽性は 0.5 以上になる実測結果を踏まえ、偽陽性より偽陰性に倒す値として 0.3 を採用。
 */
export const NODE_MATCH_THRESHOLD = 0.3;

// 漢字・カタカナ・英数字のみを残す (ひらがな・記号を除去)。
// 抽出 steps の自然文 ("評価額を計算する") はひらがなの助詞を含むが、
// mermaid ノードラベル ("評価額計算") は体言止めの複合語であるため、
// ひらがなを落とすことで両者の表記ゆれを吸収する。
const KEEP_CHARS_RE = /[一-鿿㐀-䶿゠-ヿA-Za-z0-9]/g;

function condense(text: string): string {
  const matches = text.normalize("NFKC").match(KEEP_CHARS_RE);
  return matches ? matches.join("") : "";
}

function bigrams(s: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}

function diceCoefficient(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const g of a) if (b.has(g)) intersection++;
  return (2 * intersection) / (a.size + b.size);
}

/** 抽出 step ラベルと標準ノードラベルの類似度 (0..1)。LLM 不使用、決定的。 */
export function scoreStepAgainstNode(stepLabel: string, nodeLabel: string): number {
  return diceCoefficient(bigrams(condense(stepLabel)), bigrams(condense(nodeLabel)));
}

/** mainNodes と steps を全組合せ照合し、ノード単位の結果配列を返す (KB宣言順)。 */
export function matchStepsToNodes(
  mainNodes: StandardNodeRef[],
  steps: SessionExtractedData["steps"],
): NodeCoverageItem[] {
  return mainNodes.map((node) => {
    let bestScore = 0;
    let bestStepId: string | null = null;
    for (const step of steps) {
      const score = scoreStepAgainstNode(step.label, node.label);
      if (score > bestScore) {
        bestScore = score;
        bestStepId = step.id;
      }
    }
    const confirmed = bestScore >= NODE_MATCH_THRESHOLD;
    return {
      nodeId: node.id,
      rawId: node.rawId,
      label: node.label,
      subgraph: node.subgraph,
      status: confirmed ? "confirmed" : "unconfirmed",
      matchedStepId: confirmed ? bestStepId : null,
      score: bestScore,
    };
  });
}

/**
 * 追跡対象とする「本筋ノード」の絞り込み。
 * - blockIndex 0 (flow-standard.md 内の最初の mermaid ブロック) を本筋とみなす
 * - stadium 形状 (Start/End 境界マーカー) は実務ステップではないため除外
 * - label === rawId は mermaid パーサーが対応できない記法のプレースホルダなので除外
 */
function isTrackableMainFlowNode(node: StandardNodeRef): boolean {
  if (node.blockIndex !== 0) return false;
  if (node.shape === "stadium") return false;
  if (node.label === node.rawId) return false;
  return true;
}

const mainNodesCache = new Map<string, Promise<StandardNodeRef[]>>();

async function loadMainFlowNodesUncached(slug: string): Promise<StandardNodeRef[]> {
  let workflow;
  try {
    workflow = await loadWorkflowBySlug(slug);
  } catch {
    return [];
  }
  return flattenStandardNodes(workflow.flowStandard).filter(isTrackableMainFlowNode);
}

/** 対象業務スラッグの本筋ノード一覧を返す。KB不在等は []。セッションごとに繰り返し呼ばれる想定でキャッシュする。 */
export async function getMainFlowNodes(slug: string): Promise<StandardNodeRef[]> {
  if (!slug) return [];
  const cached = mainNodesCache.get(slug);
  if (cached) return cached;
  const promise = loadMainFlowNodesUncached(slug);
  mainNodesCache.set(slug, promise);
  return promise;
}

/**
 * slug + steps から本筋ノードの被覆状況を計算する。
 * slug が空 / KB 不在 / 追跡対象ノードが0件 のときは null (呼び出し側は既存挙動にフォールバックする)。
 */
export async function computeNodeCoverage(
  slug: string | null | undefined,
  steps: SessionExtractedData["steps"],
): Promise<NodeCoverageResult | null> {
  if (!slug) return null;
  const mainNodes = await getMainFlowNodes(slug);
  if (mainNodes.length === 0) return null;
  const items = matchStepsToNodes(mainNodes, steps);
  const confirmedNodes = items.filter((i) => i.status === "confirmed").length;
  return {
    slug,
    totalNodes: items.length,
    confirmedNodes,
    coverageRatio: confirmedNodes / items.length,
    items,
    nextUnconfirmed: items.find((i) => i.status === "unconfirmed") ?? null,
  };
}

/**
 * 次に確認すべき本筋ノードを guideQuestion 文に整形する。
 * risks.ts の formatRiskCueAsGuide と対称的な役割。
 */
export function formatNodeCoverageAsGuide(item: NodeCoverageItem): string {
  const owner = item.subgraph ? `（${item.subgraph}が担当）` : "";
  return `標準フローの次のステップは「${item.label}」です${owner}。実際の業務ではこのステップをどのように行っていますか？担当者・タイミング・使用システムなど分かる範囲で教えてください。`;
}

/** テスト用にキャッシュをリセットするヘルパ。 */
export function _resetNodeCoverageCache() {
  mainNodesCache.clear();
}

/**
 * 本筋ノード被覆率がこの割合に達するまでは、controller.ts の INCIDENTS_RISK_BOOST を抑制する。
 * isMinimumFilled の一般閾値(0.7、全スロット共通)とは独立した、本機能専用の閾値。
 * 「枝葉は本筋がひととおり確認できてから」という受け入れ条件のための、あえて厳しめの値。
 */
export const MAIN_FLOW_COVERAGE_GATE = 0.8;

/**
 * incidents スロットへのリスクブースト発火条件。
 * controller.ts (db/openai に依存し env 必須) ではなくここに置くことで、
 * DB モックや OPENAI_API_KEY 無しで検証スクリプトから直接テストできる。
 */
export function shouldBoostIncidents(params: {
  riskCuesCount: number;
  incidentsEmpty: boolean;
  extracted: SessionExtractedData;
  nodeCoverage: NodeCoverageResult | null;
}): boolean {
  const { riskCuesCount, incidentsEmpty, extracted, nodeCoverage } = params;
  if (riskCuesCount === 0 || !incidentsEmpty) return false;
  if (!isMinimumFilled(extracted, nodeCoverage)) return false;
  // nodeCoverage が計算不能 (KB無し等) のときはゲート自体を無効化し、既存挙動を維持する
  return !nodeCoverage || nodeCoverage.coverageRatio >= MAIN_FLOW_COVERAGE_GATE;
}
