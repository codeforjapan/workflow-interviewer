import { desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sessions } from "@/lib/db/schema";
import { listAllWorkflows } from "@/lib/kb/loader";
import { DashboardClient } from "@/components/dashboard/DashboardClient";

// D1: MVP では inkan-toroku のみがアクティブ。他の業務は未対応 badge で表示。
const SUPPORTED_SLUGS = new Set(["inkan-toroku"]);

export default async function Home() {
  const [allSessions, workflows] = await Promise.all([
    db.query.sessions.findMany({ orderBy: desc(sessions.createdAt) }),
    listAllWorkflows(),
  ]);

  const workflowOptions = workflows
    .map((w) => ({ ...w, supported: SUPPORTED_SLUGS.has(w.slug) }))
    // サポート済みを先頭に、その後はスラッグ順
    .sort((a, b) => {
      if (a.supported !== b.supported) return a.supported ? -1 : 1;
      return a.slug.localeCompare(b.slug);
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
        <DashboardClient sessions={allSessions} workflows={workflowOptions} />
      </div>
    </div>
  );
}
