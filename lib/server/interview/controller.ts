import { eq, asc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { messages, sessions } from "@/lib/db/schema";
import { extractBusinessInfo } from "./extract";
import { generateAdaptiveQuestion } from "./followup";
import { questions } from "./questions";
import {
  chooseNextSlot,
  isFinished,
  MAX_TURNS,
  SLOT_DEFS,
} from "./slots";

/**
 * ユーザー発話を受けて 1 ターン進める。
 * 1. user メッセージ保存
 * 2. 構造化抽出を実行して extractedData を更新
 * 3. スロット駆動で次の質問 (or クロージング) を決定し assistant メッセージとして保存
 * 4. session.currentQuestionIndex を進める。終了時は MAX_TURNS まで進めて UI に "完了" を促す
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
  const llmExtracted = await extractBusinessInfo({
    conversation: conversation
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    current: session.extractedData,
  });
  const updatedExtracted = {
    ...llmExtracted,
    connections: session.extractedData.connections,
    exceptions: session.extractedData.exceptions,
    gaps: session.extractedData.gaps,
    incidents: session.extractedData.incidents,
  };

  // 3. スロット駆動で次の発話を決定
  const nextTurnCount = session.currentQuestionIndex + 1;
  const reachedMax = nextTurnCount >= MAX_TURNS;
  const finished = isFinished(updatedExtracted, nextTurnCount);
  const shouldClose = reachedMax || finished;

  let nextContent: string;
  if (shouldClose) {
    nextContent = questions.closing;
  } else {
    const slot = chooseNextSlot(updatedExtracted, userInput);
    if (!slot) {
      nextContent = questions.closing;
    } else {
      const template = SLOT_DEFS[slot].template;
      nextContent = await generateAdaptiveQuestion({
        sessionId,
        sessionStatus: session.status,
        guideQuestion: template,
        questionIndex: nextTurnCount,
        conversation: conversation
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        extracted: updatedExtracted,
      });
    }
  }

  await db.insert(messages).values({
    id: nanoid(12),
    sessionId,
    role: "assistant",
    content: nextContent,
  });

  // 4. session 更新。終了時は currentQuestionIndex を MAX_TURNS にして UI の "完了" ボタンを有効化。
  const updatedIndex =
    nextContent === questions.closing ? MAX_TURNS : nextTurnCount;

  const [updatedSession] = await db
    .update(sessions)
    .set({
      currentQuestionIndex: updatedIndex,
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
