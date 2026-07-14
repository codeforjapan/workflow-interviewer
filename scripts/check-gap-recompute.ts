import type { SessionExtractedData } from "@/lib/db/schema";
import {
  GAP_RECOMPUTE_INTERVAL,
  recomputeGaps,
  shouldRecomputeGaps,
} from "@/lib/server/gap/recompute";
import { formatGapRef } from "@/lib/server/gap/match";

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

const EMPTY: SessionExtractedData = {
  taskName: null,
  purpose: null,
  legalBasis: null,
  stakeholders: [],
  steps: [],
  connections: [],
  exceptions: [],
  gaps: [],
  incidents: [],
  cautionFlags: [],
  confirmedNodeIds: [],
};

function withSteps(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${i + 1}`,
    label: `step ${i + 1}`,
    order: i + 1,
  }));
}

async function main() {
  console.log("C3 gap recompute check");

  // 1) shouldRecomputeGaps: turn 0 は false、3/6/9 で true、それ以外は false
  {
    assert(!shouldRecomputeGaps(0), "turn 0 should be false");
    assert(!shouldRecomputeGaps(1), "turn 1 should be false");
    assert(!shouldRecomputeGaps(2), "turn 2 should be false");
    assert(shouldRecomputeGaps(3), "turn 3 should be true");
    assert(!shouldRecomputeGaps(4), "turn 4 should be false");
    assert(!shouldRecomputeGaps(5), "turn 5 should be false");
    assert(shouldRecomputeGaps(6), "turn 6 should be true");
    assert(shouldRecomputeGaps(9), "turn 9 should be true");
    assert(shouldRecomputeGaps(12), "turn 12 should be true");
    assert(!shouldRecomputeGaps(-1), "negative should be false");
    console.log(`  shouldRecomputeGaps (interval=${GAP_RECOMPUTE_INTERVAL}) ✓`);
  }

  // 2) recomputeGaps E2E: 注入 matcher で C1 (match) + C2 (diff) の合成を確認
  {
    const extracted: SessionExtractedData = {
      ...EMPTY,
      steps: withSteps(5),
    };
    let matchCalls = 0;
    let diffCalls = 0;
    const result = await recomputeGaps(
      {
        slug: "inkan-toroku",
        extracted,
        conversation: [
          { role: "user", content: "代理申請の本人確認は窓口担当の判断でばらつく" },
        ],
      },
      {
        matchMatcher: async (cands) => {
          matchCalls += 1;
          return cands.map((c) => ({
            gap_index: c.index,
            status: c.index === 1 ? ("matched" as const) : ("not_matched" as const),
            reason: c.index === 1 ? "ばらつき発話と一致" : null,
          }));
        },
        diffMatcher: async () => {
          diffCalls += 1;
          return [
            {
              kind: "missing",
              standard_node_id: "block-2/SendInquiry",
              extracted_step_id: null,
              severity: null,
              reason: "照会書送付の言及なし",
            },
          ];
        },
      },
    );
    assert(matchCalls === 1, `expected 1 match call, got ${matchCalls}`);
    assert(diffCalls === 1, `expected 1 diff call, got ${diffCalls}`);
    assert(result.length === 2, `expected 2 gaps (1 matched + 1 missing), got ${result.length}`);
    assert(
      result.some((g) => g.matchedKnownGap === formatGapRef("inkan-toroku", 1)),
      "matched gap should be present",
    );
    assert(
      result.some((g) => g.kind === "missing" && g.standardStepRef === "block-2/SendInquiry"),
      "missing finding should be present",
    );
    console.log("  recomputeGaps composes C1+C2 ✓");
  }

  // 3) 既存 matched gap がある場合、二回目の recompute は match をスキップしつつ diff は走る
  {
    const existing = [
      {
        id: "kb-gap-1",
        kind: "local-rule" as const,
        reason: "既存",
        matchedKnownGap: formatGapRef("inkan-toroku", 1),
      },
    ];
    const extracted: SessionExtractedData = {
      ...EMPTY,
      steps: withSteps(5),
      gaps: existing,
    };
    let matchCalls = 0;
    let diffCalls = 0;
    const result = await recomputeGaps(
      {
        slug: "inkan-toroku",
        extracted,
        conversation: [{ role: "user", content: "..." }],
      },
      {
        matchMatcher: async (cands) => {
          matchCalls += 1;
          // 残候補 (index=2..4) を受け取るはず
          return cands.map((c) => ({
            gap_index: c.index,
            status: "not_matched" as const,
            reason: null,
          }));
        },
        diffMatcher: async () => {
          diffCalls += 1;
          return [];
        },
      },
    );
    assert(matchCalls === 1, "match should still be invoked for remaining candidates");
    assert(diffCalls === 1, "diff should still be invoked");
    // 既存 gap が保持されている
    assert(
      result.some((g) => g.matchedKnownGap === formatGapRef("inkan-toroku", 1)),
      "existing matched gap preserved",
    );
    console.log("  recomputeGaps preserves existing gaps + filters candidates ✓");
  }

  // 4) slug 不正 → match/diff ともスキップして既存 gaps をそのまま返す
  {
    const extracted: SessionExtractedData = {
      ...EMPTY,
      steps: withSteps(5),
    };
    let matchCalls = 0;
    let diffCalls = 0;
    const result = await recomputeGaps(
      { slug: "", extracted, conversation: [] },
      {
        matchMatcher: async () => {
          matchCalls += 1;
          return [];
        },
        diffMatcher: async () => {
          diffCalls += 1;
          return [];
        },
      },
    );
    assert(matchCalls === 0 && diffCalls === 0, "no matcher should be called for empty slug");
    assert(result === extracted.gaps, "extracted.gaps should be returned as-is");
    console.log("  empty slug pass-through ✓");
  }

  // 5) recomputeGaps は自身の中で pruneResolvedMissingGaps を適用する。diffMatcher (C2) が
  // 独立に "missing" を返しても、nodeCoverage (confirmedNodeIds) 側が既に確認済みと
  // 判断しているノードなら、最終結果からは除かれる。
  // (issue: /complete と /gap-recompute API が recomputeGaps を直接呼ぶだけで、
  //  この pruning を一切適用していなかった)。
  {
    const extracted: SessionExtractedData = {
      ...EMPTY,
      steps: withSteps(5),
      confirmedNodeIds: ["block-1/End"],
    };
    const result = await recomputeGaps(
      { slug: "sonota", extracted, conversation: [] },
      {
        matchMatcher: async () => [],
        diffMatcher: async () => [
          {
            kind: "missing",
            standard_node_id: "block-1/End",
            extracted_step_id: null,
            severity: "medium",
            reason: "終了 / ペンディングが抽出 steps に見当たらない",
          },
        ],
      },
    );
    assert(
      !result.some((g) => g.kind === "missing" && g.standardStepRef === "block-1/End"),
      "missing gap for an already-confirmed node should be pruned by recomputeGaps itself",
    );
    console.log("  recomputeGaps prunes missing gaps for confirmedNodeIds-covered nodes ✓");
  }

  console.log("PASS");
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`FAIL: ${msg}`);
  process.exit(1);
});
