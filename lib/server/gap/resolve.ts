import type { NodeCoverageResult } from "@/lib/server/interview/nodeCoverage";
import type { ExtractedGap } from "@/lib/server/interview/schema";

/**
 * 「不足」(kind: "missing") ギャップのうち、今ユーザーに見せるべきでないものを取り除く。
 * 2つの理由で取り除く:
 *
 * 1. 解決済み: standardStepRef が指すノードが nodeCoverage 側で confirmed になっている
 *    (Dice 一致・extract.ts の LLM confirmedNodeIds・OR fork-group、いずれの経路でもよい)。
 * 2. 未到達 (askCounts 指定時のみ): diffStandardVsExtracted (C2) は標準フローの全ノードを
 *    毎回まとめて判定するため、「会話がまだそこまで進んでいない (＝一度も聞かれていない)
 *    ノード」も、「会話は進んだのに答え損ねた/拾えなかったノード」と同じ "missing" として
 *    扱ってしまう。ユーザーからすると「まだ聞かれてもいないのに不足と言われる」不親切な
 *    体験になる (issue)。askCounts (meta.targetNode 由来、countNodeAsks で計算) に
 *    一度も現れないノードは「一度も質問対象にしていない」ことが確実なので、そちらは隠す。
 *    askCounts を渡さない呼び出し元では、この区別ができないため従来通り区別しない
 *    (未到達かどうか判定不能 → 保守的に表示したままにする)。
 *
 *    未到達で隠した gap は extractedData に永続しない (このターンの gaps から単純に除外する
 *    だけ) ので、実際に会話がそこに到達してもなお未対応なら、次の diff 再計算で
 *    自然に再度 "missing" として検出される。
 *
 * add/order/local-rule はここでは扱わない (steps の被覆状況と1:1対応しないため、
 * このイシューのスコープ外)。matchKnownGaps 由来 (kb-gap-*) も対象外
 * (kind は常に "local-rule" 固定なので、そもそもここには含まれない)。
 * standardStepRef が nodeCoverage.items に見つからない場合 (集約 finding が Start ノードや
 * block-1 以外を指すケース、既知の限界) は判定できないためそのまま残す。
 */
export function pruneResolvedMissingGaps(
  gaps: ExtractedGap[],
  nodeCoverage: NodeCoverageResult | null,
  askCounts?: ReadonlyMap<string, number>,
): ExtractedGap[] {
  if (!nodeCoverage) return gaps;
  const nodeIds = new Set(nodeCoverage.items.map((item) => item.nodeId));
  const confirmedNodeIds = new Set(
    nodeCoverage.items.filter((item) => item.status === "confirmed").map((item) => item.nodeId),
  );
  return gaps.filter((gap) => {
    if (gap.kind !== "missing" || !gap.standardStepRef) return true;
    if (confirmedNodeIds.has(gap.standardStepRef)) return false;
    if (!askCounts || !nodeIds.has(gap.standardStepRef)) return true;
    return (askCounts.get(gap.standardStepRef) ?? 0) > 0;
  });
}
