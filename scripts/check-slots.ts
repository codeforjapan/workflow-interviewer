import type { SessionExtractedData } from "@/lib/db/schema";
import type { NodeCoverageResult } from "@/lib/server/interview/nodeCoverage";
import {
  chooseNextSlot,
  isFinished,
  isMinimumFilled,
  MAX_TURNS,
  MIN_TURNS_BEFORE_FINISH,
  scoreSlots,
  slotCompleteness,
} from "@/lib/server/interview/slots";

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

function withSteps(n: number): SessionExtractedData["steps"] {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${i + 1}`,
    label: `step ${i + 1}`,
    order: i + 1,
  }));
}

function main() {
  console.log("B1 slot logic check");

  // Case 1: 全空 → taskName が weight=10 で最上位
  {
    const top = chooseNextSlot(EMPTY, "");
    assert(top === "taskName", `empty extracted should pick taskName, got ${top}`);
    console.log("  case#1 empty -> taskName ✓");
  }

  // Case 2: taskName だけ埋まっている → 残る tier-1 のいずれかが選ばれる (gaps は除外される)
  {
    const e = { ...EMPTY, taskName: "印鑑登録" };
    const top = chooseNextSlot(e, "");
    assert(
      top === "purpose" || top === "steps" || top === "stakeholders" || top === "legalBasis",
      `expected a tier-1 slot, got ${top}`,
    );
    console.log(`  case#2 taskName-only -> ${top} ✓`);
  }

  // Case 3: keyword boost: "連携" を含む発話で connections が tier-1 と互角に
  {
    const e = {
      ...EMPTY,
      taskName: "印鑑登録",
      purpose: "本人確認手段の提供",
      legalBasis: "条例X号",
      stakeholders: ["住民", "窓口", "審査"],
      steps: withSteps(5),
    };
    const ranked = scoreSlots(e, "他業務との連携も気になる");
    const connectionsRank = ranked.findIndex((s) => s.key === "connections");
    assert(connectionsRank === 0, `connections should rank top with boost, got rank ${connectionsRank}`);
    console.log("  case#3 keyword boost -> connections ✓");
  }

  // Case 4: gaps は weight=0 なので常に最下位扱い
  {
    const ranked = scoreSlots(EMPTY, "");
    const last = ranked[ranked.length - 1];
    assert(last.key === "gaps", `gaps should be last (weight=0), got ${last.key}`);
    console.log("  case#4 gaps excluded ✓");
  }

  // Case 5: isFinished — tier-1 + steps が 0.7+ かつ turnCount >= MIN_TURNS_BEFORE_FINISH
  {
    const filled: SessionExtractedData = {
      ...EMPTY,
      taskName: "印鑑登録",
      purpose: "本人確認手段の提供",
      legalBasis: "条例X号",
      stakeholders: ["住民", "窓口", "審査"],
      steps: withSteps(5),
    };
    assert(!isFinished(filled, 2), "should not finish before MIN_TURNS_BEFORE_FINISH");
    assert(isFinished(filled, MIN_TURNS_BEFORE_FINISH), "should finish at min turns when slots filled");
    console.log("  case#5 isFinished gating ✓");
  }

  // Case 6: tier-1 不足 → 永遠に finished にならない
  {
    const partial: SessionExtractedData = {
      ...EMPTY,
      taskName: "印鑑登録",
      stakeholders: ["住民"],
      steps: withSteps(5),
    };
    assert(!isFinished(partial, 10), "should not finish without tier-1 fully filled");
    console.log("  case#6 tier-1 gating ✓");
  }

  // Case 7: chooseNextSlot は score<=0 のとき null を返す
  {
    const allFilled: SessionExtractedData = {
      ...EMPTY,
      taskName: "印鑑登録",
      purpose: "本人確認手段の提供",
      legalBasis: "条例X号",
      stakeholders: ["住民", "窓口", "審査", "外部"],
      steps: withSteps(6),
      connections: [
        { id: "c1", fromStepId: "s1", target: { type: "department", label: "他課", ref: null }, note: null },
        { id: "c2", fromStepId: "s2", target: { type: "external", label: "外部", ref: null }, note: null },
        { id: "c3", fromStepId: "s3", target: { type: "workflow", label: "別業務", ref: null }, note: null },
      ],
      exceptions: [
        { id: "e1", relatedStepId: "s2", label: "差し戻し", condition: "書類不備", frequency: null },
        { id: "e2", relatedStepId: "s3", label: "保留", condition: "本人確認不能", frequency: null },
        { id: "e3", relatedStepId: "s4", label: "却下", condition: "対象外", frequency: null },
      ],
      incidents: [
        { id: "i1", relatedStepId: null, scenario: "...", severity: "low", knownIncidentRef: null },
        { id: "i2", relatedStepId: null, scenario: "...", severity: "medium", knownIncidentRef: null },
        { id: "i3", relatedStepId: null, scenario: "...", severity: "high", knownIncidentRef: null },
      ],
    };
    const top = chooseNextSlot(allFilled, "");
    assert(top === null, `fully filled should return null, got ${top}`);
    console.log("  case#7 all-filled -> null ✓");
  }

  // Case 8: slotCompleteness の境界
  {
    assert(slotCompleteness(EMPTY, "taskName") === 0, "empty taskName completeness");
    assert(slotCompleteness({ ...EMPTY, taskName: "X" }, "taskName") === 1, "filled taskName completeness");
    assert(slotCompleteness({ ...EMPTY, steps: withSteps(3) }, "steps") === 0.7, "steps 3 = 0.7");
    assert(slotCompleteness({ ...EMPTY, steps: withSteps(6) }, "steps") === 1, "steps 6 = 1.0");
    console.log("  case#8 completeness boundaries ✓");
  }

  // Case 9 (UX1 回帰再現): steps が本数条件 (6件) を満たしていても、
  // nodeCoverage の被覆率が低ければ isMinimumFilled/isFinished は true にならない。
  // デモで観測された「本数さえ揃えば本筋が薄くても質問が止まる」不具合の再現・修正証明。
  {
    const filled: SessionExtractedData = {
      ...EMPTY,
      taskName: "固定資産税",
      purpose: "適正な課税",
      legalBasis: "地方税法",
      stakeholders: ["住民", "課税担当", "収納担当"],
      steps: withSteps(6),
    };
    // nodeCoverage なし (フォールバック): 従来通り steps 6件で充足扱い
    assert(isMinimumFilled(filled), "without nodeCoverage, steps>=6 should still be minimum-filled");

    const lowCoverage: NodeCoverageResult = {
      slug: "kotei-shisan-zei",
      totalNodes: 13,
      confirmedNodes: 3,
      coverageRatio: 3 / 13,
      items: [],
      nextUnconfirmed: null,
    };
    assert(
      !isMinimumFilled(filled, lowCoverage),
      "with low nodeCoverage, steps count alone should NOT satisfy minimum-filled",
    );
    assert(
      !isFinished(filled, MAX_TURNS, lowCoverage),
      "with low nodeCoverage, isFinished should stay false even at MAX_TURNS",
    );

    const highCoverage: NodeCoverageResult = {
      ...lowCoverage,
      confirmedNodes: 12,
      coverageRatio: 12 / 13,
    };
    assert(
      isMinimumFilled(filled, highCoverage),
      "with high nodeCoverage (>=0.7), minimum-filled should hold",
    );
    console.log("  case#9 low node coverage blocks isMinimumFilled/isFinished despite steps>=6 ✓");
  }

  console.log(`PASS (MAX_TURNS=${MAX_TURNS}, MIN_TURNS_BEFORE_FINISH=${MIN_TURNS_BEFORE_FINISH})`);
}

try {
  main();
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}
