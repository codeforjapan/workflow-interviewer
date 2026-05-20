import type { SessionExtractedData } from "@/lib/db/schema";
import { loadWorkflowBySlug } from "@/lib/kb/loader";
import {
  formatGapRef,
  matchKnownGaps,
  mergeMatches,
  pickUnmatchedCandidates,
  toMatchCandidate,
} from "@/lib/server/gap/match";

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
};

async function main() {
  console.log("C1 gap match check");

  // 1) inkan-toroku の gap-notes から候補が 4 件作れる (spec/reality 抽出が機能する)
  const workflow = await loadWorkflowBySlug("inkan-toroku");
  const candidates = workflow.gapNotes.gaps.map(toMatchCandidate);
  assert(candidates.length === 4, `expected 4 candidates, got ${candidates.length}`);
  for (const c of candidates) {
    assert(c.title.length > 0, `gap-${c.index} title empty`);
    assert(c.spec.length > 0, `gap-${c.index} spec empty`);
    assert(c.reality.length > 0, `gap-${c.index} reality empty`);
  }
  console.log(`  inkan-toroku candidates: ${candidates.length} ✓`);

  // 2) formatGapRef フォーマット
  {
    const ref = formatGapRef("inkan-toroku", 1);
    assert(ref === "inkan-toroku/gap-1", `unexpected ref: ${ref}`);
    console.log("  formatGapRef ✓");
  }

  // 3) pickUnmatchedCandidates: 既存 matchedKnownGap がある候補は除外
  {
    const existing = [
      {
        id: "kb-gap-1",
        kind: "local-rule" as const,
        reason: "...",
        matchedKnownGap: "inkan-toroku/gap-1",
      },
    ];
    const remaining = pickUnmatchedCandidates(candidates, existing, "inkan-toroku");
    assert(
      remaining.length === candidates.length - 1,
      `expected ${candidates.length - 1} remaining, got ${remaining.length}`,
    );
    assert(
      !remaining.some((c) => c.index === 1),
      "gap-1 should have been filtered out",
    );
    console.log("  pickUnmatchedCandidates filters matched ✓");
  }

  // 4) mergeMatches が matched=true のみを ExtractedGap として追加
  {
    const llmMatches = [
      { gap_index: 1, matched: true, reason: "代理申請でばらつきがある旨の発話あり" },
      { gap_index: 2, matched: false, reason: null },
      { gap_index: 3, matched: true, reason: null }, // reason 空 → title フォールバック
    ];
    const merged = mergeMatches([], candidates, llmMatches, "inkan-toroku");
    assert(merged.length === 2, `expected 2 merged gaps, got ${merged.length}`);
    const g1 = merged.find((g) => g.matchedKnownGap === "inkan-toroku/gap-1");
    assert(g1 != null, "gap-1 should be merged");
    assert(g1!.kind === "local-rule", "kind should be local-rule");
    assert(g1!.reason.includes("ばらつき"), `reason: ${g1!.reason}`);
    const g3 = merged.find((g) => g.matchedKnownGap === "inkan-toroku/gap-3");
    assert(g3 != null, "gap-3 should be merged with fallback reason");
    const cand3 = candidates.find((c) => c.index === 3);
    assert(g3!.reason === cand3!.title, "gap-3 reason should fall back to title");
    console.log("  mergeMatches basic ✓");
  }

  // 5) mergeMatches dedup: 既に matchedKnownGap がある場合は追加しない
  {
    const existing = [
      {
        id: "kb-gap-1",
        kind: "local-rule" as const,
        reason: "既存",
        matchedKnownGap: "inkan-toroku/gap-1",
      },
    ];
    const llmMatches = [{ gap_index: 1, matched: true, reason: "二度目" }];
    const merged = mergeMatches(existing, candidates, llmMatches, "inkan-toroku");
    assert(merged.length === 1, `should not duplicate, got ${merged.length}`);
    assert(merged[0].reason === "既存", "existing entry should be preserved");
    console.log("  mergeMatches dedup ✓");
  }

  // 6) matchKnownGaps エンドツーエンド: matcher を差し替えて KB ロード〜マージまで通す
  {
    const extracted: SessionExtractedData = { ...EMPTY, taskName: "印鑑登録" };
    const result = await matchKnownGaps(
      {
        slug: "inkan-toroku",
        extracted,
        conversation: [
          { role: "user", content: "代理申請の本人確認は窓口担当の判断でばらつく" },
        ],
      },
      async (cands) => cands.map((c) => ({
        gap_index: c.index,
        matched: c.index === 1,
        reason: c.index === 1 ? "ばらつきの発話と一致" : null,
      })),
    );
    assert(result.length === 1, `expected 1 matched gap, got ${result.length}`);
    assert(
      result[0].matchedKnownGap === "inkan-toroku/gap-1",
      `unexpected ref: ${result[0].matchedKnownGap}`,
    );
    console.log("  matchKnownGaps E2E with injected matcher ✓");
  }

  // 7) スラッグ不正 / 未指定なら既存 gaps をそのまま返す
  {
    const extracted: SessionExtractedData = { ...EMPTY };
    const result1 = await matchKnownGaps({ slug: "", extracted, conversation: [] });
    assert(result1 === extracted.gaps, "empty slug should pass through gaps");
    const result2 = await matchKnownGaps({
      slug: "nonexistent-zzz",
      extracted,
      conversation: [],
    });
    assert(result2 === extracted.gaps, "missing slug should pass through gaps");
    console.log("  invalid slug pass-through ✓");
  }

  // 8) 全候補が既にマッチ済み → 既存 gaps をそのまま返す（LLM 呼び出しなし）
  {
    const existing = candidates.map((c) => ({
      id: `kb-gap-${c.index}`,
      kind: "local-rule" as const,
      reason: c.title,
      matchedKnownGap: formatGapRef("inkan-toroku", c.index),
    }));
    const extracted: SessionExtractedData = { ...EMPTY, gaps: existing };
    let matcherCalls = 0;
    const result = await matchKnownGaps(
      {
        slug: "inkan-toroku",
        extracted,
        conversation: [{ role: "user", content: "ダミー" }],
      },
      async () => {
        matcherCalls += 1;
        return [];
      },
    );
    assert(matcherCalls === 0, `LLM should not be called when nothing to match, got ${matcherCalls}`);
    assert(result.length === existing.length, "existing gaps preserved");
    console.log("  all-matched skips LLM call ✓");
  }

  console.log("PASS");
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`FAIL: ${msg}`);
  process.exit(1);
});
