import { desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sessions } from "@/lib/db/schema";
import { listAllWorkflows } from "@/lib/kb/loader";
import { DashboardClient } from "@/components/dashboard/DashboardClient";

export default async function Home() {
  const [allSessions, workflows] = await Promise.all([
    db.query.sessions.findMany({ orderBy: desc(sessions.createdAt) }),
    listAllWorkflows(),
  ]);

  // KB に flow-standard.md がある業務は全て選択可能にする。
  // KB authoring 状況により creates_risks / gap-notes 等が未整備の業務でも、
  // パイプライン側 (B2/B3/C1/C2) は欠落時に passthrough する設計なので動作する。
  const workflowOptions = workflows
    .map((w) => ({ ...w, supported: true }))
    .sort((a, b) => a.slug.localeCompare(b.slug));

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
