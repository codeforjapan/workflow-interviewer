"use client";

import type { KeyboardEvent, RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function ChatInput({
  value,
  onChange,
  onSend,
  disabled,
  textareaRef,
  selectedChoices = [],
  onRemoveChoice,
}: {
  /** 入力中のテキスト（親でステート管理し、選択肢との合成に使う） */
  value: string;
  onChange: (value: string) => void;
  /** 送信ボタン押下時のコールバック。現在の value / selectedChoices は親側で合成する。 */
  onSend: () => void | Promise<void>;
  disabled?: boolean;
  /** SessionView 側から「その他」クリックでフォーカスするための ref */
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  /** 選択肢ボタンで選択中の項目。送信時にテキストと合成される。 */
  selectedChoices?: string[];
  /** 選択中の項目をチップから外すためのコールバック */
  onRemoveChoice?: (choice: string) => void;
}) {
  const canSubmit = !disabled && (value.trim().length > 0 || selectedChoices.length > 0);

  const submit = async () => {
    if (!canSubmit) return;
    await onSend();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <div className="border-t p-3">
      {selectedChoices.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selectedChoices.map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-1 rounded-full bg-zinc-900 px-2.5 py-0.5 text-xs text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              {c}
              <button
                type="button"
                onClick={() => onRemoveChoice?.(c)}
                disabled={disabled || !onRemoveChoice}
                aria-label={`${c} を選択解除`}
                className="text-white/70 hover:text-white disabled:cursor-not-allowed dark:text-zinc-900/60 dark:hover:text-zinc-900"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="メッセージを入力 (⌘/Ctrl + Enter で送信)"
          disabled={disabled}
          rows={2}
          className="flex-1 resize-none"
        />
        <Button onClick={submit} disabled={!canSubmit}>
          送信
        </Button>
      </div>
    </div>
  );
}
