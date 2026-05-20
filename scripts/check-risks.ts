import type { SessionExtractedData } from "@/lib/db/schema";
import {
  _resetRiskCueCache,
  formatRiskCueAsGuide,
  loadRiskCues,
} from "@/lib/server/interview/risks";
import { chooseNextSlot, isMinimumFilled } from "@/lib/server/interview/slots";

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

function withSteps(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${i + 1}`,
    label: `step ${i + 1}`,
    order: i + 1,
  }));
}

async function main() {
  _resetRiskCueCache();
  console.log("B3 risk cue check");

  // inkan-toroku: creates_risks 未定義 → 0 件
  {
    const cues = await loadRiskCues("inkan-toroku");
    assert(cues.length === 0, `inkan-toroku should yield 0 cues, got ${cues.length}`);
    console.log("  inkan-toroku -> 0 cues ✓");
  }

  // jyumin-ido: creates_risks が複数定義済み
  {
    const cues = await loadRiskCues("jyumin-ido");
    assert(cues.length > 0, `jyumin-ido should yield >0 cues, got ${cues.length}`);
    for (const cue of cues) {
      assert(cue.incidentId.length > 0, `cue ${cue.ref} missing incidentId`);
      assert(cue.incidentTitle.length > 0, `cue ${cue.ref} missing title`);
      assert(cue.chainSummary.length > 0, `cue ${cue.incidentId} missing chainSummary`);
    }
    console.log(`  jyumin-ido -> ${cues.length} cues ✓`);
    for (const cue of cues) {
      console.log(`    ${cue.incidentId} ${cue.incidentTitle}`);
    }
  }

  // 不存在スラッグ → 例外を投げず空配列
  {
    const cues = await loadRiskCues("nonexistent-slug-zzz");
    assert(cues.length === 0, "missing slug should return []");
    console.log("  nonexistent slug -> [] ✓");
  }

  // formatRiskCueAsGuide が「もし〜」型の文字列を生成すること
  {
    const cues = await loadRiskCues("jyumin-ido");
    assert(cues.length > 0, "expected cues for jyumin-ido");
    const text = formatRiskCueAsGuide(cues[0]);
    assert(text.includes("もし"), `guide should contain 'もし', got: ${text.slice(0, 60)}`);
    assert(text.includes("何が起きうると思いますか"), "guide should phrase as future-tense question");
    assert(text.includes(cues[0].incidentId), "guide should reference incident id");
    console.log("  formatRiskCueAsGuide ✓");
  }

  // ブースト挙動: tier-1 + steps 充足 & incidents 空 & boosts.incidents=50 で incidents が最上位に
  {
    const filled: SessionExtractedData = {
      ...EMPTY,
      taskName: "住民異動",
      purpose: "転入転出の届出処理",
      legalBasis: "住民基本台帳法",
      stakeholders: ["住民", "窓口", "他課"],
      steps: withSteps(5),
    };
    const noBoost = chooseNextSlot(filled, "");
    assert(
      noBoost !== "incidents" || filled.incidents.length > 0,
      `without boost incidents shouldn't dominate (got ${noBoost})`,
    );
    const withBoost = chooseNextSlot(filled, "", { incidents: 50 });
    assert(
      withBoost === "incidents",
      `with boost=50 incidents should be selected, got ${withBoost}`,
    );
    console.log("  boost steers chooseNextSlot to incidents ✓");
  }

  // isMinimumFilled が tier-1 + steps 不足を弾く（controller の boost gate）
  {
    assert(!isMinimumFilled(EMPTY), "empty extracted should NOT be minimum-filled");
    const partial: SessionExtractedData = {
      ...EMPTY,
      taskName: "X",
      purpose: "Y",
      legalBasis: "Z",
      stakeholders: ["a", "b", "c"],
      // steps なし
    };
    assert(
      !isMinimumFilled(partial),
      "tier-1 only (steps なし) should NOT be minimum-filled",
    );
    const filled: SessionExtractedData = {
      ...EMPTY,
      taskName: "X",
      purpose: "Y",
      legalBasis: "Z",
      stakeholders: ["a", "b", "c"],
      steps: withSteps(5),
    };
    assert(
      isMinimumFilled(filled),
      "tier-1 + steps>=3 should be minimum-filled",
    );
    console.log("  isMinimumFilled gates correctly ✓");
  }

  console.log("PASS");
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`FAIL: ${msg}`);
  process.exit(1);
});
