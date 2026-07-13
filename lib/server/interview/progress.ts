import type { SessionExtractedData } from "@/lib/db/schema";
import { computeNodeCoverage, type NodeCoverageResult } from "./nodeCoverage";
import {
  isFinished,
  MIN_TURNS_BEFORE_FINISH,
  REQUIRED_SLOT_THRESHOLD,
  SLOT_DEFS,
  SLOT_KEYS,
  slotCompleteness,
  type SlotKey,
} from "./slots";

export type SlotProgressItem = {
  key: SlotKey;
  label: string;
  /** 0..1, slotCompleteness() の生値 */
  completeness: number;
  filled: boolean;
};

export type InterviewProgress = {
  /** 必須スロット (requiredForMinimum) のみ、SLOT_KEYS 宣言順 */
  requiredSlots: SlotProgressItem[];
  requiredFilledCount: number;
  requiredTotalCount: number;
  /** turnCount >= MIN_TURNS_BEFORE_FINISH */
  minTurnsReached: boolean;
  /** isFinished(extracted, turnCount, nodeCoverage) と同一ロジック。完了ボタンの活性条件に直結。 */
  readyToFinish: boolean;
  /** UX1 由来。KB 無し等は null。 */
  nodeCoverage: NodeCoverageResult | null;
};

/**
 * nodeCoverage を同期的に受け取る版。呼び出し元 (controller.ts) が isFinished 判定のために
 * 既に nodeCoverage を計算済みのケースで、KB を二重に読みに行かずに済む。
 */
export function buildInterviewProgress(params: {
  extracted: SessionExtractedData;
  turnCount: number;
  nodeCoverage: NodeCoverageResult | null;
}): InterviewProgress {
  const { extracted, turnCount, nodeCoverage } = params;
  const requiredKeys = SLOT_KEYS.filter((k) => SLOT_DEFS[k].requiredForMinimum);
  const requiredSlots: SlotProgressItem[] = requiredKeys.map((key) => {
    const completeness = slotCompleteness(extracted, key, nodeCoverage);
    return {
      key,
      label: SLOT_DEFS[key].shortLabel,
      completeness,
      filled: completeness >= REQUIRED_SLOT_THRESHOLD,
    };
  });

  return {
    requiredSlots,
    requiredFilledCount: requiredSlots.filter((s) => s.filled).length,
    requiredTotalCount: requiredSlots.length,
    minTurnsReached: turnCount >= MIN_TURNS_BEFORE_FINISH,
    readyToFinish: isFinished(extracted, turnCount, nodeCoverage),
    nodeCoverage,
  };
}

/**
 * nodeCoverage をまだ持っていない呼び出し元 (API route / RSC page) 向けの非同期版。
 * computeNodeCoverage が失敗しても progress 計算全体は落とさない
 * (KB 不備が本流のターン表示を壊さないようにする)。
 */
export async function computeInterviewProgress(params: {
  extracted: SessionExtractedData;
  turnCount: number;
  taskSlug: string | null | undefined;
}): Promise<InterviewProgress> {
  let nodeCoverage: NodeCoverageResult | null = null;
  try {
    nodeCoverage = await computeNodeCoverage(params.taskSlug, params.extracted.steps);
  } catch (err) {
    console.error("[computeInterviewProgress] node coverage failed", err);
  }
  return buildInterviewProgress({
    extracted: params.extracted,
    turnCount: params.turnCount,
    nodeCoverage,
  });
}
