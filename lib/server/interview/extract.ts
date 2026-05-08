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
- 例外・差し戻し・保留は通常フローの近い step.label に「（例外: ...）」として埋め込む
- 他業務への連携・同時案内がある場合は、末尾寄りの step として追加する
- 同じ意味の step は重複させず、簡潔に統合する`;

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
