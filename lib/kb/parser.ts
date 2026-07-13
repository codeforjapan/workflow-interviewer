import matter from "gray-matter";
import { parseMermaidFlowchart } from "./mermaid";
import {
  ConceptFrontmatterSchema,
  FlowStandardFrontmatterSchema,
  GapNotesFrontmatterSchema,
  IncidentFrontmatterSchema,
  type ConceptSection,
  type FlowStandardMermaidBlock,
  type Gap,
  type GapSection,
  type IncidentSection,
  type ParsedConceptDoc,
  type ParsedFlowStandard,
  type ParsedGapNotes,
  type ParsedIncidentDoc,
} from "./types";

export { parseMermaidFlowchart } from "./mermaid";

const MERMAID_FENCE = /```mermaid\n([\s\S]*?)\n```/g;
const GAP_HEADING = /^(#{2,3})\s*ギャップ(\d+)\s*[：:]\s*(.+?)\s*$/gm;
const SECTION_HEADING = /^\*\*([^*]+?)\*\*\s*[：:]\s*(.*)$/gm;
const H2_HEADING = /^## (.+?)\s*$/gm;
const WHAT_HAPPENS_HEADING = "何が起きるか";

/**
 * pos より前にある最後の `## ` 見出し文字列を返す（無ければ null）。
 * flow-standard.md の各 mermaid ブロックがどの標準フロー（年度課税台帳整備／
 * 評価替え／新築増改築 等）に属するかを、diff.ts (C2) に伝えるために使う。
 */
function findPrecedingH2(markdown: string, pos: number): string | null {
  H2_HEADING.lastIndex = 0;
  let title: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = H2_HEADING.exec(markdown)) !== null) {
    if (m.index >= pos) break;
    title = m[1].trim();
  }
  return title;
}

export function parseFlowStandard(markdown: string): ParsedFlowStandard {
  const parsed = matter(markdown);
  const frontmatter = FlowStandardFrontmatterSchema.parse(parsed.data);

  const mermaid: FlowStandardMermaidBlock[] = [];
  MERMAID_FENCE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MERMAID_FENCE.exec(markdown)) !== null) {
    const graph = parseMermaidFlowchart(match[1]);
    mermaid.push({ ...graph, flowTitle: findPrecedingH2(markdown, match.index) });
  }

  return { frontmatter, mermaid, raw: markdown };
}

function classifySection(label: string): GapSection["kind"] {
  if (label === "仕様書の記述" || label === "仕様書／典型例の記述") {
    return "spec";
  }
  if (label === "現実に起きていること") return "reality";
  if (label === "FDE提案の根拠" || label === "なぜギャップが生まれるか") {
    return "rationale";
  }
  if (label === "インシデントリスク") return "risk";
  return "other";
}

function splitSections(body: string): GapSection[] {
  const positions: Array<{
    start: number;
    headerEnd: number;
    label: string;
    inline: string;
  }> = [];
  SECTION_HEADING.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SECTION_HEADING.exec(body)) !== null) {
    positions.push({
      start: m.index,
      headerEnd: m.index + m[0].length,
      label: m[1].trim(),
      inline: m[2],
    });
  }

  const sections: GapSection[] = [];
  for (let i = 0; i < positions.length; i += 1) {
    const cur = positions[i];
    const next = positions[i + 1];
    const tail = body.slice(cur.headerEnd, next ? next.start : body.length);
    const combined = `${cur.inline}\n${tail}`.trim();
    sections.push({
      kind: classifySection(cur.label),
      label: cur.label,
      body: combined,
    });
  }
  return sections;
}

export function parseGapNotes(markdown: string): ParsedGapNotes {
  const parsed = matter(markdown);
  const frontmatter = GapNotesFrontmatterSchema.parse(parsed.data);
  const content = parsed.content;

  const headings: Array<{
    start: number;
    headerEnd: number;
    index: number;
    title: string;
  }> = [];
  GAP_HEADING.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = GAP_HEADING.exec(content)) !== null) {
    headings.push({
      start: m.index,
      headerEnd: m.index + m[0].length,
      index: Number.parseInt(m[2], 10),
      title: m[3].trim(),
    });
  }

  // 最後のギャップの本文が、ファイル末尾の無関係な汎用セクション
  // (例:「## 標準仕様書が定めておらず...」「## 差分の構造的な意味」) を
  // 飲み込んでしまうのを防ぐため、次のギャップ見出しに加えて次の汎用 H2 見出しも
  // 境界候補にする。
  const h2Positions: number[] = [];
  H2_HEADING.lastIndex = 0;
  while ((m = H2_HEADING.exec(content)) !== null) {
    h2Positions.push(m.index);
  }

  function boundaryAfter(pos: number): number {
    let boundary = content.length;
    for (const h of headings) {
      if (h.start > pos && h.start < boundary) boundary = h.start;
    }
    for (const h2 of h2Positions) {
      if (h2 > pos && h2 < boundary) boundary = h2;
    }
    return boundary;
  }

  const gaps: Gap[] = [];
  for (const cur of headings) {
    const end = boundaryAfter(cur.start);
    const block = content.slice(cur.start, end);
    const bodyAfterHeading = content.slice(cur.headerEnd, end);
    gaps.push({
      index: cur.index,
      title: cur.title,
      sections: splitSections(bodyAfterHeading),
      raw: block,
    });
  }

  return { frontmatter, gaps, raw: markdown };
}

/**
 * incident-catalog/INC-*.md をパースする。
 * `## 何が起きるか` セクション（穴の連鎖記述）を whatHappens として抽出し、
 * その他の `## ` セクションは順序を保ったまま sections に入れる。
 */
export function parseIncidentDoc(markdown: string): ParsedIncidentDoc {
  const parsed = matter(markdown);
  const frontmatter = IncidentFrontmatterSchema.parse(parsed.data);
  const content = parsed.content;

  const positions: Array<{ start: number; headerEnd: number; heading: string }> =
    [];
  H2_HEADING.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = H2_HEADING.exec(content)) !== null) {
    positions.push({
      start: m.index,
      headerEnd: m.index + m[0].length,
      heading: m[1].trim(),
    });
  }

  let whatHappens = "";
  const sections: IncidentSection[] = [];
  for (let i = 0; i < positions.length; i += 1) {
    const cur = positions[i];
    const next = positions[i + 1];
    const body = content
      .slice(cur.headerEnd, next ? next.start : content.length)
      .trim();
    if (cur.heading === WHAT_HAPPENS_HEADING) {
      whatHappens = body;
    } else {
      sections.push({ heading: cur.heading, body });
    }
  }

  return { frontmatter, whatHappens, sections, raw: markdown };
}

/**
 * concepts/*.md をパースする。全 H2 セクションを順序保持で抽出。
 */
export function parseConceptDoc(markdown: string): ParsedConceptDoc {
  const parsed = matter(markdown);
  const frontmatter = ConceptFrontmatterSchema.parse(parsed.data);
  const content = parsed.content;

  const positions: Array<{ start: number; headerEnd: number; heading: string }> =
    [];
  H2_HEADING.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = H2_HEADING.exec(content)) !== null) {
    positions.push({
      start: m.index,
      headerEnd: m.index + m[0].length,
      heading: m[1].trim(),
    });
  }

  const sections: ConceptSection[] = [];
  for (let i = 0; i < positions.length; i += 1) {
    const cur = positions[i];
    const next = positions[i + 1];
    const body = content
      .slice(cur.headerEnd, next ? next.start : content.length)
      .trim();
    sections.push({ heading: cur.heading, body });
  }

  return { frontmatter, sections, raw: markdown };
}
