import type { SessionExtractedData } from "@/lib/db/schema";
import { loadWorkflowBySlug } from "@/lib/kb/loader";
import {
  diffStandardVsExtracted,
  flattenStandardNodes,
  mergeFindings,
} from "@/lib/server/gap/diff";

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

function withSteps(labels: string[]) {
  return labels.map((label, i) => ({ id: `s${i + 1}`, label, order: i + 1 }));
}

async function main() {
  console.log("C2 gap diff check");

  // 1) inkan-toroku 標準フローのノードがフラット化される
  const workflow = await loadWorkflowBySlug("inkan-toroku");
  const nodes = flattenStandardNodes(workflow.flowStandard);
  assert(nodes.length > 0, "expected non-empty standard nodes");
  // block 番号がついた id になっている
  assert(
    nodes[0].id.startsWith("block-"),
    `id should be block-prefixed, got: ${nodes[0].id}`,
  );
  // 同じ rawId が複数ブロックで出現しても別エントリ
  const startCount = nodes.filter((n) => n.rawId === "Start").length;
  assert(
    startCount >= 2,
    `Start should appear in multiple blocks, got ${startCount}`,
  );
  // subgraph 情報が付くノードがある
  const inSubgraph = nodes.filter((n) => n.subgraph != null).length;
  assert(inSubgraph > 0, "some nodes should be inside subgraphs");
  console.log(
    `  inkan-toroku standard nodes: total=${nodes.length}, in-subgraph=${inSubgraph}, 'Start' occurrences=${startCount} ✓`,
  );

  // 2) ノードラベルから \n が除去される
  const newlineNodes = nodes.filter((n) => /\\n|\n/.test(n.label));
  assert(
    newlineNodes.length === 0,
    `labels should be newline-stripped, found ${newlineNodes.length}`,
  );
  console.log("  label \\n stripped ✓");

  // 2b) UX2 (issue #36): flowTitle が各ブロック直前の `## ` 見出しから伝播する。
  // kotei-shisan-zei は3本の独立フローを持ち、見出し文字列でノードを判別できる必要がある。
  // (KB編集時に見出し文言が変わったらこのアサーションも合わせて更新すること)
  {
    const { flowStandard } = await loadWorkflowBySlug("kotei-shisan-zei");
    const koteiNodes = flattenStandardNodes(flowStandard);
    const byFlow = new Map<string, number>();
    for (const n of koteiNodes) {
      const key = n.flowTitle ?? "(null)";
      byFlow.set(key, (byFlow.get(key) ?? 0) + 1);
    }
    assert(byFlow.get("年度課税台帳整備フロー（毎年度サイクル）") === 15, `expected 15 nodes, got ${byFlow.get("年度課税台帳整備フロー（毎年度サイクル）")}`);
    assert(byFlow.get("評価替え（3年に1回）フロー") === 12, `expected 12 nodes, got ${byFlow.get("評価替え（3年に1回）フロー")}`);
    assert(byFlow.get("新築・増改築評価フロー") === 12, `expected 12 nodes, got ${byFlow.get("新築・増改築評価フロー")}`);
    console.log("  flowTitle propagation (kotei-shisan-zei: 15/12/12 per flow) ✓");
  }

  // 3) mergeFindings: kind 別に取り込まれる + add の sanity (extracted_step_id 必須)
  {
    const findings = [
      {
        kind: "missing" as const,
        standard_node_id: "block-2/SendInquiry",
        extracted_step_id: null,
        severity: "medium" as const,
        reason: "照会書送付の言及なし",
      },
      {
        kind: "add" as const,
        standard_node_id: null,
        extracted_step_id: "s5",
        severity: "low" as const,
        reason: "マイナンバー利用で省略",
      },
      {
        kind: "add" as const,
        standard_node_id: null,
        extracted_step_id: null,
        severity: null,
        reason: "extractedStepId なし → 弾かれる",
      },
      {
        kind: "missing" as const,
        standard_node_id: null,
        extracted_step_id: null,
        severity: null,
        reason: "standardNodeId なし → 弾かれる",
      },
    ];
    const merged = mergeFindings([], findings);
    assert(merged.length === 2, `expected 2 valid findings, got ${merged.length}`);
    const m = merged.find((g) => g.kind === "missing");
    assert(m != null, "missing finding should be merged");
    assert(m!.standardStepRef === "block-2/SendInquiry", "standardStepRef preserved");
    const a = merged.find((g) => g.kind === "add");
    assert(a != null, "add finding should be merged");
    assert(a!.actualStepRef === "s5", "actualStepRef preserved");
    console.log("  mergeFindings kind + sanity ✓");
  }

  // 4) mergeFindings dedup: 同じ kind + ref のペアは追加されない
  {
    const existing = [
      {
        id: "diff-missing-0",
        kind: "missing" as const,
        standardStepRef: "block-2/SendInquiry",
        reason: "(既存)",
      },
    ];
    const llm = [
      {
        kind: "missing" as const,
        standard_node_id: "block-2/SendInquiry",
        extracted_step_id: null,
        severity: null,
        reason: "重複候補",
      },
      {
        kind: "missing" as const,
        standard_node_id: "block-2/WaitReply",
        extracted_step_id: null,
        severity: null,
        reason: "新規",
      },
    ];
    const merged = mergeFindings(existing, llm);
    assert(merged.length === 2, `expected 2 (1 kept + 1 new), got ${merged.length}`);
    assert(
      merged.some((g) => g.standardStepRef === "block-2/WaitReply"),
      "new missing should be added",
    );
    console.log("  mergeFindings dedup ✓");
  }

  // 4b) mergeFindings id uniqueness: 既存 "diff-missing-0" がある場合、
  //     新規 missing は "diff-missing-1" 以降になる (C3 で複数回呼ばれても衝突しない)
  {
    const existing = [
      {
        id: "diff-missing-0",
        kind: "missing" as const,
        standardStepRef: "block-1/CheckResidence",
        reason: "(既存 0)",
      },
      {
        id: "diff-missing-1",
        kind: "missing" as const,
        standardStepRef: "block-1/CheckAge",
        reason: "(既存 1)",
      },
    ];
    const llm = [
      {
        kind: "missing" as const,
        standard_node_id: "block-2/SendInquiry",
        extracted_step_id: null,
        severity: null,
        reason: "新規 1",
      },
      {
        kind: "missing" as const,
        standard_node_id: "block-2/WaitReply",
        extracted_step_id: null,
        severity: null,
        reason: "新規 2",
      },
    ];
    const merged = mergeFindings(existing, llm);
    const ids = merged.map((g) => g.id);
    const uniqueIds = new Set(ids);
    assert(
      ids.length === uniqueIds.size,
      `id collision: ${JSON.stringify(ids)}`,
    );
    assert(ids.includes("diff-missing-2"), `expected diff-missing-2, got ${ids.join(",")}`);
    assert(ids.includes("diff-missing-3"), `expected diff-missing-3, got ${ids.join(",")}`);
    console.log("  mergeFindings id uniqueness across calls ✓");
  }

  // 5) C1 の matchedKnownGap 付き gap と C2 findings は共存する (dedup キーがバラける)
  {
    const c1Gap = {
      id: "kb-gap-1",
      kind: "local-rule" as const,
      reason: "なりすまし",
      matchedKnownGap: "inkan-toroku/gap-1",
    };
    const c2Llm = [
      {
        kind: "local-rule" as const,
        standard_node_id: "block-1/CheckResidence",
        extracted_step_id: "s2",
        severity: "low" as const,
        reason: "ラベル相違",
      },
    ];
    const merged = mergeFindings([c1Gap], c2Llm);
    assert(merged.length === 2, "C1 gap + C2 finding should coexist");
    const c2Merged = merged.find((g) => g.kind === "local-rule" && g.standardStepRef);
    assert(c2Merged?.severity === "low", "severity should propagate from LLM finding to ExtractedGap");
    console.log("  C1 (matched) + C2 (diff) coexistence ✓");
  }

  // 6) reason 空文字 / whitespace は弾く
  {
    const findings = [
      {
        kind: "add" as const,
        standard_node_id: null,
        extracted_step_id: "s1",
        severity: null,
        reason: "",
      },
      {
        kind: "add" as const,
        standard_node_id: null,
        extracted_step_id: "s2",
        severity: null,
        reason: "   ",
      },
    ];
    const merged = mergeFindings([], findings);
    assert(merged.length === 0, `empty reason should be dropped, got ${merged.length}`);
    console.log("  empty reason dropped ✓");
  }

  // 7) diffStandardVsExtracted E2E (注入 matcher): missing と add が gaps に追加される
  {
    const extracted: SessionExtractedData = {
      ...EMPTY,
      steps: withSteps([
        "申請者の本人確認",
        "印鑑を受領",
        "マイナンバーで照会書を省略",
        "システムに登録",
        "印鑑登録証を発行",
      ]),
    };
    const result = await diffStandardVsExtracted(
      { slug: "inkan-toroku", extracted },
      async () => [
        {
          kind: "missing",
          standard_node_id: "block-2/SendInquiry",
          extracted_step_id: null,
          severity: "medium",
          reason: "照会書送付の言及なし",
        },
        {
          kind: "add",
          standard_node_id: null,
          extracted_step_id: "s3",
          severity: "low",
          reason: "マイナンバー利用で照会書を省略している運用",
        },
      ],
    );
    assert(result.length === 2, `expected 2 gaps, got ${result.length}`);
    const kinds = result.map((g) => g.kind).sort();
    assert(
      kinds[0] === "add" && kinds[1] === "missing",
      `unexpected kinds: ${kinds.join(",")}`,
    );
    console.log("  diffStandardVsExtracted E2E ✓");
  }

  // 8) steps が少ない / slug 空 / 不存在 / matcher 失敗 のときは既存 gaps をパススルー
  {
    const sparse: SessionExtractedData = {
      ...EMPTY,
      steps: withSteps(["x", "y"]),
    };
    const r1 = await diffStandardVsExtracted({ slug: "inkan-toroku", extracted: sparse });
    assert(r1 === sparse.gaps, "sparse steps should pass through");

    const r2 = await diffStandardVsExtracted({ slug: "", extracted: EMPTY });
    assert(r2 === EMPTY.gaps, "empty slug should pass through");

    const r3 = await diffStandardVsExtracted({
      slug: "nonexistent-zzz",
      extracted: { ...EMPTY, steps: withSteps(["a", "b", "c"]) },
    });
    assert(Array.isArray(r3), "missing slug should pass through (return existing)");

    const e: SessionExtractedData = { ...EMPTY, steps: withSteps(["a", "b", "c", "d"]) };
    const r4 = await diffStandardVsExtracted(
      { slug: "inkan-toroku", extracted: e },
      async () => {
        throw new Error("simulated LLM failure");
      },
    );
    assert(r4 === e.gaps, "matcher failure should pass through");
    console.log("  pass-through guards (sparse / empty / missing / throw) ✓");
  }

  console.log("PASS");
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`FAIL: ${msg}`);
  process.exit(1);
});
