import type { Session } from "./types";
import type { SessionExtractedData } from "@/lib/server/interview/schema";
import { buildFilename, buildSuggestedPath } from "./markdown";

export const EXPORT_SCHEMA_VERSION = "workflow-interviewer/v1";

/**
 * 後工程連携用の拡張 JSON。既存の minimal JSON (sessionId/data/completedAt) を
 * 包含しつつ、より分析しやすい構造で session メタを併記する。
 *
 * - schema: 将来の互換性ガード用バージョン文字列
 * - generatedAt: ISO 8601
 * - session: id / taskSlug / status / createdAt / updatedAt
 * - extracted: SessionExtractedData そのまま
 * - suggestedPaths: KB local に置く際の推奨パス (md + json)
 */
export function buildJsonReport(
  session: Session,
  extracted: SessionExtractedData,
  now: Date = new Date(),
): { filename: string; content: string } {
  const mdFilename = buildFilename(now);
  const jsonFilename = mdFilename.replace(/\.md$/, ".json");
  const slug = session.taskSlug ?? "";

  const payload = {
    schema: EXPORT_SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    session: {
      id: session.id,
      taskSlug: session.taskSlug,
      status: session.status,
      currentQuestionIndex: session.currentQuestionIndex,
      category: session.category,
      summary: session.summary,
      createdAt:
        session.createdAt instanceof Date
          ? session.createdAt.toISOString()
          : session.createdAt,
      updatedAt:
        session.updatedAt instanceof Date
          ? session.updatedAt.toISOString()
          : session.updatedAt,
    },
    extracted,
    suggestedPaths: {
      markdown: buildSuggestedPath(slug, mdFilename),
      json: buildSuggestedPath(slug, jsonFilename),
    },
  };
  return {
    filename: jsonFilename,
    content: JSON.stringify(payload, null, 2),
  };
}
