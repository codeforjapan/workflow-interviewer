import { extractDisplayName, loadOverviewBySlug, loadWorkflowBySlug } from "./loader";

/**
 * 業務スラッグから機械的に導ける「一般的にはこうだろう」という仮説。
 * インタビューの taskName/purpose/legalBasis/stakeholders をゼロから聞くのではなく、
 * この仮説を提示した上で確認・追加を求める質問にするために使う (slots.ts の
 * getSlotGuideQuestion 参照)。
 *
 * 仮説はあくまで標準フロー由来のたたき台であり、事実確認ではない。
 * 各フィールドは「精度に自信が持てない場合は null / 空配列を返し、通常の
 * ゼロベース質問にフォールバックさせる」方針を取る（誤った仮説を提示して
 * 逆に「AIが分かってない感」を強めるのを避けるため）。
 */
export type TaskHypothesis = {
  slug: string;
  /** flow-standard.md の H1 由来の表示名（例: "人事給与"） */
  taskName: string;
  /** frontmatter spec_law。値が "-" 相当や短すぎる場合は null（KB 側の記載品質のばらつき対策） */
  legalBasis: string | null;
  /** mermaid subgraph 名から抽出した関係者候補。汎用ロール（システム/住民等）は除外し、
   *  残りが MIN_INFORMATIVE_STAKEHOLDERS 未満なら空配列（仮説を出さない方が安全なため）。
   *  stakeholderContext がある場合はそちらを優先する（課名・組織名は自治体差が大きく、
   *  subgraph 名より overview.md の人手記述の方が信頼できるため）。 */
  stakeholders: string[];
  /** overview.md の「概要」系セクションから抽出した、purpose 仮説提示用の要約。
   *  overview.md が存在しない業務では null（purpose は taskName のみの軽い文脈付けに留める）。
   *  legalBasis/stakeholders と違い「事実として確認する」対象ではなく、あくまで
   *  「聞かれる側がゼロから制度趣旨を説明しなくて済むようにする」背景情報として使う。 */
  purposeContext: string | null;
  /** overview.md の「関連部門・関連業務の傾向」系セクションから抽出した要約。
   *  課名そのものではなく機能・連携関係として書かれている想定で、stakeholders の
   *  guideQuestion ではこちらを優先する（無ければ subgraph 由来の stakeholders にフォールバック）。 */
  stakeholderContext: string | null;
};

// subgraph 名がこれらで始まる場合は「関係部署」としては汎用的すぎる
// (例: "システム人事給与システム", "住民・申請者") ため仮説から除外する。
const GENERIC_STAKEHOLDER_RE = /^(システム|住民|申請者|利用者)/;

// クリーニング後にこの件数未満しか残らない場合は、仮説を出さずに通常の質問にフォールバックする。
const MIN_INFORMATIVE_STAKEHOLDERS = 2;

// legalBasis として提示するには短すぎる/内容がない値を弾く。
const MIN_LEGAL_BASIS_CHARS = 4;

// overview.md のセクション本文を guideQuestion に渡す長さの上限（risks.ts/gapCues.ts の
// summarizeChain/summarizeReality と同じ考え方: guideQuestion は最終的に LLM が
// 1文に圧縮するための素材なので、ある程度の長さは許容する）。
const MAX_OVERVIEW_CONTEXT_CHARS = 350;

function summarizeOverviewSection(body: string): string {
  const collapsed = body.replace(/\n{3,}/g, "\n\n").trim();
  if (collapsed.length <= MAX_OVERVIEW_CONTEXT_CHARS) return collapsed;
  return `${collapsed.slice(0, MAX_OVERVIEW_CONTEXT_CHARS)}…`;
}

type OverviewContexts = {
  purposeContext: string | null;
  stakeholderContext: string | null;
};

/**
 * overview.md から purposeContext / stakeholderContext を導く。
 * - purposeContext: 「概要」を含む見出しのセクションを優先し、無ければ先頭セクション
 * - stakeholderContext: 「関連部門」「関連業務」を含む見出しのセクション（無ければ null）
 * overview.md が無い場合は両方 null。
 */
async function loadOverviewContexts(slug: string): Promise<OverviewContexts> {
  const overview = await loadOverviewBySlug(slug);
  if (!overview || overview.sections.length === 0) {
    return { purposeContext: null, stakeholderContext: null };
  }

  const purposeSection =
    overview.sections.find((s) => s.heading.includes("概要")) ?? overview.sections[0];
  const purposeContext = purposeSection.body.trim()
    ? summarizeOverviewSection(purposeSection.body)
    : null;

  const stakeholderSection = overview.sections.find(
    (s) => s.heading.includes("関連部門") || s.heading.includes("関連業務"),
  );
  const stakeholderContext =
    stakeholderSection && stakeholderSection.body.trim()
      ? summarizeOverviewSection(stakeholderSection.body)
      : null;

  return { purposeContext, stakeholderContext };
}

const cache = new Map<string, Promise<TaskHypothesis | null>>();

/**
 * 対象業務スラッグの標準フローから TaskHypothesis を導く。
 * sonota (民間業務の汎用フロー) は法令・部署名の仮説がそもそも意味を持たないため常に null。
 * KB に存在しないスラッグも null（呼び出し側は通常のゼロベース質問にフォールバックする）。
 */
export async function loadTaskHypothesis(slug: string): Promise<TaskHypothesis | null> {
  if (!slug || slug === "sonota") return null;
  const cached = cache.get(slug);
  if (cached) return cached;
  const promise = loadTaskHypothesisUncached(slug);
  cache.set(slug, promise);
  return promise;
}

async function loadTaskHypothesisUncached(slug: string): Promise<TaskHypothesis | null> {
  let workflow;
  try {
    workflow = await loadWorkflowBySlug(slug);
  } catch {
    return null;
  }
  const { frontmatter, raw, mermaid } = workflow.flowStandard;
  const taskName = extractDisplayName(raw, slug);

  const specLaw = frontmatter.spec_law?.trim() ?? "";
  const legalBasis =
    specLaw && specLaw !== "-" && specLaw.length >= MIN_LEGAL_BASIS_CHARS ? specLaw : null;

  const titles = new Set<string>();
  for (const block of mermaid) {
    for (const subgraph of block.subgraphs) {
      const title = subgraph.title.trim();
      if (title && !GENERIC_STAKEHOLDER_RE.test(title)) titles.add(title);
    }
  }
  const stakeholders =
    titles.size >= MIN_INFORMATIVE_STAKEHOLDERS ? Array.from(titles) : [];

  const { purposeContext, stakeholderContext } = await loadOverviewContexts(slug);

  return { slug, taskName, legalBasis, stakeholders, purposeContext, stakeholderContext };
}

/** テスト用にキャッシュをリセットするヘルパ。 */
export function _resetTaskHypothesisCache() {
  cache.clear();
}
