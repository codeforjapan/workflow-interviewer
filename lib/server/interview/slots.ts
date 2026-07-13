import type { SessionExtractedData } from "@/lib/db/schema";
import type { NodeCoverageResult } from "./nodeCoverage";

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
  /** UX3: 進捗チェックリスト等の表示用の短いラベル。 */
  shortLabel: string;
};

export const SLOT_DEFS: Record<SlotKey, SlotDef> = {
  taskName: {
    key: "taskName",
    weight: 10,
    template: "まず、今回整理する業務の正式名称（通称があればそれも）を教えてください。",
    keywords: ["業務名", "名称"],
    requiredForMinimum: true,
    shortLabel: "業務名",
  },
  purpose: {
    key: "purpose",
    weight: 9,
    template:
      "この業務の目的・達成したい状態を教えてください。住民にとっての価値もあれば合わせてお願いします。",
    keywords: ["目的", "達成", "ゴール"],
    requiredForMinimum: true,
    shortLabel: "目的",
  },
  legalBasis: {
    key: "legalBasis",
    weight: 7,
    template:
      "根拠となる法令・条例・要綱・通知などを、分かる範囲で教えてください。",
    keywords: ["法令", "条例", "要綱", "通知", "根拠"],
    requiredForMinimum: true,
    shortLabel: "根拠法令",
  },
  stakeholders: {
    key: "stakeholders",
    weight: 8,
    template:
      "主な関係者を教えてください（住民、窓口担当、審査担当、他部署、外部機関など）。",
    keywords: ["関係者", "担当", "部署", "外部"],
    requiredForMinimum: true,
    shortLabel: "関係者",
  },
  steps: {
    key: "steps",
    weight: 9,
    template:
      "業務の標準的な流れを、開始のきっかけから完了まで順番に教えてください。",
    keywords: ["流れ", "手順", "ステップ", "段取り"],
    requiredForMinimum: true,
    shortLabel: "業務の流れ",
  },
  exceptions: {
    key: "exceptions",
    weight: 6,
    template:
      "差し戻し・再申請・保留など、通常フローから外れる例外ケースがあれば教えてください。",
    keywords: ["例外", "差し戻し", "保留", "再申請", "イレギュラー"],
    requiredForMinimum: false,
    shortLabel: "例外フロー",
  },
  connections: {
    key: "connections",
    weight: 6,
    template:
      "他業務への連携や、同時に案内が必要な手続きはありますか？（例: 国保・年金・児童手当・他部署への引き継ぎなど）",
    keywords: ["連携", "他業務", "案内", "引き継ぎ", "つながり"],
    requiredForMinimum: false,
    shortLabel: "他業務連携",
  },
  incidents: {
    key: "incidents",
    weight: 5,
    template:
      "この業務で特にミスしやすい点・確認漏れしやすい点・ヒヤリハットがあれば教えてください。",
    keywords: ["ミス", "ヒヤリ", "事故", "トラブル", "漏れ"],
    requiredForMinimum: false,
    shortLabel: "ヒヤリハット",
  },
  gaps: {
    /** 標準フローとのギャップは KB マッチングで算出する派生スロット（C1/C2 で実装）。
     *  ここでは質問対象から除外する。 */
    key: "gaps",
    weight: 0,
    template: "",
    keywords: [],
    requiredForMinimum: false,
    shortLabel: "標準との差分",
  },
};

export const SLOT_KEYS: readonly SlotKey[] = Object.keys(SLOT_DEFS) as SlotKey[];

/** 1 スロットあたり 0..1 の充足度を返す。0=空、1=十分。
 *
 * nodeCoverage (UX1: 標準フロー本筋ノードの被覆追跡) が渡された場合、steps の充足度は
 * 「本数が6以上で満点」という粗い判定ではなく、本筋ノードの被覆率をそのまま採用する。
 * nodeCoverage が省略/null (KB不在等) の場合は従来の本数ベース判定にフォールバックする。
 */
