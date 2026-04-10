import { eq, asc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { messages, sessions } from "@/lib/db/schema";
import { extractBusinessInfo } from "./extract";
import { questions, TOTAL_QUESTIONS } from "./questions";

/**
 * ユーザー発話を受けて 1 ターン進める。
 * 1. user メッセージ保存
 * 2. 構造化抽出を実行して extractedData を更新
 * 3. 次の質問 (or クロージング) を assistant メッセージとして保存
 * 4. session.currentQuestionIndex を進める
 */
export async function handleUserTurn(params: {
  sessionId: string;
  userInput: string;
}) {
  const { sessionId, userInput } = params;

  const session = await db.query.sessions.findFirst({
    where: eq(sessions.id, sessionId),
  });
  if (!session) throw new Error("session not found");
  if (session.status !== "active") throw new Error("session is not active");

  // 1. user メッセージ保存
  await db.insert(messages).values({
    id: nanoid(12),
    sessionId,
    role: "user",
    content: userInput,
  });

  // 2. 抽出
  const conversation = await db.query.messages.findMany({
    where: eq(messages.sessionId, sessionId),
    orderBy: asc(messages.createdAt),
  });
  const updatedExtracted = await extractBusinessInfo({
    conversation: conversation
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    current: session.extractedData,
  });

  // 3. 次の assistant メッセージを決定
  const nextIndex = session.currentQuestionIndex + 1;
  const isFinished = nextIndex >= TOTAL_QUESTIONS;
  const nextContent = isFinished ? questions.closing : questions.list[nextIndex];

  await db.insert(messages).values({
    id: nanoid(12),
    sessionId,
    role: "assistant",
    content: nextContent,
  });

  // 4. session 更新
  const [updatedSession] = await db
    .update(sessions)
    .set({
      currentQuestionIndex: nextIndex,
      extractedData: updatedExtracted,
    })
    .where(eq(sessions.id, sessionId))
    .returning();

  const allMessages = await db.query.messages.findMany({
    where: eq(messages.sessionId, sessionId),
    orderBy: asc(messages.createdAt),
  });

  return { session: updatedSession, messages: allMessages };
}
