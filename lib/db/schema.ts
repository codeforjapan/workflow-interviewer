import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { ExtractedBusinessInfo } from "@/lib/server/interview/schema";

export type { ExtractedBusinessInfo };
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
 */
export const sessions = pgTable("sessions", {
  id: text().primaryKey(),
  status: sessionStatusEnum().notNull().default("active"),
  currentQuestionIndex: integer().notNull().default(0),
  extractedData: jsonb()
    .$type<ExtractedBusinessInfo>()
    .notNull()
    .default({
      taskName: null,
      purpose: null,
      legalBasis: null,
      stakeholders: [],
      steps: [],
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

export const messages = pgTable("messages", {
  id: text().primaryKey(),
  sessionId: text()
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  role: messageRoleEnum().notNull(),
  content: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const EMPTY_EXTRACTED: ExtractedBusinessInfo = {
  taskName: null,
  purpose: null,
  legalBasis: null,
  stakeholders: [],
  steps: [],
};
