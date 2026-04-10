import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

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

/**
 * AI の Structured Outputs で抽出する業務情報の型。
 * lib/server/interview/schema.ts の zod スキーマと一致させること。
 */
export type ExtractedBusinessInfo = {
  taskName: string | null;
  purpose: string | null;
  legalBasis: string | null;
  stakeholders: string[];
  steps: { id: string; label: string; order: number }[];
};

export const EMPTY_EXTRACTED: ExtractedBusinessInfo = {
  taskName: null,
  purpose: null,
  legalBasis: null,
  stakeholders: [],
  steps: [],
};
