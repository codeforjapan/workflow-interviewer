import type { ExtractedGap, SessionExtractedData } from "@/lib/server/interview/schema";
import { computeNodeCoverage } from "@/lib/server/interview/nodeCoverage";
import { diffStandardVsExtracted, type DiffMatcher } from "./diff";
import { matchKnownGaps, type GapMatcher } from "./match";
import { pruneResolvedMissingGaps } from "./resolve";

/** ギャップ計算のスケジューリング間隔 (turn % GAP_RECOMPUTE_INTERVAL === 0 で実行)。 */
export const GAP_RECOMPUTE_INTERVAL = 3;

/**
 * 与えられた turnCount でギャップ一括計算を走らせるべきか判定する。
 * turn 0 は false (まだ何も語られていない)、turn 3/6/9... で true。
 */
export function shouldRecomputeGaps(turnCount: number): boolean {
  if (turnCount <= 0) return false;
  return turnCount % GAP_RECOMPUTE_INTERVAL === 0;
}

export type RecomputeInput = {
  slug: string;
  extracted: SessionExtractedData;
  conversation: Array<{ role: "user" | "assistant" | "system"; content: string }>;
};

export type RecomputeOverrides = {
  matchMatcher?: GapMatcher;
  diffMatcher?: DiffMatcher;
};

/**
 * C1 (matchKnownGaps) + C2 (diffStandardVsExtracted) を順に実行して
 * 更新された gaps[] を返す。
 *
 * - C1 が既存 gaps[] に matchedKnownGap 付きを追加
 * - C2 がさらに add/missing/order/local-rule findings を追加
 * - 両者は dedup キーが分かれているので衝突しない
 * - 最後に pruneResolvedMissingGaps で「不足」ギャップの自動解消を適用する。
 *   diffStandardVsExtracted は steps/exceptions だけを見て独立に "missing" を判定するため、
 *   会話全体を見る confirmedNodeIds (nodeCoverage)側が既に確認済みと判断したノードでも、
 *   独自に "missing" を再追加してしまうことがある (実測済み: exceptions で説明済みのはずの
 *   ギャップが、新しい id を振って復活する)。呼び出し元 (per-turn / 3ターン毎 / gap-recompute
 *   API / complete API) 全てに一括で適用されるよう、ここで行う。
 *
 * matcher を渡すと OpenAI 呼び出しをモックできる (テスト用)。
 */
export async function recomputeGaps(
  input: RecomputeInput,
  overrides: RecomputeOverrides = {},
): Promise<ExtractedGap[]> {
  const afterMatch = await matchKnownGaps(
    {
      slug: input.slug,
      extracted: input.extracted,
      conversation: input.conversation,
    },
    overrides.matchMatcher,
  );
  const afterDiff = await diffStandardVsExtracted(
    {
      slug: input.slug,
      extracted: { ...input.extracted, gaps: afterMatch },
    },
    overrides.diffMatcher,
  );
  const nodeCoverage = await computeNodeCoverage(
    input.slug,
    input.extracted.steps,
    new Set(input.extracted.confirmedNodeIds ?? []),
  );
  return pruneResolvedMissingGaps(afterDiff, nodeCoverage);
}
