"use client";

import { useEffect, useRef } from "react";
import type { InferSelectModel } from "drizzle-orm";
import type { messages } from "@/lib/db/schema";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type Message = InferSelectModel<typeof messages>;

export function Transcript({ messages }: { messages: Message[] }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex flex-col gap-3 p-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
              m.role === "user"
                ? "self-end bg-zinc-900 text-white"
                : "self-start bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100",
            )}
          >
            {m.content}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </ScrollArea>
  );
}
