"use client";

import type { KeyboardEvent, RefObject } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function ChatInput({
  onSend,
  disabled,
  textareaRef,
}: {
  onSend: (content: string) => void | Promise<void>;
  disabled?: boolean;
  /** SessionView 側から「その他」クリックでフォーカスするための ref */
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
}) {
  const [value, setValue] = useState("");

  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    setValue("");
    await onSend(trimmed);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <div className="border-t p-3">
      <div className="flex gap-2">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="メッセージを入力 (⌘/Ctrl + Enter で送信)"
          disabled={disabled}
          rows={2}
          className="flex-1 resize-none"
        />
        <Button onClick={submit} disabled={disabled || !value.trim()}>
          送信
        </Button>
      </div>
    </div>
  );
}
