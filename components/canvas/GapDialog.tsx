"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { ExtractedGap } from "@/lib/server/interview/schema";

const KIND_LABEL: Record<ExtractedGap["kind"], string> = {
  add: "標準にない独自運用 (add)",
  missing: "標準にあるが現場で未言及 (missing)",
  order: "対応するが順序が違う (order)",
  "local-rule": "意図は同じだがラベル/条件が異なる (local-rule)",
};

const KIND_CLASS: Record<ExtractedGap["kind"], string> = {
  add: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  missing: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
  order: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  "local-rule": "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
};

export function GapDialog({
  gap,
  onOpenChange,
  onSendMessage,
  sending = false,
}: {
  gap: ExtractedGap | null;
  onOpenChange: (open: boolean) => void;
  /** UX: このギャップについて気づいたことをそのままチャットに送る (通常のチャット送信と同じ経路)。
   *  省略時 (readonly セッションなど) は回答欄を表示しない。 */
  onSendMessage?: (text: string) => void;
  /** 送信中は入力・送信ボタンを無効化する (SessionView の sending state をそのまま渡す想定)。 */
  sending?: boolean;
}) {
  const [answer, setAnswer] = useState("");
  const [answerForGapId, setAnswerForGapId] = useState<string | null>(null);

  // gap が切り替わる (別のギャップを開く/閉じる) たびに入力欄をリセットする。
  // useEffect だと前のギャップの内容が1フレーム見えてしまうため、レンダー中に state を
  // 調整する React 推奨パターンを使う (https://react.dev/learn/you-might-not-need-an-effect)。
  if ((gap?.id ?? null) !== answerForGapId) {
    setAnswerForGapId(gap?.id ?? null);
    setAnswer("");
  }

  const handleSubmit = () => {
    const trimmed = answer.trim();
    if (!trimmed || !gap || !onSendMessage) return;
    onSendMessage(`【${gap.reason}】への回答: ${trimmed}`);
    setAnswer("");
  };

  return (
    <Dialog open={gap !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>ギャップ詳細</DialogTitle>
          <DialogDescription>
            {gap ? (
              <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${KIND_CLASS[gap.kind]}`}>
                {KIND_LABEL[gap.kind]}
              </span>
            ) : (
              ""
            )}
          </DialogDescription>
        </DialogHeader>
        {gap && (
          <div className="mt-2 space-y-3 text-sm">
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                判定理由
              </h3>
              <p className="mt-1 whitespace-pre-wrap leading-relaxed">{gap.reason}</p>
            </section>

            <section className="grid grid-cols-2 gap-3">
              {gap.standardStepRef && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    標準ノード参照
                  </h3>
                  <p className="mt-1 text-xs font-mono">{gap.standardStepRef}</p>
                </div>
              )}
              {gap.actualStepRef && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    抽出 step 参照
                  </h3>
                  <p className="mt-1 text-xs font-mono">{gap.actualStepRef}</p>
                </div>
              )}
            </section>

            {(gap.matchedKnownGap || gap.severity) && (
              <section className="flex flex-wrap gap-2">
                {gap.matchedKnownGap && (
                  <Badge variant="outline">既知ギャップ: {gap.matchedKnownGap}</Badge>
                )}
                {gap.severity && (
                  <Badge variant="outline">severity: {gap.severity}</Badge>
                )}
                <Badge variant="outline">id: {gap.id}</Badge>
              </section>
            )}

            {gap.kind === "missing" && onSendMessage && (
              <section className="space-y-2 border-t pt-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  気づいたことを回答する
                </h3>
                <p className="text-xs text-muted-foreground">
                  ここに入力して送信すると、通常のチャット回答と同じように扱われます。実務でこのステップが
                  行われていることが確認できると、このギャップは一覧から自動的に消えます。
                </p>
                <Textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="実際にどのように行っているか教えてください"
                  disabled={sending}
                  rows={3}
                  className="resize-none text-sm"
                />
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    disabled={sending || !answer.trim()}
                    onClick={handleSubmit}
                  >
                    {sending ? "送信中…" : "送信する"}
                  </Button>
                </div>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
