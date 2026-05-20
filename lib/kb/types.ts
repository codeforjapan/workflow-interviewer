import { z } from "zod";

const stringOrStringArray = z.union([z.string(), z.array(z.string())]);

export const FlowStandardFrontmatterSchema = z
  .object({
    psid_service_category: z.string(),
    psid_lifecycle: stringOrStringArray,
    flow_type: z.literal("standard"),
    spec_ref: z.string(),
    spec_law: z.string(),
    psid_lifecycle_also: z.array(z.string()).optional(),
    depends_on: z.array(z.unknown()).optional(),
    triggers: z.array(z.unknown()).optional(),
    creates_risks: z.array(z.unknown()).optional(),
    concept_dependencies: z.array(z.unknown()).optional(),
    review_status: z.enum(["drafted", "reviewed", "verified"]).optional(),
    applicability_scope: z
      .enum(["national-common", "requires-local-check"])
      .optional(),
  })
  .passthrough();

export type FlowStandardFrontmatter = z.infer<
  typeof FlowStandardFrontmatterSchema
>;

export const GapNotesFrontmatterSchema = z
  .object({
    flow_type: z.literal("gap-notes"),
    related_workflow: z.string(),
  })
  .passthrough();

export type GapNotesFrontmatter = z.infer<typeof GapNotesFrontmatterSchema>;

export const MermaidNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  shape: z.enum(["rect", "stadium", "diamond"]),
});

export type MermaidNode = z.infer<typeof MermaidNodeSchema>;

export const MermaidEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  label: z.string().nullable(),
  style: z.enum(["solid", "dotted"]),
});

export type MermaidEdge = z.infer<typeof MermaidEdgeSchema>;

export const MermaidSubgraphSchema = z.object({
  title: z.string(),
  nodeIds: z.array(z.string()),
});

export type MermaidSubgraph = z.infer<typeof MermaidSubgraphSchema>;

export const MermaidGraphSchema = z.object({
  nodes: z.array(MermaidNodeSchema),
  edges: z.array(MermaidEdgeSchema),
  subgraphs: z.array(MermaidSubgraphSchema),
});

export type MermaidGraph = z.infer<typeof MermaidGraphSchema>;

export const GapSectionSchema = z.object({
  kind: z.enum(["spec", "reality", "rationale", "risk", "other"]),
  label: z.string(),
  body: z.string(),
});

export type GapSection = z.infer<typeof GapSectionSchema>;

export const GapSchema = z.object({
  index: z.number().int(),
  title: z.string(),
  sections: z.array(GapSectionSchema),
  raw: z.string(),
});

export type Gap = z.infer<typeof GapSchema>;

export const ParsedFlowStandardSchema = z.object({
  frontmatter: FlowStandardFrontmatterSchema,
  mermaid: z.array(MermaidGraphSchema),
  raw: z.string(),
});

export type ParsedFlowStandard = z.infer<typeof ParsedFlowStandardSchema>;

export const ParsedGapNotesSchema = z.object({
  frontmatter: GapNotesFrontmatterSchema,
  gaps: z.array(GapSchema),
  raw: z.string(),
});

export type ParsedGapNotes = z.infer<typeof ParsedGapNotesSchema>;

export function normalizeLifecycle(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}
