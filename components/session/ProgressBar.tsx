"use client";

import { CheckIcon, CircleIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { InterviewProgress } from "@/lib/server/interview/progress";

export function ProgressBar({
  progress,
  turnCount,
  maxTurns,
  completed,
}: {
  progress: InterviewProgress;
  turnCount: number;
  maxTurns: number;
  completed: boolean;
}) {
  const remainingToCap = Math.max(maxTurns - turnCount, 0);
  const ratio =
    progress.requiredTotalCount === 0
      ? 0
      : progress.requiredFilledCount / progress.requiredTotalCount;

  const statusText = completed
    ? "セッションは完了しています"
    : progress.readyToFinish
      ? "必須項目は揃いました。いつでも完了できます。"
      : progress.requiredFilledCount === progress.requiredTotalCount && !progress.minTurnsReached
        ? "必須項目は揃いましたが、最低ヒアリング回数に達していません"
        : `上限まで残り最大 ${remainingToCap} ターン（目安。必須項目が揃えば早く終えられます）`;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b bg-sky-50 px-6 py-2 dark:bg-sky-950/20">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-sky-900 dark:text-sky-200">
          必須項目 {progress.requiredFilledCount}/{progress.requiredTotalCount}
        </span>
        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-sky-200 dark:bg-sky-900">
          <div
            className="h-full bg-sky-600 transition-all"
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {progress.requiredSlots.map((slot) => (
          <Badge
            key={slot.key}
            variant={slot.filled ? "default" : "outline"}
            className={cn(
              "gap-1",
              slot.filled ? "bg-sky-700 text-white dark:bg-sky-600" : "text-muted-foreground",
            )}
            title={`${slot.label}: 充足度 ${Math.round(slot.completeness * 100)}%`}
          >
            {slot.filled ? <CheckIcon className="size-3" /> : <CircleIcon className="size-3" />}
            {slot.label}
          </Badge>
        ))}
      </div>

      {progress.nodeCoverage && (
        <span className="text-xs text-sky-900 dark:text-sky-200">
          本筋ステップ {progress.nodeCoverage.confirmedNodes}/{progress.nodeCoverage.totalNodes} 確認済み
          {progress.nodeCoverage.nextUnconfirmed &&
            ` ・ 次点: ${progress.nodeCoverage.nextUnconfirmed.label.replace(/\n/g, " ")}`}
        </span>
      )}

      <span className="text-xs text-sky-800/80 dark:text-sky-300/80">{statusText}</span>
    </div>
  );
}
