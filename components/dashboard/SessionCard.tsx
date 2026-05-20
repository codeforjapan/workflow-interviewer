"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ExtractedBusinessInfo } from "@/lib/db/schema";

interface SessionCardProps {
  id: string;
  status: "active" | "completed";
  extractedData: ExtractedBusinessInfo;
  category: string | null;
  summary: string | null;
  createdAt: Date;
  onViewFlow: (id: string) => void;
}

export function SessionCard({
  id,
  status,
  extractedData,
  category,
  summary,
  createdAt,
  onViewFlow,
}: SessionCardProps) {
  const title = extractedData.taskName ?? "無題のセッション";
  const displaySummary =
    summary ?? (extractedData.purpose ? `目的: ${extractedData.purpose}` : null);
  const stepCount = extractedData.steps.length;

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="line-clamp-2 text-base leading-snug">{title}</CardTitle>
          <Badge
            variant={status === "completed" ? "default" : "secondary"}
            className="shrink-0 text-xs"
          >
            {status === "completed" ? "完了" : "進行中"}
          </Badge>
        </div>
        {category && (
          <Badge variant="outline" className="w-fit text-xs">
            {category}
          </Badge>
        )}
      </CardHeader>

      <CardContent className="flex-1 space-y-2 pb-3">
        {displaySummary ? (
          <p className="line-clamp-3 text-sm text-zinc-600 dark:text-zinc-400">{displaySummary}</p>
        ) : (
          <p className="text-sm text-zinc-400 dark:text-zinc-600">概要はまだありません</p>
        )}
        {stepCount > 0 && (
          <p className="text-xs text-zinc-500">{stepCount} ステップ抽出済み</p>
        )}
        <p className="text-xs text-zinc-400">
          {new Date(createdAt).toLocaleDateString("ja-JP", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </p>
      </CardContent>

      <CardFooter className="flex gap-2 pt-0">
        <Link
          href={`/sessions/${id}`}
          className={cn(buttonVariants({ size: "sm" }), "flex-1 text-center")}
        >
          チャットを開く
        </Link>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onViewFlow(id)}
          disabled={extractedData.steps.length === 0}
        >
          フロー図
        </Button>
      </CardFooter>
    </Card>
  );
}
