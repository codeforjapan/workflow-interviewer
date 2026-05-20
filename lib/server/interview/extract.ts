import { zodResponseFormat } from "openai/helpers/zod";
import { MODELS, openai } from "@/lib/server/openai";
import {
  ExtractedBusinessInfoSchema,
  type ExtractedBusinessInfo,
} from "./schema";

const SYSTEM_PROMPT = `あなたは自治体業務インタビューの構造化抽出器です。
これまでの会話と現在の抽出データを踏まえ、最新状態を統合して返してください。

ルール:
- 既に抽出済みの値があり、新たな矛盾情報がない場合はそのまま保持する
- 新たに判明した情報は適切なフィールドに反映する
- 業務手順 (steps) は時系列順に order を 1 から振る
- 各 step の id は短い英数字 ("s1", "s2", ...) を使う
- 不明な単一値は null、不明な配列は [] を返す
- 推測や創作は禁止。会話で明示的に語られた情報だけを反映する

steps 抽出方針:
- 「開始条件（何をきっかけに始まるか）」は最初の step に含める
- 「完了条件（何をもって完了か）」は最後の step に含める
- 分岐条件は step.label に「（条件: ...）」として埋め込む
- 同じ意味の step は重複させず、簡潔に統合する

connections（業務間/部署/外部機関リンク）:
- 他業務・他部署・外部機関・システムへのリンクを抽出する
- 「○○課に連携」「△△制度に引き継ぐ」「外部機関と協議」等の発話が対象
- 既に抽出済み（KB 由来含む）の connection は保持し、新規分のみ追加する
- id は "c1", "c2", ...（KB 由来の "kb-t*"/"kb-d*" は変えない）
- fromStepId は特定 step に紐づく場合のみ string、ワークフロー全体のリンクは null
- target.type は workflow / department / external / system のいずれか
- target.label は人が読める短い名前、target.ref は null で可

exceptions（例外フロー）:
- 差し戻し・再申請・保留・却下など、通常フローから外れる分岐を別管理する
- step.label に例外を埋め込むのではなく、exception として切り出す
- id は "e1", "e2", ... 、relatedStepId は必ず該当 step の id を指す
- condition は「いつ発生するか」、frequency は「どの程度の頻度か」（不明なら null）

incidents（過去のヒヤリハット/ミス）:
- 「過去に〜があった」「ミスしやすいのは〜」「危うく〜だった」等の発話を抽出
- id は "i1", "i2", ... 、relatedStepId はあれば該当 step を指す（無ければ null）
- severity (low/medium/high) を語りの強さから推定。明示なしでも medium をデフォルト`;

type Message = { role: "user" | "assistant"; content: string };

export async function extractBusinessInfo(params: {
  conversation: Message[];
  current: ExtractedBusinessInfo;
}): Promise<ExtractedBusinessInfo> {
  const conversationText = params.conversation
    .map((m) => `${m.role === "user" ? "職員" : "AI"}: ${m.content}`)
    .join("\n");

  const completion = await openai.chat.completions.parse({
    model: MODELS.extract,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `現在の抽出データ (JSON):\n${JSON.stringify(params.current)}\n\n会話履歴:\n${conversationText}\n\n統合後の抽出データを返してください。`,
      },
    ],
    response_format: zodResponseFormat(ExtractedBusinessInfoSchema, "business_info"),
  });

  const parsed = completion.choices[0]?.message.parsed;
  if (!parsed) {
    // パース失敗時は現状維持
    return params.current;
  }
  return parsed;
}
