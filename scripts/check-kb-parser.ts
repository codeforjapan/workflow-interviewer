import { loadWorkflowBySlug } from "@/lib/kb/loader";
import { normalizeLifecycle } from "@/lib/kb/types";

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

async function main() {
  const slug = "inkan-toroku";
  const { flowStandard, gapNotes } = await loadWorkflowBySlug(slug);

  console.log(`KB Parser DoD check — slug: ${slug}`);
  console.log("  flow-standard");

  const fs = flowStandard.frontmatter;
  assert(fs.flow_type === "standard", "flow_type === 'standard'");
  assert(
    fs.psid_service_category === "C1",
    `psid_service_category === 'C1' (got ${fs.psid_service_category})`,
  );
  const lifecycle = normalizeLifecycle(fs.psid_lifecycle);
  assert(lifecycle.includes("L5"), `psid_lifecycle includes 'L5' (got ${lifecycle.join(",")})`);
  assert(fs.spec_ref.length > 0, "spec_ref non-empty");
  assert(fs.spec_law.length > 0, "spec_law non-empty");
  console.log(
    `    frontmatter: flow_type=${fs.flow_type}, category=${fs.psid_service_category}, lifecycle=[${lifecycle.join(",")}]`,
  );

  assert(
    flowStandard.mermaid.length === 4,
    `mermaid.length === 4 (got ${flowStandard.mermaid.length})`,
  );
  console.log(`    mermaid blocks: ${flowStandard.mermaid.length}`);

  const first = flowStandard.mermaid[0];
  assert(first.nodes.length >= 1, "block #1 has >=1 node");
  assert(first.edges.length >= 1, "block #1 has >=1 edge");
  assert(first.subgraphs.length >= 1, "block #1 has >=1 subgraph");
  assert(
    first.nodes.some((n) => n.shape === "diamond"),
    "block #1 has at least one diamond node",
  );
  assert(
    first.nodes.some((n) => n.shape === "stadium"),
    "block #1 has at least one stadium node",
  );
  assert(
    first.edges.some((e) => e.style === "dotted"),
    "block #1 has at least one dotted edge",
  );
  assert(
    first.edges.some((e) => e.label !== null),
    "block #1 has at least one labelled edge",
  );
  assert(
    first.subgraphs.some((s) => s.title === "住民・申請者"),
    "block #1 subgraphs include '住民・申請者'",
  );
  const shapeCount = first.nodes.reduce(
    (acc, n) => {
      acc[n.shape] += 1;
      return acc;
    },
    { rect: 0, stadium: 0, diamond: 0 } as Record<string, number>,
  );
  console.log(
    `    block #1: ${first.nodes.length} nodes, ${first.edges.length} edges, ${first.subgraphs.length} subgraphs`,
  );
  console.log(
    `    block #1 shapes: rect=${shapeCount.rect}, stadium=${shapeCount.stadium}, diamond=${shapeCount.diamond}`,
  );

  console.log("  gap-notes");
  const gn = gapNotes.frontmatter;
  assert(gn.flow_type === "gap-notes", "gap-notes flow_type === 'gap-notes'");
  assert(
    gn.related_workflow === "flow-standard.md",
    `related_workflow === 'flow-standard.md' (got ${gn.related_workflow})`,
  );
  console.log(`    frontmatter: related_workflow=${gn.related_workflow}`);

  assert(
    gapNotes.gaps.length === 4,
    `gaps.length === 4 (got ${gapNotes.gaps.length})`,
  );
  for (const gap of gapNotes.gaps) {
    assert(
      gap.sections.length >= 1,
      `gap ${gap.index} has >=1 section (got ${gap.sections.length})`,
    );
  }
  const g1 = gapNotes.gaps[0];
  const kinds = new Set(g1.sections.map((s) => s.kind));
  assert(kinds.has("spec"), "gap[0] has spec section");
  assert(kinds.has("reality"), "gap[0] has reality section");
  assert(kinds.has("rationale"), "gap[0] has rationale section");
  assert(
    g1.title.includes("なりすまし"),
    `gap[0].title contains 'なりすまし' (got ${g1.title})`,
  );
  console.log(`    gaps: ${gapNotes.gaps.length}`);
  console.log(`    gap #1: ${g1.title}`);
  console.log(
    `      sections: ${g1.sections.map((s) => s.kind).join(", ")} (${g1.sections.length} sections)`,
  );

  // UX2 (issue #36): gap-notes.md 境界バグの回帰チェック。
  // kotei-shisan-zei は最後のギャップ見出しの後に無関係な汎用セクション
  // (「## 標準仕様書が定めておらず...」「## 差分の構造的な意味」) が続く構造で、
  // 修正前は gap4 の rationale にこれらが丸ごと混入していた。
  console.log("KB Parser boundary regression — slug: kotei-shisan-zei");
  {
    const { gapNotes } = await loadWorkflowBySlug("kotei-shisan-zei");
    assert(gapNotes.gaps.length === 4, `expected 4 gaps, got ${gapNotes.gaps.length}`);
    const last = gapNotes.gaps[gapNotes.gaps.length - 1];
    const rationale = last.sections.find((s) => s.kind === "rationale");
    assert(rationale != null, "gap4 should have a rationale section");
    assert(
      !rationale!.body.includes("標準仕様書が定めておらず"),
      "gap4 rationale should NOT leak the trailing H2 section (boundary bug regression)",
    );
    assert(
      !rationale!.body.includes("差分の構造的な意味"),
      "gap4 rationale should NOT leak the trailing ascii diagram section",
    );
    console.log(`  kotei-shisan-zei gap4 rationale boundary ✓ (length=${rationale!.body.length})`);
  }

  console.log("PASS");
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`FAIL: ${msg}`);
  process.exit(1);
});
