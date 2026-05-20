import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { loadWorkflowBySlug } from "@/lib/kb/loader";
import type { Gap as KnownGap } from "@/lib/kb/types";
import { MODELS, openai } from "@/lib/server/openai";
import type {
  ExtractedGap,
  SessionExtractedData,
} from "@/lib/server/interview/schema";

const CONVERSATION_TAIL = 10;
const MATCH_REASON_MAX = 240;

const GapMatchResponseSchema = z.object({
  matches: z.array(
    z.object({
      gap_index: z.number().int(),
      matched: z.boolean(),
      reason: z.string().nullable(),
    }),
  ),
});

type Message = { role: "user" | "assistant" | "system"; content: string };

export type GapMatchInput = {
  slug: string;
  extracted: SessionExtractedData;
  conversation: Message[];
};

export type GapMatchCandidate = {
  index: number;
  title: string;
  spec: string;
  reality: string;
};

/**
 * KB の Gap を LLM に提示する候補に整形する。
 * - spec / reality セクションの本文だけを抜き出す
 * - 長すぎる本文は切り詰める（LLM プロンプト膨張防止）
 */
export function toMatchCandidate(gap: KnownGap): GapMatchCandidate {
  const specSec = gap.sections.find((s) => s.kind === "spec");
  const realitySec = gap.sections.find((s) => s.kind === "reality");
  return {
    index: gap.index,
    title: gap.title,
    spec: clip(specSec?.body ?? "", 400),
    reality: clip(realitySec?.body ?? "", 400),
  };
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

/**
 * matchedKnownGap の参照文字列を組み立てる。
 * 例: "inkan-toroku/gap-1"
 */
export function formatGapRef(slug: string, gapIndex: number): string {
  return `${slug}/gap-${gapIndex}`;
}

/**
 * 既存 gaps[] から「まだ matchedKnownGap がついていない」KB ギャップを抽出する。
 */
export function pickUnmatchedCandidates(
  candidates: GapMatchCandidate[],
  existing: ExtractedGap[],
  slug: string,
): GapMatchCandidate[] {
  const alreadyMatched = new Set(
    existing.map((g) => g.matchedKnownGap).filter((v): v is string => !!v),
  );
  return candidates.filter(
    (c) => !alreadyMatched.has(formatGapRef(slug, c.index)),
  );
}

/**
 * LLM プロンプトに渡す会話・抽出抜粋を整形する。
 */
export function summarizeContext(
  extracted: SessionExtractedData,
  conversation: Message[],
): string {
  const conversationText = conversation
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-CONVERSATION_TAIL)
    .map(
      (m) =>
        `${m.role === "user" ? "職員" : "AI"}: ${clip(m.content, 300)}`,
    )
    .join("\n");
  const summary = {
    taskName: extracted.taskName,
    purpose: extracted.purpose,
    steps: extracted.steps.map((s) => s.label),
    exceptions: extracted.exceptions.map((e) => `${e.label} / ${e.condition}`),
    incidents: extracted.incidents.map((i) => i.scenario),
  };
  return `直近の会話 (最大 ${CONVERSATION_TAIL} 発話):\n${conversationText || "(なし)"}\n\n現在の抽出データ抜粋:\n${JSON.stringify(summary)}`;
}

/**
 * LLM 判定結果を ExtractedGap[] に取り込む（既存配列に追加して返す）。
 *
 * - matched=false は無視
 * - 既に同じ matchedKnownGap がある場合は重複追加しない
 * - reason が null/空なら gap.title をフォールバック
 * - kind は "local-rule" 固定（known gap は基本的に自治体差分なため）
 */
