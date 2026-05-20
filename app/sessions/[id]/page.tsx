import { notFound } from "next/navigation";
import { eq, asc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sessions, messages } from "@/lib/db/schema";
import { loadStandardFlowSummary } from "@/lib/kb/loader";
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

  return (
    <SessionView
      initialSession={session}
      initialMessages={initialMessages}
      standardFlow={standardFlow}
    />
  );
}
