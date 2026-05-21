import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { desc, eq, asc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { sessions, messages } from "@/lib/db/schema";
import { detectCautionFlagsForExtracted } from "@/lib/server/interview/cautions";
import { handleUserTurn } from "@/lib/server/interview/controller";
import { buildJsonReport } from "@/lib/server/export/json";
import { buildMarkdownReport } from "@/lib/server/export/markdown";
import { recomputeGaps } from "@/lib/server/gap/recompute";
import { questions } from "@/lib/server/interview/questions";
import { SLOT_DEFS } from "@/lib/server/interview/slots";
import { generateAdaptiveQuestion } from "@/lib/server/interview/followup";
import { loadSeedConnections } from "@/lib/server/interview/seed";
import { openai, MODELS } from "@/lib/server/openai";

const DEFAULT_TASK_SLUG = "inkan-toroku";

const sessionCreateSchema = z
  .object({
    task_slug: z.string().min(1).optional(),
  })
  .optional();

const WORKFLOW_CATEGORIES = [
  "申請・届出",
  "許認可",
  "税務",
  "福祉・介護",
  "都市計画・建設",
  "教育・文化",
  "その他",
] as const;

const messageInputSchema = z.object({
  content: z.string().min(1).max(4000),
});
const flowLayoutSchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string().min(1),
      x: z.number().finite(),
      y: z.number().finite(),
    }),
  ),
  edges: z.array(
    z.object({
      id: z.string().min(1),
      source: z.string().min(1),
      target: z.string().min(1),
    }),
  ),
  groups: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        nodeIds: z.array(z.string().min(1)),
      }),
    )
    .default([]),
});

