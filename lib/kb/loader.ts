import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseFlowStandard, parseGapNotes } from "./parser";
import type { ParsedFlowStandard, ParsedGapNotes } from "./types";

const KB_ROOT = path.join(
  process.cwd(),
  "docs",
  "kb",
  "workflows",
  "_standardized-20",
);

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
