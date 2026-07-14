import { notFound } from "next/navigation";
import { eq, asc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sessions, messages } from "@/lib/db/schema";
import { loadStandardFlowSummary } from "@/lib/kb/loader";
import { computeInterviewProgress } from "@/lib/server/interview/progress";
import { SessionView } from "@/components/session/SessionView";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await db.query.sessions.findFirst({
    where: eq(sessions.id, id),
  });
  if (!session) notFound();

  const [initialMessages, standardFlow] = await Promise.all([
    db.query.messages.findMany({
      where: eq(messages.sessionId, id),
      orderBy: asc(messages.createdAt),
    }),
    loadStandardFlowSummary(session.taskSlug ?? ""),
  ]);
  // サーキットブレーカー (applyAskLimit) 判定に必要なメッセージ履歴を渡すため、
  // messages 取得後に実行する (以前は Promise.all で並列実行していたが、ここでは依存関係がある)。
  const initialProgress = await computeInterviewProgress({
    extracted: session.extractedData,
    turnCount: session.currentQuestionIndex,
    taskSlug: session.taskSlug,
    messages: initialMessages,
  });

  return (
    <SessionView
      initialSession={session}
      initialMessages={initialMessages}
      initialProgress={initialProgress}
      standardFlow={standardFlow}
    />
  );
}
