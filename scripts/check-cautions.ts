import { _resetConceptIndexCache, loadConceptIndex } from "@/lib/kb/concepts";
import { loadConceptBySlug } from "@/lib/kb/loader";
import { detectCautionFlags } from "@/lib/server/interview/cautions";
import type { SessionExtractedData } from "@/lib/db/schema";

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
  _resetConceptIndexCache();
  console.log("B4 caution detection check");

  // 1) インデックスに ai_caution=true の概念のみが入る
  const index = await loadConceptIndex();
  assert(index.length > 0, "expected at least one ai_caution concept");
  const conceptNames = index.map((e) => e.conceptName);
  assert(
    conceptNames.includes("世帯"),
    `index should contain '世帯', got: ${conceptNames.join(", ")}`,
  );
  // すべての index entry が aiCaution=true
  for (const e of index) {
    assert(e.aiCaution === true, `${e.conceptName} should be aiCaution=true`);
  }
  console.log(`  concept index built: ${index.length} entries`);
  console.log(`    e.g. ${conceptNames.slice(0, 5).join(", ")}`);

  // 2) "・" 区切りの concept_name が複数 term に分解される
  const incomeEntry = index.find((e) => e.conceptName === "収入・所得");
  if (incomeEntry) {
    assert(
      incomeEntry.terms.includes("収入") && incomeEntry.terms.includes("所得"),
      `'収入・所得' should split into '収入' and '所得'`,
    );
    console.log("  multi-term split (収入・所得) ✓");
  }

  // 3) steps.label に「世帯」が出現したら検出される
  {
    const extracted: SessionExtractedData = {
      ...EMPTY,
      steps: [
        { id: "s1", label: "申請者の世帯構成を確認", order: 1 },
        { id: "s2", label: "印鑑を受領", order: 2 },
      ],
    };
    const flags = detectCautionFlags(extracted, index);
    assert(flags.length === 1, `expected 1 flag, got ${flags.length}`);
    assert(flags[0].conceptName === "世帯", `expected 世帯, got ${flags[0].conceptName}`);
    assert(flags[0].matches.length === 1, "expected 1 match on s1");
    assert(flags[0].matches[0].source === "steps", "match source should be steps");
    assert(flags[0].matches[0].sourceId === "s1", "match sourceId should be s1");
    console.log("  steps detection ✓");
  }

  // 4) 複数 source に跨る match が同じ concept にまとまる
  {
    const extracted: SessionExtractedData = {
      ...EMPTY,
      steps: [{ id: "s1", label: "世帯構成を確認", order: 1 }],
      exceptions: [
        {
          id: "e1",
          relatedStepId: "s1",
          label: "世帯員が不在",
          condition: "本人確認不能",
          frequency: null,
        },
      ],
      connections: [
        {
          id: "c1",
          fromStepId: "s1",
          target: { type: "department", label: "世帯給付課", ref: null },
          note: null,
        },
      ],
    };
    const flags = detectCautionFlags(extracted, index);
    const householdFlag = flags.find((f) => f.conceptName === "世帯");
    assert(householdFlag != null, "expected 世帯 flag from multi-source");
    assert(
      householdFlag!.matches.length === 3,
      `expected 3 matches across 3 sources, got ${householdFlag!.matches.length}`,
    );
    const sources = new Set(householdFlag!.matches.map((m) => m.source));
    assert(
      sources.has("steps") && sources.has("exceptions") && sources.has("connections"),
      "matches should span all three sources",
    );
    console.log("  cross-source grouping ✓");
  }

  // 5) ヒットなし extracted → 空配列
  {
    const extracted: SessionExtractedData = {
      ...EMPTY,
      steps: [{ id: "s1", label: "ABC", order: 1 }],
    };
    const flags = detectCautionFlags(extracted, index);
    assert(flags.length === 0, `no-hit should yield 0 flags, got ${flags.length}`);
    console.log("  no-hit -> [] ✓");
  }

  // 6) 重複防止: 同じ sourceId+term の重複は弾く
  {
    const extracted: SessionExtractedData = {
      ...EMPTY,
      steps: [{ id: "s1", label: "世帯と世帯を確認", order: 1 }],
    };
    const flags = detectCautionFlags(extracted, index);
    assert(flags.length === 1, "expected 1 flag");
    assert(
      flags[0].matches.length === 1,
      `duplicate term hits in same source should dedupe, got ${flags[0].matches.length}`,
    );
    console.log("  dedupe within source ✓");
  }

  // 7) concept doc loader が "競合が顕在化する典型場面" を返す
  {
    const doc = await loadConceptBySlug("household");
    const focus = doc.sections.find((s) => s.heading === "競合が顕在化する典型場面");
    assert(focus != null, "household.md should have '競合が顕在化する典型場面' section");
    assert(focus!.body.length > 0, "section body should be non-empty");
    console.log("  loadConceptBySlug + section extraction ✓");
  }

  console.log("PASS");
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`FAIL: ${msg}`);
  process.exit(1);
});
