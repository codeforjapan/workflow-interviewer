"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { InferSelectModel } from "drizzle-orm";
import { ArrowLeftIcon } from "lucide-react";
import type { FlowLayout, sessions, messages } from "@/lib/db/schema";
import { Transcript } from "@/components/chat/Transcript";
import { ChatInput } from "@/components/chat/ChatInput";
import { FlowCanvas } from "@/components/canvas/FlowCanvas";
import { Button } from "@/components/ui/button";
import { CautionBar } from "@/components/session/CautionBar";
import { ProgressBar } from "@/components/session/ProgressBar";
import { ShareUrlBox } from "@/components/session/ShareUrlBox";
import {
  StandardFlowPanel,
  type StandardFlowSummary,
} from "@/components/session/StandardFlowPanel";
import type { InterviewProgress } from "@/lib/server/interview/progress";
import { MAX_TURNS } from "@/lib/server/interview/slots";

type Session = InferSelectModel<typeof sessions>;
type Message = InferSelectModel<typeof messages>;

type LayoutTab = "standard" | "chat" | "canvas";

export function SessionView({
  initialSession,
  initialMessages,
  initialProgress,
  standardFlow,
  readonly = false,
}: {
  initialSession: Session;
  initialMessages: Message[];
  initialProgress: InterviewProgress;
  standardFlow: StandardFlowSummary | null;
  /** D4: 共有用 /sessions/[id]/view からの呼び出し時に編集系 UI を全て隠す */
  readonly?: boolean;
}) {
  const [session, setSession] = useState(initialSession);
  const [msgs, setMsgs] = useState(initialMessages);
  const [progress, setProgress] = useState(initialProgress);
  const [sending, setSending] = useState(false);
  // 追い質問本文のストリーミング途中経過。null = 非表示、"" = 応答待ち中（本文未着手）。
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [flowSaveState, setFlowSaveState] = useState<"idle" | "saving" | "error">("idle");
  const [gapRecomputeState, setGapRecomputeState] = useState<"idle" | "running" | "error">(
    "idle",
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedChoices, setSelectedChoices] = useState<string[]>([]);
  const [chatValue, setChatValue] = useState("");
  const [activeTab, setActiveTab] = useState<LayoutTab>("chat");
  const flowSaveTimerRef = useRef<number | null>(null);
  const latestFlowLayoutRef = useRef<FlowLayout | null>(null);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const wasSendingRef = useRef(false);

  const isFinished = session.status === "completed";
  // UX3: MAX_TURNS到達は絶対上限としての完了可否。progress.readyToFinish は
  // 必須スロット充足 + 最低ヒアリング回数を満たした早期終了の完了可否。
  const atMaxTurns = session.currentQuestionIndex >= MAX_TURNS;
  const canComplete = atMaxTurns || progress.readyToFinish;

  const completeSession = async () => {
    const res = await fetch(`/api/sessions/${session.id}/complete`, { method: "POST" });
    if (!res.ok) return;
    const data = (await res.json()) as { session: Session; progress: InterviewProgress };
    setSession(data.session);
    setProgress(data.progress);
    // D5: 完了時に Markdown レポート + 拡張 JSON を順番にダウンロード
    triggerExportDownload(data.session.id, "md");
    triggerExportDownload(data.session.id, "json");
  };

  const downloadReports = () => {
    triggerExportDownload(session.id, "md");
    triggerExportDownload(session.id, "json");
  };

  const recomputeGaps = async () => {
    if (gapRecomputeState === "running") return;
    setGapRecomputeState("running");
    try {
      const res = await fetch(`/api/sessions/${session.id}/gap-recompute`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as { session: Session; progress: InterviewProgress };
      setSession(data.session);
      setProgress(data.progress);
      setGapRecomputeState("idle");
    } catch (e) {
      console.error("[recomputeGaps] failed", e);
      setGapRecomputeState("error");
    }
  };

  /**
   * 共通: /api/sessions/:id/export?format=... を <a download> でフェッチして
   * ブラウザのダウンロードフローに乗せる。
   */
  const triggerExportDownload = (sessionId: string, format: "md" | "json") => {
    const a = document.createElement("a");
    a.href = `/api/sessions/${sessionId}/export?format=${format}`;
    // server 側で Content-Disposition: attachment を付けているので download 属性は補助
    a.download = "";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
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

  // ストリーミング応答 (sending: true -> false) が完了したら入力欄にオートフォーカスする。
  // 初回マウント時 (sending は常に false スタート) には発火しないよう、直前の sending を ref で追う。
  useEffect(() => {
    if (wasSendingRef.current && !sending && !isFinished) {
      chatInputRef.current?.focus();
    }
    wasSendingRef.current = sending;
  }, [sending, isFinished]);

  // SSE の 1 イベント分 ("event: ...\ndata: ...\n\n") を event 名と生 data 文字列に分解する。
  const parseSseFrame = (rawEvent: string): { event: string; rawData: string } | null => {
    let event = "message";
    const dataLines: string[] = [];
    for (const line of rawEvent.split("\n")) {
      if (line.startsWith("event:")) event = line.slice("event:".length).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice("data:".length).replace(/^ /, ""));
    }
    if (dataLines.length === 0) return null;
    return { event, rawData: dataLines.join("\n") };
  };

  const sendMessage = async (content: string) => {
    setSending(true);
    setError(null);
    setStreamingContent("");
    // 往復完了を待たずにユーザー自身の発言を先に表示する（体感速度向上）。
    // サーバーからは新規 assistant メッセージのみが返るため、この楽観的な user メッセージは
    // そのまま残し続けてよい（内容はサーバーへ送った content と完全一致する）。
    const optimisticId = `optimistic-${crypto.randomUUID()}`;
    setMsgs((prev) => [
      ...prev,
      {
        id: optimisticId,
        sessionId: session.id,
        role: "user",
        content,
        meta: {},
        createdAt: new Date(),
      },
    ]);
    try {
      const res = await fetch(`/api/sessions/${session.id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok || !res.body) {
        const body = await res.text();
        console.error("message POST failed", res.status, body);
        throw new Error(`${res.status}: ${body.slice(0, 300)}`);
      }
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("text/event-stream")) {
        // 想定外のケース（本来は zValidator の 400 などここに到達する前に弾かれる）は
        // 従来通り JSON 一括レスポンスとして処理するフォールバック。
        const data = (await res.json()) as {
          session: Session;
          messages: Message[];
          progress: InterviewProgress;
        };
        setSession(data.session);
        setMsgs(data.messages);
        setProgress(data.progress);
        setSelectedChoices([]);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sawMessageEvent = false;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        // stream: true を付けないと日本語などマルチバイト文字が chunk 境界で分割され文字化けする。
        buffer += decoder.decode(value, { stream: true });
        let sepIndex: number;
        while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
          const frame = parseSseFrame(buffer.slice(0, sepIndex));
          buffer = buffer.slice(sepIndex + 2);
          if (!frame) continue;

          if (frame.event === "error") {
            // hono streamSSE の onError は data に生の Error#message を渡す（JSON化しない）。
            setError(frame.rawData || "unknown error");
            continue;
          }
          const data = JSON.parse(frame.rawData) as {
            text?: string;
            message?: Message;
            session?: Session;
            progress?: InterviewProgress;
          };
          if (frame.event === "delta" && typeof data.text === "string") {
            setStreamingContent(data.text);
          } else if (frame.event === "message" && data.message && data.session) {
            sawMessageEvent = true;
            setMsgs((prev) => [...prev, data.message as Message]);
            setSession(data.session);
            if (data.progress) setProgress(data.progress);
            setStreamingContent(null);
            setSelectedChoices([]);
            setSending(false);
          } else if (frame.event === "session" && data.session) {
            setSession(data.session);
          }
        }
      }
      if (!sawMessageEvent) {
        // message イベントを一度も受け取れなかった（＝ error イベントのみ、または接続が途切れた）
        throw new Error("応答の取得に失敗しました");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
      setMsgs((prev) => prev.filter((m) => m.id !== optimisticId));
      setStreamingContent(null);
    } finally {
      setSending(false);
    }
  };

  // 選択済みの選択肢 + 自由入力テキストを1つのメッセージ文字列に合成する
  const composeAnswer = (choices: string[], freeText: string) =>
    [...choices, freeText.trim()].filter(Boolean).join("、");

  // 選択肢ボタン: クリックでトグル選択するのみ（即送信しない）
  const handleToggleChoice = (choice: string) => {
    if (sending || isFinished) return;
    setSelectedChoices((prev) =>
      prev.includes(choice) ? prev.filter((c) => c !== choice) : [...prev, choice],
    );
  };

  // 「まとめて送信」ボタン: 選択済みの選択肢 (+ 入力中のテキストがあれば合成) を送信
  const handleSubmitChoices = () => {
    if (sending || isFinished || selectedChoices.length === 0) return;
    const combined = composeAnswer(selectedChoices, chatValue);
    setChatValue("");
    void sendMessage(combined);
  };

  // 「その他」ボタン: 自由入力欄にフォーカス（選択済みの選択肢は残し、送信時に合成する）
  const handleOtherClick = () => {
    if (sending || isFinished) return;
    chatInputRef.current?.focus();
  };

  // ChatInput からの送信: 選択済みの選択肢があれば自由入力と合成して1メッセージにする
  const handleChatSend = async () => {
    const combined = composeAnswer(selectedChoices, chatValue);
    setChatValue("");
    await sendMessage(combined);
  };

  const handleRemoveChoice = (choice: string) => {
    setSelectedChoices((prev) => prev.filter((c) => c !== choice));
  };

  // UX6: 現在の質問（最新の assistant メッセージ）が対象にしている標準フローノード。
  // 対応ノードを特定できない質問では undefined のままで、ハイライトは表示されない。
  const activeTargetNode = useMemo(() => {
    for (let i = msgs.length - 1; i >= 0; i -= 1) {
      const m = msgs[i];
      if (m.role !== "assistant") continue;
      return m.meta?.targetNode ?? null;
    }
    return null;
  }, [msgs]);

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
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
            title="トップへ戻る"
          >
            <ArrowLeftIcon className="size-3" />
            トップ
          </Link>
          <div>
          <h1 className="text-lg font-semibold">
            業務インタビュー{readonly && " (読み取り専用)"}
          </h1>
          <p className="text-xs text-zinc-500">
            セッション {session.id} ・ ターン {Math.min(session.currentQuestionIndex, MAX_TURNS)} / {MAX_TURNS}
            {isFinished && " ・ 完了"}
          </p>
          {!readonly && flowSaveState === "saving" && (
            <p className="text-xs text-zinc-500">フローを保存中...</p>
          )}
          {!readonly && flowSaveState === "error" && (
            <p className="text-xs text-red-600 dark:text-red-400">フローの保存に失敗しました</p>
          )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!readonly && <ShareUrlBox sessionId={session.id} />}
          {!readonly && !isFinished && (
            <Button
              variant="outline"
              onClick={recomputeGaps}
              disabled={gapRecomputeState === "running"}
            >
              {gapRecomputeState === "running"
                ? "ギャップ計算中..."
                : gapRecomputeState === "error"
                  ? "ギャップ更新 (再試行)"
                  : "ギャップ更新"}
            </Button>
          )}
          {!readonly && (isFinished ? (
            <Button variant="outline" onClick={downloadReports}>
              レポート再ダウンロード
            </Button>
          ) : (
            <Button
              onClick={completeSession}
              disabled={!canComplete}
              title={
                canComplete
                  ? undefined
                  : progress.requiredFilledCount < progress.requiredTotalCount
                    ? `必須項目が ${progress.requiredFilledCount}/${progress.requiredTotalCount} 件です`
                    : "最低ヒアリング回数に達していません"
              }
            >
              完了してレポート出力
            </Button>
          ))}
          {readonly && (
            <Button variant="outline" onClick={downloadReports}>
              レポートをダウンロード
            </Button>
          )}
        </div>
      </header>
      <ProgressBar
        progress={progress}
        turnCount={session.currentQuestionIndex}
        maxTurns={MAX_TURNS}
        completed={isFinished}
      />
      <CautionBar flags={session.extractedData.cautionFlags ?? []} />
      {/* lg 未満: タブで切替、lg 以上: 3 カラム並列表示 */}
      <div className="flex shrink-0 border-b bg-card lg:hidden">
        {(
          [
            { key: "standard", label: "標準フロー" },
            { key: "chat", label: "対話" },
            { key: "canvas", label: "抽出キャンバス" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 px-3 py-2 text-xs font-medium transition ${
              activeTab === tab.key
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(280px,1fr)_minmax(360px,1.4fr)_minmax(360px,1.6fr)]">
        <section
          className={`min-h-0 border-r ${activeTab === "standard" ? "flex flex-col" : "hidden"} lg:flex lg:flex-col`}
        >
          <StandardFlowPanel standardFlow={standardFlow} activeTargetNode={activeTargetNode} />
        </section>
        <section
          className={`min-h-0 flex-col border-r ${activeTab === "chat" ? "flex" : "hidden"} lg:flex`}
        >
          <Transcript
            messages={msgs}
            streamingContent={readonly ? null : streamingContent}
            selectedChoices={selectedChoices}
            onToggleChoice={readonly ? undefined : handleToggleChoice}
            onSubmitChoices={readonly ? undefined : handleSubmitChoices}
            onOtherClick={readonly ? undefined : handleOtherClick}
            disabled={sending || isFinished}
          />
          {!readonly && error && (
            <div className="border-t bg-red-50 px-4 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}
          {!readonly && (
            <ChatInput
              value={chatValue}
              onChange={setChatValue}
              onSend={handleChatSend}
              disabled={sending || isFinished}
              textareaRef={chatInputRef}
              selectedChoices={selectedChoices}
              onRemoveChoice={handleRemoveChoice}
            />
          )}
        </section>
        <section
          className={`relative ${activeTab === "canvas" ? "block" : "hidden"} lg:block`}
        >
          <FlowCanvas
            extracted={session.extractedData}
            flowLayout={session.flowLayout}
            onFlowChange={readonly ? undefined : handleFlowChange}
            onNodeSelect={setSelectedNodeId}
            readonly={readonly}
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
