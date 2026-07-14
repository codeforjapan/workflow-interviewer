import type { NodeCoverageResult } from "@/lib/server/interview/nodeCoverage";
import type { ExtractedGap } from "@/lib/server/interview/schema";

/**
 * 「不足」(kind: "missing") ギャップの自動解消。
 * standardStepRef が指すノードが nodeCoverage 側で confirmed になっていれば
 * (Dice 一致・extract.ts の LLM confirmedNodeIds・OR fork-group、いずれの経路でもよい)、
 * そのギャップは解決済みとみなして取り除く。
 *
 * add/order/local-rule はここでは扱わない (steps の被覆状況と1:1対応しないため、
 * このイシューのスコープ外)。matchKnownGaps 由来 (kb-gap-*) も対象外
 * (kind は常に "local-rule" 固定なので、そもそもここには含まれない)。
 */
export function pruneResolvedMissingGaps(
  gaps: ExtractedGap[],
  nodeCoverage: NodeCoverageResult | null,
): ExtractedGap[] {
  if (!nodeCoverage) return gaps;
  const confirmedNodeIds = new Set(
    nodeCoverage.items.filter((item) => item.status === "confirmed").map((item) => item.nodeId),
  );
  return gaps.filter((gap) => {
    if (gap.kind !== "missing" || !gap.standardStepRef) return true;
    return !confirmedNodeIds.has(gap.standardStepRef);
  });
}
