import type { NodeCoverageResult } from "@/lib/server/interview/nodeCoverage";
import type { ExtractedGap } from "@/lib/server/interview/schema";
import { pruneResolvedMissingGaps } from "@/lib/server/gap/resolve";

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

function coverage(items: NodeCoverageResult["items"]): NodeCoverageResult {
  const confirmedNodes = items.filter((i) => i.status === "confirmed").length;
  return {
    slug: "sonota",
    totalNodes: items.length,
    confirmedNodes,
    coverageRatio: items.length === 0 ? 1 : confirmedNodes / items.length,
    items,
    nextUnconfirmed: items.find((i) => i.status === "unconfirmed") ?? null,
  };
}

function main() {
  console.log("gap auto-resolve check");

  // 1) confirmed になった標準ノードを指す missing gap は取り除かれる
  {
    const gaps: ExtractedGap[] = [
      {
        id: "diff-missing-0",
        kind: "missing",
        standardStepRef: "block-1/E",
        reason: "「見積・提案の提示」が抽出に言及されていない。",
      },
      {
        id: "diff-missing-1",
        kind: "missing",
        standardStepRef: "block-1/F",
        reason: "「発注の意思確認」が抽出に言及されていない。",
      },
    ];
    const nodeCoverage = coverage([
      {
        nodeId: "block-1/E",
        rawId: "E",
        label: "見積・提案の提示",
        subgraph: null,
        blockIndex: 0,
        status: "confirmed",
        matchedStepId: null,
        score: 0,
        source: "llm",
      },
      {
        nodeId: "block-1/F",
        rawId: "F",
        label: "発注の意思確認",
        subgraph: null,
        blockIndex: 0,
        status: "unconfirmed",
        matchedStepId: null,
        score: 0,
      },
    ]);
    const pruned = pruneResolvedMissingGaps(gaps, nodeCoverage);
    assert(pruned.length === 1, `expected 1 remaining gap, got ${pruned.length}`);
    assert(pruned[0].id === "diff-missing-1", "unconfirmed node's gap should remain");
    console.log("  case#1 confirmed node's missing-gap disappears, unconfirmed one stays ✓");
  }

  // 2) missing 以外 (add/order/local-rule) は nodeCoverage 状態に関わらず一切触らない
  {
    const gaps: ExtractedGap[] = [
      { id: "diff-add-0", kind: "add", actualStepRef: "s1", reason: "独自運用" },
      { id: "kb-gap-1", kind: "local-rule", reason: "既知ギャップ", matchedKnownGap: "sonota/gap-1" },
    ];
    const nodeCoverage = coverage([]);
    const pruned = pruneResolvedMissingGaps(gaps, nodeCoverage);
    assert(pruned.length === 2, `expected add/local-rule gaps untouched, got ${pruned.length}`);
    console.log("  case#2 add/local-rule gaps are never pruned ✓");
  }

  // 3) nodeCoverage が null (KB 不在等) のときは gaps をそのまま返す
  {
    const gaps: ExtractedGap[] = [
      { id: "diff-missing-0", kind: "missing", standardStepRef: "block-1/E", reason: "..." },
    ];
    const pruned = pruneResolvedMissingGaps(gaps, null);
    assert(pruned.length === 1, "null nodeCoverage should pass gaps through unchanged");
    console.log("  case#3 null nodeCoverage -> pass-through, no throw ✓");
  }

  // 4) askCounts 指定時: 一度も質問対象にしていない (＝会話がまだそこまで進んでいない) ノードの
  // "missing" は隠す。質問はしたがまだ未確認 (＝答え損ねた/拾えなかった) ノードは表示したままにする。
  // (issue: 「まだ聞かれてもいないのに不足と言われる」不親切な表示を区別する)
  {
    const gaps: ExtractedGap[] = [
      {
        id: "diff-missing-0",
        kind: "missing",
        standardStepRef: "block-1/E",
        reason: "まだ一度も聞かれていないノード",
      },
      {
        id: "diff-missing-1",
        kind: "missing",
        standardStepRef: "block-1/F",
        reason: "聞かれたが未確認のノード",
      },
    ];
    const nodeCoverage = coverage([
      {
        nodeId: "block-1/E",
        rawId: "E",
        label: "見積・提案の提示",
        subgraph: null,
        blockIndex: 0,
        status: "unconfirmed",
        matchedStepId: null,
        score: 0,
      },
      {
        nodeId: "block-1/F",
        rawId: "F",
        label: "発注の意思確認",
        subgraph: null,
        blockIndex: 0,
        status: "unconfirmed",
        matchedStepId: null,
        score: 0,
      },
    ]);
    // block-1/F だけ質問対象にした実績がある (block-1/E は一度も無い = askCounts に現れない)
    const askCounts = new Map([["block-1/F", 1]]);
    const pruned = pruneResolvedMissingGaps(gaps, nodeCoverage, askCounts);
    assert(pruned.length === 1, `expected 1 remaining gap, got ${pruned.length}`);
    assert(pruned[0].id === "diff-missing-1", "asked-but-unanswered node's gap should remain");
    console.log("  case#4 askCounts hides never-asked nodes, keeps asked-but-unanswered ones ✓");
  }

  // 5) nodeCoverage.items に存在しないノード参照 (Start ノードへの集約 finding 等、既知の限界)
  // は askCounts を渡していても判定できないためそのまま残す。
  {
    const gaps: ExtractedGap[] = [
      { id: "diff-missing-0", kind: "missing", standardStepRef: "block-1/Start", reason: "flow全体が未確認" },
    ];
    const nodeCoverage = coverage([]);
    const pruned = pruneResolvedMissingGaps(gaps, nodeCoverage, new Map());
    assert(pruned.length === 1, "unrecognized standardStepRef should be left as-is");
    console.log("  case#5 gaps referencing untracked nodes are left untouched ✓");
  }

  console.log("PASS");
}

try {
  main();
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}
