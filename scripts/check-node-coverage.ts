import { readdir } from "node:fs/promises";
import path from "node:path";
import type { SessionExtractedData } from "@/lib/db/schema";
import {
  _resetNodeCoverageCache,
  applyAskLimit,
  computeNodeCoverage,
  getMainFlowNodes,
  NODE_ASK_LIMIT,
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

  // 4) sonota: `:::className` サフィックスも正しくパースされ、real な diamond/milestone ノードが
  // 追跡対象に含まれる (以前はパーサーのバグで C/F/G/H/K/N/O が丸ごと消えていた)。
  // 唯一 G (`:::condOr` の fork-group 分岐元) だけは、分岐先 G1/G2/G3 側で個別に追跡するため除外する。
  {
    const nodes = await getMainFlowNodes("sonota");
    assert(nodes.length === 21, `sonota should have 21 nodes, got ${nodes.length}`);
    assert(!nodes.some((n) => n.rawId === "G"), "sonota condOr fork-source G should be excluded");
    for (const included of ["C", "F", "H", "K", "N", "O", "P", "G1", "G2", "G3"]) {
      assert(
        nodes.some((n) => n.rawId === included),
        `sonota node ${included} should be trackable (was silently dropped by the classDef parser bug)`,
      );
    }
    console.log("  case#4 sonota -> 21 nodes, condOr source G excluded, real diamonds/milestones included ✓");
  }

  // 4b) sonota OR fork-group: 社内承認ルート (G1 Slack / G2 board / G3 その他) は排他的な代替パス。
  // どれか1つが実務で確認できれば、残りは「言及されなかった」だけで未確認のまま聞き続けない。
  {
    const steps = withSteps([
      "受注が決まったら担当者がSlackのチャンネルで共有し、上長が確認して承認する",
    ]);
    const result = await computeNodeCoverage("sonota", steps);
    assert(result !== null, "expected non-null result for sonota");
    const byRawId = new Map(result!.items.map((i) => [i.rawId, i]));
    assert(byRawId.get("G1")?.status === "confirmed", "G1 (Slack) should be confirmed by the matching step");
    assert(
      byRawId.get("G2")?.status === "confirmed",
      "G2 (board) should be confirmed via OR fork-group override even though never mentioned",
    );
    assert(
      byRawId.get("G3")?.status === "confirmed",
      "G3 (その他) should be confirmed via OR fork-group override even though never mentioned",
    );
    console.log("  case#4b sonota OR fork-group (G1/G2/G3) confirms as a group ✓");
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

  // 8) confirmedNodeIds (extract.ts の LLM 判定): 実際に詰まったセッションの再現。
  // 「見積・提案の提示」(block-1/E) の内容が「見積書作成」step と「Slack承認してPDF提示」step の
  // 2つに分割されると、Dice はどちらの step 単体でも閾値を超えられず永遠に unconfirmed のまま
  // (real session OaJsheZYxuvK で5回連続同じ質問が繰り返された)。LLM 判定 (confirmedNodeIds) で補う。
  {
    const steps = withSteps([
      "提案書をテンプレートで作成、見積書を作成しboardとnotionのプロジェクトシートに入れる",
      "Slackのapprovalチャンネルで承認をもらってクライアントにPDFで提示（完了条件）",
    ]);
    const withoutLlm = await computeNodeCoverage("sonota", steps);
    assert(withoutLlm !== null, "expected non-null result for sonota");
    const eWithout = withoutLlm!.items.find((i) => i.rawId === "E");
    assert(eWithout != null, "node E should exist in sonota main flow");
    assert(
      eWithout!.status === "unconfirmed",
      "node E should stay unconfirmed by Dice alone (content split across 2 steps)",
    );

    const withLlm = await computeNodeCoverage("sonota", steps, new Set(["block-1/E"]));
    const eWith = withLlm!.items.find((i) => i.rawId === "E");
    assert(eWith?.status === "confirmed", "node E should be confirmed via LLM confirmedNodeIds");
    assert(eWith?.source === "llm", `expected source "llm", got ${eWith?.source}`);
    console.log("  case#8 confirmedNodeIds rescues a node split across multiple steps (real session repro) ✓");
  }

  // 9) applyAskLimit サーキットブレーカー: 同一ノードを NODE_ASK_LIMIT 回聞いても未確認なら
  // nextUnconfirmed の選択対象・coverageRatio の分母から除外する (詰まったセッションの安全網)。
  {
    const steps = withSteps(["よくわからない手順"]);
    const base = await computeNodeCoverage("sonota", steps);
    assert(base !== null, "expected non-null result");
    const stuckNode = base!.nextUnconfirmed;
    assert(stuckNode !== null, "expected an unconfirmed node to exist");
    const askCounts = new Map([[stuckNode!.nodeId, NODE_ASK_LIMIT]]);
    const limited = applyAskLimit(base!, askCounts);
    const stuckAfter = limited.items.find((i) => i.nodeId === stuckNode!.nodeId);
    assert(stuckAfter?.skipped === true, "over-asked node should be marked skipped");
    assert(
      limited.nextUnconfirmed?.nodeId !== stuckNode!.nodeId,
      "skipped node should not be reselected as nextUnconfirmed",
    );
    assert(
      limited.totalNodes === base!.totalNodes - 1,
      `totalNodes should shrink by 1 (skipped excluded), got ${limited.totalNodes} vs base ${base!.totalNodes}`,
    );
    console.log("  case#9 applyAskLimit circuit breaker excludes over-asked node from denominator/targeting ✓");
  }

  // 10) フォールバック: null / 空 / 存在しない slug はすべて null (例外を投げない)
  {
    const steps = withSteps(["何かのステップ"]);
    assert((await computeNodeCoverage(null, steps)) === null, "null slug should yield null");
    assert((await computeNodeCoverage("", steps)) === null, "empty slug should yield null");
    assert(
      (await computeNodeCoverage("nonexistent-slug-zzz", steps)) === null,
      "unknown slug should yield null, not throw",
    );
    console.log("  case#10 null/empty/unknown slug -> null, no throw ✓");
  }

  console.log("PASS");
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`FAIL: ${msg}`);
  process.exit(1);
});
