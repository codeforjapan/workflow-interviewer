import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { streamSSE, type SSEMessage } from "hono/streaming";
import { desc, eq, asc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { loadTaskHypothesis } from "@/lib/kb/hypothesis";
import { sessions, messages, type MessageMeta } from "@/lib/db/schema";
import { detectCautionFlagsForExtracted } from "@/lib/server/interview/cautions";
import {
  handleUserTurnStreaming,
  recomputeDeferredGaps,
} from "@/lib/server/interview/controller";
import { buildJsonReport } from "@/lib/server/export/json";
import { buildMarkdownReport } from "@/lib/server/export/markdown";
import { recomputeGaps } from "@/lib/server/gap/recompute";
import {
  buildStepsTargetNode,
  computeNodeCoverage,
  countNodeAsks,
  formatNodeCoverageAsGuide,
} from "@/lib/server/interview/nodeCoverage";
import { computeInterviewProgress } from "@/lib/server/interview/progress";
import { questions } from "@/lib/server/interview/questions";
import { appendExhaustionChoice, chooseNextSlot, getSlotGuideQuestion } from "@/lib/server/interview/slots";
import { generateAdaptiveQuestion } from "@/lib/server/interview/followup";
import { loadSeedConnections } from "@/lib/server/interview/seed";
import { openai, MODELS } from "@/lib/server/openai";

const DEFAULT_TASK_SLUG = "sonota";

const sessionCreateSchema = z
  .object({
    task_slug: z.string().min(1).optional(),
  })
  .optional();

const WORKFLOW_CATEGORIES = [
  "申請・届出",
  "許認可",
  "税務",
  "福祉・介護",
  "都市計画・建設",
  "教育・文化",
  "その他",
] as const;

const messageInputSchema = z.object({
  content: z.string().min(1).max(4000),
});
const flowLayoutSchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string().min(1),
      x: z.number().finite(),
      y: z.number().finite(),
    }),
  ),
  edges: z.array(
    z.object({
      id: z.string().min(1),
      source: z.string().min(1),
      target: z.string().min(1),
    }),
  ),
  groups: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        nodeIds: z.array(z.string().min(1)),
      }),
    )
    .default([]),
});

