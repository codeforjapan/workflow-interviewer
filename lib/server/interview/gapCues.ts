import { loadWorkflowBySlug } from "@/lib/kb/loader";
import type { Gap as KnownGap } from "@/lib/kb/types";
import type { ExtractedGap } from "./schema";

/**
 * gap-notes.md の reality セクションから作る、質問生成用の素材。
 * risks.ts の RiskCue と対称的な役割だが、こちらは INC-*.md ではなく
 * 全業務に既にある gap-notes.md の記述をそのまま再利用する（新規コンテンツ執筆不要）。
 */
export type GapCue = {
  gapIndex: number;
  title: string;
  /** reality セクションを要約用に切り詰めたもの */
  realitySummary: string;
  /** "kotei-shisan-zei/gap-2" 形式。C1 の matchedKnownGap と同じ書式にして突合できるようにする */
  ref: string;
};

const MAX_REALITY_CHARS = 350;

function summarizeReality(body: string): string {
  const collapsed = body.replace(/\n{3,}/g, "\n\n").trim();
  if (collapsed.length <= MAX_REALITY_CHARS) return collapsed;
  return `${collapsed.slice(0, MAX_REALITY_CHARS)}…`;
}

const cache = new Map<string, Promise<GapCue[]>>();

async function loadGapCuesUncached(slug: string): Promise<GapCue[]> {
  let workflow;
  try {
    workflow = await loadWorkflowBySlug(slug);
  } catch {
    return [];
  }
  return workflow.gapNotes.gaps
    .map((gap: KnownGap): GapCue | null => {
      const reality = gap.sections.find((s) => s.kind === "reality");
      if (!reality || !reality.body.trim()) return null;
      return {
        gapIndex: gap.index,
        title: gap.title,
        realitySummary: summarizeReality(reality.body),
        ref: `${slug}/gap-${gap.index}`,
      };
    })
    .filter((c): c is GapCue => c !== null);
}

/**
 * 対象業務スラッグの gap-notes.md から質問素材を作る。
 * スラッグや gap-notes.md が存在しない場合は空配列。
 * セッションごとに同じスラッグで何度も呼ばれる想定なので Promise キャッシュする。
 */
export async function loadGapCues(slug: string): Promise<GapCue[]> {
  if (!slug) return [];
  const cached = cache.get(slug);
  if (cached) return cached;
  const promise = loadGapCuesUncached(slug);
  cache.set(slug, promise);
  return promise;
}

/** C1 で既に matchedKnownGap 済みの gap は質問対象から除外する。 */
export function pickUnmatchedGapCues(
  cues: GapCue[],
  existingGaps: ExtractedGap[],
): GapCue[] {
  const matchedRefs = new Set(
    existingGaps.map((g) => g.matchedKnownGap).filter((v): v is string => !!v),
  );
  return cues.filter((c) => !matchedRefs.has(c.ref));
}

/**
 * 指定の cue を質問の guideQuestion 文に整形する。
 * risks.ts の formatRiskCueAsGuide と対称的な役割。
 */
export function formatGapCueAsGuide(cue: GapCue): string {
  return `他の自治体では「${cue.title}」に関連して、次のような状況が起きることがあります。\n${cue.realitySummary}\n\nこれに近い状況・お困りごとはありますか？実際の対応や工夫があれば教えてください。`;
}

/** テスト用にキャッシュをリセットするヘルパ。 */
export function _resetGapCueCache() {
  cache.clear();
}
