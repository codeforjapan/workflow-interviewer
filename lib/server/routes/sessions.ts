import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { desc, eq, asc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { sessions, messages } from "@/lib/db/schema";
import { handleUserTurn } from "@/lib/server/interview/controller";
import { questions } from "@/lib/server/interview/questions";
import { SLOT_DEFS } from "@/lib/server/interview/slots";
import { generateAdaptiveQuestion } from "@/lib/server/interview/followup";
import { openai, MODELS } from "@/lib/server/openai";

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
   */
  .post("/", async (c) => {
    const id = nanoid(12);
    const [session] = await db
      .insert(sessions)
      .values({ id })
      .returning();

    const firstQuestion = await generateAdaptiveQuestion({
      sessionId: id,
      sessionStatus: session.status,
      guideQuestion: SLOT_DEFS.taskName.template,
      questionIndex: 0,
      conversation: [],
      extracted: session.extractedData,
    });
    const opener = `${questions.opener}\n\n${firstQuestion}`;
    const [firstMessage] = await db
      .insert(messages)
      .values({
        id: nanoid(12),
        sessionId: id,
        role: "assistant",
        content: opener,
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

    const { taskName, purpose, legalBasis, steps } = session.extractedData;
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
      .set({ status: "completed", category, summary })
      .where(eq(sessions.id, id))
      .returning();
    return c.json({ session: updated });
  });
