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
  /** mermaid の `:::className` サフィックス (例: "cond", "condOr", "milestone")。無ければ null。 */
  className: z.string().nullable(),
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

export const FlowStandardMermaidBlockSchema = MermaidGraphSchema.extend({
  /** この mermaid ブロックの直前にある `## ` 見出し文字列（無ければ null）。
   *  C2 (diffStandardVsExtracted) が「このノード群はどの標準フロー
   *  （年度課税台帳整備／評価替え／新築増改築 等）に属するか」を
   *  LLM に伝えるために使う。 */
  flowTitle: z.string().nullable(),
});

export type FlowStandardMermaidBlock = z.infer<typeof FlowStandardMermaidBlockSchema>;

export const ParsedFlowStandardSchema = z.object({
  frontmatter: FlowStandardFrontmatterSchema,
  mermaid: z.array(FlowStandardMermaidBlockSchema),
  raw: z.string(),
});

export type ParsedFlowStandard = z.infer<typeof ParsedFlowStandardSchema>;

export const ParsedGapNotesSchema = z.object({
  frontmatter: GapNotesFrontmatterSchema,
  gaps: z.array(GapSchema),
  raw: z.string(),
});

export type ParsedGapNotes = z.infer<typeof ParsedGapNotesSchema>;

/**
 * incident-catalog/INC-*.md の frontmatter。
 * id, title, severity, frequency, fix_cost が必須。
 * related_journeys / related_workflows は参照リンク。
 */
export const IncidentFrontmatterSchema = z
  .object({
    file_type: z.literal("incident"),
    id: z.string(),
    title: z.string(),
    severity: z.string(),
    frequency: z.string(),
    fix_cost: z.string(),
    related_journeys: z.array(z.string()).optional(),
    related_workflows: z.array(z.string()).optional(),
  })
  .passthrough();

export type IncidentFrontmatter = z.infer<typeof IncidentFrontmatterSchema>;

/** INC-*.md の各見出しセクション。 */
export const IncidentSectionSchema = z.object({
  heading: z.string(),
  body: z.string(),
});

export type IncidentSection = z.infer<typeof IncidentSectionSchema>;

export const ParsedIncidentDocSchema = z.object({
  frontmatter: IncidentFrontmatterSchema,
  /** "## 何が起きるか" セクション本文（INC-*.md で常に最初に登場する穴の連鎖記述）。 */
  whatHappens: z.string(),
  /** その他のセクション（対策案・法的根拠など）。順序は元ファイル通り。 */
  sections: z.array(IncidentSectionSchema),
  raw: z.string(),
});

export type ParsedIncidentDoc = z.infer<typeof ParsedIncidentDocSchema>;

/**
 * concepts/*.md の frontmatter。
 * ai_caution=true の概念は AI が自動推論してはならない領域として明示される。
 * concept_name は "世帯" / "収入・所得" / "住所・居住地" のように "・" 区切りで複合表記の場合あり。
 */
export const ConceptFrontmatterSchema = z
  .object({
    file_type: z.literal("concept"),
    concept_id: z.string(),
    concept_name: z.string(),
    divergence_scope: z.array(z.string()).optional(),
    related_workflows: z.array(z.string()).optional(),
    related_incidents: z.array(z.string()).optional(),
    ai_caution: z.boolean().optional(),
    review_status: z.enum(["drafted", "reviewed", "verified"]).optional(),
  })
  .passthrough();

export type ConceptFrontmatter = z.infer<typeof ConceptFrontmatterSchema>;

export const ConceptSectionSchema = z.object({
  heading: z.string(),
  body: z.string(),
});

export type ConceptSection = z.infer<typeof ConceptSectionSchema>;

export const ParsedConceptDocSchema = z.object({
  frontmatter: ConceptFrontmatterSchema,
  /** 全 H2 セクションを順序保持して保持。"競合が顕在化する典型場面" / "AIへの注意事項" 等の抽出はここから行う。 */
  sections: z.array(ConceptSectionSchema),
  raw: z.string(),
});

export type ParsedConceptDoc = z.infer<typeof ParsedConceptDocSchema>;

export function normalizeLifecycle(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}
