import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq, asc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sessions, messages } from "@/lib/db/schema";
import { loadStandardFlowSummary } from "@/lib/kb/loader";
import { computeInterviewProgress } from "@/lib/server/interview/progress";
import { SessionView } from "@/components/session/SessionView";

/**
 * 12 桁 ID の推測困難性のみで保護される読み取り専用ビュー。
 * 認証なしで他人と URL 共有できる。検索エンジンには載せない (noindex)。
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function SessionViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await db.query.sessions.findFirst({
    where: eq(sessions.id, id),
  });
  if (!session) notFound();

  const [initialMessages, standardFlow, initialProgress] = await Promise.all([
    db.query.messages.findMany({
      where: eq(messages.sessionId, id),
      orderBy: asc(messages.createdAt),
    }),
    loadStandardFlowSummary(session.taskSlug ?? ""),
    computeInterviewProgress({
      extracted: session.extractedData,
      turnCount: session.currentQuestionIndex,
      taskSlug: session.taskSlug,
    }),
  ]);

  return (
    <SessionView
      initialSession={session}
      initialMessages={initialMessages}
      initialProgress={initialProgress}
      standardFlow={standardFlow}
      readonly
    />
  );
}
