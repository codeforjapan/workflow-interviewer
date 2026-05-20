import { loadConceptIndex, type ConceptIndexEntry } from "@/lib/kb/concepts";
import type { CautionFlag, SessionExtractedData } from "./schema";

type LabeledItem = {
  source: "steps" | "exceptions" | "connections";
  sourceId: string;
  text: string;
};

/**
 * extracted の steps / exceptions / connections から検出対象テキストを抽出する。
 */
function collectLabeledItems(extracted: SessionExtractedData): LabeledItem[] {
  const items: LabeledItem[] = [];
  for (const step of extracted.steps) {
    items.push({ source: "steps", sourceId: step.id, text: step.label });
  }
  for (const ex of extracted.exceptions) {
    items.push({
      source: "exceptions",
      sourceId: ex.id,
      text: `${ex.label} / ${ex.condition}`,
    });
  }
  for (const conn of extracted.connections) {
    const note = conn.note ? ` / ${conn.note}` : "";
    items.push({
      source: "connections",
      sourceId: conn.id,
      text: `${conn.target.label}${note}`,
    });
  }
  return items;
}

function matchTerm(text: string, term: string): boolean {
  return term.length > 0 && text.includes(term);
}

/**
 * 抽出データの label/condition/note 中に ai_caution=true 概念のキー語が出現したら
 * CautionFlag[] として集約する。同じ概念で複数箇所ヒットしたら matches に集約。
 */
export function detectCautionFlags(
  extracted: SessionExtractedData,
  index: ConceptIndexEntry[],
): CautionFlag[] {
  const items = collectLabeledItems(extracted);
  if (items.length === 0 || index.length === 0) return [];

  const byConcept = new Map<string, CautionFlag>();
  for (const item of items) {
    for (const entry of index) {
      for (const term of entry.terms) {
        if (!matchTerm(item.text, term)) continue;
        let flag = byConcept.get(entry.conceptId);
        if (!flag) {
          flag = {
            conceptId: entry.conceptId,
            conceptName: entry.conceptName,
            conceptSlug: entry.slug,
            matches: [],
          };
          byConcept.set(entry.conceptId, flag);
        }
        // 同一 sourceId + term の重複は弾く
        const already = flag.matches.some(
          (m) =>
            m.source === item.source &&
            m.sourceId === item.sourceId &&
            m.term === term,
        );
        if (!already) {
          flag.matches.push({
            source: item.source,
            sourceId: item.sourceId,
            text: item.text,
            term,
          });
        }
        // 同じ item 内で同じ entry の他の term も検査する場合は break しない方が網羅的だが、
        // 一語ヒットすれば概念として警告対象になるので break で十分。
        break;
      }
    }
  }
  return Array.from(byConcept.values());
}

/** 上記をインデックス自動ロードで使うラッパ。 */
export async function detectCautionFlagsForExtracted(
  extracted: SessionExtractedData,
): Promise<CautionFlag[]> {
  const index = await loadConceptIndex();
  return detectCautionFlags(extracted, index);
}
