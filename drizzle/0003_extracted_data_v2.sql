ALTER TABLE "sessions" ADD COLUMN "task_slug" text;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "extracted_data" SET DEFAULT '{"taskName":null,"purpose":null,"legalBasis":null,"stakeholders":[],"steps":[],"connections":[],"exceptions":[],"gaps":[],"incidents":[]}'::jsonb;--> statement-breakpoint
UPDATE "sessions"
SET "extracted_data" = "extracted_data" || '{"connections":[],"exceptions":[],"gaps":[],"incidents":[]}'::jsonb
WHERE NOT ("extracted_data" ? 'connections');
