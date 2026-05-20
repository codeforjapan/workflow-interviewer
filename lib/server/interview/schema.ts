import { z } from "zod";

/**
 * Structured Outputs で抽出する業務情報。
 * lib/db/schema.ts の ExtractedBusinessInfo 型と一致させる。
 *
 * Structured Outputs は nullable を許すが optional は不可。
 * 不明値は明示的に null / 空配列を返させる。
 */
export const ExtractedBusinessInfoSchema = z.object({
  taskName: z.string().nullable(),
  purpose: z.string().nullable(),
  legalBasis: z.string().nullable(),
  stakeholders: z.array(z.string()),
  steps: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      order: z.number().int(),
    }),
  ),
});

export type ExtractedBusinessInfo = z.infer<typeof ExtractedBusinessInfoSchema>;

/**
 * 業務間/部署/外部機関へのリンク。
 * step が他のワークフロー・部署・システム等とどうつながるかを表現する。
 */
export const ConnectionSchema = z.object({
  id: z.string(),
  fromStepId: z.string(),
  target: z.object({
    type: z.enum(["workflow", "department", "external", "system"]),
    label: z.string(),
    ref: z.string().optional(),
  }),
  note: z.string().optional(),
});

export type Connection = z.infer<typeof ConnectionSchema>;

/**
 * 例外フロー。通常フローから派生する条件付きの分岐。
 */
export const ExceptionSchema = z.object({
  id: z.string(),
  relatedStepId: z.string(),
  label: z.string(),
  condition: z.string(),
  frequency: z.string().optional(),
});

export type Exception = z.infer<typeof ExceptionSchema>;

/**
 * 標準フローと現場フローのギャップ。
 * KB の既知ギャップにマッチした場合は matchedKnownGap に gap-notes の参照を持つ。
 */
export const ExtractedGapSchema = z.object({
  id: z.string(),
  kind: z.enum(["add", "missing", "order", "local-rule"]),
  standardStepRef: z.string().optional(),
  actualStepRef: z.string().optional(),
  reason: z.string(),
  severity: z.enum(["low", "medium", "high"]).optional(),
  matchedKnownGap: z.string().optional(),
});

export type ExtractedGap = z.infer<typeof ExtractedGapSchema>;

/**
 * インシデント候補（ヒヤリハットや過去事象）。
 */
export const IncidentSchema = z.object({
  id: z.string(),
  relatedStepId: z.string().optional(),
  scenario: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  knownIncidentRef: z.string().optional(),
});

export type Incident = z.infer<typeof IncidentSchema>;

/**
 * DB の sessions.extractedData が持つ完全形。
 * LLM 抽出（ExtractedBusinessInfo）に connections/exceptions/gaps/incidents を加えたもの。
 *
 * これらの新フィールドは A3 時点では LLM では抽出せず、B2 以降で順次埋める。
 * 既存セッションとの後方互換のため空配列をデフォルトとする。
 */
export const SessionExtractedDataSchema = ExtractedBusinessInfoSchema.extend({
  connections: z.array(ConnectionSchema),
  exceptions: z.array(ExceptionSchema),
  gaps: z.array(ExtractedGapSchema),
  incidents: z.array(IncidentSchema),
});

export type SessionExtractedData = z.infer<typeof SessionExtractedDataSchema>;
