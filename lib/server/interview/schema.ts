import { z } from "zod";

/**
 * 業務間/部署/外部機関へのリンク。
 * step が他のワークフロー・部署・システム等とどうつながるかを表現する。
 * fromStepId が null の場合はワークフロー全体のレベルのリンク（KB seed 由来など）。
 */
export const ConnectionSchema = z.object({
  id: z.string(),
  fromStepId: z.string().nullable(),
  target: z.object({
    type: z.enum(["workflow", "department", "external", "system"]),
    label: z.string(),
    ref: z.string().nullable(),
  }),
  note: z.string().nullable(),
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
  frequency: z.string().nullable(),
});

export type Exception = z.infer<typeof ExceptionSchema>;

/**
 * インシデント候補（ヒヤリハットや過去事象）。
 */
export const IncidentSchema = z.object({
  id: z.string(),
  relatedStepId: z.string().nullable(),
  scenario: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  knownIncidentRef: z.string().nullable(),
});

export type Incident = z.infer<typeof IncidentSchema>;

/**
 * Structured Outputs で抽出する業務情報。
 * lib/db/schema.ts の ExtractedBusinessInfo 型と一致させる。
 *
 * Structured Outputs は nullable を許すが optional は不可。
 * 不明値は明示的に null / 空配列を返させる。
 *
 * B2 から connections / exceptions / incidents も LLM で抽出する。
 * gaps は C1/C2 で KB マッチにより派生する別経路のため、ここでは扱わない。
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
  connections: z.array(ConnectionSchema),
  exceptions: z.array(ExceptionSchema),
  incidents: z.array(IncidentSchema),
});

export type ExtractedBusinessInfo = z.infer<typeof ExtractedBusinessInfoSchema>;

/**
 * 標準フローと現場フローのギャップ。
 * KB の既知ギャップにマッチした場合は matchedKnownGap に gap-notes の参照を持つ。
 * gaps は LLM ではなく C1/C2 の KB マッチング/差分計算で埋まる。
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
 * AI が自動推論してはならない制度間競合概念（KB concepts/*.md の ai_caution=true）が
 * 抽出データの label 中で検出されたとき、その出現箇所を記録するフラグ。
 *
 * UI で「この概念は制度ごとに定義が異なります」警告バッジを出す。
 * concept 本文は API/lazy fetch で別取得する想定なので、このフラグには ID と一致情報のみ保持。
 */
export const CautionFlagSchema = z.object({
  conceptId: z.string(),
  conceptName: z.string(),
  conceptSlug: z.string(),
  matches: z.array(
    z.object({
      source: z.enum(["steps", "exceptions", "connections"]),
      sourceId: z.string(),
      text: z.string(),
      term: z.string(),
    }),
  ),
});

export type CautionFlag = z.infer<typeof CautionFlagSchema>;

/**
 * DB の sessions.extractedData が持つ完全形。
 * LLM 抽出（ExtractedBusinessInfo）に gaps と cautionFlags を加えたもの。
 * いずれも LLM ではなく KB マッチ/後処理で派生する。
 */
export const SessionExtractedDataSchema = ExtractedBusinessInfoSchema.extend({
  gaps: z.array(ExtractedGapSchema),
  cautionFlags: z.array(CautionFlagSchema),
});

export type SessionExtractedData = z.infer<typeof SessionExtractedDataSchema>;
