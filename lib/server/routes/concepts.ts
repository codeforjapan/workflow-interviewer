import { Hono } from "hono";
import { loadConceptBySlug } from "@/lib/kb/loader";

const MODAL_SECTIONS = ["競合が顕在化する典型場面", "AIへの注意事項"] as const;

export const conceptsRoute = new Hono()
  /**
   * GET /api/concepts/:slug
   * UI モーダル用: concept_id / concept_name と modal 表示用セクションを返す。
   *
   * 抜粋セクション: "競合が顕在化する典型場面" と "AIへの注意事項" を優先返却。
   * その他のセクションも heading + body のリストで添付する。
   */
  .get("/:slug", async (c) => {
    const slug = c.req.param("slug");
    try {
      const doc = await loadConceptBySlug(slug);
      const focus: Array<{ heading: string; body: string }> = [];
      for (const heading of MODAL_SECTIONS) {
        const found = doc.sections.find((s) => s.heading === heading);
        if (found) focus.push({ heading, body: found.body });
      }

      return c.json({
        conceptId: doc.frontmatter.concept_id,
        conceptName: doc.frontmatter.concept_name,
        slug,
        divergenceScope: doc.frontmatter.divergence_scope ?? [],
        focusSections: focus,
        allSections: doc.sections,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      return c.json({ error: message }, 404);
    }
  });
