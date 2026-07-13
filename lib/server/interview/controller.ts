import { eq, asc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { messages, sessions } from "@/lib/db/schema";
import { recomputeGaps, shouldRecomputeGaps } from "@/lib/server/gap/recompute";
import { detectCautionFlagsForExtracted } from "./cautions";
import { extractBusinessInfo } from "./extract";
import { generateAdaptiveQuestion } from "./followup";
import { formatGapCueAsGuide, loadGapCues, pickUnmatchedGapCues } from "./gapCues";
import {
  computeNodeCoverage,
  formatNodeCoverageAsGuide,
  shouldBoostIncidents,
} from "./nodeCoverage";
import { buildInterviewProgress } from "./progress";
import { questions } from "./questions";
import { formatRiskCueAsGuide, loadRiskCues } from "./risks";
import { chooseNextSlot, getSlotTemplate, isFinished, MAX_TURNS, SLOT_DEFS, type SlotBoosts } from "./slots";

const INCIDENTS_RISK_BOOST = 50;

/**
 * ユーザー発話を受けて 1 ターン進める。
 * 1. user メッセージ保存
 * 2. 構造化抽出を実行して extractedData を更新
 * 3. スロット駆動で次の質問 (or クロージング) を決定し assistant メッセージとして保存
 * 4. session.currentQuestionIndex を実ターン数として更新 (MAX_TURNS で頭打ち。絶対上限のみを意味する)
 * 5. progress (完了可否 + 必須スロット充足 + 本筋ノード被覆) を組み立てて返す
 */
export async function handleUserTurn(params: {
  sessionId: string;
  userInput: string;
}) {
  const { sessionId, userInput } = params;

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
  const llmExtracted = await extractBusinessInfo({
    conversation: conversation
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    current: session.extractedData,
  });
  // LLM は connections / exceptions / incidents まで抽出する (B2)。
  // gaps は C1 (既知ギャップ照合) で埋める。matchedKnownGap 付きで蓄積。
  // cautionFlags は B4 の後処理で常に再計算する。
  const conversationForLlm = conversation
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  // C3: ギャップ計算 (C1+C2) は 3 ターン毎に絞る。それ以外のターンでは
  //     セッション既存の gaps をそのまま維持する。明示再計算は
  //     POST /api/sessions/:id/gap-recompute から呼ばれる。
  const nextTurnCount = session.currentQuestionIndex + 1;
  const refreshGaps = shouldRecomputeGaps(nextTurnCount);
  const gaps = refreshGaps
    ? await recomputeGaps({
        slug: session.taskSlug ?? "",
        extracted: {
          ...llmExtracted,
          gaps: session.extractedData.gaps,
          cautionFlags: [],
        },
        conversation: conversationForLlm,
      })
    : session.extractedData.gaps;
  // cautionFlags は label を毎ターンスキャンするだけの軽い処理なので毎ターン更新する。
  const cautionFlags = await detectCautionFlagsForExtracted({
    ...llmExtracted,
    gaps,
    cautionFlags: [],
  });
  const updatedExtracted = {
    ...llmExtracted,
    gaps,
    cautionFlags,
  };

  // 3. スロット駆動で次の発話を決定
  // UX1: 標準フロー本筋ノードの被覆状況 (LLM 非依存、毎ターン軽量に計算)
  const nodeCoverage = await computeNodeCoverage(session.taskSlug, updatedExtracted.steps);

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
      }
      const followup = await generateAdaptiveQuestion({
        sessionId,
        sessionStatus: session.status,
        guideQuestion,
        questionIndex: nextTurnCount,
        conversation: conversation
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        extracted: updatedExtracted,
        taskSlug: session.taskSlug,
        nodeCoverage,
      });
      nextContent = followup.content;
      nextChoices = followup.choices;
    }
  }

  await db.insert(messages).values({
    id: nanoid(12),
    sessionId,
    role: "assistant",
    content: nextContent,
    meta: { choices: nextChoices },
  });

  // 4. session 更新。currentQuestionIndex は常に実ターン数 (MAX_TURNS で頭打ち)。
  //    UX3: 以前はクロージング時に MAX_TURNS へ強制ジャンプさせ、これを完了ボタンの
  //    活性シグナルとして使っていたが、早期終了セッションが「ターン20/20」と誤表示される
  //    原因になっていたため廃止した。完了可否は progress.readyToFinish で判定する。
  const updatedIndex = Math.min(nextTurnCount, MAX_TURNS);

  const [updatedSession] = await db
    .update(sessions)
    .set({
      currentQuestionIndex: updatedIndex,
      extractedData: updatedExtracted,
    })
    .where(eq(sessions.id, sessionId))
    .returning();

  const allMessages = await db.query.messages.findMany({
    where: eq(messages.sessionId, sessionId),
    orderBy: asc(messages.createdAt),
  });

  // UX3: 直前に計算済みの nodeCoverage を再利用し、KB の二重読み込みを避ける。
  const progress = buildInterviewProgress({
    extracted: updatedExtracted,
    turnCount: updatedIndex,
    nodeCoverage,
  });

  return { session: updatedSession, messages: allMessages, progress };
}
