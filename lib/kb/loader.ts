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
