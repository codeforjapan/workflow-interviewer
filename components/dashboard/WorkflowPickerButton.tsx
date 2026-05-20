"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type WorkflowOption = {
  slug: string;
  displayName: string;
  psidServiceCategory: string;
  psidLifecycle: string[];
  specRef: string;
  supported: boolean;
};

export function WorkflowPickerButton({ workflows }: { workflows: WorkflowOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startSession = async (slug: string) => {
    setCreating(slug);
    setError(null);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task_slug: slug }),
      });
      if (!res.ok) throw new Error(`failed: ${res.status}`);
      const data = (await res.json()) as { session: { id: string } };
      router.push(`/sessions/${data.session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
      setCreating(null);
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>新しいセッションを開始</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>業務を選んでセッションを開始</DialogTitle>
            <DialogDescription>
              KB に登録されている業務から 1 つ選んでください。MVP では印鑑登録のみがアクティブです。
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {workflows.map((wf) => {
              const isCreating = creating === wf.slug;
              return (
                <div
                  key={wf.slug}
                  className={`flex items-center justify-between gap-3 rounded border bg-card p-3 ${
                    wf.supported ? "" : "opacity-60"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-medium">{wf.displayName}</h3>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {wf.psidServiceCategory}
                      </Badge>
                      {wf.psidLifecycle.map((lc) => (
                        <Badge
                          key={lc}
                          variant="secondary"
                          className="shrink-0 text-[10px]"
                        >
                          {lc}
                        </Badge>
                      ))}
                      {!wf.supported && (
                        <Badge
                          variant="secondary"
                          className="shrink-0 bg-zinc-200 text-[10px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                        >
                          未対応
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {wf.specRef}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground/70">
                      slug: {wf.slug}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={wf.supported ? "default" : "outline"}
                    disabled={!wf.supported || creating !== null}
                    onClick={() => startSession(wf.slug)}
                  >
                    {isCreating ? "作成中..." : wf.supported ? "セッション開始" : "近日対応"}
                  </Button>
                </div>
              );
            })}
          </div>

          {error && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
