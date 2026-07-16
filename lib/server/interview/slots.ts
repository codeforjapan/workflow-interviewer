import type { TaskHypothesis } from "@/lib/kb/hypothesis";
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
    // 「目的・達成したい状態」という抽象的な聞き方は、現場で日々その業務を回している
    // 職員には答えにくい（issue: 職員から「目的を聞かれても意味がわからない」との指摘）。
    // 日々の実感を尋ねる具体的な聞き方にする。
    template:
      "この業務を担当している中で、普段どんなことを大事にしていますか？住民の方に喜ばれる点や、逆に難しいと感じる点があれば教えてください。",
    keywords: ["目的", "達成", "ゴール", "大事", "喜ばれる"],
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
    // 「他部署、外部機関」を例示に含めると connections（他業務・他部署への連携）と
    // 質問の見分けがつかなくなり、部署名を答えた内容が connections 側に吸われて
    // stakeholders が永遠に埋まらないループを起こす (issue: セッションが同じ質問を
    // 繰り返すループに入った実例)。stakeholders は「役割」に絞る。
    template:
      "この業務に関わる人・役割を教えてください（住民の方、窓口で対応する担当者、審査・決裁する担当者など）。",
    keywords: ["関係者", "役割", "担当", "決裁"],
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
 *
 * confirmedExhausted (confirmedExhaustedSlots 参照) にスロットが含まれる場合は常に 1 を返す。
 * stakeholders/connections/exceptions/incidents のような自治体ごとに実件数が全く異なる
 * スロットは、件数の閾値に普遍的な「正解」が無い (issue: 本当に2件しかない自治体が
 * 件数ベースの閾値のせいで永遠に isFinished にならない不具合)。ユーザーが「もうない」
 * 「以上です」等と明確に打ち切りを宣言した場合は、件数に関わらずそれを最優先の完了シグナルとする。
 */
