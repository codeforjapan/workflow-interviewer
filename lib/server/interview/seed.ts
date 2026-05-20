import { z } from "zod";
import { loadWorkflowBySlug } from "@/lib/kb/loader";
import type { Connection } from "./schema";

const TriggerEntrySchema = z.object({
  target: z.string(),
  event: z.string().optional(),
  note: z.string().optional(),
});

const DependsOnEntrySchema = z.object({
  target: z.string(),
  type: z.string().optional(),
  note: z.string().optional(),
});

/**
 * KB の `triggers` を Connection に変換する。
 * 例: workflows/_standardized-20/kokumin-kenko-hoken/ -> kokumin-kenko-hoken
 */
function triggerToConnection(raw: unknown, index: number): Connection | null {
  const parsed = TriggerEntrySchema.safeParse(raw);
  if (!parsed.success) return null;
  const entry = parsed.data;
  const label = extractLabelFromTarget(entry.target);
  const note = [entry.event, entry.note].filter(Boolean).join(" / ") || null;
  return {
    id: `kb-t${index}`,
    fromStepId: null,
    target: {
      type: "workflow",
      label,
      ref: entry.target,
    },
    note,
  };
}

/**
 * KB の `depends_on` を Connection に変換する。
 * concepts/* への参照を「system レベルの定義依存」として表現する。
 */
function dependsOnToConnection(raw: unknown, index: number): Connection | null {
  const parsed = DependsOnEntrySchema.safeParse(raw);
  if (!parsed.success) return null;
  const entry = parsed.data;
  return {
    id: `kb-d${index}`,
    fromStepId: null,
    target: {
      type: "system",
      label: extractLabelFromTarget(entry.target),
      ref: entry.target,
    },
    note: entry.note ?? null,
  };
}

function extractLabelFromTarget(target: string): string {
  const trimmed = target.replace(/\/$/, "");
  const last = trimmed.split("/").pop() ?? trimmed;
  return last.replace(/\.md$/, "");
}

/**
 * 対象業務スラッグの flow-standard.md frontmatter から connections の seed を生成する。
 * スラッグが見つからない / フロントマターに該当フィールドがない場合は空配列を返す。
 */
export async function loadSeedConnections(slug: string): Promise<Connection[]> {
  let workflow;
  try {
    workflow = await loadWorkflowBySlug(slug);
  } catch {
    return [];
  }
  const fm = workflow.flowStandard.frontmatter;
  const triggers = Array.isArray(fm.triggers) ? fm.triggers : [];
  const dependsOn = Array.isArray(fm.depends_on) ? fm.depends_on : [];

  const out: Connection[] = [];
  triggers.forEach((raw, i) => {
    const c = triggerToConnection(raw, i);
    if (c) out.push(c);
  });
  dependsOn.forEach((raw, i) => {
    const c = dependsOnToConnection(raw, i);
    if (c) out.push(c);
  });
  return out;
}
