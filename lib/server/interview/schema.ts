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