export function mergeMatches(
  existing: ExtractedGap[],
  candidates: GapMatchCandidate[],
  llmMatches: Array<{ gap_index: number; matched: boolean; reason: string | null }>,
  slug: string,
): ExtractedGap[] {
  const out = [...existing];
  const matchedRefs = new Set(
    existing.map((g) => g.matchedKnownGap).filter((v): v is string => !!v),
  );
  for (const m of llmMatches) {
    if (!m.matched) continue;
    const cand = candidates.find((c) => c.index === m.gap_index);
    if (!cand) continue;
    const ref = formatGapRef(slug, cand.index);
    if (matchedRefs.has(ref)) continue;
    const reason = m.reason?.trim() || cand.title;
    out.push({
      id: `kb-gap-${cand.index}`,
      kind: "local-rule",
      reason: clip(reason, MATCH_REASON_MAX),
      matchedKnownGap: ref,
    });
    matchedRefs.add(ref);
  }
  return out;
}

const SYSTEM_PROMPT = `あなたは標準業務フローと現場フローのギャップ照合エンジンです。
以下の既知ギャップそれぞれについて、職員の発話および現在の抽出データから判断して、
そのギャップが今回のインタビュー対象でも該当しそうかを matched: true/false で判定してください。

ルール:
- 「該当しそう」とは、現実セクションに書かれた状況と類似する状況が会話・抽出データに見られること
- 推測や創作は禁止。明示的に該当する発言や状況がない場合は false
- 迷う場合は false
- reason は短く（150 字以内）。matched=false のときは null で可
- gap_index は与えられた既知ギャップの index をそのまま返す`;

/**
 * LLM 呼び出し本体。
 * 渡された候補が空のときは即座に空配列を返す。
 */
async function callOpenAIMatcher(
  candidates: GapMatchCandidate[],
  context: string,
): Promise<Array<{ gap_index: number; matched: boolean; reason: string | null }>> {
  if (candidates.length === 0) return [];
  const completion = await openai.chat.completions.parse({
    model: MODELS.extract,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `既知ギャップ:\n${JSON.stringify(candidates)}\n\n${context}\n\n各ギャップについて判定して matches 配列を返してください。`,
      },
    ],
    response_format: zodResponseFormat(GapMatchResponseSchema, "gap_match_response"),
  });
  const parsed = completion.choices[0]?.message.parsed;
  if (!parsed) return [];
  return parsed.matches;
}

export type GapMatcher = (
  candidates: GapMatchCandidate[],
  context: string,
) => Promise<Array<{ gap_index: number; matched: boolean; reason: string | null }>>;

/**
 * 対象業務 KB の既知ギャップと現在の会話・抽出データを LLM で照合し、
 * `gaps[]` に matchedKnownGap 付きの ExtractedGap を追加した配列を返す。
 *
 * - slug が空 / KB が見つからない / known gaps が無い場合は existing をそのまま返す
 * - 既に matched 済みの KB ギャップはスキップ
 * - 単一 LLM コールで全候補を一括判定する（issue C1 完了条件）
 *
 * matcher を渡すと LLM 呼び出しを差し替え可能（テスト用）。
 */
export async function matchKnownGaps(
  input: GapMatchInput,
  matcher: GapMatcher = callOpenAIMatcher,
): Promise<ExtractedGap[]> {
  if (!input.slug) return input.extracted.gaps;
  let workflow;
  try {
    workflow = await loadWorkflowBySlug(input.slug);
  } catch {
    return input.extracted.gaps;
  }
  const allCandidates = workflow.gapNotes.gaps.map(toMatchCandidate);
  const candidates = pickUnmatchedCandidates(
    allCandidates,
    input.extracted.gaps,
    input.slug,
  );
  if (candidates.length === 0) return input.extracted.gaps;

  let llmMatches: Array<{ gap_index: number; matched: boolean; reason: string | null }>;
  try {
    const context = summarizeContext(input.extracted, input.conversation);
    llmMatches = await matcher(candidates, context);
  } catch {
    return input.extracted.gaps;
  }

  return mergeMatches(input.extracted.gaps, candidates, llmMatches, input.slug);
}
