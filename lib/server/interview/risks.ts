import { z } from "zod";
import { loadIncidentByPath, loadWorkflowBySlug } from "@/lib/kb/loader";

const CreatesRiskEntrySchema = z.object({
  target: z.string(),
  condition: z.string().optional(),
  note: z.string().optional(),
});

/**
 * 業務 KB の creates_risks と参照先 INC-*.md から導いた、
 * 「もし X が起きたら何が起きるか」型質問の素材。
 */
export type RiskCue = {
  /** "INC-001" 等の参照 ID */
  incidentId: string;
  /** INC frontmatter の title */
  incidentTitle: string;
  /** creates_risks.condition（業務側で「いつ穴が空きうるか」を述べたもの） */
  condition: string;
  /** INC の「何が起きるか」セクションの最初の意味的な塊（要約用）。 */
  chainSummary: string;
  /** 参照元の KB パス（デバッグ・トレース用）。 */
  ref: string;
};

const MAX_CHAIN_CHARS = 400;

function summarizeChain(whatHappens: string): string {
  if (!whatHappens) return "";
  // 先頭の見出し的な行（"## ..." は parser で除去済み）+ 連鎖 code block を含む可能性。
  // 余計な空行を畳んで MAX_CHAIN_CHARS で打ち切る。
  const collapsed = whatHappens.replace(/\n{3,}/g, "\n\n").trim();
  if (collapsed.length <= MAX_CHAIN_CHARS) return collapsed;
  return `${collapsed.slice(0, MAX_CHAIN_CHARS)}…`;
}

const cache = new Map<string, Promise<RiskCue[]>>();

/**
 * 対象業務スラッグの creates_risks を辿り、INC-*.md の「何が起きるか」を要約した
 * RiskCue 配列を返す。スラッグや INC-*.md が存在しない場合は空配列。
 *
 * セッションごとに同じスラッグで何度も呼ばれる想定なので Promise キャッシュする。
 */
export async function loadRiskCues(slug: string): Promise<RiskCue[]> {
  if (!slug) return [];
  const cached = cache.get(slug);
  if (cached) return cached;
  const promise = loadRiskCuesUncached(slug);
  cache.set(slug, promise);
  return promise;
}

async function loadRiskCuesUncached(slug: string): Promise<RiskCue[]> {
  let workflow;
  try {
    workflow = await loadWorkflowBySlug(slug);
  } catch {
    return [];
  }
  const raw = workflow.flowStandard.frontmatter.creates_risks;
  if (!Array.isArray(raw)) return [];

  const cues: RiskCue[] = [];
  for (const entry of raw) {
    const parsed = CreatesRiskEntrySchema.safeParse(entry);
    if (!parsed.success) continue;
    const { target, condition } = parsed.data;
    try {
      const inc = await loadIncidentByPath(target);
      cues.push({
        incidentId: inc.frontmatter.id,
        incidentTitle: inc.frontmatter.title,
        condition: condition ?? "",
        chainSummary: summarizeChain(inc.whatHappens),
        ref: target,
      });
    } catch {
      // INC-*.md が見つからない場合はその cue を黙ってスキップ
    }
  }
  return cues;
}

/**
 * 指定の cue を「もし〜なら何が起きるか」型の guideQuestion 文に整形する。
 * generateAdaptiveQuestion 経由で LLM に渡され、自然な質問に書き換えられる前提の素材。
 */
export function formatRiskCueAsGuide(cue: RiskCue): string {
  const condition = cue.condition || `${cue.incidentTitle} と同じ事象`;
  const chain = cue.chainSummary
    ? `\n\n参考: ${cue.incidentTitle} (${cue.incidentId}) で報告されている連鎖:\n${cue.chainSummary}`
    : "";
  return `もし「${condition}」が現場で起きたら、何が起きうると思いますか？過去のヒヤリ・実際のミス・他課への波及などがあれば教えてください。${chain}`;
}

/** テスト用にキャッシュをリセットするヘルパ。 */
export function _resetRiskCueCache() {
  cache.clear();
}
