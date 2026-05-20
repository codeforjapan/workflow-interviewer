"use client";

import { useEffect, useState } from "react";
import { CheckIcon, CopyIcon, LinkIcon } from "lucide-react";

/**
 * セッションヘッダ用の「読み取り専用 URL を共有」コピー機能。
 * クライアント側で window.location から /view URL を組み立ててクリップボードへ。
 */
export function ShareUrlBox({ sessionId }: { sessionId: string }) {
  const [url, setUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setUrl(`${window.location.origin}/sessions/${sessionId}/view`);
  }, [sessionId]);

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 一部ブラウザで失敗する可能性があるが、表示は維持する
    }
  };

  return (
    <div className="hidden items-center gap-2 rounded-md border bg-card px-2 py-1 text-xs md:flex">
      <LinkIcon className="size-3 text-muted-foreground" />
      <span className="max-w-[220px] truncate font-mono text-muted-foreground">
        {url || "URL 取得中..."}
      </span>
      <button
        type="button"
        onClick={copy}
        disabled={!url}
        className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium hover:bg-zinc-200 disabled:opacity-50 dark:hover:bg-zinc-700"
        title="共有 URL をコピー"
      >
        {copied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
        {copied ? "コピー済" : "コピー"}
      </button>
    </div>
  );
}