export const sessionsRoute = new Hono()
  /**
   * GET /api/sessions
   * セッション一覧を返す（新しい順）。
   */
  .get("/", async (c) => {
    const allSessions = await db.query.sessions.findMany({
      orderBy: desc(sessions.createdAt),
    });
    return c.json({ sessions: allSessions });
  })
  /**
   * POST /api/sessions
   * 新規セッションを作成し、最初の assistant メッセージ (アイスブレイク + Q1) を返す。
   * body.task_slug が指定されればその業務 KB から connections を seed する。
   * 未指定の場合は inkan-toroku がデフォルト（D1 のセレクタ UI が入るまでの暫定挙動）。
   */
  .post("/", async (c) => {
    let body: { task_slug?: string } | undefined;
    try {
      const raw = await c.req.json();
      const parsed = sessionCreateSchema.parse(raw);
      body = parsed;
    } catch {
      body = undefined;
    }
    const taskSlug = body?.task_slug ?? DEFAULT_TASK_SLUG;
    const [seedConnections, hypothesis] = await Promise.all([
      loadSeedConnections(taskSlug),
      loadTaskHypothesis(taskSlug),
    ]);

    const id = nanoid(12);
    const [session] = await db
      .insert(sessions)
      .values({
        id,
        taskSlug,
        extractedData: {
          // KB 標準フローの表示名が分かる業務は taskName を事前に埋め、
          // 「業務の正式名称を教えてください」というゼロベースの最初の質問を丸ごと省く
          // (hypothesis が null の場合、つまり sonota や KB 未登録スラッグは従来通り null のまま質問する)。
          taskName: hypothesis?.taskName ?? null,
          // overview.md 由来の purposeContext (KB が既に説明している制度趣旨) がある業務は
          // purpose も事前に埋め、「目的を教えてください」という抽象的で現場には答えにくい
          // 質問自体を省く (issue: 職員から「目的を聞かれても意味がわからない」との指摘)。
          // overview.md が無い業務は従来通り null のまま質問する（getSlotGuideQuestion の
          // 具体的な言い回しにフォールバック）。
          purpose: hypothesis?.purposeContext ?? null,
          legalBasis: null,
          stakeholders: [],
          steps: [],
          connections: seedConnections,
          exceptions: [],
          gaps: [],
          incidents: [],
          cautionFlags: [],
          confirmedNodeIds: [],
        },
      })
      .returning();

    const firstSlot = chooseNextSlot(session.extractedData, "", {}, null) ?? "purpose";
    // taskName/purpose が事前 seed される KB 業務では、最初の実質的な質問がいきなり "steps"
    // (weight 9 で最上位) になりうる。controller.ts のターン内処理は steps が選ばれたとき
    // nodeCoverage の未確認ノードを1つずつ指す質問に差し替えるが、この最初の質問生成だけは
    // それをやっていなかったため、"開始から完了まで一気に教えてください" という粗い一括質問に
    // なってしまっていた (issue: 初回質問が「一気に全部答える」感じになる)。同じ decompose を
    // ここでも行う (nodeCoverage.ts の formatNodeCoverageAsGuide/buildStepsTargetNode を共有)。
    let firstGuideQuestion = getSlotGuideQuestion(firstSlot, taskSlug, hypothesis);
    let firstNodeCoverage: Awaited<ReturnType<typeof computeNodeCoverage>> = null;
    let firstTargetNode: MessageMeta["targetNode"];
    if (firstSlot === "steps") {
      firstNodeCoverage = await computeNodeCoverage(taskSlug, [], new Set());
      if (firstNodeCoverage?.nextUnconfirmed) {
        firstGuideQuestion = formatNodeCoverageAsGuide(firstNodeCoverage.nextUnconfirmed);
        firstTargetNode = buildStepsTargetNode(firstNodeCoverage.nextUnconfirmed);
      }
    }
    const firstQuestion = await generateAdaptiveQuestion({
      sessionId: id,
      sessionStatus: session.status,
      guideQuestion: firstGuideQuestion,
      questionIndex: 0,
      conversation: [],
      extracted: session.extractedData,
      taskSlug: session.taskSlug,
      nodeCoverage: firstSlot === "steps" ? firstNodeCoverage : null,
    });
    const opener = `${questions.opener}\n\n${firstQuestion.content}`;
    const [firstMessage] = await db
      .insert(messages)
      .values({
        id: nanoid(12),
        sessionId: id,
        role: "assistant",
        content: opener,
        // targetSlot: countSlotAsks/confirmedExhaustedSlots (controller.ts) がスロット毎の
        // 質問回数・打ち切り宣言を数える起点。ここで設定し忘れると最初の質問がノーカウントになる。
        meta: {
          choices: appendExhaustionChoice(firstQuestion.choices, firstSlot),
          targetSlot: firstSlot,
          ...(firstTargetNode ? { targetNode: firstTargetNode } : {}),
        },
      })
      .returning();

    return c.json({ session, messages: [firstMessage] }, 201);
  })
  /**
   * GET /api/sessions/:id
   * セッション + 全メッセージ + 進捗 (UX3) を返す。
   */
  .get("/:id", async (c) => {
    const id = c.req.param("id");
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, id),
    });
    if (!session) return c.json({ error: "session not found" }, 404);

    const sessionMessages = await db.query.messages.findMany({
      where: eq(messages.sessionId, id),
      orderBy: asc(messages.createdAt),
    });
    // UX3: 進捗はDB永続化しない派生データ。都度計算して返す。
    const progress = await computeInterviewProgress({
      extracted: session.extractedData,
      turnCount: session.currentQuestionIndex,
      taskSlug: session.taskSlug,
      messages: sessionMessages,
    });

    return c.json({ session, messages: sessionMessages, progress });
  })
  /**
   * POST /api/sessions/:id/messages
   * ユーザー発話を 1 ターン進める。
   * UX5: 追い質問本文をトークン単位で SSE ストリーミングする。
   * イベント種別: delta (本文の途中経過) → message (確定メッセージ + session) →
   * (3ターン毎のみ) session (ギャップ再計算後の最新 session) → エラー時は error。
   * リクエストバリデーション自体（400）はここに到達する前に zValidator が非SSEで返す。
   */
  .post("/:id/messages", zValidator("json", messageInputSchema), async (c) => {
    const id = c.req.param("id");
    const { content } = c.req.valid("json");

    return streamSSE(
      c,
      async (stream) => {
        // OpenAI のストリームイベントは同期的に発火するが writeSSE は非同期なので、
        // 呼び出し順に書き込みが完了するよう直列化するキューを挟む。
        let writeQueue: Promise<unknown> = Promise.resolve();
        const enqueue = (message: SSEMessage) => {
          writeQueue = writeQueue.then(() => stream.writeSSE(message));
          return writeQueue;
        };

        const result = await handleUserTurnStreaming({
          sessionId: id,
          userInput: content,
          onQuestionDelta: (contentSoFar) => {
            enqueue({ event: "delta", data: JSON.stringify({ text: contentSoFar }) });
          },
        });

        // message イベント送出前に currentQuestionIndex / extractedData（gaps据え置き）/
        // cautionFlags の DB 書き込みは handleUserTurnStreaming 内で完了済み。
        // クライアントはこのイベントを受けて次ターンの送信を再開してよい。
        await enqueue({
          event: "message",
          data: JSON.stringify({
            message: result.message,
            session: result.session,
            progress: result.progress,
          }),
        });

        if (result.needsGapRecompute && result.gapRecomputeContext) {
          const updatedSession = await recomputeDeferredGaps(result.gapRecomputeContext);
          if (updatedSession) {
            await enqueue({
              event: "session",
              data: JSON.stringify({ session: updatedSession }),
            });
          }
        }
      },
      async (err) => {
        console.error("[POST /sessions/:id/messages] failed", err);
      },
    );
  })
  /**
   * GET /api/sessions/:id/export?format=md|json
   * D5: KB local 規約に沿った Markdown / 拡張 JSON レポートを返す。
   * クライアント側のダウンロード用に Content-Disposition: attachment を付与。
   */
  .get("/:id/export", async (c) => {
    const id = c.req.param("id");
    const format = c.req.query("format") ?? "json";
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, id),
    });
    if (!session) return c.json({ error: "session not found" }, 404);

    if (format === "md" || format === "markdown") {
      const { filename, content } = buildMarkdownReport(
        session,
        session.extractedData,
      );
      return new Response(content, {
        headers: {
          "content-type": "text/markdown; charset=utf-8",
          "content-disposition": `attachment; filename="${filename}"`,
        },
      });
    }
    if (format === "json") {
      const { filename, content } = buildJsonReport(
        session,
        session.extractedData,
      );
      return new Response(content, {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-disposition": `attachment; filename="${filename}"`,
        },
      });
    }
    return c.json({ error: `unknown format: ${format}` }, 400);
  })
  /**
   * POST /api/sessions/:id/gap-recompute
   * C3: 「ギャップ更新」ボタン用の明示再計算エンドポイント。
   * C1 + C2 を実行して gaps[] と cautionFlags を更新する。
   */
  .post("/:id/gap-recompute", async (c) => {
    const id = c.req.param("id");
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, id),
    });
    if (!session) return c.json({ error: "session not found" }, 404);

    const sessionMessages = await db.query.messages.findMany({
      where: eq(messages.sessionId, id),
      orderBy: asc(messages.createdAt),
    });
    const conversationForLlm = sessionMessages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    try {
      const gaps = await recomputeGaps({
        slug: session.taskSlug ?? "",
        extracted: { ...session.extractedData, cautionFlags: [] },
        conversation: conversationForLlm,
        askCounts: countNodeAsks(sessionMessages),
      });
      const cautionFlags = await detectCautionFlagsForExtracted({
        ...session.extractedData,
        gaps,
        cautionFlags: [],
      });
      const [updated] = await db
        .update(sessions)
        .set({ extractedData: { ...session.extractedData, gaps, cautionFlags } })
        .where(eq(sessions.id, id))
        .returning();
      const progress = await computeInterviewProgress({
        extracted: updated.extractedData,
        turnCount: updated.currentQuestionIndex,
        taskSlug: updated.taskSlug,
        messages: sessionMessages,
      });
      return c.json({ session: updated, progress });
    } catch (err) {
      console.error("[POST /sessions/:id/gap-recompute] failed", err);
      const message = err instanceof Error ? err.message : "unknown error";
      return c.json({ error: message }, 500);
    }
  })
  /**
   * PATCH /api/sessions/:id/flow
   * 手動編集されたフロー図のレイアウト・接続を保存する。
   */
  .patch("/:id/flow", zValidator("json", flowLayoutSchema), async (c) => {
    const id = c.req.param("id");
    const flowLayout = c.req.valid("json");
    const nodeIds = new Set(flowLayout.nodes.map((n) => n.id));
    const hasInvalidEdge = flowLayout.edges.some(
      (edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target),
    );
    if (hasInvalidEdge) {
      return c.json({ error: "edge source/target must exist in nodes" }, 400);
    }

    const [updated] = await db
      .update(sessions)
      .set({ flowLayout })
      .where(eq(sessions.id, id))
      .returning();
    if (!updated) return c.json({ error: "session not found" }, 404);
    return c.json({ session: updated });
  })
  /**
   * POST /api/sessions/:id/complete
   * セッションを完了状態にし、AI で category / summary を生成して保存する。
   */
  .post("/:id/complete", async (c) => {
    const id = c.req.param("id");
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, id),
    });
    if (!session) return c.json({ error: "session not found" }, 404);

    const finalMessages = await db.query.messages.findMany({
      where: eq(messages.sessionId, id),
      orderBy: asc(messages.createdAt),
    });

    // C3: 完了時の最終ギャップ計算 (失敗しても complete 処理は止めない)
    let finalExtracted = session.extractedData;
    try {
      const conversationForLlm = finalMessages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
      // askCounts (「まだ聞かれていないノードは missing にしない」フィルタ) はあえて渡さない。
      // ここはインタビュー終了時の最終レポート用の計算で、これ以上質問する機会はもう無いため、
      // 聞かれたかどうかに関わらず未確認なものは全て最終的な gap として報告すべき。
      const gaps = await recomputeGaps({
        slug: session.taskSlug ?? "",
        extracted: { ...session.extractedData, cautionFlags: [] },
        conversation: conversationForLlm,
      });
      const cautionFlags = await detectCautionFlagsForExtracted({
        ...session.extractedData,
        gaps,
        cautionFlags: [],
      });
      finalExtracted = { ...session.extractedData, gaps, cautionFlags };
    } catch (err) {
      console.error("[POST /sessions/:id/complete] final gap recompute failed", err);
    }

    const { taskName, purpose, legalBasis, steps } = finalExtracted;
    let category: string | null = null;
    let summary: string | null = null;

    if (taskName || purpose) {
      try {
        const completion = await openai.chat.completions.create({
          model: MODELS.chat,
          messages: [
            {
              role: "system",
              content: `あなたは自治体業務の分類アシスタントです。
以下の業務カテゴリの中から最も適切なものを1つ選び、日本語で1〜2文の業務概要も作成してください。

カテゴリ: ${WORKFLOW_CATEGORIES.join(" / ")}

JSON形式で回答してください: {"category": "<カテゴリ名>", "summary": "<概要>"}`,
            },
            {
              role: "user",
              content: [
                taskName ? `業務名: ${taskName}` : null,
                purpose ? `目的: ${purpose}` : null,
                legalBasis ? `根拠法令: ${legalBasis}` : null,
                steps.length > 0 ? `主なステップ: ${steps.map((s) => s.label).join("、")}` : null,
              ]
                .filter(Boolean)
                .join("\n"),
            },
          ],
          response_format: { type: "json_object" },
        });
        const raw = completion.choices[0]?.message?.content ?? "{}";
        const parsed = JSON.parse(raw) as { category?: string; summary?: string };
        category = WORKFLOW_CATEGORIES.includes(parsed.category as (typeof WORKFLOW_CATEGORIES)[number])
          ? (parsed.category ?? null)
          : "その他";
        summary = parsed.summary ?? null;
      } catch (err) {
        console.error("[POST /sessions/:id/complete] AI generation failed", err);
      }
    }

    const [updated] = await db
      .update(sessions)
      .set({
        status: "completed",
        category,
        summary,
        extractedData: finalExtracted,
      })
      .where(eq(sessions.id, id))
      .returning();
    const progress = await computeInterviewProgress({
      extracted: updated.extractedData,
      turnCount: updated.currentQuestionIndex,
      taskSlug: updated.taskSlug,
      messages: finalMessages,
    });
    return c.json({ session: updated, progress });
  });
