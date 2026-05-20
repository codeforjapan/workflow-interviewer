import type { Session } from "@/lib/server/export/types";
import type {
  CautionFlag,
  ExtractedGap,
  SessionExtractedData,
} from "@/lib/server/interview/schema";

/**
 * 業務スラッグ + 日付から KB の local 規約に合わせたファイル名を生成する。
 * 例: 20260520-findings.md → local/processes/[slug]/20260520-findings.md
 */
export function buildFilename(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}-findings.md`;
}

export function buildSuggestedPath(slug: string, filename: string): string {
  return `local/processes/${slug || "unknown"}/${filename}`;
}

const KIND_LABEL: Record<ExtractedGap["kind"], string> = {
  add: "add (現場独自運用)",
  missing: "missing (標準にあるが言及なし)",
  order: "order (順序が違う)",
  "local-rule": "local-rule (意図同じ・運用差分)",
};

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function escapeMarkdownLine(text: string): string {
  // 改行を空白に潰してテーブル列 / リスト行に収まるようにする
  return text.replace(/\r?\n/g, " ").trim();
}

function buildMermaidStepChain(extracted: SessionExtractedData): string {
  const sorted = [...extracted.steps].sort((a, b) => a.order - b.order);
  if (sorted.length === 0) return "";
  const lines: string[] = ["```mermaid", "flowchart TD"];
  for (const s of sorted) {
    const label = escapeMarkdownLine(s.label).replace(/"/g, "'");
    lines.push(`    ${s.id}["${label}"]`);
  }
  for (let i = 1; i < sorted.length; i += 1) {
    lines.push(`    ${sorted[i - 1].id} --> ${sorted[i].id}`);
  }
  lines.push("```");
  return lines.join("\n");
}

function renderGapEntry(g: ExtractedGap): string {
  const lines: string[] = [];
  lines.push(`### ${g.id}`);
  lines.push("");
  lines.push(`- **kind**: ${KIND_LABEL[g.kind]}`);
  if (g.matchedKnownGap) lines.push(`- **既知ギャップ参照**: ${g.matchedKnownGap}`);
  if (g.standardStepRef) lines.push(`- **標準ノード参照**: \`${g.standardStepRef}\``);
  if (g.actualStepRef) lines.push(`- **抽出 step 参照**: \`${g.actualStepRef}\``);
  if (g.severity) lines.push(`- **severity**: ${g.severity}`);
  lines.push("");
  lines.push(`> ${escapeMarkdownLine(g.reason)}`);
  return lines.join("\n");
}

function renderCautionEntry(c: CautionFlag): string {
  const lines: string[] = [];
  lines.push(`### ${c.conceptName} (\`${c.conceptId}\`)`);
  lines.push("");
  lines.push(`- **slug**: \`${c.conceptSlug}\``);
  lines.push(`- **検出箇所**: ${c.matches.length} 件`);
  for (const m of c.matches.slice(0, 8)) {
    lines.push(
      `  - [${m.source}/${m.sourceId}] ${escapeMarkdownLine(m.text)} (語: ${m.term})`,
    );
  }
  if (c.matches.length > 8) lines.push(`  - … 他 ${c.matches.length - 8} 件`);
  return lines.join("\n");
}

/**
 * セッションを KB local/processes/ 配下に取り込める Markdown レポートに整形する。
 *
 * 構成:
 *   frontmatter (date / task_slug / source_session_id / status / generated_by)
 *   - 業務概要
 *   - 抽出フロー (mermaid + 番号付きリスト)
 *   - 既知ギャップ (matchedKnownGap あり)
 *   - 新規ギャップ (matchedKnownGap なし、C2 構造差分)
 *   - 例外フロー
 *   - インシデント候補
 *   - 他業務との連携
 *   - AI 注意事項 (cautionFlags)
 */
