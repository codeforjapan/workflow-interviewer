"use client";

import { useState } from "react";
import type { InferSelectModel } from "drizzle-orm";
import type { sessions, messages } from "@/lib/db/schema";
import { Transcript } from "@/components/chat/Transcript";
import { ChatInput } from "@/components/chat/ChatInput";
import { FlowCanvas } from "@/components/canvas/FlowCanvas";

type Session = InferSelectModel<typeof sessions>;
type Message = InferSelectModel<typeof messages>;

export function SessionView({
  initialSession,
  initialMessages,
}: {
  initialSession: Session;
  initialMessages: Message[];
}) {
  const [session, setSession] = useState(initialSession);
  const [msgs, setMsgs] = useState(initialMessages);
  const [sending, setSending] = useState(false);

  const isFinished = session.status === "completed";

  const sendMessage = async (content: string) => {
    setSending(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error(`failed: ${res.status}`);
      const data = (await res.json()) as { session: Session; messages: Message[] };
      setSession(data.session);
      setMsgs(data.messages);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="border-b bg-white px-6 py-3 dark:bg-zinc-950">
        <h1 className="text-lg font-semibold">業務インタビュー</h1>
        <p className="text-xs text-zinc-500">
          セッション {session.id} ・ 進捗 {session.currentQuestionIndex} / 5
        </p>
      </header>
      <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
        <section className="flex flex-col border-r">
          <Transcript messages={msgs} />
          <ChatInput onSend={sendMessage} disabled={sending || isFinished} />
        </section>
        <section className="relative">
          <FlowCanvas extracted={session.extractedData} />
        </section>
      </div>
    </div>
  );
}
