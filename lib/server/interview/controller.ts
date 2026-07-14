import { eq, asc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { messages, sessions, type MessageMeta, type SessionExtractedData } from "@/lib/db/schema";
import type { ExtractedBusinessInfo } from "@/lib/server/interview/schema";
import { recomputeGaps, shouldRecomputeGaps } from "@/lib/server/gap/recompute";
import { pruneResolvedMissingGaps } from "@/lib/server/gap/resolve";
import { detectCautionFlagsForExtracted } from "./cautions";
import { extractBusinessInfo } from "./extract";
import { streamAdaptiveQuestion } from "./followup";
import { formatGapCueAsGuide, loadGapCues, pickUnmatchedGapCues } from "./gapCues";
import {
  applyAskLimit,
  computeNodeCoverage,
  countNodeAsks,
  formatNodeCoverageAsGuide,
  getMainFlowNodes,
  shouldBoostIncidents,
} from "./nodeCoverage";
import { buildInterviewProgress, type InterviewProgress } from "./progress";
import { questions } from "./questions";
import { formatRiskCueAsGuide, loadRiskCues } from "./risks";
import { chooseNextSlot, getSlotTemplate, isFinished, MAX_TURNS, SLOT_DEFS, type SlotBoosts } from "./slots";

const INCIDENTS_RISK_BOOST = 50;

type ConversationMessage = { role: "user" | "assistant"; content: string };

export type HandleUserTurnStreamingResult = {
  message: typeof messages.$inferSelect;
  session: typeof sessions.$inferSelect;
  progress: InterviewProgress;
  /** true の場合、message 送出後に recomputeDeferredGaps を呼んでギャップ再計算を反映させる */
  needsGapRecompute: boolean;
  gapRecomputeContext?: DeferredGapContext;
};

type DeferredGapContext = {
  sessionId: string;
  slug: string;
  llmExtracted: ExtractedBusinessInfo;
  conversationForLlm: ConversationMessage[];
  askCounts: ReadonlyMap<string, number>;
};

/**
 * ユーザー発話を受けて 1 ターン進める（ストリーミング版）。
 * 1. user メッセージ保存
 * 2. 構造化抽出を実行して extractedData を更新（gaps は前回値を維持したまま = クリティカルパスから外す）
 * 3. スロット駆動で次の質問 (or クロージング) を決定。追い質問本文は onQuestionDelta でトークン単位に流す
 * 4. assistant メッセージ保存 + session 更新（currentQuestionIndex, gaps 以外の extractedData, cautionFlags）
 *    をここまでで DB に確定させてから戻り値を返す（呼び出し側はこの時点で次ターンを受け付けてよい）
 * 5. progress (完了可否 + 必須スロット充足 + 本筋ノード被覆) を組み立てて返す
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
  // UX1: 標準フロー本筋ノード一覧を抽出 LLM に渡し、Dice 係数では拾えない
  // (複数 steps に分割された/同義語で言い換えられた) カバー済みノードを判定させる。
  const mainNodes = await getMainFlowNodes(session.taskSlug ?? "");
  const llmExtracted = await extractBusinessInfo({
    conversation: conversationForLlm,
    current: session.extractedData,
    mainNodes: mainNodes.map((n) => ({ id: n.id, label: n.label })),
  });
  // ラチェット: LLM が今回言い忘れても、前回までに確認済みの id は失われない (union のみ、縮小しない)。
  // mainNodes に実在しない id (LLM の書式ミス・幻覚) は union する前に弾く。ラチェットは
  // 一度入った id を二度と外さない仕組みなので、無効な id が紛れ込むと恒久的に残ってしまう。
  const validNodeIds = new Set(mainNodes.map((n) => n.id));
  const confirmedNodeIds = Array.from(
    new Set([
      ...(session.extractedData.confirmedNodeIds ?? []),
      ...(llmExtracted.confirmedNodeIds ?? []),
    ]),
  ).filter((id) => validNodeIds.has(id));
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
    confirmedNodeIds,
  };

  // 3. スロット駆動で次の発話を決定
  // UX1: 標準フロー本筋ノードの被覆状況 (Dice 係数 + confirmedNodeIds の LLM 判定を併用)
  const rawNodeCoverage = await computeNodeCoverage(
    session.taskSlug,
    updatedExtracted.steps,
    new Set(confirmedNodeIds),
  );
  // サーキットブレーカー: meta.targetNode で「これまで何回このノードを狙い撃ちしたか」を数え、
  // NODE_ASK_LIMIT 回を超えても解決しないノードは以後の質問対象・分母から除外する
  // (issue: 同じノードを延々と聞き続けて詰まるセッションの安全網)。
  const askCounts = countNodeAsks(conversation);
  const nodeCoverage = rawNodeCoverage ? applyAskLimit(rawNodeCoverage, askCounts) : null;
  // 「不足」ギャップの自動解消: 対象ノードが confirmed になったら一覧から消す
  // (issue: ユーザーがチャット/モーダルで回答してもギャップバッジが消えず残り続ける問題)。
  // askCounts も渡し、一度も質問されていないノードの "missing" は「まだ会話がそこまで
  // 進んでいない」として隠す (issue: 未到達のノードまで「不足」と表示され不親切だった)。
  updatedExtracted.gaps = pruneResolvedMissingGaps(updatedExtracted.gaps, nodeCoverage, askCounts);

  const reachedMax = nextTurnCount >= MAX_TURNS;
  const finished = isFinished(updatedExtracted, nextTurnCount, nodeCoverage);
  const shouldClose = reachedMax || finished;

  // B3/UX2: 業務 KB の creates_risks → INC-*.md 由来の cue と、gap-notes.md の reality
  // 記述由来の cue (UX2 新規) を読み、tier-1 が充足 & incidents が空 & 本筋ノード被覆が
  // MAIN_FLOW_COVERAGE_GATE 以上のときに incidents スロットを強くブースト
  // (UX1: 本筋が薄いうちは枝葉の深掘りを抑える)。
  const [riskCues, gapCuesAll] = await Promise.all([
    loadRiskCues(session.taskSlug ?? ""),
    loadGapCues(session.taskSlug ?? ""),
  ]);
  const gapCues = pickUnmatchedGapCues(gapCuesAll, updatedExtracted.gaps);
  const combinedCues: Array<
    | { kind: "gap"; cue: (typeof gapCues)[number] }
    | { kind: "risk"; cue: (typeof riskCues)[number] }
  > = [
    ...gapCues.map((cue) => ({ kind: "gap" as const, cue })),
    ...riskCues.map((cue) => ({ kind: "risk" as const, cue })),
  ];
  const boosts: SlotBoosts = {};
  const incidentsEmpty = updatedExtracted.incidents.length === 0;
  if (
    shouldBoostIncidents({
      // 未消化の gapCues が残っている限り再アームする (riskCues は従来通り1回きり)。
      cuesCount: combinedCues.length,
      incidentsEmpty: incidentsEmpty || gapCues.length > 0,
      extracted: updatedExtracted,
      nodeCoverage,
    })
  ) {
    boosts.incidents = INCIDENTS_RISK_BOOST;
  }

  let nextContent: string;
  let nextChoices: string[] = [];
  // UX6: 質問がどの標準フローノードを対象にしているか。特定できる質問 ("steps" スロットで
  // 未確認の本筋ノードを名指しする場合) のみ設定し、フロー図側のハイライトに使う。
  let targetNode: MessageMeta["targetNode"];
  if (shouldClose) {
    nextContent = questions.closing;
  } else {
    const slot = chooseNextSlot(updatedExtracted, userInput, boosts, nodeCoverage);
    if (!slot) {
      nextContent = questions.closing;
    } else {
      // incidents スロットが選ばれ、かつ combinedCues (risk cue / gap cue) があれば、
      // テンプレを「もし X が起きたら」型 or「他自治体ではこう」型に差し替える。
      // ターン毎に cue をローテーションして同じ問いを連投しない。
      let guideQuestion = getSlotTemplate(slot, session.taskSlug);
      if (slot === "incidents" && combinedCues.length > 0) {
        const picked = combinedCues[nextTurnCount % combinedCues.length];
        guideQuestion =
          picked.kind === "gap" ? formatGapCueAsGuide(picked.cue) : formatRiskCueAsGuide(picked.cue);
      } else if (slot === "steps" && nodeCoverage?.nextUnconfirmed) {
        // UX1: 未確認の本筋ノードがあれば、それを具体的に指す質問に差し替える。
        guideQuestion = formatNodeCoverageAsGuide(nodeCoverage.nextUnconfirmed);
        targetNode = {
          kind: "standard",
          nodeId: nodeCoverage.nextUnconfirmed.nodeId,
          rawId: nodeCoverage.nextUnconfirmed.rawId,
          blockIndex: nodeCoverage.nextUnconfirmed.blockIndex,
        };
      }
      const followup = await streamAdaptiveQuestion({
        sessionId,
        sessionStatus: session.status,
        guideQuestion,
        questionIndex: nextTurnCount,
        conversation: conversationForLlm,
        extracted: updatedExtracted,
        taskSlug: session.taskSlug,
        // 選ばれたスロットが "steps" のときだけ nodeCoverage を渡す。
        // 常に渡すと、purpose/legalBasis/stakeholders 等 他スロットが選ばれても
        // followup.ts の「未確認ステップ最優先」文脈に引っ張られ、guideQuestion が
        // 無視されてしまう (issue: 必須項目が taskName 以外いつまでも埋まらない)。
        nodeCoverage: slot === "steps" ? nodeCoverage : null,
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
      meta: { choices: nextChoices, ...(targetNode ? { targetNode } : {}) },
    })
    .returning();

  // 4. session 更新。currentQuestionIndex は常に実ターン数 (MAX_TURNS で頭打ち)。
  //    UX3: 以前はクロージング時に MAX_TURNS へ強制ジャンプさせ、これを完了ボタンの
  //    活性シグナルとして使っていたが、早期終了セッションが「ターン20/20」と誤表示される
  //    原因になっていたため廃止した。完了可否は progress.readyToFinish で判定する。
  // ここまでを DB に確定させてから戻り値を返すことで、呼び出し側が「メッセージ確定 = 次ターン受付可」
  // として扱っても currentQuestionIndex 等の競合を起こさないようにする。
  const updatedIndex = Math.min(nextTurnCount, MAX_TURNS);

  const [updatedSession] = await db
    .update(sessions)
    .set({
      currentQuestionIndex: updatedIndex,
      extractedData: updatedExtracted,
    })
    .where(eq(sessions.id, sessionId))
    .returning();

  // UX3: 直前に計算済みの nodeCoverage を再利用し、KB の二重読み込みを避ける。
  const progress = buildInterviewProgress({
    extracted: updatedExtracted,
    turnCount: updatedIndex,
    nodeCoverage,
  });

  return {
    message: assistantMessage,
    session: updatedSession,
    progress,
    needsGapRecompute: refreshGaps,
    gapRecomputeContext: refreshGaps
      ? { sessionId, slug: session.taskSlug ?? "", llmExtracted, conversationForLlm, askCounts }
      : undefined,
  };
}

/**
 * handleUserTurnStreaming が needsGapRecompute=true を返したときに、
 * message 送出後（応答表示のクリティカルパスの外）で呼ぶ。
 *
 * 競合対策: 呼び出し時点の session スナップショットを使い回さず DB を再読込し (latest)、
 * gaps/cautionFlags 以外のフィールドは再読込した最新値をそのまま引き継ぐ（部分マージ）。
 * さらに、gaps 計算 (LLM 呼び出し、数秒かかりうる) が終わった直後にもう一度読み直し (freshest)、
 * 書き込みは freshest をベースにマージする。latest のままだと、この処理の実行中に次ターンが
 * commit した内容 (新しい steps/confirmedNodeIds 等) を丸ごと巻き戻してしまう窓が数秒間開く。
 * (完全な競合排除ではない — 再読込〜書き込みの間の短い窓は残るが、実用上十分に狭める)。
 */
export async function recomputeDeferredGaps(
  ctx: DeferredGapContext,
): Promise<typeof sessions.$inferSelect | null> {
  const { sessionId, slug, llmExtracted, conversationForLlm, askCounts } = ctx;
  const latest = await db.query.sessions.findFirst({
    where: eq(sessions.id, sessionId),
  });
  if (!latest) return null;

  // confirmedNodeIds は llmExtracted (このターンの抽出生値、ラチェット前) ではなく、
  // per-turn の commit 後に再読込した latest.extractedData (ラチェット済み) を使う。
  // recomputeGaps がこの extracted.steps/confirmedNodeIds を使って missing gap の自動解消も行う。
  const gaps = await recomputeGaps({
    slug,
    extracted: {
      ...llmExtracted,
      gaps: latest.extractedData.gaps,
      cautionFlags: [],
      confirmedNodeIds: latest.extractedData.confirmedNodeIds,
    },
    conversation: conversationForLlm,
    askCounts,
  });
  const cautionFlags = await detectCautionFlagsForExtracted({
    ...llmExtracted,
    gaps,
    cautionFlags: [],
  });

  // 書き込み直前にもう一度読み直す: ここまでの LLM 呼び出し (数秒) の間に次ターンが
  // commit している可能性があるため、その場合は最初の latest ではなく最新スナップショットに
  // gaps/cautionFlags だけをマージする (それ以外のフィールドを巻き戻さない)。
  const freshest = await db.query.sessions.findFirst({
    where: eq(sessions.id, sessionId),
  });
  if (!freshest) return null;
  const mergedExtracted: SessionExtractedData = {
    ...freshest.extractedData,
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
