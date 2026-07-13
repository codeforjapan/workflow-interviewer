"use client";

import { useEffect, useRef, useState } from "react";
import {
  Maximize2Icon,
  MinusIcon,
  PlusIcon,
  RotateCcwIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { MessageMeta } from "@/lib/db/schema";
import { preprocessMermaidSource } from "./mermaid-preprocess";

/** mermaid が生成するノード DOM id ("...-flowchart-<rawId>-<counter>") を
 *  特定するためのクラス名。app/globals.css 側でハイライトスタイルを定義する。 */
const ACTIVE_NODE_CLASS = "ux6-target-node";

/** rawId を含む node id のサフィックスを見つけるための正規表現エスケープ */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const SCALE_STEP = 1.25;

export type StandardFlowSummary = {
  slug: string;
  displayName: string;
  mermaidSources: string[];
};

/**
 * Mermaid 公式ライブラリで mermaid ソースを SVG に変換して表示する。
 * - mermaid は ESM 1MB+ なので dynamic import で SSR を回避
 * - レンダ結果は state に格納し dangerouslySetInnerHTML 経由で React 管理下に置く
 *   (innerHTML を直接書くと React の reconcile と衝突して removeChild エラーになる)
 */
export function StandardFlowPanel({
  standardFlow,
  activeTargetNode = null,
}: {
  standardFlow: StandardFlowSummary | null;
  /** UX6: 現在の質問が対象にしている標準フローノード。あればそのノードをハイライトする。 */
  activeTargetNode?: MessageMeta["targetNode"] | null;
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
          <MermaidBlock
            key={`${standardFlow.slug}-${i}`}
            index={i}
            source={src}
            activeRawId={activeTargetNode?.blockIndex === i ? activeTargetNode.rawId : null}
          />
        ))}
      </div>
    </div>
  );
}

type BlockState =
  | { status: "loading" }
  | { status: "ready"; svg: string }
  | { status: "error"; message: string };

function MermaidBlock({
  index,
  source,
  activeRawId = null,
}: {
  index: number;
  source: string;
  /** UX6: このブロック内でハイライトすべきノードの mermaid 生 id */
  activeRawId?: string | null;
}) {
  const [state, setState] = useState<BlockState>({ status: "loading" });
  const [zoomOpen, setZoomOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const inlineContainerRef = useRef<HTMLDivElement | null>(null);
  const dialogContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
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
        const cleaned = preprocessMermaidSource(source);
        const { svg } = await mermaid.render(id, cleaned);
        if (cancelled) return;
        setState({ status: "ready", svg });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setState({ status: "error", message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [index, source]);

  // UX6: SVG は dangerouslySetInnerHTML で React 管理外に置かれるため、
  // ハイライトの付け外しは DOM を直接操作する (React の再レンダには乗らない)。
  useEffect(() => {
    if (state.status !== "ready") return;
    for (const container of [inlineContainerRef.current, dialogContainerRef.current]) {
      if (!container) continue;
      for (const el of container.querySelectorAll(`.${ACTIVE_NODE_CLASS}`)) {
        el.classList.remove(ACTIVE_NODE_CLASS);
      }
      if (!activeRawId) continue;
      const suffixRe = new RegExp(`flowchart-${escapeRegExp(activeRawId)}-\\d+$`);
      for (const el of container.querySelectorAll("[id]")) {
        if (suffixRe.test(el.id)) el.classList.add(ACTIVE_NODE_CLASS);
      }
    }
  }, [state, activeRawId, zoomOpen]);

  return (
    <section className="mb-4 last:mb-0">
      <h3 className="mb-1 text-xs font-semibold text-muted-foreground">
        ケース{index + 1}
      </h3>
      {state.status === "error" ? (
        <div className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-700 dark:border-red-700 dark:bg-red-950/30 dark:text-red-300">
          <p className="font-medium">Mermaid 描画失敗</p>
          <p className="mt-0.5 break-all">{state.message}</p>
          <pre className="mt-2 max-h-40 overflow-auto rounded bg-white p-2 text-[10px] dark:bg-zinc-900">
            {source}
          </pre>
        </div>
      ) : state.status === "loading" ? (
        <div className="overflow-x-auto rounded border bg-white p-2 dark:bg-zinc-900">
          <p className="text-xs text-muted-foreground">描画中...</p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setScale(1);
            setZoomOpen(true);
          }}
          className="group relative block w-full cursor-zoom-in overflow-x-auto rounded border bg-white p-2 text-left dark:bg-zinc-900"
          title="クリックで拡大表示"
        >
          <span
            className="pointer-events-none absolute right-2 top-2 inline-flex items-center gap-0.5 rounded bg-zinc-900/70 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-0 transition group-hover:opacity-100"
          >
            <Maximize2Icon className="size-3" />
            拡大
          </span>
          <div
            ref={inlineContainerRef}
            // mermaid の出力 SVG を React 管理下に置く。
            // 直接 innerHTML で書くと、再レンダ時に removeChild が失敗する。
            dangerouslySetInnerHTML={{ __html: state.svg }}
          />
        </button>
      )}

      {state.status === "ready" && (
        <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
          <DialogContent className="flex h-[90vh] max-w-[min(1400px,95vw)] flex-col gap-2 sm:max-w-[min(1400px,95vw)]">
            <DialogHeader>
              <DialogTitle>
                ケース{index + 1} ・ {(scale * 100).toFixed(0)}%
              </DialogTitle>
            </DialogHeader>
            <div className="flex gap-1 border-b pb-2">
              <button
                type="button"
                onClick={() => setScale((s) => Math.max(MIN_SCALE, s / SCALE_STEP))}
                disabled={scale <= MIN_SCALE + 1e-6}
                className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                title="縮小"
              >
                <MinusIcon className="size-3" />
              </button>
              <button
                type="button"
                onClick={() => setScale((s) => Math.min(MAX_SCALE, s * SCALE_STEP))}
                disabled={scale >= MAX_SCALE - 1e-6}
                className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                title="拡大"
              >
                <PlusIcon className="size-3" />
              </button>
              <button
                type="button"
                onClick={() => setScale(1)}
                className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-muted"
                title="100% に戻す"
              >
                <RotateCcwIcon className="size-3" />
                100%
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto rounded border bg-white p-4 dark:bg-zinc-900">
              <div
                ref={dialogContainerRef}
                style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}
                className="inline-block"
                dangerouslySetInnerHTML={{ __html: state.svg }}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
