import type { SessionExtractedData } from "@/lib/db/schema";
import {
  buildBaseGraph,
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
    const { nodes } = buildBaseGraph(data);
    const s1 = nodes.find((n) => n.id === "s1")!.data as unknown as StepNodeData;
    const s2 = nodes.find((n) => n.id === "s2")!.data as unknown as StepNodeData;
    assert(s1.exceptionCount === 1, `s1 should have 1 exception, got ${s1.exceptionCount}`);
    assert(s2.exceptionCount === 2, `s2 should have 2 exceptions, got ${s2.exceptionCount}`);
    console.log("  exceptionCount per step ✓");
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

  console.log("PASS");
}

try {
  main();
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}
