import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { loadWorkflowBySlug } from "@/lib/kb/loader";
import { flattenStandardNodes, type StandardNodeRef } from "@/lib/kb/standardNodes";
import { MODELS, openai } from "@/lib/server/openai";
import type {
  ExtractedGap,
  SessionExtractedData,
} from "@/lib/server/interview/schema";

const MIN_STEPS_TO_DIFF = 3;
const REASON_MAX = 240;

const FindingKindSchema = z.enum(["add", "missing", "order", "local-rule"]);
const FindingSeveritySchema = z.enum(["low", "medium", "high"]);

const DiffResponseSchema = z.object({
  findings: z.array(
    z.object({
      kind: FindingKindSchema,
      standard_node_id: z.string().nullable(),
      extracted_step_id: z.string().nullable(),
      severity: FindingSeveritySchema.nullable(),
      reason: z.string(),
    }),
  ),
});

// StandardNodeRef / flattenStandardNodes は lib/kb/standardNodes.ts に移設済み。
// nodeCoverage.ts (毎ターン軽量実行、LLM 非依存) がこのファイル経由で
// openai モジュールを引き込まないようにするための切り出し。ここでは re-export のみ行う。
export { flattenStandardNodes };
export type { StandardNodeRef };

export type DiffInput = {
  slug: string;
  extracted: SessionExtractedData;
};

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

/**
 * dedup キー: kind + standardStepRef + actualStepRef
 * 同じ kind + 同じ標準ノード/抽出 step 参照を持つ findings は重複として弾く。
 */
function findingKey(
  kind: ExtractedGap["kind"],
  standardRef: string | undefined,
  extractedRef: string | undefined,
): string {
  return `${kind}|${standardRef ?? ""}|${extractedRef ?? ""}`;
}

/**
 * 既存 gaps[] から "diff-<kind>-<n>" の n の最大値 + 1 を返す。
 * mergeFindings が呼び出される度に local counter が 0 に戻る問題を回避し、
 * グローバル一意な id を割り当てるための next-seq 取得ヘルパ。
 */
