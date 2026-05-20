import type { SessionExtractedData } from "@/lib/db/schema";
import {
  chooseNextSlot,
  isFinished,
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
        { id: "c1", fromStepId: "s1", target: { type: "department", label: "他課" } },
        { id: "c2", fromStepId: "s2", target: { type: "external", label: "外部" } },
        { id: "c3", fromStepId: "s3", target: { type: "workflow", label: "別業務" } },
      ],
      exceptions: [
        { id: "e1", relatedStepId: "s2", label: "差し戻し", condition: "書類不備" },
        { id: "e2", relatedStepId: "s3", label: "保留", condition: "本人確認不能" },
        { id: "e3", relatedStepId: "s4", label: "却下", condition: "対象外" },
      ],
      incidents: [
        { id: "i1", scenario: "...", severity: "low" },
        { id: "i2", scenario: "...", severity: "medium" },
        { id: "i3", scenario: "...", severity: "high" },
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

  console.log(`PASS (MAX_TURNS=${MAX_TURNS}, MIN_TURNS_BEFORE_FINISH=${MIN_TURNS_BEFORE_FINISH})`);
}

try {
  main();
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}
