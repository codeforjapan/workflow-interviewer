import { loadAllConcepts } from "./loader";

/**
 * AI caution の検出に必要な最小情報のフラット化されたインデックス。
 * - terms は concept_name を "・" で分割した検出対象語のリスト
 *   (例: "収入・所得" -> ["収入", "所得"])
 * - 元 KB の概念ドキュメントは modal 表示等で別途 loadConceptBySlug で取得する
 */
export type ConceptIndexEntry = {
  conceptId: string;
  conceptName: string;
  slug: string;
  /** 検出用キー。スペースを除いた長さ降順 (長い語から優先マッチ) */
  terms: string[];
  aiCaution: boolean;
};

let indexCache: Promise<ConceptIndexEntry[]> | null = null;

/**
 * 概念インデックスを構築する。
 * ai_caution=true の概念のみを対象とする (issue 範囲)。
 * Promise キャッシュで複数セッションから安全に共有。
 */
export async function loadConceptIndex(): Promise<ConceptIndexEntry[]> {
  if (!indexCache) indexCache = buildConceptIndex();
  return indexCache;
}

async function buildConceptIndex(): Promise<ConceptIndexEntry[]> {
  const docs = await loadAllConcepts();
  const entries: ConceptIndexEntry[] = [];
  for (const { slug, doc } of docs) {
    if (doc.frontmatter.ai_caution !== true) continue;
    const terms = doc.frontmatter.concept_name
      .split("・")
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      .sort((a, b) => b.length - a.length);
    if (terms.length === 0) continue;
    entries.push({
      conceptId: doc.frontmatter.concept_id,
      conceptName: doc.frontmatter.concept_name,
      slug,
      terms,
      aiCaution: true,
    });
  }
  return entries;
}

/** テスト用にキャッシュをリセットするヘルパ。 */
export function _resetConceptIndexCache() {
  indexCache = null;
}
