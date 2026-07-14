import type { Session } from "@/lib/server/export/types";
import type { SessionExtractedData } from "@/lib/server/interview/schema";
import {
  buildFilename,
  buildMarkdownReport,
  buildSuggestedPath,
} from "@/lib/server/export/markdown";
import {
  buildJsonReport,
  EXPORT_SCHEMA_VERSION,
} from "@/lib/server/export/json";

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

const FIXED = new Date("2026-05-20T10:00:00Z");

const SAMPLE_EXTRACTED: SessionExtractedData = {
  taskName: "印鑑登録",
  purpose: "住民の本人確認手段の提供",
  legalBasis: "印鑑登録条例",
  stakeholders: ["住民", "窓口担当", "審査担当"],
  steps: [
    { id: "s1", label: "申請受付", order: 1 },
    { id: "s2", label: "本人確認", order: 2 },
    { id: "s3", label: "印鑑登録", order: 3 },
  ],
  connections: [
    {
      id: "kb-t0",
      fromStepId: null,
      target: {
        type: "workflow",
        label: "kokumin-kenko-hoken",
        ref: "workflows/_standardized-20/kokumin-kenko-hoken/",
      },
      note: "他業務への案内",
    },
    {
      id: "c1",
      fromStepId: "s2",
      target: { type: "department", label: "他課", ref: null },
      note: null,
    },
  ],
  exceptions: [
    {
      id: "e1",
      relatedStepId: "s2",
      label: "差し戻し",
      condition: "書類不備",
      frequency: "週 2 件",
    },
  ],
  gaps: [
    {
      id: "kb-gap-1",
      kind: "local-rule",
      reason: "代理申請の本人確認は窓口判断でばらつく",
      matchedKnownGap: "inkan-toroku/gap-1",
    },
    {
      id: "diff-missing-0",
      kind: "missing",
      standardStepRef: "block-2/SendInquiry",
      reason: "照会書送付の言及なし",
    },
  ],
  incidents: [
    {
      id: "i1",
      relatedStepId: "s2",
      scenario: "なりすまし事例",
      severity: "medium",
      knownIncidentRef: null,
    },
  ],
  cautionFlags: [
    {
      conceptId: "CONCEPT-HOUSEHOLD",
      conceptName: "世帯",
      conceptSlug: "household",
      matches: [
        {
          source: "steps",
          sourceId: "s1",
          text: "申請者の世帯構成を確認",
          term: "世帯",
        },
      ],
    },
  ],
  confirmedNodeIds: [],
};

const SAMPLE_SESSION: Session = {
  id: "abc123def456",
  status: "completed",
  taskSlug: "inkan-toroku",
  currentQuestionIndex: 8,
  extractedData: SAMPLE_EXTRACTED,
  flowLayout: { nodes: [], edges: [], groups: [] },
  category: "申請・届出",
  summary: "印鑑登録の業務サマリ",
  createdAt: new Date("2026-05-19T09:00:00Z"),
  updatedAt: new Date("2026-05-20T10:00:00Z"),
};