export function slotCompleteness(
  extracted: SessionExtractedData,
  key: SlotKey,
  nodeCoverage?: NodeCoverageResult | null,
  confirmedExhausted?: ReadonlySet<SlotKey>,
): number {
  if (confirmedExhausted?.has(key)) return 1;
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
 * スロット毎のスコアを返す。weight=0 または excludedSlots に含まれるスロットは -Infinity 扱い。
 *
 * boosts はタスクコンテキスト由来の加算ブースト（KB の creates_risks が
 * あって incidents が空のとき incidents を底上げする等）。
 * 加算は最終スコアに対して行うため、ベース計算は変えずに優先度のみ上げられる。
 *
 * excludedSlots はサーキットブレーカー用 (SLOT_ASK_LIMIT/countSlotAsks 参照): completeness が
 * 一向に進まないスロットを聞き続けて詰まるセッションを防ぐため、以後の選択対象から除外する。
 * confirmedExhausted は slotCompleteness に渡り、ユーザーが明確に打ち切りを宣言したスロットを
 * completeness=1 として扱う (excludedSlots とは意味が異なる: こちらは「充足」、excludedSlots は
 * 「諦め」。confirmedExhausted は isFinished/isMinimumFilled にも波及すべきなので slotCompleteness
 * 経由で渡す一方、excludedSlots はスコアリングにのみ影響し isFinished 等では見ない)。
 */
export function scoreSlots(
  extracted: SessionExtractedData,
  lastUserInput: string,
  boosts?: SlotBoosts,
  nodeCoverage?: NodeCoverageResult | null,
  excludedSlots?: ReadonlySet<SlotKey>,
  confirmedExhausted?: ReadonlySet<SlotKey>,
): Array<{ key: SlotKey; score: number; completeness: number }> {
  const text = lastUserInput.toLowerCase();
  return SLOT_KEYS.map((key) => {
    const def = SLOT_DEFS[key];
    const completeness = slotCompleteness(extracted, key, nodeCoverage, confirmedExhausted);
    if (def.weight === 0 || excludedSlots?.has(key)) {
      return { key, score: Number.NEGATIVE_INFINITY, completeness };
    }
    const insufficiency = 1 - completeness;
    const relevant = def.keywords.some((kw) => text.includes(kw.toLowerCase()));
    const base = def.weight * insufficiency * (1 + (relevant ? RECENT_BOOST : 0));
    const extra = boosts?.[key] ?? 0;
    return { key, score: base + extra, completeness };
  }).sort((a, b) => b.score - a.score);
}

/** 次に質問すべきスロットを返す。すべて十分充足している/除外済みであれば null。 */
export function chooseNextSlot(
  extracted: SessionExtractedData,
  lastUserInput: string,
  boosts?: SlotBoosts,
  nodeCoverage?: NodeCoverageResult | null,
  excludedSlots?: ReadonlySet<SlotKey>,
  confirmedExhausted?: ReadonlySet<SlotKey>,
): SlotKey | null {
  const ranked = scoreSlots(extracted, lastUserInput, boosts, nodeCoverage, excludedSlots, confirmedExhausted);
  const top = ranked[0];
  if (!top || top.score <= 0) return null;
  return top.key;
}

/**
 * サーキットブレーカー: 同じスロットを繰り返し聞き続けても completeness が進まない事態を防ぐ。
 * nodeCoverage.ts の NODE_ASK_LIMIT/countNodeAsks/applyAskLimit と同じ考え方
 * (issue: stakeholders と connections の質問が意味的に衝突し、部署名の回答が毎回 connections
 * 側に吸われて stakeholders が永遠に空のまま質問され続け、セッションがループした実例)。
 * この回数を超えて completeness が閾値未満のまま聞き続けたスロットは、以後 chooseNextSlot の
 * 選択対象から除外する（excludedSlotsFromAskCounts と組み合わせて使う）。
 */
export const SLOT_ASK_LIMIT = 3;

/**
 * メッセージ履歴 (assistant の meta.targetSlot) から、スロットごとに何回質問対象にしたかを数える。
 * targetSlot は controller.ts がスロット選択時に付与する (steps の meta.targetNode と対になる)。
 */
export function countSlotAsks(
  messages: ReadonlyArray<{ role: string; meta?: { targetSlot?: string | null } | null }>,
): Map<SlotKey, number> {
  const counts = new Map<SlotKey, number>();
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    const slot = m.meta?.targetSlot;
    if (slot && (SLOT_KEYS as readonly string[]).includes(slot)) {
      const key = slot as SlotKey;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * steps はこの slot 単位サーキットブレーカーの対象外とする。steps は標準フローのノード単位で
 * 進捗を追う仕組み (nodeCoverage の NODE_ASK_LIMIT / countNodeAsks / applyAskLimit) を別に
 * 持っており、そちらが「同じノードを聞き続けるループ」を防ぐ主経路になっている。
 * slot 単位の粗い ask-limit まで併用すると、標準フローに多数のノードがあっても steps の質問が
 * SLOT_ASK_LIMIT 回に達した時点で steps 全体が打ち切られ、本筋の大半が未被覆のまま
 * chooseNextSlot が null を返してクロージングに入ってしまう
 * (issue: 固定資産税セッションで標準フロー13ノード中4ノードのみ被覆=31%の状態で
 *  「一通りの聞き取りが完了しました」と誤って表示された実例)。
 */
const SLOT_ASK_LIMIT_EXEMPT: ReadonlySet<SlotKey> = new Set(["steps"]);

/**
 * askCounts が limit 以上のスロットを excludedSlots として返す。completeness が閾値に
 * 達しているスロットは元々スコア 0 で自然に選ばれなくなるため、ここでは単純に回数だけを見る。
 * SLOT_ASK_LIMIT_EXEMPT のスロット (steps) はノード単位のブレーカーに委ねるため除外しない。
 */
export function excludedSlotsFromAskCounts(
  askCounts: ReadonlyMap<SlotKey, number>,
  limit: number = SLOT_ASK_LIMIT,
): Set<SlotKey> {
  const excluded = new Set<SlotKey>();
  for (const [slot, count] of askCounts) {
    if (SLOT_ASK_LIMIT_EXEMPT.has(slot)) continue;
    if (count >= limit) excluded.add(slot);
  }
  return excluded;
}

/** 必須スロットの充足とみなす完成度の閾値。isMinimumFilled / isFinished で共有。 */
export const REQUIRED_SLOT_THRESHOLD = 0.7;

/** 最低充足ゲートを満たしているか（B3 のリスクブースト判定で使用）。 */
export function isMinimumFilled(
  extracted: SessionExtractedData,
  nodeCoverage?: NodeCoverageResult | null,
  confirmedExhausted?: ReadonlySet<SlotKey>,
): boolean {
  const minSlots = SLOT_KEYS.filter((k) => SLOT_DEFS[k].requiredForMinimum);
  return minSlots.every(
    (k) => slotCompleteness(extracted, k, nodeCoverage, confirmedExhausted) >= REQUIRED_SLOT_THRESHOLD,
  );
}

/** 最低充足ゲート + 最小ターン数を満たしたら true。 */
export function isFinished(
  extracted: SessionExtractedData,
  turnCount: number,
  nodeCoverage?: NodeCoverageResult | null,
  confirmedExhausted?: ReadonlySet<SlotKey>,
): boolean {
  const minSlots = SLOT_KEYS.filter((k) => SLOT_DEFS[k].requiredForMinimum);
  const allFilled = minSlots.every(
    (k) => slotCompleteness(extracted, k, nodeCoverage, confirmedExhausted) >= REQUIRED_SLOT_THRESHOLD,
  );
  if (!allFilled) return false;
  if (turnCount < MIN_TURNS_BEFORE_FINISH) return false;
  return true;
}

/**
 * 「もうない/以上です」等、ユーザーが明確に打ち切りを宣言したとみなす定型文のホワイトリスト。
 * 部分一致 (includes) ではなく正規化後の完全一致で判定する — 「ないわけではない」や
 * 「他にないか確認します」のような、"ない" を含むが打ち切り宣言ではない発話を誤検出しないため。
 *
 * EXHAUSTION_CHOICE_LABEL は controller.ts が connections/stakeholders/exceptions/incidents の
 * 質問の choices に機械的に追加する定型選択肢。ここで検出対象にも含めることで、
 * クリックした場合も自由記述で似た言い回しを打った場合も同じロジックで検出できる。
 */
export const EXHAUSTION_CHOICE_LABEL = "特にありません";

const EXHAUSTION_PATTERNS: RegExp[] = [
  /^(もう|特に|他には|他に)?(ない|なし|ありません)(です|ですね)?$/,
  /^以上(です)?$/,
  /^これで(全部|以上)(です)?$/,
];

function normalizeForExhaustionMatch(text: string): string {
  return text
    .normalize("NFKC")
    .trim()
    .replace(/[。．.！!？?、,\s]+$/g, "");
}

/** ユーザー発話が「もうない/以上です」型の打ち切り宣言とみなせるかを判定する。 */
export function isExhaustionReply(text: string): boolean {
  const normalized = normalizeForExhaustionMatch(text);
  if (!normalized) return false;
  if (normalized === EXHAUSTION_CHOICE_LABEL) return true;
  return EXHAUSTION_PATTERNS.some((re) => re.test(normalized));
}

/**
 * メッセージ履歴から「直前の質問が対象にしていたスロットについて、ユーザーが明確に
 * 打ち切りを宣言した」スロットの集合を導く。slotCompleteness の confirmedExhausted に渡す
 * completeness の主経路 (SLOT_ASK_LIMIT の回数ベース除外は、この検出に失敗した場合の
 * 二次的な安全網に過ぎない)。
 *
 * 一度確認された打ち切り宣言は撤回しない (ratchet)。以後の会話で追加情報が出てきても
 * 単なる追加情報として扱ってよく、completeness は 1 のままで問題ない。
 */
export function confirmedExhaustedSlots(
  messages: ReadonlyArray<{
    role: string;
    content: string;
    meta?: { targetSlot?: string | null } | null;
  }>,
): Set<SlotKey> {
  const exhausted = new Set<SlotKey>();
  for (let i = 0; i < messages.length - 1; i += 1) {
    const question = messages[i];
    if (question.role !== "assistant") continue;
    const slot = question.meta?.targetSlot;
    if (!slot || !(SLOT_KEYS as readonly string[]).includes(slot)) continue;
    const answer = messages[i + 1];
    if (answer.role !== "user") continue;
    if (isExhaustionReply(answer.content)) {
      exhausted.add(slot as SlotKey);
    }
  }
  return exhausted;
}

/**
 * 自治体ごとに実件数が大きく異なり、件数ベースの閾値に普遍的な「正解」が無いスロット。
 * controller.ts がこれらのスロットの質問 choices に EXHAUSTION_CHOICE_LABEL を機械的に
 * 追加する対象を絞るために使う (taskName/purpose/legalBasis/steps は該当しない:
 * legalBasis 等は元々 has-value の二値判定であり、「特にありません」という選択肢は
 * 質問の趣旨に合わない)。
 */
export const OPEN_ENDED_SLOTS: ReadonlySet<SlotKey> = new Set([
  "stakeholders",
  "connections",
  "exceptions",
  "incidents",
]);

/**
 * OPEN_ENDED_SLOTS に該当するスロットの choices に EXHAUSTION_CHOICE_LABEL を追加する。
 * 既に含まれていれば重複させない。MAX_CHOICES (followup.ts) を超えないよう、
 * 追加前に先頭4件までに切り詰めてから追加する。
 */
export function appendExhaustionChoice(choices: string[], slot: SlotKey): string[] {
  if (!OPEN_ENDED_SLOTS.has(slot)) return choices;
  if (choices.includes(EXHAUSTION_CHOICE_LABEL)) return choices;
  return [...choices.slice(0, 4), EXHAUSTION_CHOICE_LABEL];
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
    "この業務を担当している中で、普段どんなことを大事にしていますか？お客様に喜ばれる点や、逆に難しいと感じる点があれば教えてください。",
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

/**
 * スロットのガイド質問を返す。taskHypothesis (KB の標準フロー由来の「一般的にはこうだろう」
 * という仮説) が使えるスロット・フィールドについては、ゼロから聞く getSlotTemplate の代わりに
 * 「標準的には〜ですが、他に/違う点は〜」という仮説確認型の文言を返す。
 *
 * これは、その業務を日々担当している職員に対して「業務の正式名称は？」のようなゼロベースの
 * 質問をすることが、聞かれる側にとってはストレス（＝AIが何も分かっていない、と感じさせる）
 * になるという課題への対応。仮説は標準フロー由来のたたき台に過ぎないため、必ず「他に/違う点」
 * を尋ねる形にし、単純な Yes/No 確認で終わらせない。
 *
 * hypothesis が null、または該当フィールドの仮説が精度不足で空/null の場合は
 * getSlotTemplate の通常文言にフォールバックする。
 */
export function getSlotGuideQuestion(
  key: SlotKey,
  taskSlug: string | null | undefined,
  hypothesis: TaskHypothesis | null,
): string {
  const fallback = getSlotTemplate(key, taskSlug);
  if (!hypothesis) return fallback;

  switch (key) {
    case "purpose":
      // overview.md 由来の制度趣旨があれば、それを背景情報として提示した上で尋ねる
      // (fact-confirm ではなく context-then-ask)。無ければ taskName が分かっていることだけを
      // 踏まえた軽い具体化に留める (KB に明確な purpose フィールドが無い場合に誤った仮説を
      // 提示するリスクを避ける)。「貴庁」等の距離感のある呼びかけ語は使わず、主語を省く。
      //
      // 「目的・住民にとっての価値」という抽象的な聞き方は、現場で日々その業務を回している
      // 職員には答えにくい (issue: 職員から「目的を聞かれても意味がわからない」との指摘)。
      // 日々の実感（大事にしていること・喜ばれる点・難しい点）を尋ねる具体的な聞き方にする。
      if (hypothesis.purposeContext) {
        return `「${hypothesis.taskName}」は一般的には次のような制度です。\n${hypothesis.purposeContext}\n\nこの業務を担当している中で、普段どんなことを大事にしていますか？住民の方に喜ばれる点や、逆に難しいと感じる点があれば教えてください。`;
      }
      return `「${hypothesis.taskName}」の業務を担当している中で、普段どんなことを大事にしていますか？住民の方に喜ばれる点や、逆に難しいと感じる点があれば教えてください。`;
    case "legalBasis":
      if (!hypothesis.legalBasis) return fallback;
      return `一般的には${hypothesis.legalBasis}が根拠になると思いますが、独自の要綱・条例・運用ルールなど、他に根拠としているものがあれば教えてください。`;
    case "stakeholders":
      // overview.md の「関連部門・関連業務の傾向」があれば優先する。課名そのものではなく
      // 機能・連携関係として書かれている想定で、subgraph 由来の課名リストより自治体差に強い。
      //
      // 閉じの質問は「部署・機関」ではなく「役割」で聞く。「どの部署が連携していますか」
      // という聞き方は connections（他業務・他部署へのデータ連携）の質問と見分けがつかず、
      // 部署名の回答が connections 側に分類されて stakeholders が永遠に埋まらない
      // (issue: セッションが同じ質問を繰り返すループに入った実例。extract.ts の
      // stakeholders/connections の境界ルールと対にして直した)。
      if (hypothesis.stakeholderContext) {
        return `標準的には次のような役割・連携先が関わる傾向があります（課名・組織名は自治体差が大きいため、機能・役割としての参考情報です）。\n${hypothesis.stakeholderContext}\n\nこの業務に実際に関わっている人・役割を教えてください（住民の方、窓口担当、審査・決裁する担当者など、役割で構いません）。`;
      }
      if (hypothesis.stakeholders.length === 0) return fallback;
      return `標準的には${hypothesis.stakeholders.join("・")}のような役割が関わることが多いですが、他にどんな人・役割が関わっていますか？`;
    default:
      return fallback;
  }
}
