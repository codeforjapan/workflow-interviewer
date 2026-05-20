import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  parseConceptDoc,
  parseFlowStandard,
  parseGapNotes,
  parseIncidentDoc,
} from "./parser";
import type {
  ParsedConceptDoc,
  ParsedFlowStandard,
  ParsedGapNotes,
  ParsedIncidentDoc,
} from "./types";

const KB_ROOT_DOCS = path.join(process.cwd(), "docs", "kb");
const KB_ROOT = path.join(KB_ROOT_DOCS, "workflows", "_standardized-20");
const CONCEPTS_ROOT = path.join(KB_ROOT_DOCS, "concepts");

export type LoadedWorkflow = {
  slug: string;
  flowStandard: ParsedFlowStandard;
  gapNotes: ParsedGapNotes;
};

export async function loadWorkflowBySlug(slug: string): Promise<LoadedWorkflow> {
  const dir = path.join(KB_ROOT, slug);
  const flowStandardPath = path.join(dir, "flow-standard.md");
  const gapNotesPath = path.join(dir, "gap-notes.md");

  let flowStandardRaw: string;
  let gapNotesRaw: string;
  try {
    [flowStandardRaw, gapNotesRaw] = await Promise.all([
      readFile(flowStandardPath, "utf-8"),
      readFile(gapNotesPath, "utf-8"),
    ]);
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(`KB workflow not found: ${slug} (${cause})`);
  }

  return {
    slug,
    flowStandard: parseFlowStandard(flowStandardRaw),
    gapNotes: parseGapNotes(gapNotesRaw),
  };
}

/**
 * incident-catalog の INC-*.md を相対パスから読み込む。
 * 渡されるパスは KB ルート相対 (例: "incident-catalog/INC-001-dv-cross-department.md")
 * もしくは絶対パス。
 */
export async function loadIncidentByPath(
  refPath: string,
): Promise<ParsedIncidentDoc> {
  const absolute = path.isAbsolute(refPath)
    ? refPath
    : path.join(KB_ROOT_DOCS, refPath);
  let raw: string;
  try {
    raw = await readFile(absolute, "utf-8");
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(`KB incident not found: ${refPath} (${cause})`);
  }
  return parseIncidentDoc(raw);
}

/**
 * workflows/_standardized-20/ 配下の全業務のメタ情報を返す。
 * - displayName は flow-standard.md の `# ...` H1 から「標準業務フロー」サフィックスを除いた文字列
 * - 一覧表示 UI (D1) で使う前提。失敗した業務はスキップする (堅牢性優先)
 */
export type WorkflowMeta = {
  slug: string;
  displayName: string;
  psidServiceCategory: string;
  psidLifecycle: string[];
  specRef: string;
};

const WORKFLOW_TITLE_RE = /^#\s+(.+?)\s*$/m;
const FRONTMATTER_RE = /^---\n[\s\S]*?\n---\n/;

function extractDisplayName(raw: string, slug: string): string {
  // gray-matter の frontmatter 内に `# 依存関係` 等のコメント風行が含まれる KB があるため、
  // frontmatter ブロックを落としてから H1 を探す
  const body = raw.replace(FRONTMATTER_RE, "");
  const m = body.match(WORKFLOW_TITLE_RE);
  if (!m) return slug;
  return m[1].replace(/\s*標準業務フロー\s*$/, "").trim() || slug;
}

/**
 * flow-standard.md の中の ` ```mermaid ... ``` ` ブロックの中身を順番に取り出す。
 * UI 側で Mermaid ライブラリにそのまま渡すためのヘルパ。
 */
const MERMAID_FENCE_RE = /```mermaid\n([\s\S]*?)\n```/g;

export function extractMermaidSources(rawMarkdown: string): string[] {
  const out: string[] = [];
  MERMAID_FENCE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MERMAID_FENCE_RE.exec(rawMarkdown)) !== null) {
    out.push(m[1]);
  }
  return out;
}

/**
 * 業務スラッグから D3 用の標準フロー情報をまとめてロードする。
 * - displayName: 業務名 (H1 から `標準業務フロー` 接尾辞を除いたもの)
 * - mermaidSources: flow-standard.md の mermaid ブロック (描画順)
 *
 * スラッグが空 / KB が見つからない場合は null。
 */
export type StandardFlowSummary = {
  slug: string;
  displayName: string;
  mermaidSources: string[];
};

export async function loadStandardFlowSummary(
  slug: string,
): Promise<StandardFlowSummary | null> {
  if (!slug) return null;
  try {
    const wf = await loadWorkflowBySlug(slug);
    return {
      slug,
      displayName: extractDisplayName(wf.flowStandard.raw, slug),
      mermaidSources: extractMermaidSources(wf.flowStandard.raw),
    };
  } catch {
    return null;
  }
}

export async function listAllWorkflows(): Promise<WorkflowMeta[]> {
  const entries = await readdir(KB_ROOT, { withFileTypes: true });
  const slugs = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
    .map((e) => e.name)
    .sort();
  const results = await Promise.all(
    slugs.map(async (slug): Promise<WorkflowMeta | null> => {
      try {
        const wf = await loadWorkflowBySlug(slug);
        const fm = wf.flowStandard.frontmatter;
        const lifecycle = Array.isArray(fm.psid_lifecycle)
          ? fm.psid_lifecycle
          : [fm.psid_lifecycle];
        return {
          slug,
          displayName: extractDisplayName(wf.flowStandard.raw, slug),
          psidServiceCategory: fm.psid_service_category,
          psidLifecycle: lifecycle,
          specRef: fm.spec_ref,
        };
      } catch {
        return null;
      }
    }),
  );
  return results.filter((r): r is WorkflowMeta => r !== null);
}

/**
 * concepts/<slug>.md を読み込む。slug = "household" / "income" など。
 */
export async function loadConceptBySlug(slug: string): Promise<ParsedConceptDoc> {
  const file = path.join(CONCEPTS_ROOT, `${slug}.md`);
  let raw: string;
  try {
    raw = await readFile(file, "utf-8");
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(`KB concept not found: ${slug} (${cause})`);
  }
  return parseConceptDoc(raw);
}

/**
 * concepts/ 配下の concept-doc を全て読み込む。README.md は除外。
 */
export async function loadAllConcepts(): Promise<
  Array<{ slug: string; doc: ParsedConceptDoc }>
> {
  const entries = await readdir(CONCEPTS_ROOT, { withFileTypes: true });
  const slugs = entries
    .filter((e) => e.isFile() && e.name.endsWith(".md") && e.name !== "README.md")
    .map((e) => e.name.replace(/\.md$/, ""));
  const results = await Promise.all(
    slugs.map(async (slug) => {
      try {
        const doc = await loadConceptBySlug(slug);
        return { slug, doc };
      } catch {
        return null;
      }
    }),
  );
  return results.filter((r): r is { slug: string; doc: ParsedConceptDoc } => r !== null);
}
