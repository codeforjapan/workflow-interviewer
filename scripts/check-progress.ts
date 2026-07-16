import type { SessionExtractedData } from "@/lib/db/schema";
import { getMainFlowNodes, type NodeCoverageResult } from "@/lib/server/interview/nodeCoverage";
import { buildInterviewProgress, computeInterviewProgress } from "@/lib/server/interview/progress";
import { MIN_TURNS_BEFORE_FINISH, SLOT_DEFS } from "@/lib/server/interview/slots";

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

function withSteps(n: number): SessionExtractedData["steps"] {
  return Array.from({ length: n }, (_, i) => ({ id: `s${i + 1}`, label: `step ${i + 1}`, order: i + 1 }));
}

const FILLED: SessionExtractedData = {
  ...EMPTY,
  taskName: "印鑑登録",
  purpose: "本人確認手段の提供",
  legalBasis: "条例X号",
  stakeholders: ["住民", "窓口", "審査"],
  steps: withSteps(6),
};

async function main() {
  console.log("UX3 progress check");

  // Case 1: 空 -> 0/5, not ready
  {
    const p = buildInterviewProgress({ extracted: EMPTY, turnCount: 0, nodeCoverage: null });
    assert(p.requiredFilledCount === 0 && p.requiredTotalCount === 5, "expected 0/5");
    assert(!p.readyToFinish && !p.minTurnsReached, "empty should not be ready");
    console.log("  case#1 empty -> 0/5, not ready ✓");
  }

  // Case 2: 全埋まりだが最低ターン未満
  {
    const p = buildInterviewProgress({ extracted: FILLED, turnCount: 2, nodeCoverage: null });
    assert(p.requiredFilledCount === 5, "expected 5 filled");
    assert(!p.readyToFinish, "should gate on MIN_TURNS_BEFORE_FINISH");
    assert(
      p.requiredFilledCount === p.requiredTotalCount && !p.minTurnsReached,
      "should be the 'filled but not enough turns' case",
    );
    console.log("  case#2 filled but turn<MIN -> not ready ✓");
  }

  // Case 3: 全埋まり + 最低ターン到達
  {
    const p = buildInterviewProgress({
      extracted: FILLED,
      turnCount: MIN_TURNS_BEFORE_FINISH,
      nodeCoverage: null,
    });
    assert(p.readyToFinish, "should be ready at MIN_TURNS_BEFORE_FINISH");
    assert(p.minTurnsReached, "minTurnsReached should be true");
    console.log("  case#3 filled + min turns -> ready ✓");
  }

  // Case 4: tier-1 不足はターンをいくら重ねても ready にならない
  {
    const partial: SessionExtractedData = { ...EMPTY, taskName: "印鑑登録", steps: withSteps(6) };
    const p = buildInterviewProgress({ extracted: partial, turnCount: 100, nodeCoverage: null });
    assert(!p.readyToFinish, "tier-1 incomplete should never be ready");
    console.log("  case#4 tier-1 incomplete -> never ready ✓");
  }

  // Case 5: 全 required slot にラベルがある
  {
    const p = buildInterviewProgress({ extracted: EMPTY, turnCount: 0, nodeCoverage: null });
    assert(p.requiredTotalCount === 5, "expected 5 required slots");
    for (const slot of p.requiredSlots) {
      assert(slot.label.length > 0, `slot ${slot.key} missing label`);
      assert(slot.label === SLOT_DEFS[slot.key].shortLabel, `slot ${slot.key} label mismatch`);
    }
    console.log("  case#5 all required slots have labels ✓");
  }

  // Case 6: nodeCoverage が渡されると steps の completeness に反映される
  // (低被覆率なら steps 本数条件を満たしていても filled 扱いにならない)
  {
    const lowCoverage: NodeCoverageResult = {
      slug: "fake",
      totalNodes: 4,
      confirmedNodes: 1,
      coverageRatio: 0.25,
      items: [],
      nextUnconfirmed: null,
    };
    const p = buildInterviewProgress({ extracted: FILLED, turnCount: 4, nodeCoverage: lowCoverage });
    const stepsSlot = p.requiredSlots.find((s) => s.key === "steps");
    assert(stepsSlot !== undefined, "steps slot should exist");
    assert(stepsSlot!.completeness === 0.25, `expected steps completeness 0.25, got ${stepsSlot!.completeness}`);
    assert(!stepsSlot!.filled, "steps should not be filled at 0.25 coverage");
    assert(!p.readyToFinish, "low node coverage should block readyToFinish despite steps>=6");
    assert(p.nodeCoverage === lowCoverage, "nodeCoverage should be passed through unchanged");
    console.log("  case#6 low nodeCoverage -> steps completeness reflects coverageRatio ✓");
  }

  // Case 7/8: 実KB結合 + 未知slugでのフェイルセーフ
  {
    const known = await computeInterviewProgress({
      extracted: FILLED,
      turnCount: 6,
      taskSlug: "inkan-toroku",
      messages: [],
    });
    assert(known.nodeCoverage !== null, "inkan-toroku should yield a non-null nodeCoverage");
    assert(known.nodeCoverage!.totalNodes > 0, "inkan-toroku nodeCoverage should have >0 total nodes");
    console.log(
      `  case#7 known slug nodeCoverage=${known.nodeCoverage!.confirmedNodes}/${known.nodeCoverage!.totalNodes} ✓`,
    );

    const unknown = await computeInterviewProgress({
      extracted: FILLED,
      turnCount: 6,
      taskSlug: "not-a-real-slug",
      messages: [],
    });
    assert(unknown.nodeCoverage === null, "unknown slug should yield null nodeCoverage, not throw");
    // フォールバック: nodeCoverage が無い場合は本数ベース判定 (steps>=6 -> completeness=1)
    const stepsSlot = unknown.requiredSlots.find((s) => s.key === "steps");
    assert(stepsSlot!.completeness === 1, "fallback (no nodeCoverage) should use count-based completeness");
    console.log("  case#8 unknown slug -> nodeCoverage null, no throw, count-based fallback ✓");
  }

  // Case 9: computeInterviewProgress は渡された messages からサーキットブレーカー (applyAskLimit)
  // を適用する (issue: 以前はターン処理中の per-turn パスにしかこれが無く、ページ再読み込み後の
  // coverageRatio/readyToFinish がターン内表示と食い違っていた)。
  {
    const nodes = await getMainFlowNodes("inkan-toroku");
    const target = nodes[0];
    const askedTwice = [
      {
        role: "assistant",
        content: "",
        meta: { targetNode: { kind: "standard" as const, nodeId: target.id, rawId: target.rawId, blockIndex: 0 } },
      },
      {
        role: "assistant",
        content: "",
        meta: { targetNode: { kind: "standard" as const, nodeId: target.id, rawId: target.rawId, blockIndex: 0 } },
      },
    ];
    const withAskLimit = await computeInterviewProgress({
      extracted: FILLED,
      turnCount: 6,
      taskSlug: "inkan-toroku",
      messages: askedTwice,
    });
    const withoutAskLimit = await computeInterviewProgress({
      extracted: FILLED,
      turnCount: 6,
      taskSlug: "inkan-toroku",
      messages: [],
    });
    assert(
      withAskLimit.nodeCoverage!.totalNodes === withoutAskLimit.nodeCoverage!.totalNodes - 1,
      `expected ask-limited node excluded from totalNodes (${withAskLimit.nodeCoverage!.totalNodes} vs ${withoutAskLimit.nodeCoverage!.totalNodes})`,
    );
    const skippedItem = withAskLimit.nodeCoverage!.items.find((i) => i.nodeId === target.id);
    assert(skippedItem?.skipped === true, "targeted node should be marked skipped after 2 prior asks");
    console.log("  case#9 computeInterviewProgress applies ask-limit circuit breaker from messages ✓");
  }

  console.log("PASS");
}

main().catch((err) => {
  console.error(`FAIL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
