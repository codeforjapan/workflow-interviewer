import { readdir } from "node:fs/promises";
import path from "node:path";
import type { SessionExtractedData } from "@/lib/db/schema";
import {
  _resetNodeCoverageCache,
  computeNodeCoverage,
  getMainFlowNodes,
  scoreStepAgainstNode,
} from "@/lib/server/interview/nodeCoverage";

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

const WORKFLOWS_ROOT = path.join(
  process.cwd(),
  "docs",
  "kb",
  "workflows",
  "_standardized-20",
);

async function listWorkflowSlugs(): Promise<string[]> {
  const entries = await readdir(WORKFLOWS_ROOT, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
    .map((e) => e.name)
    .sort();
}

function withSteps(labels: string[]): SessionExtractedData["steps"] {
  return labels.map((label, i) => ({ id: `s${i + 1}`, label, order: i + 1 }));
}

async function main() {
  _resetNodeCoverageCache();
  console.log("UX1 node coverage check");

  // 1) 全21業務スイープ: どの業務でも追跡対象ノードが1件以上ある
  {
    const slugs = await listWorkflowSlugs();
    assert(slugs.length === 21, `expected 21 workflow slugs, got ${slugs.length}`);
    for (const slug of slugs) {
      const nodes = await getMainFlowNodes(slug);
      assert(nodes.length > 0, `${slug} should have >0 trackable main-flow nodes`);
    }
    console.log(`  case#1 all ${slugs.length} workflows have >0 trackable nodes ✓`);
  }

  // 2) kotei-shisan-zei: 3 ブロック中 block-0 (年度課税台帳整備フロー) の13ノードのみが対象
  {
    const nodes = await getMainFlowNodes("kotei-shisan-zei");
    assert(nodes.length === 13, `kotei-shisan-zei should have 13 nodes, got ${nodes.length}`);
    assert(nodes.every((n) => n.blockIndex === 0), "all nodes should be from block 0");
    for (const id of ["CalcValue", "CalcTax", "CheckZeroProp"]) {
      assert(nodes.some((n) => n.rawId === id), `expected node ${id} in main flow`);
    }
    console.log("  case#2 kotei-shisan-zei -> 13 nodes incl. CalcValue/CalcTax/CheckZeroProp ✓");
  }

  // 3) inkan-toroku: 4 ブロックのうち block-0 のみ (block-2 の SendInquiry 等は対象外)
  {
    const nodes = await getMainFlowNodes("inkan-toroku");
    assert(nodes.length === 14, `inkan-toroku should have 14 nodes, got ${nodes.length}`);
    assert(
      !nodes.some((n) => n.rawId === "SendInquiry"),
      "inkan-toroku block-2 node should not leak into main flow",
    );
    console.log("  case#3 inkan-toroku -> 14 nodes, block-2 excluded ✓");
  }

  // 4) sonota: classDef サフィックス等でプレースホルダ化した7ノードが除外される
  {
    const nodes = await getMainFlowNodes("sonota");
    assert(nodes.length === 14, `sonota should have 14 nodes, got ${nodes.length}`);
    for (const placeholder of ["C", "F", "G", "H", "K", "N", "O"]) {
      assert(
        !nodes.some((n) => n.rawId === placeholder),
        `sonota placeholder node ${placeholder} should be excluded`,
      );
    }
    console.log("  case#4 sonota -> 14 nodes, placeholder nodes excluded ✓");
  }

  // 5) scoreStepAgainstNode: 真陽性は 0.5 以上、抵当権の枝葉フレーズは大きく下回る
  {
    const trueCases: Array<[string, string]> = [
      ["評価額を計算する。基本的には前年度と同じ方式を継続する", "評価額計算 前年度と同一方式で継続"],
      ["評価額をもとに税率をかけて税額を計算し、1000円未満は切り捨てる", "税額計算 評価額 × 税率 1000円未満端数処理"],
      ["納税通知書と課税明細書を発行して郵送する", "納税通知書・ 課税明細書 発行・郵送"],
    ];
    for (const [step, node] of trueCases) {
      const score = scoreStepAgainstNode(step, node);
      assert(score >= 0.5, `expected true-positive score >=0.5, got ${score} for "${step}"`);
    }
    const falseCase = scoreStepAgainstNode(
      "抵当権の設定者の氏名・住所・生年月日・職業・身分証明書を確認する",
      "評価額計算 前年度と同一方式で継続",
    );
    assert(falseCase < 0.3, `mortgage tangent should score <0.3 against CalcValue, got ${falseCase}`);
    console.log("  case#5 scoreStepAgainstNode true/false-positive regression ✓");
  }

  // 6) computeNodeCoverage E2E: 一部確認済み、枝葉ステップは confirm しない
  {
    const steps = withSteps([
      "毎年度、前年度の課税台帳をベースに開始データを抽出する",
      "評価額を計算する。基本的には前年度と同じ方式を継続する",
      "評価額をもとに税率をかけて税額を計算し、1000円未満は切り捨てる",
      "抵当権の設定者の氏名・住所・生年月日・職業・身分証明書を確認する",
    ]);
    const result = await computeNodeCoverage("kotei-shisan-zei", steps);
    assert(result !== null, "expected non-null result for kotei-shisan-zei");
    assert(result.totalNodes === 13, `expected 13 total nodes, got ${result.totalNodes}`);
    assert(result.confirmedNodes === 3, `expected 3 confirmed nodes, got ${result.confirmedNodes}`);
    assert(
      ["AssembleData", "CalcValue", "CalcTax"].every((id) =>
        result.items.some((i) => i.rawId === id && i.status === "confirmed"),
      ),
      "AssembleData/CalcValue/CalcTax should be confirmed",
    );
    assert(result.nextUnconfirmed !== null, "expected a next unconfirmed node");
    console.log(
      `  case#6 computeNodeCoverage E2E -> ${result.confirmedNodes}/${result.totalNodes} confirmed, mortgage step confirms nothing ✓`,
    );
  }

  // 7) フォールバック: null / 空 / 存在しない slug はすべて null (例外を投げない)
  {
    const steps = withSteps(["何かのステップ"]);
    assert((await computeNodeCoverage(null, steps)) === null, "null slug should yield null");
    assert((await computeNodeCoverage("", steps)) === null, "empty slug should yield null");
    assert(
      (await computeNodeCoverage("nonexistent-slug-zzz", steps)) === null,
      "unknown slug should yield null, not throw",
    );
    console.log("  case#7 null/empty/unknown slug -> null, no throw ✓");
  }

  console.log("PASS");
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`FAIL: ${msg}`);
  process.exit(1);
});
