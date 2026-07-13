import { eq, asc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { messages, sessions, type SessionExtractedData } from "@/lib/db/schema";
import type { ExtractedBusinessInfo } from "@/lib/server/interview/schema";
import { recomputeGaps, shouldRecomputeGaps } from "@/lib/server/gap/recompute";
import { detectCautionFlagsForExtracted } from "./cautions";
import { extractBusinessInfo } from "./extract";
import { streamAdaptiveQuestion } from "./followup";
import { questions } from "./questions";
import { formatRiskCueAsGuide, loadRiskCues } from "./risks";
import {
  chooseNextSlot,
  getSlotTemplate,
  isFinished,
  isMinimumFilled,
  MAX_TURNS,
  SLOT_DEFS,
  type SlotBoosts,
} from "./slots";

const INCIDENTS_RISK_BOOST = 50;

type ConversationMessage = { role: "user" | "assistant"; content: string };

export type HandleUserTurnStreamingResult = {
  message: typeof messages.$inferSelect;
  session: typeof sessions.$inferSelect;
  /** true の場合、message 送出後に recomputeDeferredGaps を呼んでギャップ再計算を反映させる */
  needsGapRecompute: boolean;
  gapRecomputeContext?: DeferredGapContext;
};

type DeferredGapContext = {
  sessionId: string;
  slug: string;
  llmExtracted: ExtractedBusinessInfo;
  conversationForLlm: ConversationMessage[];
};

/**
 * ユーザー発話を受けて 1 ターン進める（ストリーミング版）。
 * 1. user メッセージ保存
 * 2. 構造化抽出を実行して extractedData を更新（gaps は前回値を維持したまま = クリティカルパスから外す）
 * 3. スロット駆動で次の質問 (or クロージング) を決定。追い質問本文は onQuestionDelta でトークン単位に流す
 * 4. assistant メッセージ保存 + session 更新（currentQuestionIndex, gaps 以外の extractedData, cautionFlags）
 *    をここまでで DB に確定させてから戻り値を返す（呼び出し側はこの時点で次ターンを受け付けてよい）
 *
 * 3 ターン毎のギャップ再計算 (recomputeGaps) はここでは行わず、needsGapRecompute=true のときだけ
 * 呼び出し側が recomputeDeferredGaps を後続で呼ぶ（応答表示のクリティカルパスから外すため）。
 */
export async function handleUserTurnStreaming(params: {
  sessionId: string;
  userInput: string;
  onQuestionDelta: (contentSoFar: string) => void;
}): Promise<HandleUserTurnStreamingResult> {
  const { sessionId, userInput, onQuestionDelta } = params;

  const session = await db.query.sessions.findFirst({
    where: eq(sessions.id, sessionId),
  });
  if (!session) throw new Error("session not found");
  if (session.status !== "active") throw new Error("session is not active");

  // 1. user メッセージ保存
  await db.insert(messages).values({
    id: nanoid(12),
    sessionId,
    role: "user",
    content: userInput,
  });

  // 2. 抽出
  const conversation = await db.query.messages.findMany({
    where: eq(messages.sessionId, sessionId),
    orderBy: asc(messages.createdAt),
  });
  const conversationForLlm: ConversationMessage[] = conversation
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  const llmExtracted = await extractBusinessInfo({
    conversation: conversationForLlm,
    current: session.extractedData,
  });
  // LLM は connections / exceptions / incidents まで抽出する (B2)。
  // gaps は C1 (既知ギャップ照合) で埋める。matchedKnownGap 付きで蓄積。
  // cautionFlags は B4 の後処理で常に再計算する。
  //
  // C3: ギャップ計算 (C1+C2) は 3 ターン毎に絞られる。UX5 でこれを応答表示の
  //     クリティカルパスから外したため、このターンでは常にセッション既存の
  //     gaps をそのまま維持し（＝ 3 ターン毎のターンでも追い質問プロンプトが
  //     見る gaps は 1 ターン分古い、という意図的な仕様変更）、
  //     needsGapRecompute=true の場合のみ呼び出し側が recomputeDeferredGaps を
  //     message 送出後に呼んで反映する。明示再計算は従来通り
  //     POST /api/sessions/:id/gap-recompute からも呼べる。
  const nextTurnCount = session.currentQuestionIndex + 1;
  const refreshGaps = shouldRecomputeGaps(nextTurnCount);
  const gaps = session.extractedData.gaps;
  // cautionFlags は label を毎ターンスキャンするだけの軽い処理なので毎ターン更新する。
  const cautionFlags = await detectCautionFlagsForExtracted({
    ...llmExtracted,
    gaps,
    cautionFlags: [],
  });
  const updatedExtracted: SessionExtractedData = {
    ...llmExtracted,
    gaps,
    cautionFlags,
  };

  // 3. スロット駆動で次の発話を決定
  const reachedMax = nextTurnCount >= MAX_TURNS;
  const finished = isFinished(updatedExtracted, nextTurnCount);
  const shouldClose = reachedMax || finished;

  // B3: 業務 KB の creates_risks → INC-*.md 由来の cue を読み、
  // tier-1 が充足 & incidents が空のときに incidents スロットを強くブースト。
  const riskCues = await loadRiskCues(session.taskSlug ?? "");
  const boosts: SlotBoosts = {};
  const incidentsEmpty = updatedExtracted.incidents.length === 0;
  if (
    riskCues.length > 0 &&
    incidentsEmpty &&
    isMinimumFilled(updatedExtracted)
  ) {
    boosts.incidents = INCIDENTS_RISK_BOOST;
  }

  let nextContent: string;
  let nextChoices: string[] = [];
  if (shouldClose) {
    nextContent = questions.closing;
  } else {
    const slot = chooseNextSlot(updatedExtracted, userInput, boosts);
    if (!slot) {
      nextContent = questions.closing;
    } else {
      // incidents スロットが選ばれ、かつ riskCues があれば、
      // テンプレを「もし X が起きたら何が起きるか」型に差し替える。
      // ターン毎に cue をローテーションして同じ問いを連投しない。
      let guideQuestion = getSlotTemplate(slot, session.taskSlug);
      if (slot === "incidents" && riskCues.length > 0) {
        const cue = riskCues[nextTurnCount % riskCues.length];
        guideQuestion = formatRiskCueAsGuide(cue);
      }
      const followup = await streamAdaptiveQuestion({
        sessionId,
        sessionStatus: session.status,
        guideQuestion,
        questionIndex: nextTurnCount,
        conversation: conversationForLlm,
        extracted: updatedExtracted,
        taskSlug: session.taskSlug,
        onDelta: onQuestionDelta,
      });
      nextContent = followup.content;
      nextChoices = followup.choices;
    }
  }

  const [assistantMessage] = await db
    .insert(messages)
    .values({
      id: nanoid(12),
      sessionId,
      role: "assistant",
      content: nextContent,
      meta: { choices: nextChoices },
    })
    .returning();

  // 4. session 更新。終了時は currentQuestionIndex を MAX_TURNS にして UI の "完了" ボタンを有効化。
  // ここまでを DB に確定させてから戻り値を返すことで、呼び出し側が「メッセージ確定 = 次ターン受付可」
  // として扱っても currentQuestionIndex 等の競合を起こさないようにする。
  const updatedIndex =
    nextContent === questions.closing ? MAX_TURNS : nextTurnCount;

  const [updatedSession] = await db
    .update(sessions)
    .set({
      currentQuestionIndex: updatedIndex,
      extractedData: updatedExtracted,
    })
    .where(eq(sessions.id, sessionId))
    .returning();

  return {
    message: assistantMessage,
    session: updatedSession,
    needsGapRecompute: refreshGaps,
    gapRecomputeContext: refreshGaps
      ? { sessionId, slug: session.taskSlug ?? "", llmExtracted, conversationForLlm }
      : undefined,
  };
}

/**
 * handleUserTurnStreaming が needsGapRecompute=true を返したときに、
 * message 送出後（応答表示のクリティカルパスの外）で呼ぶ。
 *
 * 競合対策: 呼び出し時点の session スナップショットを使い回さず DB を再読込し、
 * gaps/cautionFlags 以外のフィールドは再読込した最新値をそのまま引き継ぐ（部分マージ）。
 * これにより、この処理が走っている間に次ターンが別フィールドを更新していても上書きしない。
 */
export async function recomputeDeferredGaps(
  ctx: DeferredGapContext,
): Promise<typeof sessions.$inferSelect | null> {
  const { sessionId, slug, llmExtracted, conversationForLlm } = ctx;
  const latest = await db.query.sessions.findFirst({
    where: eq(sessions.id, sessionId),
  });
  if (!latest) return null;

  const gaps = await recomputeGaps({
    slug,
    extracted: {
      ...llmExtracted,
      gaps: latest.extractedData.gaps,
      cautionFlags: [],
    },
    conversation: conversationForLlm,
  });
  const cautionFlags = await detectCautionFlagsForExtracted({
    ...llmExtracted,
    gaps,
    cautionFlags: [],
  });

  const mergedExtracted: SessionExtractedData = {
    ...latest.extractedData,
    gaps,
    cautionFlags,
  };
  const [updated] = await db
    .update(sessions)
    .set({ extractedData: mergedExtracted })
    .where(eq(sessions.id, sessionId))
    .returning();
  return updated;
}
