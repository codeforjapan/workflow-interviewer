import { desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sessions } from "@/lib/db/schema";
import { DashboardClient } from "@/components/dashboard/DashboardClient";

export default async function Home() {
  const allSessions = await db.query.sessions.findMany({
    orderBy: desc(sessions.createdAt),
  });

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">業務インタビュー</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            AI が業務についてヒアリングし、その場でフロー図を生成します。
          </p>
        </div>
        <DashboardClient sessions={allSessions} />
      </div>
    </div>
  );
}
