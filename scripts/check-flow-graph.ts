import type { FlowLayout, SessionExtractedData } from "@/lib/db/schema";
import {
  buildBaseGraph,
  buildGraph,
  CONNECTION_NODE_PREFIX,
  pickWorkflowLevelGaps,
  type ConnectionNodeData,
  type StepNodeData,
} from "@/components/canvas/graph";

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

function withSteps(labels: string[]) {
  return labels.map((label, i) => ({ id: `s${i + 1}`, label, order: i + 1 }));
}

function main() {
  console.log("D2 flow graph check");

  // 1) 空 extracted → ノード 0、エッジ 0
  {
    const { nodes, edges } = buildBaseGraph(EMPTY);
    assert(nodes.length === 0, `empty should yield 0 nodes, got ${nodes.length}`);
    assert(edges.length === 0, `empty should yield 0 edges, got ${edges.length}`);
    console.log("  empty -> 0 nodes/edges ✓");
  }

  // 2) task name + 3 steps → 1 (task) + 3 (step) ノード、2 (task→s1, s1→s2, s2→s3) エッジ
  {
    const data: SessionExtractedData = {
      ...EMPTY,
      taskName: "印鑑登録",
      steps: withSteps(["申請受付", "本人確認", "印鑑登録"]),
    };
    const { nodes, edges } = buildBaseGraph(data);
    assert(nodes.length === 4, `expected 4 nodes (task + 3 steps), got ${nodes.length}`);
    assert(edges.length === 3, `expected 3 edges, got ${edges.length}`);
    assert(nodes[0].id === "task" && nodes[0].type === "input", "task header is input node");
    const stepNodes = nodes.filter((n) => n.type === "step");
    assert(stepNodes.length === 3, "3 step nodes expected");
    console.log("  task + steps -> linear chain ✓");
  }

  // 3) connections: workflow-level (fromStepId=null) は task に接続、step-bound は step に接続
  {
    const data: SessionExtractedData = {
      ...EMPTY,
      taskName: "住民異動",
      steps: withSteps(["転入届受付", "住民票更新", "完了"]),
      connections: [
        {
          id: "kb-t0",
          fromStepId: null,
          target: { type: "workflow", label: "国民健康保険", ref: null },
          note: null,
        },
        {
          id: "c1",
          fromStepId: "s2",
          target: { type: "department", label: "他課", ref: null },
          note: "案内",
        },
      ],
    };
    const { nodes, edges } = buildBaseGraph(data);
    const connNodes = nodes.filter((n) =>
      n.id.startsWith(CONNECTION_NODE_PREFIX),
    );
    assert(connNodes.length === 2, `expected 2 connection nodes, got ${connNodes.length}`);
    assert(
      connNodes.every((n) => n.type === "connectionExternal"),
      "all connection nodes should be type=connectionExternal",
    );

    const taskConnEdge = edges.find(
      (e) => e.source === "task" && e.target === `${CONNECTION_NODE_PREFIX}kb-t0`,
    );
    assert(taskConnEdge != null, "workflow-level conn should source from task");
    const dashedStyle = taskConnEdge!.style as { strokeDasharray?: string } | undefined;
    assert(
      dashedStyle?.strokeDasharray != null,
      "conn edge should be dashed",
    );

    const stepConnEdge = edges.find(
      (e) => e.source === "s2" && e.target === `${CONNECTION_NODE_PREFIX}c1`,
    );
    assert(stepConnEdge != null, "step-bound conn should source from s2");
    console.log("  connections placed + dashed edges ✓");
  }

  // 4) gaps with actualStepRef → StepNode.data.gaps に格納
  {
    const data: SessionExtractedData = {
      ...EMPTY,
      taskName: "印鑑登録",
      steps: withSteps(["a", "b", "c"]),
      gaps: [
        {
          id: "diff-add-0",
          kind: "add",
          actualStepRef: "s2",
          reason: "独自運用",
        },
        {
          id: "diff-missing-0",
          kind: "missing",
          standardStepRef: "block-1/Reject",
          reason: "標準にあるが言及なし",
        },
        {
          id: "kb-gap-1",
          kind: "local-rule",
          matchedKnownGap: "inkan-toroku/gap-1",
          reason: "なりすまし",
        },
      ],
    };
    const { nodes } = buildBaseGraph(data);
    const s2 = nodes.find((n) => n.id === "s2");
    assert(s2 != null, "s2 should exist");
    const stepData = s2!.data as unknown as StepNodeData;
    assert(stepData.gaps.length === 1, `s2 should have 1 step-linked gap, got ${stepData.gaps.length}`);
    assert(stepData.gaps[0].kind === "add", "s2 gap kind should be add");
    // workflow-level gaps (missing without step, kb-gap without refs) はここに含まれない
    const s1 = nodes.find((n) => n.id === "s1");
    assert((s1!.data as unknown as StepNodeData).gaps.length === 0, "s1 has no step-linked gaps");
    console.log("  gaps attached to matching steps ✓");
  }

  // 5) exceptions の数が exceptionCount として step に乗る
  {
    const data: SessionExtractedData = {
      ...EMPTY,
      taskName: "印鑑登録",
      steps: withSteps(["a", "b"]),
      exceptions: [
        { id: "e1", relatedStepId: "s2", label: "差し戻し", condition: "書類不備", frequency: null },
        { id: "e2", relatedStepId: "s2", label: "却下", condition: "対象外", frequency: null },
        { id: "e3", relatedStepId: "s1", label: "保留", condition: "不明", frequency: null },
      ],
    };
    const { nodes, edges } = buildBaseGraph(data);
    const s1 = nodes.find((n) => n.id === "s1")!.data as unknown as StepNodeData;
    const s2 = nodes.find((n) => n.id === "s2")!.data as unknown as StepNodeData;
    assert(s1.exceptionCount === 1, `s1 should have 1 exception, got ${s1.exceptionCount}`);
    assert(s2.exceptionCount === 2, `s2 should have 2 exceptions, got ${s2.exceptionCount}`);
    console.log("  exceptionCount per step ✓");

    // exceptions は「バッジの件数」だけでなく、関連 step から分岐する独立ノード + edge としても描画される
    // (issue: 回答が exceptions に抽出されても、キャンバス上は件数バッジしか変わらず
    // 「フローが更新されない」ように見えていた)。
    for (const excId of ["e1", "e2", "e3"]) {
      assert(
        nodes.some((n) => n.id === `exc:${excId}` && n.type === "exception"),
        `expected exception node exc:${excId} to exist`,
      );
    }
    const e1Node = nodes.find((n) => n.id === "exc:e1")!.data as unknown as {
      label: string;
      condition: string;
    };
    assert(e1Node.label === "差し戻し" && e1Node.condition === "書類不備", "exception node data preserved");
    assert(edges.some((e) => e.id === "e-s2-exc:e1" && e.source === "s2" && e.target === "exc:e1"), "s2->e1 edge");
    assert(edges.some((e) => e.id === "e-s2-exc:e2" && e.source === "s2" && e.target === "exc:e2"), "s2->e2 edge");
    assert(edges.some((e) => e.id === "e-s1-exc:e3" && e.source === "s1" && e.target === "exc:e3"), "s1->e3 edge");
    console.log("  exceptions render as branch nodes/edges from their related step ✓");
  }

  // 6) pickWorkflowLevelGaps: actualStepRef なし or 不一致のものを抜き出す
  {
    const data: SessionExtractedData = {
      ...EMPTY,
      steps: withSteps(["a", "b"]),
      gaps: [
        { id: "g1", kind: "add", actualStepRef: "s1", reason: "..." },
        { id: "g2", kind: "missing", standardStepRef: "block-1/X", reason: "..." },
        { id: "g3", kind: "local-rule", matchedKnownGap: "x/gap-1", reason: "..." },
        { id: "g4", kind: "add", actualStepRef: "non-existent", reason: "..." },
      ],
    };
    const result = pickWorkflowLevelGaps(data);
    assert(result.length === 3, `expected 3 workflow-level gaps, got ${result.length}`);
    assert(result.every((g) => g.id !== "g1"), "step-linked gap should not appear");
    console.log("  pickWorkflowLevelGaps ✓");
  }

  // 6b) 既存 DB に重複 id の gaps が混入していても dedup される (React key 衝突防止)
  {
    const dup = {
      id: "diff-missing-0",
      kind: "missing" as const,
      standardStepRef: "block-2/SendInquiry",
      reason: "...",
    };
    const data: SessionExtractedData = {
      ...EMPTY,
      steps: withSteps(["a", "b"]),
      gaps: [dup, dup, { ...dup, reason: "別文" }],
    };
    const workflow = pickWorkflowLevelGaps(data);
    const ids = workflow.map((g) => g.id);
    const unique = new Set(ids);
    assert(
      ids.length === unique.size,
      `pickWorkflowLevelGaps should dedupe by id, got ${ids.join(",")}`,
    );
    const { nodes } = buildBaseGraph({
      ...data,
      gaps: [
        { id: "g1", kind: "add", actualStepRef: "s1", reason: "x" },
        { id: "g1", kind: "add", actualStepRef: "s1", reason: "x dup" },
      ],
    });
    const s1 = nodes.find((n) => n.id === "s1")!;
    const stepData = s1.data as unknown as StepNodeData;
    assert(
      stepData.gaps.length === 1,
      `buildBaseGraph should dedupe step-bound gaps by id, got ${stepData.gaps.length}`,
    );
    console.log("  defensive id dedup ✓");
  }

  // 7) ConnectionNodeData の整合性チェック
  {
    const data: SessionExtractedData = {
      ...EMPTY,
      taskName: "X",
      steps: withSteps(["a"]),
      connections: [
        {
          id: "c1",
          fromStepId: "s1",
          target: { type: "external", label: "外部機関", ref: "external/x" },
          note: "案内",
        },
      ],
    };
    const { nodes } = buildBaseGraph(data);
    const c = nodes.find((n) => n.id === `${CONNECTION_NODE_PREFIX}c1`);
    assert(c != null, "connection node missing");
    const cd = c!.data as unknown as ConnectionNodeData;
    assert(cd.targetType === "external", "targetType preserved");
    assert(cd.label === "外部機関", "label preserved");
    assert(cd.note === "案内", "note preserved");
    assert(cd.ref === "external/x", "ref preserved");
    console.log("  ConnectionNodeData shape ✓");
  }

  // 8) buildGraph: 古い flowLayout (少ないstep数の頃に一度手動編集して保存されたもの) と
  // 新しい extracted (steps/connections が増えた後の最新状態) をマージしたとき、
  // 追加された新規ノードにも edge が補完される (real session repro: JeR6Zdx4h90T で
  // s3〜s10・conn:c2/c3 が孤立ノードとして表示され続けていた)。
  // 一方、ユーザーが意図的に削除した既存ノード同士の edge は復活させない。
  {
    const data: SessionExtractedData = {
      ...EMPTY,
      taskName: "テスト業務",
      steps: withSteps(["a", "b", "c", "d"]),
      connections: [
        {
          id: "c1",
          fromStepId: "s1",
          target: { type: "system", label: "Slack", ref: null },
          note: null,
        },
        {
          id: "c2",
          fromStepId: "s3",
          target: { type: "system", label: "board", ref: null },
          note: null,
        },
      ],
    };
    // レイアウト保存時点では steps=[a,b] / connections=[c1] しか存在しなかった想定のスナップショット。
    const staleLayout: FlowLayout = {
      nodes: [
        { id: "task", x: 80, y: 0 },
        { id: "s1", x: 80, y: 100 },
        { id: "s2", x: 80, y: 200 },
        { id: "conn:c1", x: 520, y: 100 },
      ],
      edges: [
        { id: "e-task-s1", source: "task", target: "s1" },
        { id: "e-s1-s2", source: "s1", target: "s2" },
        { id: "e-s1-conn:c1", source: "s1", target: "conn:c1" },
      ],
      groups: [],
    };
    const { edges } = buildGraph(data, staleLayout);
    const edgeIds = new Set(edges.map((e) => e.id));
    for (const expected of ["e-task-s1", "e-s1-s2", "e-s1-conn:c1", "e-s2-s3", "e-s3-s4", "e-s3-conn:c2"]) {
      assert(edgeIds.has(expected), `expected edge ${expected} to exist, got [${[...edgeIds].join(", ")}]`);
    }
    console.log("  case#8a buildGraph fills in edges for steps/connections added after layout save ✓");

    // ユーザーが s1->s2 の edge を明示的に削除したケース (両端とも既存ノード) は復活させない。
    const layoutWithDeletion: FlowLayout = {
      ...staleLayout,
      edges: staleLayout.edges.filter((e) => e.id !== "e-s1-s2"),
    };
    const { edges: edgesAfterDeletion } = buildGraph(data, layoutWithDeletion);
    assert(
      !edgesAfterDeletion.some((e) => e.id === "e-s1-s2"),
      "intentionally deleted edge between two known nodes should not be resurrected",
    );
    assert(
      edgesAfterDeletion.some((e) => e.id === "e-s2-s3"),
      "new-node edges should still be filled in even when an old edge was deleted",
    );
    console.log("  case#8b buildGraph respects a user-deleted edge between existing nodes ✓");
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
