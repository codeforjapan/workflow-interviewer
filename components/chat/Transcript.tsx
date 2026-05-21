"use client";

import { useEffect, useRef } from "react";
import type { InferSelectModel } from "drizzle-orm";
import type { messages } from "@/lib/db/schema";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type Message = InferSelectModel<typeof messages>;

const OTHER_LABEL = "その他";

export function Transcript({
  messages,
  onChoiceClick,
  disabled,
}: {
  messages: Message[];
  /** 選択肢ボタンが押されたときのコールバック。
   *  通常選択肢は引数のテキストをそのまま送信、null は「その他」(自由入力フォーカス)。 */
  onChoiceClick?: (choice: string | null) => void;
  /** チャット送信中などで選択肢を無効化したい場合 */
  disabled?: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // 最後の assistant メッセージのみで choices を有効化する。
  // 職員が次の発話 (user message) を返したら既に応答済みなので非表示。
  const lastMessage = messages[messages.length - 1];
  const choicesActiveOnId =
    lastMessage && lastMessage.role === "assistant" &&
    (lastMessage.meta?.choices?.length ?? 0) > 0
      ? lastMessage.id
      : null;

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex flex-col gap-3 p-4">
        {messages.map((m) => {
          const isAssistant = m.role === "assistant";
          const choices = m.meta?.choices ?? [];
          const showChoices =
            isAssistant && m.id === choicesActiveOnId && choices.length > 0;
          return (
            <div
              key={m.id}
              className={cn(
                "flex flex-col gap-2",
                isAssistant ? "items-start" : "items-end",
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                  m.role === "user"
                    ? "bg-zinc-900 text-white"
                    : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100",
                )}
              >
                {m.content}
              </div>
              {showChoices && (
                <div className="flex max-w-[85%] flex-wrap gap-1.5">
                  {choices.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => onChoiceClick?.(c)}
                      disabled={disabled || !onChoiceClick}
                      className="rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      {c}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => onChoiceClick?.(null)}
                    disabled={disabled || !onChoiceClick}
                    className="rounded-full border border-dashed border-zinc-300 bg-white px-3 py-1 text-xs text-zinc-600 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    title="自由入力で答える"
                  >
                    {OTHER_LABEL}
                  </button>
                </div>
              )}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
    </ScrollArea>
  );
}