export function slotCompleteness(
  extracted: SessionExtractedData,
  key: SlotKey,
  nodeCoverage?: NodeCoverageResult | null,
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
      if (nodeCoverage) return nodeCoverage.coverageRatio;
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

export type SlotBoosts = Partial<Record<SlotKey, number>>;

/**
 * スロット毎のスコアを返す。weight=0 のスロットは -Infinity 扱い。
 *
 * boosts はタスクコンテキスト由来の加算ブースト（KB の creates_risks が
 * あって incidents が空のとき incidents を底上げする等）。
 * 加算は最終スコアに対して行うため、ベース計算は変えずに優先度のみ上げられる。
 */
export function scoreSlots(
  extracted: SessionExtractedData,
  lastUserInput: string,
  boosts?: SlotBoosts,
  nodeCoverage?: NodeCoverageResult | null,
): Array<{ key: SlotKey; score: number; completeness: number }> {
  const text = lastUserInput.toLowerCase();
  return SLOT_KEYS.map((key) => {
    const def = SLOT_DEFS[key];
    const completeness = slotCompleteness(extracted, key, nodeCoverage);
    if (def.weight === 0) {
      return { key, score: Number.NEGATIVE_INFINITY, completeness };
    }
    const insufficiency = 1 - completeness;
    const relevant = def.keywords.some((kw) => text.includes(kw.toLowerCase()));
    const base = def.weight * insufficiency * (1 + (relevant ? RECENT_BOOST : 0));
    const extra = boosts?.[key] ?? 0;
    return { key, score: base + extra, completeness };
  }).sort((a, b) => b.score - a.score);
}

/** 次に質問すべきスロットを返す。すべて十分充足していれば null。 */
export function chooseNextSlot(
  extracted: SessionExtractedData,
  lastUserInput: string,
  boosts?: SlotBoosts,
  nodeCoverage?: NodeCoverageResult | null,
): SlotKey | null {
  const ranked = scoreSlots(extracted, lastUserInput, boosts, nodeCoverage);
  const top = ranked[0];
  if (!top || top.score <= 0) return null;
  return top.key;
}

/** 必須スロットの充足とみなす完成度の閾値。isMinimumFilled / isFinished で共有。 */
export const REQUIRED_SLOT_THRESHOLD = 0.7;

/** 最低充足ゲートを満たしているか（B3 のリスクブースト判定で使用）。 */
export function isMinimumFilled(
  extracted: SessionExtractedData,
  nodeCoverage?: NodeCoverageResult | null,
): boolean {
  const minSlots = SLOT_KEYS.filter((k) => SLOT_DEFS[k].requiredForMinimum);
  return minSlots.every(
    (k) => slotCompleteness(extracted, k, nodeCoverage) >= REQUIRED_SLOT_THRESHOLD,
  );
}

/** 最低充足ゲート + 最小ターン数を満たしたら true。 */
export function isFinished(
  extracted: SessionExtractedData,
  turnCount: number,
  nodeCoverage?: NodeCoverageResult | null,
): boolean {
  const minSlots = SLOT_KEYS.filter((k) => SLOT_DEFS[k].requiredForMinimum);
  const allFilled = minSlots.every(
    (k) => slotCompleteness(extracted, k, nodeCoverage) >= REQUIRED_SLOT_THRESHOLD,
  );
  if (!allFilled) return false;
  if (turnCount < MIN_TURNS_BEFORE_FINISH) return false;
  return true;
}

/** 早期終了を許す最小ターン数。これ未満では isFinished は常に false。 */
export const MIN_TURNS_BEFORE_FINISH = 4;

/** 安全弁: このターン数に達したら強制的にクロージングへ。 */
export const MAX_TURNS = 20;

/**
 * sonota（汎用業務フロー）向けのスロットテンプレート。
 * 自治体語彙（住民・法令・条例）を民間業務語彙に置き換えている。
 */
const SONOTA_SLOT_TEMPLATES: Partial<Record<SlotKey, string>> = {
  taskName:
    "まず、今回整理する業務・案件の名称（通称があればそれも）を教えてください。",
  purpose:
    "この業務の目的・背景を教えてください。どんな課題を解決したい、あるいはどんな価値を提供したいですか？",
  legalBasis:
    "社内規定・契約形態・利用しているツール（boardなど）があれば教えてください。",
  stakeholders:
    "主な関係者を教えてください（クライアント担当、社内承認者、パートナー、請求先など）。",
  steps:
    "業務の標準的な流れを、最初の問い合わせ・相談受付から入金・案件終了まで順番に教えてください。",
  exceptions:
    "失注・ペンディング・差し戻し・再見積もりなど、通常フローから外れるケースがあれば教えてください。",
  connections:
    "他の部署・案件・外部パートナーとの連携が必要な場面はありますか？（例: 社内他部門への引き継ぎ、協力会社への発注など）",
  incidents:
    "この業務で特にミスしやすい点・抜け漏れしやすい点・過去にトラブルになったことがあれば教えてください。",
};

/**
 * スロットのガイド質問テンプレートを返す。
 * taskSlug が "sonota" のときは民間業務向けテンプレートを優先する。
 */
export function getSlotTemplate(key: SlotKey, taskSlug?: string | null): string {
  if (taskSlug === "sonota") {
    return SONOTA_SLOT_TEMPLATES[key] ?? SLOT_DEFS[key].template;
  }
  return SLOT_DEFS[key].template;
}