export function buildMarkdownReport(
  session: Session,
  extracted: SessionExtractedData,
  now: Date = new Date(),
): { filename: string; suggestedPath: string; content: string } {
  const filename = buildFilename(now);
  const slug = session.taskSlug ?? "";
  const suggestedPath = buildSuggestedPath(slug, filename);

  const frontmatter = [
    "---",
    `date: ${isoDate(now)}`,
    `task_slug: ${slug}`,
    `source_session_id: ${session.id}`,
    `status: ${session.status}`,
    `generated_by: workflow-interviewer`,
    "---",
  ].join("\n");

  const title = extracted.taskName
    ? `# ${extracted.taskName} 業務 findings`
    : "# 業務 findings (業務名未抽出)";

  const overview = [
    "## 業務概要",
    "",
    `- **業務名**: ${extracted.taskName ?? "(未抽出)"}`,
    `- **目的**: ${extracted.taskName ? (extracted.purpose ?? "(未抽出)") : "(未抽出)"}`,
    `- **根拠法令**: ${extracted.legalBasis ?? "(未抽出)"}`,
    `- **関係者**: ${extracted.stakeholders.length > 0 ? extracted.stakeholders.join("、") : "(未抽出)"}`,
  ].join("\n");

  const flowSection = (() => {
    const sorted = [...extracted.steps].sort((a, b) => a.order - b.order);
    if (sorted.length === 0) {
      return "## 抽出された業務フロー\n\n(steps が抽出されていません)";
    }
    const numbered = sorted
      .map((s) => `${s.order}. **${s.id}** — ${escapeMarkdownLine(s.label)}`)
      .join("\n");
    const mermaid = buildMermaidStepChain(extracted);
    return [
      "## 抽出された業務フロー (現場の語り)",
      "",
      mermaid,
      "",
      numbered,
    ].join("\n");
  })();

  const knownGaps = extracted.gaps.filter((g) => !!g.matchedKnownGap);
  const newGaps = extracted.gaps.filter((g) => !g.matchedKnownGap);

  const knownGapsSection = [
    "## 既知ギャップ (KB matched)",
    "",
    knownGaps.length === 0
      ? "(マッチした既知ギャップなし)"
      : knownGaps.map(renderGapEntry).join("\n\n"),
  ].join("\n");

  const newGapsSection = [
    "## 新規ギャップ (構造差分)",
    "",
    newGaps.length === 0
      ? "(新規ギャップなし)"
      : newGaps.map(renderGapEntry).join("\n\n"),
  ].join("\n");

  const exceptionsSection = [
    "## 例外フロー",
    "",
    extracted.exceptions.length === 0
      ? "(例外抽出なし)"
      : extracted.exceptions
          .map(
            (e) =>
              `- (${e.relatedStepId}) **${escapeMarkdownLine(e.label)}**: ${escapeMarkdownLine(e.condition)}${
                e.frequency ? ` / 頻度: ${escapeMarkdownLine(e.frequency)}` : ""
              }`,
          )
          .join("\n"),
  ].join("\n");

  const incidentsSection = [
    "## インシデント候補",
    "",
    extracted.incidents.length === 0
      ? "(インシデント抽出なし)"
      : extracted.incidents
          .map(
            (i) =>
              `- ${i.relatedStepId ? `(${i.relatedStepId}) ` : ""}[severity=${i.severity}] ${escapeMarkdownLine(i.scenario)}${
                i.knownIncidentRef ? ` ← ${i.knownIncidentRef}` : ""
              }`,
          )
          .join("\n"),
  ].join("\n");

  const connectionsSection = [
    "## 他業務との連携",
    "",
    extracted.connections.length === 0
      ? "(連携抽出なし)"
      : extracted.connections
          .map((c) => {
            const from = c.fromStepId ? `from=${c.fromStepId}` : "workflow-level";
            const ref = c.target.ref ? ` ← \`${c.target.ref}\`` : "";
            const note = c.note ? `\n  - note: ${escapeMarkdownLine(c.note)}` : "";
            return `- [${c.target.type}] **${escapeMarkdownLine(c.target.label)}** (${from})${ref}${note}`;
          })
          .join("\n"),
  ].join("\n");

  const cautionsSection = [
    "## AI 注意事項 (制度間競合の検出)",
    "",
    extracted.cautionFlags.length === 0
      ? "(注意対象なし)"
      : extracted.cautionFlags.map(renderCautionEntry).join("\n\n"),
  ].join("\n");

  const content = [
    frontmatter,
    "",
    title,
    "",
    `> 標準フロー (KB) と現場フローを比較した抽出レポート`,
    `> 生成日: ${isoDate(now)} / 元セッション: \`${session.id}\``,
    "",
    overview,
    "",
    flowSection,
    "",
    knownGapsSection,
    "",
    newGapsSection,
    "",
    exceptionsSection,
    "",
    incidentsSection,
    "",
    connectionsSection,
    "",
    cautionsSection,
    "",
  ].join("\n");

  return { filename, suggestedPath, content };
}
