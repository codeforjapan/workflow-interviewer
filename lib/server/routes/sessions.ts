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
      const message = err instanceof Error ? err.message : "unknown error";
      return c.json({ error: message }, 400);
    }
  });
