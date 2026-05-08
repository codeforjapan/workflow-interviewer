import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, asc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { sessions, messages } from "@/lib/db/schema";
import { handleUserTurn } from "@/lib/server/interview/controller";
import { questions } from "@/lib/server/interview/questions";

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
   * POST /api/sessions
   * 新規セッションを作成し、最初の assistant メッセージ (アイスブレイク + Q1) を返す。
   */
  .post("/", async (c) => {
    const id = nanoid(12);
    const [session] = await db
      .insert(sessions)
      .values({ id })
      .returning();

    const opener = `${questions.opener}\n\n${questions.list[0]}`;
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
   * セッションを完了状態にして最終データを返す。
   */
  .post("/:id/complete", async (c) => {
    const id = c.req.param("id");
    const [updated] = await db
      .update(sessions)
      .set({ status: "completed" })
      .where(eq(sessions.id, id))
      .returning();
    if (!updated) return c.json({ error: "session not found" }, 404);
    return c.json({ session: updated });
  });
