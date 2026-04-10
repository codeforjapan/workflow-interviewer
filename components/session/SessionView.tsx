"use client";

import { useState } from "react";
import type { InferSelectModel } from "drizzle-orm";
import type { sessions, messages } from "@/lib/db/schema";
import { Transcript } from "@/components/chat/Transcript";
import { ChatInput } from "@/components/chat/ChatInput";
import { FlowCanvas } from "@/components/canvas/FlowCanvas";
import { Button } from "@/components/ui/button";
import { TOTAL_QUESTIONS } from "@/lib/server/interview/questions";

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
  const allQuestionsAsked = session.currentQuestionIndex >= TOTAL_QUESTIONS;

  const completeSession = async () => {
    const res = await fetch(`/api/sessions/${session.id}/complete`, { method: "POST" });
    if (!res.ok) return;
    const data = (await res.json()) as { session: Session };
    setSession(data.session);
    downloadJson(data.session);
  };

  const downloadJson = (s: Session) => {
    const payload = {
      sessionId: s.id,
      completedAt: s.updatedAt,
      data: s.extractedData,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `session-${s.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
      <header className="flex items-center justify-between border-b bg-white px-6 py-3 dark:bg-zinc-950">
        <div>
          <h1 className="text-lg font-semibold">業務インタビュー</h1>
          <p className="text-xs text-zinc-500">
            セッション {session.id} ・ 進捗 {session.currentQuestionIndex} / {TOTAL_QUESTIONS}
            {isFinished && " ・ 完了"}
          </p>
        </div>
        <div className="flex gap-2">
          {isFinished ? (
            <Button variant="outline" onClick={() => downloadJson(session)}>
              JSON を再ダウンロード
            </Button>
          ) : (
            <Button onClick={completeSession} disabled={!allQuestionsAsked}>
              完了して JSON 出力
            </Button>
          )}
        </div>
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
