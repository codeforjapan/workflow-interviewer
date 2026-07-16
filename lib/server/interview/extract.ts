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
- ただし、直前の AI 発話が「一般的には〜だと思いますが」「標準的には〜が多いですが」のような
  標準フロー由来の仮説を提示しており、それに対する職員の発話が明確な肯定（「はい」「その通り
  です」「合っています」等、または仮説に追加情報を足すだけの発話）であれば、その仮説の内容は
  職員が明示的に認めた情報として反映してよい。職員が明確に否定・訂正した場合はその仮説を反映
  しない（訂正後の内容のみ反映する）。AI が提示していない部分を仮説から推測して補ってはならない

steps 抽出方針:
- 「開始条件（何をきっかけに始まるか）」は最初の step に含める
- 「完了条件（何をもって完了か）」は最後の step に含める
- 分岐条件は step.label に「（条件: ...）」として埋め込む
- 同じ意味の step は重複させず、簡潔に統合する

stakeholders（この業務に関わる人・役割）:
- 業務を実際に行う・関わる「人・役割」を文字列で列挙する（例: "住民", "窓口担当", "審査担当",
  "決裁者", "職員本人" 等）。単なる文字列の配列であり、他フィールドのような id 構造は持たない
- 他部署・外部機関・外部システムへの「データ連携・引き継ぎ」の話は stakeholders ではなく
  connections に分類する（例:「税務署に情報を送る」「国保システムと連携する」は connections。
  「窓口担当が受け付ける」「審査担当が確認する」のような役割の話は stakeholders）
- 既に抽出済みの stakeholders は保持し、新規に判明した役割のみ追加する（重複は統合する）

connections（業務間/部署/外部機関リンク）:
- 他業務・他部署・外部機関・システムへの「データ連携・引き継ぎ」を抽出する（stakeholders との
  違いは上記参照）
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
- severity (low/medium/high) を語りの強さから推定。明示なしでも medium をデフォルト

confirmedNodeIds（標準フロー本筋ノードのうち、実務でカバーされていると判断できるものの id）:
- 下記「標準フロー本筋ノード一覧」が渡された場合のみ判定する。渡されなければ常に [] を返す
- 会話全体（複数ターン・複数 steps にまたがってもよい）を踏まえ、そのノードの内容が実務で
  行われている/説明されたと言えるなら id を含める。1つの steps だけで完結している必要はない
  （例: 「見積書を作る」step と「Slackで承認を得てPDFで提示する」step の2つを合わせて
  「見積・提案の提示」ノードをカバーしていると判断してよい）
- 表現が標準フローのラベルと一字一句一致しなくても、同義・言い換えであれば含めてよい
- 逆に、会話で明示的に触れられていないノードは含めない（推測禁止）
- 一度含めた id は今後の統合でも保持する（前回の抽出データに含まれる confirmedNodeIds は
  基本的にそのまま残し、新たに確認できたものだけ追加する）`;

type Message = { role: "user" | "assistant"; content: string };
type MainFlowNodeRef = { id: string; label: string };

function buildMainFlowNodesSection(mainNodes: MainFlowNodeRef[] | undefined): string {
  if (!mainNodes || mainNodes.length === 0) return "";
  const lines = mainNodes.map((n) => `- ${n.id}: ${n.label}`).join("\n");
  return `\n\n標準フロー本筋ノード一覧 (confirmedNodeIds の判定対象):\n${lines}`;
}

export async function extractBusinessInfo(params: {
  conversation: Message[];
  current: ExtractedBusinessInfo;
  /** UX1追加: 標準フロー本筋ノード一覧。渡されない/空のときは confirmedNodeIds は常に []。 */
  mainNodes?: MainFlowNodeRef[];
}): Promise<ExtractedBusinessInfo> {
  const conversationText = params.conversation
    .map((m) => `${m.role === "user" ? "職員" : "AI"}: ${m.content}`)
    .join("\n");
  const mainNodesSection = buildMainFlowNodesSection(params.mainNodes);

  const completion = await openai.chat.completions.parse({
    model: MODELS.extract,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `現在の抽出データ (JSON):\n${JSON.stringify(params.current)}\n\n会話履歴:\n${conversationText}${mainNodesSection}\n\n統合後の抽出データを返してください。`,
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