function main() {
  console.log("D5 export check");

  // 1) ファイル名は YYYYMMDD-findings.md
  {
    const fn = buildFilename(FIXED);
    assert(fn === "20260520-findings.md", `unexpected filename: ${fn}`);
    const path = buildSuggestedPath("inkan-toroku", fn);
    assert(
      path === "local/processes/inkan-toroku/20260520-findings.md",
      `unexpected path: ${path}`,
    );
    console.log("  filename / suggestedPath ✓");
  }

  // 2) buildMarkdownReport の構造
  {
    const md = buildMarkdownReport(SAMPLE_SESSION, SAMPLE_EXTRACTED, FIXED);
    assert(md.filename === "20260520-findings.md", "md filename");
    assert(
      md.suggestedPath === "local/processes/inkan-toroku/20260520-findings.md",
      "md suggestedPath",
    );
    // frontmatter
    assert(md.content.startsWith("---\n"), "md should start with frontmatter");
    assert(md.content.includes("date: 2026-05-20"), "date in frontmatter");
    assert(md.content.includes("task_slug: inkan-toroku"), "task_slug in frontmatter");
    assert(md.content.includes("source_session_id: abc123def456"), "source_session_id");
    assert(md.content.includes("status: completed"), "status");
    // sections
    assert(md.content.includes("# 印鑑登録 業務 findings"), "title");
    assert(md.content.includes("## 業務概要"), "overview section");
    assert(md.content.includes("## 抽出された業務フロー"), "flow section");
    assert(md.content.includes("```mermaid"), "mermaid block");
    assert(md.content.includes("## 既知ギャップ"), "known gaps section");
    assert(md.content.includes("inkan-toroku/gap-1"), "matchedKnownGap render");
    assert(md.content.includes("## 新規ギャップ"), "new gaps section");
    assert(md.content.includes("block-2/SendInquiry"), "standardStepRef render");
    assert(md.content.includes("## 例外フロー"), "exceptions section");
    assert(md.content.includes("差し戻し"), "exception label");
    assert(md.content.includes("## インシデント候補"), "incidents section");
    assert(md.content.includes("なりすまし事例"), "incident scenario");
    assert(md.content.includes("## 他業務との連携"), "connections section");
    assert(md.content.includes("kokumin-kenko-hoken"), "connection target");
    assert(md.content.includes("## AI 注意事項"), "cautions section");
    assert(md.content.includes("CONCEPT-HOUSEHOLD"), "concept id render");
    console.log("  markdown structure (frontmatter + 9 sections) ✓");
  }

  // 3) 空 extracted でも壊れない
  {
    const empty: SessionExtractedData = {
      taskName: null,
      purpose: null,
      legalBasis: null,
      stakeholders: [],
      steps: [],
      connections: [],
      exceptions: [],
      gaps: [],
      incidents: [],
      cautionFlags: [],
      confirmedNodeIds: [],
    };
    const session: Session = {
      ...SAMPLE_SESSION,
      taskSlug: null,
      extractedData: empty,
    };
    const md = buildMarkdownReport(session, empty, FIXED);
    assert(md.suggestedPath === "local/processes/unknown/20260520-findings.md", "empty slug fallback");
    assert(md.content.includes("(業務名未抽出)"), "fallback title");
    assert(md.content.includes("(steps が抽出されていません)"), "no steps fallback");
    assert(md.content.includes("(マッチした既知ギャップなし)"), "no known gaps");
    assert(md.content.includes("(新規ギャップなし)"), "no new gaps");
    assert(md.content.includes("(例外抽出なし)"), "no exceptions");
    assert(md.content.includes("(インシデント抽出なし)"), "no incidents");
    assert(md.content.includes("(連携抽出なし)"), "no connections");
    assert(md.content.includes("(注意対象なし)"), "no cautions");
    console.log("  empty fallbacks ✓");
  }

  // 4) buildJsonReport の構造
  {
    const json = buildJsonReport(SAMPLE_SESSION, SAMPLE_EXTRACTED, FIXED);
    assert(json.filename === "20260520-findings.json", `unexpected json filename: ${json.filename}`);
    const obj = JSON.parse(json.content);
    assert(obj.schema === EXPORT_SCHEMA_VERSION, "schema version");
    assert(obj.session.id === "abc123def456", "session id");
    assert(obj.session.taskSlug === "inkan-toroku", "session taskSlug");
    assert(obj.session.status === "completed", "session status");
    assert(typeof obj.session.createdAt === "string", "createdAt ISO");
    assert(obj.extracted.taskName === "印鑑登録", "extracted preserved");
    assert(obj.extracted.gaps.length === 2, "gaps preserved");
    assert(
      obj.suggestedPaths.markdown === "local/processes/inkan-toroku/20260520-findings.md",
      "suggestedPaths.markdown",
    );
    assert(
      obj.suggestedPaths.json === "local/processes/inkan-toroku/20260520-findings.json",
      "suggestedPaths.json",
    );
    console.log("  json shape (schema + session + extracted + suggestedPaths) ✓");
  }

  // 5) gaps の matchedKnownGap 有無で 既知/新規 を分離
  {
    const md = buildMarkdownReport(SAMPLE_SESSION, SAMPLE_EXTRACTED, FIXED);
    const knownIdx = md.content.indexOf("## 既知ギャップ");
    const newIdx = md.content.indexOf("## 新規ギャップ");
    assert(knownIdx < newIdx, "known section appears before new section");
    const known = md.content.slice(knownIdx, newIdx);
    const newer = md.content.slice(newIdx, md.content.indexOf("## 例外フロー"));
    assert(known.includes("kb-gap-1"), "kb-gap-1 in known section");
    assert(!known.includes("diff-missing-0"), "diff-missing-0 NOT in known section");
    assert(newer.includes("diff-missing-0"), "diff-missing-0 in new section");
    assert(!newer.includes("kb-gap-1"), "kb-gap-1 NOT in new section");
    console.log("  known vs new gap partitioning ✓");
  }

  console.log("PASS");
}

try {
  main();
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}
