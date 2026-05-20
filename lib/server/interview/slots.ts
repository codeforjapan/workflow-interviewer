import type { SessionExtractedData } from "@/lib/db/schema";

export type SlotKey =
  | "taskName"
  | "purpose"
  | "legalBasis"
  | "stakeholders"
  | "steps"
  | "exceptions"
  | "connections"
  | "incidents"
  | "gaps";

type SlotDef = {
  key: SlotKey;
  /** スコアリングの重み。0 を指定すると質問対象から除外される。 */
  weight: number;
  /** generateAdaptiveQuestion に渡すガイド質問のベース文。 */
  template: string;
  /** 直近のユーザー発話に含まれていたら関連度ブーストをかけるキーワード。 */
  keywords: readonly string[];
  /** 最低充足ゲート (isFinished) で満たすべきかどうか。 */
  requiredForMinimum: boolean;
};

export const SLOT_DEFS: Record<SlotKey, SlotDef> = {
  taskName: {
    key: "taskName",
    weight: 10,
    template: "まず、今回整理する業務の正式名称（通称があればそれも）を教えてください。",
    keywords: ["業務名", "名称"],
    requiredForMinimum: true,
  },
  purpose: {
    key: "purpose",
    weight: 9,
    template:
      "この業務の目的・達成したい状態を教えてください。住民にとっての価値もあれば合わせてお願いします。",
    keywords: ["目的", "達成", "ゴール"],
    requiredForMinimum: true,
  },
  legalBasis: {
    key: "legalBasis",
    weight: 7,
    template:
      "根拠となる法令・条例・要綱・通知などを、分かる範囲で教えてください。",
    keywords: ["法令", "条例", "要綱", "通知", "根拠"],
    requiredForMinimum: true,
  },
  stakeholders: {
    key: "stakeholders",
    weight: 8,
    template:
      "主な関係者を教えてください（住民、窓口担当、審査担当、他部署、外部機関など）。",
    keywords: ["関係者", "担当", "部署", "外部"],
    requiredForMinimum: true,
  },
  steps: {
    key: "steps",
    weight: 9,
    template:
      "業務の標準的な流れを、開始のきっかけから完了まで順番に教えてください。",
    keywords: ["流れ", "手順", "ステップ", "段取り"],
    requiredForMinimum: true,
  },
  exceptions: {
    key: "exceptions",
    weight: 6,
    template:
      "差し戻し・再申請・保留など、通常フローから外れる例外ケースがあれば教えてください。",
    keywords: ["例外", "差し戻し", "保留", "再申請", "イレギュラー"],
    requiredForMinimum: false,
  },
  connections: {
    key: "connections",
    weight: 6,
    template:
      "他業務への連携や、同時に案内が必要な手続きはありますか？（例: 国保・年金・児童手当・他部署への引き継ぎなど）",
    keywords: ["連携", "他業務", "案内", "引き継ぎ", "つながり"],
    requiredForMinimum: false,
  },
  incidents: {
    key: "incidents",
    weight: 5,
    template:
      "この業務で特にミスしやすい点・確認漏れしやすい点・ヒヤリハットがあれば教えてください。",
    keywords: ["ミス", "ヒヤリ", "事故", "トラブル", "漏れ"],
    requiredForMinimum: false,
  },
  gaps: {
    /** 標準フローとのギャップは KB マッチングで算出する派生スロット（C1/C2 で実装）。
     *  ここでは質問対象から除外する。 */
    key: "gaps",
    weight: 0,
    template: "",
    keywords: [],
    requiredForMinimum: false,
  },
};

export const SLOT_KEYS: readonly SlotKey[] = Object.keys(SLOT_DEFS) as SlotKey[];

/** 1 スロットあたり 0..1 の充足度を返す。0=空、1=十分。 */
export function slotCompleteness(
  extracted: SessionExtractedData,
  key: SlotKey,
): number {
  switch (key) {
    case "taskName":
    case "purpose":
    case "legalBasis":
      return extracted[key] ? 1 : 0;
    case "stakeholders": {
      const n = extracted.stakeholders.length;
      if (n === 0) return 0;
      if (n < 3) return 0.5;
      return 1;
    }
    case "steps": {
      const n = extracted.steps.length;
      if (n === 0) return 0;
      if (n < 3) return 0.3;
      if (n < 6) return 0.7;
      return 1;
    }
    case "exceptions":
    case "connections":
    case "incidents": {
      const n = extracted[key].length;
      if (n === 0) return 0;
      if (n < 3) return 0.5;
      return 1;
    }
    case "gaps":
      return 1;
  }
}

const RECENT_BOOST = 0.5;

/** スロット毎のスコアを返す。weight=0 のスロットは -Infinity 扱い。 */
export function scoreSlots(
  extracted: SessionExtractedData,
  lastUserInput: string,
): Array<{ key: SlotKey; score: number; completeness: number }> {
  const text = lastUserInput.toLowerCase();
  return SLOT_KEYS.map((key) => {
    const def = SLOT_DEFS[key];
    const completeness = slotCompleteness(extracted, key);
    if (def.weight === 0) {
      return { key, score: Number.NEGATIVE_INFINITY, completeness };
    }
    const insufficiency = 1 - completeness;
    const relevant = def.keywords.some((kw) => text.includes(kw.toLowerCase()));
    const score = def.weight * insufficiency * (1 + (relevant ? RECENT_BOOST : 0));
    return { key, score, completeness };
  }).sort((a, b) => b.score - a.score);
}

/** 次に質問すべきスロットを返す。すべて十分充足していれば null。 */
export function chooseNextSlot(
  extracted: SessionExtractedData,
  lastUserInput: string,
): SlotKey | null {
  const ranked = scoreSlots(extracted, lastUserInput);
  const top = ranked[0];
  if (!top || top.score <= 0) return null;
  return top.key;
}

/** 最低充足ゲート + 最小ターン数を満たしたら true。 */
export function isFinished(
  extracted: SessionExtractedData,
  turnCount: number,
): boolean {
  const minSlots = SLOT_KEYS.filter((k) => SLOT_DEFS[k].requiredForMinimum);
  const allFilled = minSlots.every((k) => slotCompleteness(extracted, k) >= 0.7);
  if (!allFilled) return false;
  if (turnCount < MIN_TURNS_BEFORE_FINISH) return false;
  return true;
}

/** 早期終了を許す最小ターン数。これ未満では isFinished は常に false。 */
export const MIN_TURNS_BEFORE_FINISH = 4;

/** 安全弁: このターン数に達したら強制的にクロージングへ。 */
export const MAX_TURNS = 20;
