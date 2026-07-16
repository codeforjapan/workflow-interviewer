import { _resetTaskHypothesisCache, loadTaskHypothesis } from "@/lib/kb/hypothesis";
import { loadOverviewBySlug } from "@/lib/kb/loader";
import type { SessionExtractedData } from "@/lib/db/schema";
import { chooseNextSlot, getSlotGuideQuestion, getSlotTemplate } from "@/lib/server/interview/slots";

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

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

async function main() {
  _resetTaskHypothesisCache();
  console.log("task hypothesis check");

  // jinji-kyuyo: taskName / legalBasis / stakeholders が全て導ける想定
  {
    const h = await loadTaskHypothesis("jinji-kyuyo");
    assert(h !== null, "jinji-kyuyo should yield a hypothesis");
    assert(h.taskName === "人事給与", `unexpected taskName: ${h?.taskName}`);
    assert(
      !!h.legalBasis && h.legalBasis.includes("地方公務員法"),
      `unexpected legalBasis: ${h?.legalBasis}`,
    );
    assert(
      h.stakeholders.length >= 2,
      `expected >=2 stakeholders, got ${h.stakeholders.length}: ${h.stakeholders.join(", ")}`,
    );
    assert(
      !h.stakeholders.some((s) => s.startsWith("システム") || s.startsWith("住民")),
      `generic roles should be filtered out, got: ${h.stakeholders.join(", ")}`,
    );
    console.log(`  jinji-kyuyo -> taskName=${h.taskName}, stakeholders=[${h.stakeholders.join(", ")}] ✓`);
  }

  // sonota: 明示的に仮説なし（法令・部署名の仮説が意味を持たない汎用業務フローのため）
  {
    const h = await loadTaskHypothesis("sonota");
    assert(h === null, "sonota should never yield a hypothesis");
    console.log("  sonota -> null ✓");
  }

  // 存在しないスラッグ -> 例外を投げず null
  {
    const h = await loadTaskHypothesis("nonexistent-slug-zzz");
    assert(h === null, "missing slug should return null");
    console.log("  nonexistent slug -> null ✓");
  }

  // getSlotGuideQuestion: hypothesis 有りのとき「仮説提示 + 他に/違う点」型になる
  {
    const h = await loadTaskHypothesis("jinji-kyuyo");
    assert(h !== null, "expected hypothesis for jinji-kyuyo");

    const stakeholders = getSlotGuideQuestion("stakeholders", "jinji-kyuyo", h);
    assert(stakeholders.includes("標準的には"), `expected hypothesis framing, got: ${stakeholders}`);
    assert(stakeholders.includes("他に"), `expected difference-seeking phrasing, got: ${stakeholders}`);
    assert(
      h.stakeholders.some((s) => stakeholders.includes(s)),
      `guide question should mention at least one hypothesized stakeholder, got: ${stakeholders}`,
    );

    const legalBasis = getSlotGuideQuestion("legalBasis", "jinji-kyuyo", h);
    assert(legalBasis.includes("一般的には"), `expected hypothesis framing, got: ${legalBasis}`);
    assert(legalBasis.includes("他に"), `expected difference-seeking phrasing, got: ${legalBasis}`);

    const purpose = getSlotGuideQuestion("purpose", "jinji-kyuyo", h);
    assert(purpose.includes(h.taskName), `expected taskName reference, got: ${purpose}`);

    console.log("  getSlotGuideQuestion (hypothesis-confirm phrasing) ✓");
  }

  // overview.md: 存在しない業務 (jinji-kyuyo) では null、存在する業務 (kotei-shisan-zei) では
  // セクションが読める
  {
    const missing = await loadOverviewBySlug("jinji-kyuyo");
    assert(missing === null, "jinji-kyuyo has no overview.md yet, should return null");

    const overview = await loadOverviewBySlug("kotei-shisan-zei");
    assert(overview !== null, "kotei-shisan-zei should have an overview.md");
    assert(overview.frontmatter.file_type === "overview", "file_type should be 'overview'");
    assert(
      overview.sections.length >= 4,
      `expected at least 4 sections, got ${overview.sections.length}`,
    );
    assert(
      overview.sections[0].heading === "制度の概要",
      `first section should be '制度の概要', got ${overview.sections[0].heading}`,
    );
    for (const heading of ["よくある論点", "関連部門・関連業務の傾向"]) {
      assert(
        overview.sections.some((s) => s.heading === heading),
        `should include a '${heading}' section`,
      );
    }
    console.log(
      `  kotei-shisan-zei overview.md -> ${overview.sections.length} sections [${overview.sections.map((s) => s.heading).join(", ")}] ✓`,
    );
  }

  // loadTaskHypothesis: overview.md がある業務は purposeContext が埋まり、
  // getSlotGuideQuestion("purpose", ...) が「制度の背景提示 + 具体的な実感を聞く」形になる
  // (「目的」という抽象語は使わず、現場の職員が答えやすい聞き方にする)
  {
    const h = await loadTaskHypothesis("kotei-shisan-zei");
    assert(h !== null, "kotei-shisan-zei should yield a hypothesis");
    assert(
      !!h.purposeContext && h.purposeContext.includes("応益原則"),
      `expected purposeContext derived from overview.md, got: ${h?.purposeContext}`,
    );

    const purpose = getSlotGuideQuestion("purpose", "kotei-shisan-zei", h);
    assert(purpose.includes(h.purposeContext!), "guide question should embed the purposeContext");
    assert(purpose.includes("大事にしています"), `expected a concrete day-to-day ask, got: ${purpose}`);
    assert(!purpose.includes("貴庁") && !purpose.includes("御庁"), `should not use distancing address terms, got: ${purpose}`);
    console.log("  purposeContext from overview.md wired into getSlotGuideQuestion ✓");
  }

  // stakeholderContext: overview.md の「関連部門・関連業務の傾向」があれば、
  // subgraph 由来の stakeholders より優先し、「課名は自治体差が大きい」旨の注記も入る
  {
    const h = await loadTaskHypothesis("kotei-shisan-zei");
    assert(h !== null, "kotei-shisan-zei should yield a hypothesis");
    assert(
      !!h.stakeholderContext && h.stakeholderContext.includes("機能・連携関係"),
      `expected stakeholderContext derived from overview.md, got: ${h?.stakeholderContext}`,
    );

    const stakeholders = getSlotGuideQuestion("stakeholders", "kotei-shisan-zei", h);
    assert(
      stakeholders.includes(h.stakeholderContext!),
      "guide question should embed stakeholderContext",
    );
    assert(
      stakeholders.includes("自治体差が大きい"),
      `expected naming-variance caveat, got: ${stakeholders}`,
    );
    console.log("  stakeholderContext from overview.md wired into getSlotGuideQuestion ✓");
  }

  // hypothesis が null (sonota) のときは常に getSlotTemplate と一致する (フォールバック)
  {
    for (const key of ["taskName", "purpose", "legalBasis", "stakeholders"] as const) {
      const withNullHypothesis = getSlotGuideQuestion(key, "sonota", null);
      const template = getSlotTemplate(key, "sonota");
      assert(
        withNullHypothesis === template,
        `sonota / null hypothesis should fall back to getSlotTemplate for ${key}`,
      );
    }
    console.log("  null hypothesis -> falls back to getSlotTemplate ✓");
  }

  // sessions.ts の POST / と同じ形 (taskName + purpose を hypothesis から事前 seed) で
  // chooseNextSlot を呼ぶと、purpose を聞き直さずに次の実質的な質問 (steps 等) へ進む
  // (issue: 「目的」は overview.md がある業務では聞く必要がない、という改善の要)
  {
    const h = await loadTaskHypothesis("kotei-shisan-zei");
    assert(h !== null && !!h.purposeContext, "expected purposeContext for kotei-shisan-zei");
    const seeded: SessionExtractedData = {
      ...EMPTY,
      taskName: h.taskName,
      purpose: h.purposeContext,
    };
    const firstSlot = chooseNextSlot(seeded, "", {}, null);
    assert(
      firstSlot !== "purpose" && firstSlot !== "taskName",
      `expected pre-seeded taskName/purpose to be skipped, got: ${firstSlot}`,
    );
    console.log(`  pre-seeded taskName+purpose -> first real question is '${firstSlot}' (not purpose) ✓`);
  }

  // taskName スロットは hypothesis の有無に関わらず現状のテンプレのまま
  // (taskName は controller/route 側で事前 seed され、質問対象から外れる想定であり、
  //  getSlotGuideQuestion 自体はゼロベース文言を返す = 呼び出し側の責務であることの確認)
  {
    const h = await loadTaskHypothesis("jinji-kyuyo");
    const q = getSlotGuideQuestion("taskName", "jinji-kyuyo", h);
    assert(q === getSlotTemplate("taskName", "jinji-kyuyo"), "taskName should stay the plain template");
    console.log("  taskName slot unaffected by hypothesis ✓");
  }

  console.log("PASS");
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`FAIL: ${msg}`);
  process.exit(1);
});
