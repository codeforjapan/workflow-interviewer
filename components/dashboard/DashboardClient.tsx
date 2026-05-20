"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SessionCard } from "./SessionCard";
import { FlowPreviewDialog } from "./FlowPreviewDialog";
import { NewSessionButton } from "./NewSessionButton";
import type { ExtractedBusinessInfo, FlowLayout } from "@/lib/db/schema";

const CATEGORIES = [
  "すべて",
  "申請・届出",
  "許認可",
  "税務",
  "福祉・介護",
  "都市計画・建設",
  "教育・文化",
  "その他",
] as const;

interface Session {
  id: string;
  status: "active" | "completed";
  extractedData: ExtractedBusinessInfo;
  flowLayout: FlowLayout;
  category: string | null;
  summary: string | null;
  createdAt: Date;
}

interface DashboardClientProps {
  sessions: Session[];
}

export function DashboardClient({ sessions }: DashboardClientProps) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("すべて");
  const [previewSessionId, setPreviewSessionId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      const title = s.extractedData.taskName ?? "";
      const summaryText = s.summary ?? s.extractedData.purpose ?? "";
      const matchesSearch =
        search.trim() === "" ||
        title.toLowerCase().includes(search.toLowerCase()) ||
        summaryText.toLowerCase().includes(search.toLowerCase());
      const matchesCategory =
        selectedCategory === "すべて" || s.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [sessions, search, selectedCategory]);

  return (
    <div className="flex flex-col gap-6">
      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          placeholder="業務名・概要で検索..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <NewSessionButton />
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <Button
            key={cat}
            variant={selectedCategory === cat ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedCategory(cat)}
          >
            {cat}
          </Button>
        ))}
      </div>

      {/* Cards grid */}
      {filtered.length === 0 ? (
        <div className="py-20 text-center text-sm text-zinc-500">
          {sessions.length === 0
            ? "まだセッションがありません。「新しいセッションを開始」から始めてください。"
            : "条件に一致するセッションがありません。"}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <SessionCard
              key={s.id}
              id={s.id}
              status={s.status}
              extractedData={s.extractedData}
              category={s.category}
              summary={s.summary}
              createdAt={s.createdAt}
              onViewFlow={setPreviewSessionId}
            />
          ))}
        </div>
      )}

      <FlowPreviewDialog
        sessionId={previewSessionId}
        onClose={() => setPreviewSessionId(null)}
      />
    </div>
  );
}
