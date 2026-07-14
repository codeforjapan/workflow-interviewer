import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type {
  ExtractedBusinessInfo,
  SessionExtractedData,
} from "@/lib/server/interview/schema";

export type { ExtractedBusinessInfo, SessionExtractedData };
export type FlowLayoutNode = { id: string; x: number; y: number };
export type FlowLayoutEdge = { id: string; source: string; target: string };
export type FlowLayoutGroup = { id: string; label: string; nodeIds: string[] };
export type FlowLayout = {
  nodes: FlowLayoutNode[];
  edges: FlowLayoutEdge[];
  groups: FlowLayoutGroup[];
};

export const sessionStatusEnum = pgEnum("session_status", ["active", "completed"]);
export const messageRoleEnum = pgEnum("message_role", ["user", "assistant", "system"]);

/**
 * インタビューセッション。
 * MVP では抽出された業務情報 (steps 含む) を JSON で持ち、別テーブル化は後続スプリント。
 *
 * task_slug は対象業務 (例: "inkan-toroku") を識別するスラッグ。null 許容で、
 * 業務選択 UI (D1) 導入前のセッションでは null のまま。
 */
export const sessions = pgTable("sessions", {
  id: text().primaryKey(),
  status: sessionStatusEnum().notNull().default("active"),
  taskSlug: text(),
  currentQuestionIndex: integer().notNull().default(0),
  extractedData: jsonb()
    .$type<SessionExtractedData>()
    .notNull()
    .default({
      taskName: null,
      purpose: null,
      legalBasis: null,
      stakeholders: [],
      steps: [],
      connections: [],
      exceptions: [],
      gaps: [],
      incidents: [],
      cautionFlags: [],
      confirmedNodeIds: [],
    }),
  flowLayout: jsonb()
    .$type<FlowLayout>()
    .notNull()
    .default({
      nodes: [],
      edges: [],
      groups: [],
    }),
  category: text(),
  summary: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type MessageMeta = {
  /** B5: assistant メッセージが選択肢付きで提示されたときの候補。
   *  UI が「その他」を自動付加するため、ここには含めない。
   *  user メッセージや choices 不要の assistant メッセージでは空配列。 */
  choices?: string[];
  /** UX6: この質問が対象にしている標準フローノード (nodeCoverage 由来)。
   *  対応ノードを特定できない質問 (taskName 等の非ステップ系スロットや、KB 不在) では省略される。 */
  targetNode?: {
    kind: "standard";
    /** StandardNodeRef.id ("block-1/CalcValue") */
    nodeId: string;
    /** mermaid ノード生 id (例 "CalcValue")。レンダ済み SVG 内のノード特定に使う */
    rawId: string;
    /** 0-based。StandardFlowSummary.mermaidSources のインデックスと一致 */
    blockIndex: number;
  };
};

export const messages = pgTable("messages", {
  id: text().primaryKey(),
  sessionId: text()
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  role: messageRoleEnum().notNull(),
  content: text().notNull(),
  meta: jsonb().$type<MessageMeta>().notNull().default({}),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const EMPTY_EXTRACTED: SessionExtractedData = {
  taskName: null,
  purpose: null,
  legalBasis: null,
  stakeholders: [],
  steps: [],
  connections: [],
  exceptions: [],
  gaps: [],
  incidents: [],
  cautionFlags: [],
  confirmedNodeIds: [],
};
