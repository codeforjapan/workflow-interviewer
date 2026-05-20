"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { InferSelectModel } from "drizzle-orm";
import type { FlowLayout, sessions, messages } from "@/lib/db/schema";
import { Transcript } from "@/components/chat/Transcript";
import { ChatInput } from "@/components/chat/ChatInput";
import { FlowCanvas } from "@/components/canvas/FlowCanvas";
import { Button } from "@/components/ui/button";
import { CautionBar } from "@/components/session/CautionBar";
import { MAX_TURNS } from "@/lib/server/interview/slots";

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
  const [flowSaveState, setFlowSaveState] = useState<"idle" | "saving" | "error">("idle");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const flowSaveTimerRef = useRef<number | null>(null);
  const latestFlowLayoutRef = useRef<FlowLayout | null>(null);

  const isFinished = session.status === "completed";
  const allQuestionsAsked = session.currentQuestionIndex >= MAX_TURNS;

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

  const [error, setError] = useState<string | null>(null);

  const persistFlowLayout = useCallback(
    async (layout: FlowLayout) => {
      setFlowSaveState("saving");
      try {
        const res = await fetch(`/api/sessions/${session.id}/flow`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(layout),
        });
        if (!res.ok) {
          throw new Error(`flow save failed: ${res.status}`);
        }
        const data = (await res.json()) as { session: Session };
        setSession(data.session);
        setFlowSaveState("idle");
      } catch {
        setFlowSaveState("error");
      }
    },
    [session.id],
  );

  const handleFlowChange = useCallback(
    (layout: FlowLayout) => {
      latestFlowLayoutRef.current = layout;
      setSession((prev) => ({ ...prev, flowLayout: layout }));
      if (flowSaveTimerRef.current) {
        window.clearTimeout(flowSaveTimerRef.current);
      }
      flowSaveTimerRef.current = window.setTimeout(() => {
        const next = latestFlowLayoutRef.current;
        if (!next) return;
        void persistFlowLayout(next);
      }, 400);
    },
    [persistFlowLayout],
  );

  useEffect(() => {
    return () => {
      if (flowSaveTimerRef.current) {
        window.clearTimeout(flowSaveTimerRef.current);
      }
    };
  }, []);

  const sendMessage = async (content: string) => {
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${session.id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const body = await res.text();
        console.error("message POST failed", res.status, body);
        throw new Error(`${res.status}: ${body.slice(0, 300)}`);
      }
      const data = (await res.json()) as { session: Session; messages: Message[] };
      setSession(data.session);
      setMsgs(data.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    } finally {
      setSending(false);
    }
  };

  const selectedNodeDetail = (() => {
    if (!selectedNodeId) return null;
    if (selectedNodeId === "task") {
      return {
        title: "業務概要ノード",
        lines: [
          `業務名: ${session.extractedData.taskName ?? "未抽出"}`,
          `目的: ${session.extractedData.purpose ?? "未抽出"}`,
          `根拠法令: ${session.extractedData.legalBasis ?? "未抽出"}`,
          `関係者: ${session.extractedData.stakeholders.join("、") || "未抽出"}`,
        ],
      };
    }
    if (selectedNodeId.startsWith("group:")) {
      const groupId = selectedNodeId.slice("group:".length);
      const group = session.flowLayout.groups.find((item) => item.id === groupId);
      return {
        title: "グループノード",
        lines: [
          `グループ名: ${group?.label ?? "不明"}`,
          `対象ノード数: ${group?.nodeIds.length ?? 0}`,
          `対象ノードID: ${group?.nodeIds.join(", ") || "なし"}`,
        ],
      };
    }
    const sortedSteps = [...session.extractedData.steps].sort((a, b) => a.order - b.order);
    const step = sortedSteps.find((item) => item.id === selectedNodeId);
    if (!step) {
      return {
        title: "ノード詳細",
        lines: [`ノードID: ${selectedNodeId}`, "このノードの詳細は見つかりませんでした。"],
      };
    }
    return {
      title: `ステップノード (${step.id})`,
      lines: [
        `順序: ${step.order}`,
        `ラベル: ${step.label}`,
        `関連グループ: ${
          session.flowLayout.groups
            .filter((group) => group.nodeIds.includes(step.id))
            .map((group) => group.label)
            .join("、") || "なし"
        }`,
      ],
    };
  })();

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b bg-white px-6 py-3 dark:bg-zinc-950">
        <div>
          <h1 className="text-lg font-semibold">業務インタビュー</h1>
          <p className="text-xs text-zinc-500">
            セッション {session.id} ・ ターン {Math.min(session.currentQuestionIndex, MAX_TURNS)} / {MAX_TURNS}
            {isFinished && " ・ 完了"}
          </p>
          {flowSaveState === "saving" && <p className="text-xs text-zinc-500">フローを保存中...</p>}
          {flowSaveState === "error" && (
            <p className="text-xs text-red-600 dark:text-red-400">フローの保存に失敗しました</p>
          )}
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
      <CautionBar flags={session.extractedData.cautionFlags ?? []} />
      <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
        <section className="flex min-h-0 flex-col border-r">
          <Transcript messages={msgs} />
          {error && (
            <div className="border-t bg-red-50 px-4 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}
          <ChatInput onSend={sendMessage} disabled={sending || isFinished} />
        </section>
        <section className="relative">
          <FlowCanvas
            extracted={session.extractedData}
            flowLayout={session.flowLayout}
            onFlowChange={handleFlowChange}
            onNodeSelect={setSelectedNodeId}
          />
        </section>
      </div>
      {selectedNodeDetail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSelectedNodeId(null)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold">{selectedNodeDetail.title}</h2>
            <div className="mt-3 space-y-2 text-sm text-zinc-700 dark:text-zinc-200">
              {selectedNodeDetail.lines.map((line) => (
                <p key={line} className="whitespace-pre-wrap">
                  {line}
                </p>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <Button variant="outline" onClick={() => setSelectedNodeId(null)}>
                閉じる
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
