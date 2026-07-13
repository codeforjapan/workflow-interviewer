import {
  _resetGapCueCache,
  formatGapCueAsGuide,
  loadGapCues,
  pickUnmatchedGapCues,
} from "@/lib/server/interview/gapCues";

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

async function main() {
  _resetGapCueCache();
  console.log("UX2 gap cue check");

  // 1) kotei-shisan-zei の gap-notes.md から 4 件の cue が作れる (reality セクションが全件非空)
  {
    const cues = await loadGapCues("kotei-shisan-zei");
    assert(cues.length === 4, `expected 4 cues, got ${cues.length}`);
    for (const cue of cues) {
      assert(cue.title.length > 0, `gap-${cue.gapIndex} title empty`);
      assert(cue.realitySummary.length > 0, `gap-${cue.gapIndex} realitySummary empty`);
      assert(cue.ref === `kotei-shisan-zei/gap-${cue.gapIndex}`, `unexpected ref: ${cue.ref}`);
    }
    console.log(`  kotei-shisan-zei -> ${cues.length} cues ✓`);
  }

  // 2) pickUnmatchedGapCues: 既に matchedKnownGap がある gap は除外される
  {
    const cues = await loadGapCues("kotei-shisan-zei");
    const filtered = pickUnmatchedGapCues(cues, [
      {
        id: "kb-gap-2",
        kind: "local-rule",
        reason: "既にマッチ済み",
        matchedKnownGap: "kotei-shisan-zei/gap-2",
      },
    ]);
    assert(filtered.length === cues.length - 1, `expected ${cues.length - 1}, got ${filtered.length}`);
    assert(!filtered.some((c) => c.ref === "kotei-shisan-zei/gap-2"), "gap-2 should be filtered out");
    console.log("  pickUnmatchedGapCues filters matched ✓");
  }

  // 3) formatGapCueAsGuide が非空文字列を生成し、タイトルと現実描写を含む
  {
    const cues = await loadGapCues("kotei-shisan-zei");
    const text = formatGapCueAsGuide(cues[0]);
    assert(text.length > 0, "guide text should be non-empty");
    assert(text.includes(cues[0].title), "guide should reference the gap title");
    assert(text.includes("お困りごとはありますか"), "guide should end with an open question");
    console.log("  formatGapCueAsGuide ✓");
  }

  // 4) 既知ギャップの無い / 存在しない業務は空配列 (例外を投げない)
  {
    const inkanCues = await loadGapCues("inkan-toroku");
    assert(inkanCues.length > 0, "inkan-toroku should have its own gap-notes cues");
    const unknownCues = await loadGapCues("nonexistent-slug-zzz");
    assert(unknownCues.length === 0, "unknown slug should yield []");
    const emptySlugCues = await loadGapCues("");
    assert(emptySlugCues.length === 0, "empty slug should yield []");
    console.log("  unknown/empty slug -> [], no throw ✓");
  }

  console.log("PASS");
}

main().catch((err) => {
  console.error(`FAIL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