export const sessionsRoute = new Hono()
  /**
   * GET /api/sessions
   * セッション一覧を返す（新しい順）。
   */
  .get("/", async (c) => {
    const allSessions = await db.query.sessions.findMany({
      orderBy: desc(sessions.createdAt),
    });
    return c.json({ sessions: allSessions });
  })
  /**
   * POST /api/sessions
   * 新規セッションを作成し、最初の assistant メッセージ (アイスブレイク + Q1) を返す。
   * body.task_slug が指定されればその業務 KB から connections を seed する。
   * 未指定の場合は inkan-toroku がデフォルト（D1 のセレクタ UI が入るまでの暫定挙動）。
   */
  .post("/", async (c) => {
    let body: { task_slug?: string } | undefined;
    try {
      const raw = await c.req.json();
      const parsed = sessionCreateSchema.parse(raw);
      body = parsed;
    } catch {
      body = undefined;
    }
    const taskSlug = body?.task_slug ?? DEFAULT_TASK_SLUG;
    const seedConnections = await loadSeedConnections(taskSlug);

    const id = nanoid(12);
    const [session] = await db
      .insert(sessions)
      .values({
        id,
        taskSlug,
        extractedData: {
          taskName: null,
          purpose: null,
          legalBasis: null,
          stakeholders: [],
          steps: [],
          connections: seedConnections,
          exceptions: [],
          gaps: [],
          incidents: [],
          cautionFlags: [],
        },
      })
      .returning();

    const firstQuestion = await generateAdaptiveQuestion({
      sessionId: id,
      sessionStatus: session.status,
      guideQuestion: SLOT_DEFS.taskName.template,
      questionIndex: 0,
      conversation: [],
      extracted: session.extractedData,
      taskSlug: session.taskSlug,
    });
    const opener = `${questions.opener}\n\n${firstQuestion.content}`;
    const [firstMessage] = await db
      .insert(messages)
      .values({
        id: nanoid(12),
        sessionId: id,
        role: "assistant",
        content: opener,
        meta: { choices: firstQuestion.choices },
      })
      .returning();

    return c.json({ session, messages: [firstMessage] }, 201);
  })
  /**
   * GET /api/sessions/:id
   * セッション + 全メッセージを返す。
   */
  .get("/:id", async (c) => {
    const id = c.req.param("id");
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, id),
    });
    if (!session) return c.json({ error: "session not found" }, 404);

    const sessionMessages = await db.query.messages.findMany({
      where: eq(messages.sessionId, id),
      orderBy: asc(messages.createdAt),
    });

    return c.json({ session, messages: sessionMessages });
  })
  /**
   * POST /api/sessions/:id/messages
   * ユーザー発話を 1 ターン進める。
   */
  .post("/:id/messages", zValidator("json", messageInputSchema), async (c) => {
    const id = c.req.param("id");
    const { content } = c.req.valid("json");
    try {
      const result = await handleUserTurn({ sessionId: id, userInput: content });
      return c.json(result);
    } catch (err) {
      console.error("[POST /sessions/:id/messages] failed", err);
      const message = err instanceof Error ? err.message : "unknown error";
      const cause = err instanceof Error && err.cause ? String(err.cause) : undefined;
      return c.json({ error: message, cause }, 500);
    }
  })
  /**
   * GET /api/sessions/:id/export?format=md|json
   * D5: KB local 規約に沿った Markdown / 拡張 JSON レポートを返す。
   * クライアント側のダウンロード用に Content-Disposition: attachment を付与。
   */
  .get("/:id/export", async (c) => {
    const id = c.req.param("id");
    const format = c.req.query("format") ?? "json";
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, id),
    });
    if (!session) return c.json({ error: "session not found" }, 404);

    if (format === "md" || format === "markdown") {
      const { filename, content } = buildMarkdownReport(
        session,
        session.extractedData,
      );
      return new Response(content, {
        headers: {
          "content-type": "text/markdown; charset=utf-8",
          "content-disposition": `attachment; filename="${filename}"`,
        },
      });
    }
    if (format === "json") {
      const { filename, content } = buildJsonReport(
        session,
        session.extractedData,
      );
      return new Response(content, {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-disposition": `attachment; filename="${filename}"`,
        },
      });
    }
    return c.json({ error: `unknown format: ${format}` }, 400);
  })
  /**
   * POST /api/sessions/:id/gap-recompute
   * C3: 「ギャップ更新」ボタン用の明示再計算エンドポイント。
   * C1 + C2 を実行して gaps[] と cautionFlags を更新する。
   */
  .post("/:id/gap-recompute", async (c) => {
    const id = c.req.param("id");
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, id),
    });
    if (!session) return c.json({ error: "session not found" }, 404);

    const sessionMessages = await db.query.messages.findMany({
      where: eq(messages.sessionId, id),
      orderBy: asc(messages.createdAt),
    });
    const conversationForLlm = sessionMessages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    try {
      const gaps = await recomputeGaps({
        slug: session.taskSlug ?? "",
        extracted: { ...session.extractedData, cautionFlags: [] },
        conversation: conversationForLlm,
      });
      const cautionFlags = await detectCautionFlagsForExtracted({
        ...session.extractedData,
        gaps,
        cautionFlags: [],
      });
      const [updated] = await db
        .update(sessions)
        .set({ extractedData: { ...session.extractedData, gaps, cautionFlags } })
        .where(eq(sessions.id, id))
        .returning();
      return c.json({ session: updated });
    } catch (err) {
      console.error("[POST /sessions/:id/gap-recompute] failed", err);
      const message = err instanceof Error ? err.message : "unknown error";
      return c.json({ error: message }, 500);
    }
  })
  /**
   * PATCH /api/sessions/:id/flow
   * 手動編集されたフロー図のレイアウト・接続を保存する。
   */
  .patch("/:id/flow", zValidator("json", flowLayoutSchema), async (c) => {
    const id = c.req.param("id");
    const flowLayout = c.req.valid("json");
    const nodeIds = new Set(flowLayout.nodes.map((n) => n.id));
    const hasInvalidEdge = flowLayout.edges.some(
      (edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target),
    );
    if (hasInvalidEdge) {
      return c.json({ error: "edge source/target must exist in nodes" }, 400);
    }

    const [updated] = await db
      .update(sessions)
      .set({ flowLayout })
      .where(eq(sessions.id, id))
      .returning();
    if (!updated) return c.json({ error: "session not found" }, 404);
    return c.json({ session: updated });
  })
  /**
   * POST /api/sessions/:id/complete
   * セッションを完了状態にし、AI で category / summary を生成して保存する。
   */
  .post("/:id/complete", async (c) => {
    const id = c.req.param("id");
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, id),
    });
    if (!session) return c.json({ error: "session not found" }, 404);

    // C3: 完了時の最終ギャップ計算 (失敗しても complete 処理は止めない)
    let finalExtracted = session.extractedData;
    try {
      const finalMessages = await db.query.messages.findMany({
        where: eq(messages.sessionId, id),
        orderBy: asc(messages.createdAt),
      });
      const conversationForLlm = finalMessages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
      const gaps = await recomputeGaps({
        slug: session.taskSlug ?? "",
        extracted: { ...session.extractedData, cautionFlags: [] },
        conversation: conversationForLlm,
      });
      const cautionFlags = await detectCautionFlagsForExtracted({
        ...session.extractedData,
        gaps,
        cautionFlags: [],
      });
      finalExtracted = { ...session.extractedData, gaps, cautionFlags };
    } catch (err) {
      console.error("[POST /sessions/:id/complete] final gap recompute failed", err);
    }

    const { taskName, purpose, legalBasis, steps } = finalExtracted;
    let category: string | null = null;
    let summary: string | null = null;

    if (taskName || purpose) {
      try {
        const completion = await openai.chat.completions.create({
          model: MODELS.chat,
          messages: [
            {
              role: "system",
              content: `あなたは自治体業務の分類アシスタントです。
以下の業務カテゴリの中から最も適切なものを1つ選び、日本語で1〜2文の業務概要も作成してください。

カテゴリ: ${WORKFLOW_CATEGORIES.join(" / ")}

JSON形式で回答してください: {"category": "<カテゴリ名>", "summary": "<概要>"}`,
            },
            {
              role: "user",
              content: [
                taskName ? `業務名: ${taskName}` : null,
                purpose ? `目的: ${purpose}` : null,
                legalBasis ? `根拠法令: ${legalBasis}` : null,
                steps.length > 0 ? `主なステップ: ${steps.map((s) => s.label).join("、")}` : null,
              ]
                .filter(Boolean)
                .join("\n"),
            },
          ],
          response_format: { type: "json_object" },
        });
        const raw = completion.choices[0]?.message?.content ?? "{}";
        const parsed = JSON.parse(raw) as { category?: string; summary?: string };
        category = WORKFLOW_CATEGORIES.includes(parsed.category as (typeof WORKFLOW_CATEGORIES)[number])
          ? (parsed.category ?? null)
          : "その他";
        summary = parsed.summary ?? null;
      } catch (err) {
        console.error("[POST /sessions/:id/complete] AI generation failed", err);
      }
    }

    const [updated] = await db
      .update(sessions)
      .set({
        status: "completed",
        category,
        summary,
        extractedData: finalExtracted,
      })
      .where(eq(sessions.id, id))
      .returning();
    return c.json({ session: updated });
  });
