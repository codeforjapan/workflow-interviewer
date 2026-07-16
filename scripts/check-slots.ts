import type { SessionExtractedData } from "@/lib/db/schema";
import type { NodeCoverageResult } from "@/lib/server/interview/nodeCoverage";
import {
  appendExhaustionChoice,
  chooseNextSlot,
  confirmedExhaustedSlots,
  countSlotAsks,
  EXHAUSTION_CHOICE_LABEL,
  excludedSlotsFromAskCounts,
  isExhaustionReply,
  isFinished,
  isMinimumFilled,
  MAX_TURNS,
  MIN_TURNS_BEFORE_FINISH,
  scoreSlots,
  SLOT_ASK_LIMIT,
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
  confirmedNodeIds: [],
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

  // Case 10 (回帰再現): stakeholders が weight 8 で最上位に選ばれ続けるのに completeness が
  // 一向に進まない場合 (実例: connections との意味的衝突で部署名の回答が毎回 connections に
  // 吸われ、stakeholders が永遠に空のまま同じ質問が繰り返された)、SLOT_ASK_LIMIT 回を超えたら
  // 除外され、chooseNextSlot が次のスロットに進むこと。
  {
    const stuck: SessionExtractedData = {
      ...EMPTY,
      taskName: "固定資産税",
      purpose: "適正な課税",
      // legalBasis は敢えて空のままにし、stakeholders 除外後にそちらへ進むことを確認する
      stakeholders: [],
      steps: withSteps(4),
      connections: [
        { id: "c1", fromStepId: null, target: { type: "department", label: "国民健康保険課", ref: null }, note: null },
        { id: "c2", fromStepId: null, target: { type: "department", label: "年金機構", ref: null }, note: null },
        { id: "c3", fromStepId: null, target: { type: "workflow", label: "児童手当関連", ref: null }, note: null },
        { id: "c4", fromStepId: null, target: { type: "department", label: "税務署", ref: null }, note: null },
      ],
    };

    const withoutHistory = chooseNextSlot(stuck, "");
    assert(
      withoutHistory === "stakeholders",
      `without ask history, empty stakeholders (weight 8) should still dominate, got ${withoutHistory}`,
    );

    const messages = Array.from({ length: SLOT_ASK_LIMIT }, () => ({
      role: "assistant",
      meta: { targetSlot: "stakeholders" },
    }));
    const askCounts = countSlotAsks(messages);
    assert(askCounts.get("stakeholders") === SLOT_ASK_LIMIT, "should count 3 stakeholders asks");
    const excluded = excludedSlotsFromAskCounts(askCounts);
    assert(excluded.has("stakeholders"), "stakeholders should be excluded after hitting the limit");

    const afterLimit = chooseNextSlot(stuck, "", {}, null, excluded);
    assert(
      afterLimit !== "stakeholders" && afterLimit !== null,
      `expected chooseNextSlot to move past the maxed-out stakeholders slot, got ${afterLimit}`,
    );
    console.log(`  case#10 stakeholders circuit breaker -> excluded after ${SLOT_ASK_LIMIT} asks, next is '${afterLimit}' ✓`);
  }

  // Case 11: isExhaustionReply — 完全一致のホワイトリストであり、部分一致 (includes) ではない。
  // 「ないわけではない」「他にないか確認します」のような、"ない" を含むが打ち切り宣言ではない
  // 発話を誤検出しないことが要件 (Fable レビューで指摘された誤検出リスク)。
  {
    const positives = [
      "もうない",
      "ない",
      "特にない",
      "特にないです",
      "ありません",
      "なし",
      "以上",
      "以上です",
      "これで全部です",
      "他にはありません",
      EXHAUSTION_CHOICE_LABEL,
      "  ない。  ",
    ];
    for (const text of positives) {
      assert(isExhaustionReply(text), `expected '${text}' to be detected as exhaustion reply`);
    }
    const negatives = [
      "ないわけではない",
      "他にないか確認します",
      "国民健康保険課",
      "税務署との連携があります",
      "",
    ];
    for (const text of negatives) {
      assert(!isExhaustionReply(text), `expected '${text}' to NOT be detected as exhaustion reply`);
    }
    console.log("  case#11 isExhaustionReply whitelist (exact-match, not substring) ✓");
  }

  // Case 12: confirmedExhaustedSlots — 直前の assistant 質問の targetSlot に対する
  // ユーザーの返信が打ち切り宣言なら、そのスロットを exhausted 扱いにする。
  // 対象外 (targetSlot なし/次が assistant/打ち切りでない返信) では反応しない。
  {
    const history = [
      { role: "assistant", content: "税務署以外にどの部署が関わっていますか？", meta: { targetSlot: "stakeholders" } },
      { role: "user", content: "もうない" },
      { role: "assistant", content: "他に例外はありますか？", meta: { targetSlot: "exceptions" } },
      { role: "user", content: "差し戻しがあります" },
    ];
    const exhausted = confirmedExhaustedSlots(history);
    assert(exhausted.has("stakeholders"), "stakeholders should be confirmed exhausted");
    assert(!exhausted.has("exceptions"), "exceptions should NOT be exhausted (user gave a real answer)");
    console.log("  case#12 confirmedExhaustedSlots attributes exhaustion via targetSlot ✓");
  }

  // Case 13 (根本原因の回帰再現): 自治体によって connections/stakeholders の実件数は異なり、
  // 件数ベースの閾値には普遍的な「正解」が無い。ユーザーが明確に打ち切りを宣言した場合は、
  // 件数が0や1であっても completeness=1 として扱い、isFinished が正しく true になること。
  {
    const trulyFew: SessionExtractedData = {
      ...EMPTY,
      taskName: "固定資産税",
      purpose: "適正な課税",
      legalBasis: "地方税法",
      stakeholders: [], // この自治体は本当に0件（住民以外に特筆すべき役割がない）
      steps: withSteps(6),
    };
    assert(slotCompleteness(trulyFew, "stakeholders") === 0, "sanity: n=0 without exhaustion is incomplete");
    const exhausted = new Set<"stakeholders">(["stakeholders"]);
    assert(
      slotCompleteness(trulyFew, "stakeholders", null, exhausted) === 1,
      "exhaustion should override count-based completeness even at n=0",
    );
    assert(
      isFinished(trulyFew, MIN_TURNS_BEFORE_FINISH, null, exhausted),
      "isFinished should become true once exhaustion satisfies the only missing required slot",
    );
    assert(
      !isFinished(trulyFew, MIN_TURNS_BEFORE_FINISH, null),
      "sanity: without exhaustion, isFinished should stay false (stakeholders still empty)",
    );
    console.log("  case#13 exhaustion overrides count-based completeness (n=0) -> isFinished true ✓");
  }

  // Case 14: 除外 (SLOT_ASK_LIMIT) と exhaustion が両方成立する場合、exhaustion の
  // 「充足」判定が優先される (isMinimumFilled/isFinished は excludedSlots を見ないため
  // 元々競合しないが、slotCompleteness が両方与えられても矛盾なく 1 を返すことを確認する)。
  {
    const filled: SessionExtractedData = { ...EMPTY, stakeholders: [] };
    const exhausted = new Set<"stakeholders">(["stakeholders"]);
    assert(
      slotCompleteness(filled, "stakeholders", null, exhausted) === 1,
      "exhausted-and-excluded slot should still report completeness=1 (exhaustion wins)",
    );
    console.log("  case#14 exhausted + ask-limited: exhaustion semantics win ✓");
  }

  // Case 15: appendExhaustionChoice — OPEN_ENDED_SLOTS のみに追加し、重複させず、
  // 5件 (MAX_CHOICES) を超えないよう先頭4件+定型選択肢に切り詰める。
  {
    const forStakeholders = appendExhaustionChoice(["窓口担当", "審査担当"], "stakeholders");
    assert(
      forStakeholders[forStakeholders.length - 1] === EXHAUSTION_CHOICE_LABEL,
      "stakeholders choices should get the exhaustion label appended",
    );
    const forLegalBasis = appendExhaustionChoice(["地方税法"], "legalBasis");
    assert(
      !forLegalBasis.includes(EXHAUSTION_CHOICE_LABEL),
      "legalBasis (not open-ended) should NOT get the exhaustion label",
    );
    const alreadyPresent = appendExhaustionChoice(["a", EXHAUSTION_CHOICE_LABEL], "connections");
    assert(
      alreadyPresent.filter((c) => c === EXHAUSTION_CHOICE_LABEL).length === 1,
      "should not duplicate the exhaustion label",
    );
    const overflow = appendExhaustionChoice(["a", "b", "c", "d", "e"], "incidents");
    assert(overflow.length <= 5, `expected at most 5 choices, got ${overflow.length}`);
    assert(overflow.includes(EXHAUSTION_CHOICE_LABEL), "exhaustion label should survive truncation");
    console.log("  case#15 appendExhaustionChoice scoped to OPEN_ENDED_SLOTS, deduped, capped ✓");
  }

  // Case 16 (根本原因の回帰再現): steps はノード単位のサーキットブレーカーを別に持つため、
  // slot 単位の SLOT_ASK_LIMIT では除外されない。両方効かせると標準フローに多数のノードが
  // あっても steps 質問3回で steps 全体が打ち切られ、本筋の大半が未被覆のまま chooseNextSlot が
  // null を返してクロージングに入ってしまう (実例: 固定資産税で13ノード中4ノード=31%被覆で誤完了)。
  {
    const askedSteps = Array.from({ length: SLOT_ASK_LIMIT + 2 }, () => ({
      role: "assistant",
      meta: { targetSlot: "steps" },
    }));
    const askCounts = countSlotAsks(askedSteps);
    assert(
      (askCounts.get("steps") ?? 0) >= SLOT_ASK_LIMIT,
      "sanity: steps should be counted beyond the limit",
    );
    const excluded = excludedSlotsFromAskCounts(askCounts);
    assert(
      !excluded.has("steps"),
      `steps must be exempt from the slot-level circuit breaker, got excluded=${[...excluded]}`,
    );

    // 未被覆ノードが残る状況では、steps 質問を何回重ねても steps がまだ選ばれ続けること
    // (= 早期に null → クロージングに落ちないこと) を確認する。
    const lowCoverage: NodeCoverageResult = {
      slug: "kotei-shisan-zei",
      totalNodes: 13,
      confirmedNodes: 4,
      coverageRatio: 4 / 13,
      items: [],
      nextUnconfirmed: null,
    };
    const stuck: SessionExtractedData = {
      ...EMPTY,
      taskName: "固定資産税",
      purpose: "適正な課税",
      // legalBasis は敢えて除外済み扱い、他は充足させ、steps だけが未充足の状況を作る
      stakeholders: ["住民", "課税担当", "収納担当"],
      steps: withSteps(3),
    };
    const legalBasisExcluded = new Set<"legalBasis">(["legalBasis"]);
    const next = chooseNextSlot(stuck, "", {}, lowCoverage, legalBasisExcluded);
    assert(
      next === "steps",
      `with legalBasis excluded and steps under-covered, next slot should stay 'steps' (not null), got ${next}`,
    );
    console.log("  case#16 steps is exempt from slot-level circuit breaker (node-level breaker owns it) ✓");
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
