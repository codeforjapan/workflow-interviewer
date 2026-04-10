import { Hono } from "hono";
import { eq, asc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { sessions, messages } from "@/lib/db/schema";
import { questions } from "@/lib/server/interview/questions";

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
  });
