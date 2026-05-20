"use client";

import { useEffect, useRef, useState } from "react";

export type StandardFlowSummary = {
  slug: string;
  displayName: string;
  mermaidSources: string[];
};

/**
 * Mermaid 公式ライブラリで mermaid ソースを SVG に変換して表示する。
 * - mermaid は ESM 1MB+ なので dynamic import で SSR を回避
 * - 各ブロックを順番に render し、エラーは中身を <pre> で fallback 表示
 */
export function StandardFlowPanel({
  standardFlow,
}: {
  standardFlow: StandardFlowSummary | null;
}) {
  if (!standardFlow) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-xs text-muted-foreground">
        この業務には KB の標準フローが登録されていません。
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b bg-card px-4 py-2">
        <h2 className="text-sm font-semibold">{standardFlow.displayName} 標準フロー</h2>
        <p className="text-[10px] text-muted-foreground">
          KB: {standardFlow.slug} ・ {standardFlow.mermaidSources.length} ブロック
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {standardFlow.mermaidSources.length === 0 && (
          <p className="text-xs text-muted-foreground">
            mermaid ブロックが見つかりませんでした。
          </p>
        )}
        {standardFlow.mermaidSources.map((src, i) => (
          <MermaidBlock key={`${standardFlow.slug}-${i}`} index={i} source={src} />
        ))}
      </div>
    </div>
  );
}

function MermaidBlock({ index, source }: { index: number; source: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setRendered(false);
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "neutral",
          flowchart: { useMaxWidth: true, htmlLabels: true },
          securityLevel: "loose",
        });
        const id = `mermaid-${index}-${Math.random().toString(36).slice(2, 9)}`;
        const { svg } = await mermaid.render(id, source);
        if (cancelled) return;
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
        setRendered(true);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [index, source]);

  return (
    <section className="mb-4 last:mb-0">
      <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        block #{index + 1}
      </h3>
      {error ? (
        <div className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-700 dark:border-red-700 dark:bg-red-950/30 dark:text-red-300">
          <p className="font-medium">Mermaid 描画失敗</p>
          <p className="mt-0.5 break-all">{error}</p>
          <pre className="mt-2 max-h-40 overflow-auto rounded bg-white p-2 text-[10px] dark:bg-zinc-900">
            {source}
          </pre>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="overflow-x-auto rounded border bg-white p-2 dark:bg-zinc-900"
        >
          {!rendered && (
            <p className="text-xs text-muted-foreground">描画中...</p>
          )}
        </div>
      )}
    </section>
  );
}