function nextSeqForKind(
  gaps: ExtractedGap[],
  kind: ExtractedGap["kind"],
): number {
  const prefix = `diff-${kind}-`;
  let max = -1;
  for (const g of gaps) {
    if (!g.id.startsWith(prefix)) continue;
    const tail = g.id.slice(prefix.length);
    const n = Number.parseInt(tail, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

/**
 * LLM の findings を ExtractedGap[] にマージする。
 * - 既存 gap (C1 の matchedKnownGap 含む) と重複する findings は除外
 * - id は "diff-{kind}-{n}" の連番。kind 毎に、既存 gaps[] にある最大 n + 1
 *   からインクリメントするので C3 で呼び直されても id 衝突しない
 */
export function mergeFindings(
  existing: ExtractedGap[],
  llmFindings: Array<{
    kind: ExtractedGap["kind"];
    standard_node_id: string | null;
    extracted_step_id: string | null;
    severity: "low" | "medium" | "high" | null;
    reason: string;
  }>,
): ExtractedGap[] {
  const out = [...existing];
  const seen = new Set<string>();
  for (const g of existing) {
    seen.add(findingKey(g.kind, g.standardStepRef, g.actualStepRef));
  }
  const seqByKind: Partial<Record<ExtractedGap["kind"], number>> = {};
  for (const f of llmFindings) {
    if (!f.reason || !f.reason.trim()) continue;
    const standardRef = f.standard_node_id ?? undefined;
    const extractedRef = f.extracted_step_id ?? undefined;
    // add は extracted_step_id が必須、missing は standard_node_id が必須 (sanity)
    if (f.kind === "add" && !extractedRef) continue;
    if (f.kind === "missing" && !standardRef) continue;
    const key = findingKey(f.kind, standardRef, extractedRef);
    if (seen.has(key)) continue;
    seen.add(key);
    // kind 毎に "既存 + 既に push 済み" の最大 seq + 1 を採用
    if (seqByKind[f.kind] === undefined) {
      seqByKind[f.kind] = nextSeqForKind(out, f.kind);
    }
    const nextN = seqByKind[f.kind]!;
    seqByKind[f.kind] = nextN + 1;
    out.push({
      id: `diff-${f.kind}-${nextN}`,
      kind: f.kind,
      standardStepRef: standardRef,
      actualStepRef: extractedRef,
      ...(f.severity ? { severity: f.severity } : {}),
      reason: clip(f.reason.trim(), REASON_MAX),
    });
  }
  return out;
}

const SYSTEM_PROMPT = `あなたは標準業務フロー (Mermaid) と現場の抽出 steps を比較し、構造的なギャップを列挙するエンジンです。
標準ノードには、どの標準フロー（年度課税台帳整備／評価替え／新築増改築 等、flow フィールド）に属するかが付与されています。

各 finding には以下のいずれかの kind を割り当ててください:
- "add": 抽出 steps にあるが、標準ノードに対応するものが見つからない (自治体独自運用候補)
- "missing": 標準ノードにあるが、抽出 steps・exceptions のどちらにも言及されていない (運用漏れ or 触れていない)
- "order": 標準と抽出で対応関係はあるが、順序が逆/前後している
- "local-rule": 意図は同じだが、ラベル/条件が異なる (例: 「照会書送付」→「マイナンバー確認」)

ルール:
- 推測や創作は禁止。明示的に語られたステップ・exceptions・標準ノードのみ対象とする
- 標準ノードの内容が抽出 exceptions (通常フローから外れる分岐・早期終了条件) でカバーされている場合、
  そのノードは steps に無くても "missing" にしない
  (例: 「決裁が通らない場合はその時点で終了」という exception は、標準ノードの
  「終了 / ペンディング」の内容を実質的にカバーしているとみなす)
- 同一の standard_node_id に対する重複した指摘のみ 1 finding にまとめる。異なる標準ノードについての指摘は、同種の欠落であってもまとめずに個別の finding として列挙すること
- まず、抽出 steps がどの flow に対応していそうかを把握すること
  - 抽出 steps が一つも対応しなさそうな flow については、そのノードを1件ずつ列挙せず、
    「(flow名) 全体が今回の会話で確認されていない」という 1 件の "missing" finding に集約してよい。
    standard_node_id にはその flow の最初のノード（通常は Start）の id を設定し、reason にどのノード群がまとめて未確認かを明記する
    (既知の限界: Start は stadium 形状のため nodeCoverage の追跡対象から除外されており、
    pruneResolvedMissingGaps はこの集約 finding を自動解消できない。会話が進んで
    その flow が実際にカバーされても、次の recompute で個別ノード単位の finding に
    分解されない限りこの集約 gap は残り続ける。未対応、既知の制約として許容している)
  - 抽出 steps が部分的にでも対応している flow については、ノード単位で個別に "missing"/"add"/"order"/"local-rule" を判定してよい（複数件の finding を出すことを推奨する）
- reason は短く (240 字以内)、その finding の根拠を述べる
- 標準ノードは "block-N/NodeId" のキーで参照する
- 抽出 step は step.id で参照する
- severity ("low"|"medium"|"high") を、住民対応や法令順守への影響度から判定する。判断できない場合は "medium"
- 不確かなものは findings に含めない (空配列もあり得る)`;

export type DiffMatcher = (
  standardNodes: StandardNodeRef[],
  extractedSteps: SessionExtractedData["steps"],
  extractedExceptions: SessionExtractedData["exceptions"],
) => Promise<
  Array<{
    kind: ExtractedGap["kind"];
    standard_node_id: string | null;
    extracted_step_id: string | null;
    severity: "low" | "medium" | "high" | null;
    reason: string;
  }>
>;

async function callOpenAIDiff(
  standardNodes: StandardNodeRef[],
  extractedSteps: SessionExtractedData["steps"],
  extractedExceptions: SessionExtractedData["exceptions"],
) {
  const completion = await openai.chat.completions.parse({
    model: MODELS.extract,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `標準ノード (Mermaid 由来):\n${JSON.stringify(
          standardNodes.map((n) => ({
            id: n.id,
            label: n.label,
            subgraph: n.subgraph,
            flow: n.flowTitle,
          })),
        )}\n\n抽出 steps (順序付き):\n${JSON.stringify(
          extractedSteps.map((s) => ({ id: s.id, label: s.label, order: s.order })),
        )}\n\n抽出 exceptions (通常フローから外れる分岐・早期終了条件):\n${JSON.stringify(
          extractedExceptions.map((e) => ({
            relatedStepId: e.relatedStepId,
            label: e.label,
            condition: e.condition,
          })),
        )}\n\n上のルールに従って findings 配列を返してください。`,
      },
    ],
    response_format: zodResponseFormat(DiffResponseSchema, "diff_response"),
  });
  const parsed = completion.choices[0]?.message.parsed;
  return parsed?.findings ?? [];
}

/**
 * 標準フロー vs 抽出 steps の構造比較。
 *
 * - slug が空 / KB が見つからない / 抽出 steps が MIN_STEPS_TO_DIFF 未満 / 標準ノード 0 のときは
 *   既存 gaps をそのまま返す
 * - LLM 失敗時も既存 gaps をそのまま返す (安全側)
 *
 * matcher を渡すと LLM 呼び出しを差し替え可能 (テスト用)。
 */
export async function diffStandardVsExtracted(
  input: DiffInput,
  matcher: DiffMatcher = callOpenAIDiff,
): Promise<ExtractedGap[]> {
  if (!input.slug) return input.extracted.gaps;
  if (input.extracted.steps.length < MIN_STEPS_TO_DIFF) {
    return input.extracted.gaps;
  }
  let workflow;
  try {
    workflow = await loadWorkflowBySlug(input.slug);
  } catch {
    return input.extracted.gaps;
  }
  const standardNodes = flattenStandardNodes(workflow.flowStandard);
  if (standardNodes.length === 0) return input.extracted.gaps;

  let findings;
  try {
    findings = await matcher(standardNodes, input.extracted.steps, input.extracted.exceptions);
  } catch {
    return input.extracted.gaps;
  }
  return mergeFindings(input.extracted.gaps, findings);
}

// テストや他モジュールから使えるよう型を再 export
export type { MermaidNode } from "@/lib/kb/types";
