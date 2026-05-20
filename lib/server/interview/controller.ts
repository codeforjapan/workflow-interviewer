import { eq, asc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { messages, sessions } from "@/lib/db/schema";
import { diffStandardVsExtracted } from "@/lib/server/gap/diff";
import { matchKnownGaps } from "@/lib/server/gap/match";
import { detectCautionFlagsForExtracted } from "./cautions";
import { extractBusinessInfo } from "./extract";
import { generateAdaptiveQuestion } from "./followup";
import { questions } from "./questions";
import { formatRiskCueAsGuide, loadRiskCues } from "./risks";
import {
  chooseNextSlot,
  isFinished,
  isMinimumFilled,
  MAX_TURNS,
  SLOT_DEFS,
  type SlotBoosts,
} from "./slots";

const INCIDENTS_RISK_BOOST = 50;

/**
 * ユーザー発話を受けて 1 ターン進める。
 * 1. user メッセージ保存
 * 2. 構造化抽出を実行して extractedData を更新
 * 3. スロット駆動で次の質問 (or クロージング) を決定し assistant メッセージとして保存
 * 4. session.currentQuestionIndex を進める。終了時は MAX_TURNS まで進めて UI に "完了" を促す
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
  const matchedGaps = await matchKnownGaps({
    slug: session.taskSlug ?? "",
    extracted: {
      ...llmExtracted,
      gaps: session.extractedData.gaps,
      cautionFlags: [],
    },
    conversation: conversationForLlm,
  });
  // C2: 標準フロー vs 抽出 steps の構造差分を新規 gaps として追加。
  // C1 で蓄積した matchedKnownGap 付き gaps と dedup される。
  const diffedGaps = await diffStandardVsExtracted({
    slug: session.taskSlug ?? "",
    extracted: {
      ...llmExtracted,
      gaps: matchedGaps,
      cautionFlags: [],
    },
  });
  const cautionFlags = await detectCautionFlagsForExtracted({
    ...llmExtracted,
    gaps: diffedGaps,
    cautionFlags: [],
  });
  const updatedExtracted = {
    ...llmExtracted,
    gaps: diffedGaps,
    cautionFlags,
  };

  // 3. スロット駆動で次の発話を決定
  const nextTurnCount = session.currentQuestionIndex + 1;
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
      let guideQuestion = SLOT_DEFS[slot].template;
      if (slot === "incidents" && riskCues.length > 0) {
        const cue = riskCues[nextTurnCount % riskCues.length];
        guideQuestion = formatRiskCueAsGuide(cue);
      }
      nextContent = await generateAdaptiveQuestion({
        sessionId,
        sessionStatus: session.status,
        guideQuestion,
        questionIndex: nextTurnCount,
        conversation: conversation
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        extracted: updatedExtracted,
      });
    }
  }

  await db.insert(messages).values({
    id: nanoid(12),
    sessionId,
    role: "assistant",
    content: nextContent,
  });

  // 4. session 更新。終了時は currentQuestionIndex を MAX_TURNS にして UI の "完了" ボタンを有効化。
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

  const allMessages = await db.query.messages.findMany({
    where: eq(messages.sessionId, sessionId),
    orderBy: asc(messages.createdAt),
  });

  return { session: updatedSession, messages: allMessages };
}
