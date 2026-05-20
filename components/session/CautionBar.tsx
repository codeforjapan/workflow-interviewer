"use client";

import { useState } from "react";
import { AlertTriangleIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CautionFlag } from "@/lib/server/interview/schema";

type ConceptModalData = {
  conceptId: string;
  conceptName: string;
  slug: string;
  divergenceScope: string[];
  focusSections: Array<{ heading: string; body: string }>;
};

const SOURCE_LABEL: Record<CautionFlag["matches"][number]["source"], string> = {
  steps: "業務手順",
  exceptions: "例外フロー",
  connections: "他業務との連携",
};

export function CautionBar({ flags }: { flags: CautionFlag[] }) {
  const [active, setActive] = useState<CautionFlag | null>(null);
  const [content, setContent] = useState<ConceptModalData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (flags.length === 0) return null;

  const openModal = async (flag: CautionFlag) => {
    setActive(flag);
    setContent(null);
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/concepts/${flag.conceptSlug}`);
      if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
      const data = (await res.json()) as ConceptModalData;
      setContent(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b bg-amber-50 px-6 py-2 dark:bg-amber-950/30">
        <AlertTriangleIcon className="size-4 text-amber-700 dark:text-amber-400" />
        <span className="text-xs text-amber-800 dark:text-amber-300">
          制度ごとに定義が異なる概念が検出されました。AI の自動推論を避けて職員確認が推奨されます:
        </span>
        {flags.map((flag) => (
          <button
            key={flag.conceptId}
            type="button"
            onClick={() => openModal(flag)}
            className="cursor-pointer"
          >
            <Badge
              variant="secondary"
              className="bg-amber-100 text-amber-900 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-100"
            >
              「{flag.conceptName}」({flag.matches.length} 箇所)
            </Badge>
          </button>
        ))}
      </div>

      <Dialog
        open={active !== null}
        onOpenChange={(open) => {
          if (!open) {
            setActive(null);
            setContent(null);
            setError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {active ? `「${active.conceptName}」について` : ""}
            </DialogTitle>
            <DialogDescription>
              {active
                ? `${active.conceptId} は制度間で定義が異なる概念です。窓口担当の文脈に合わせて慎重に解釈してください。`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {active && (
            <div className="mt-2 space-y-3 max-h-[60vh] overflow-y-auto text-sm">
              {/* 検出箇所 */}
              <section className="rounded border bg-muted/30 p-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  抽出データで検出された箇所
                </h3>
                <ul className="mt-2 space-y-1">
                  {active.matches.map((m, idx) => (
                    <li key={idx} className="text-xs">
                      <span className="font-medium text-amber-700 dark:text-amber-400">
                        [{SOURCE_LABEL[m.source]} / {m.sourceId}]
                      </span>{" "}
                      {m.text}{" "}
                      <span className="text-muted-foreground">(語: {m.term})</span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* KB content */}
              {loading && <p className="text-xs text-muted-foreground">KB を読み込み中...</p>}
              {error && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  KB 取得に失敗しました: {error}
                </p>
              )}
              {content && (
                <>
                  {content.divergenceScope.length > 0 && (
                    <section>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        定義が分岐する制度
                      </h3>
                      <ul className="mt-1 list-disc list-inside space-y-0.5 text-xs">
                        {content.divergenceScope.map((scope, i) => (
                          <li key={i}>{scope}</li>
                        ))}
                      </ul>
                    </section>
                  )}
                  {content.focusSections.map((s) => (
                    <section key={s.heading}>
                      <h3 className="text-sm font-semibold">{s.heading}</h3>
                      <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-muted-foreground">
                        {s.body}
                      </pre>
                    </section>
                  ))}
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
