ALTER TABLE "sessions" ALTER COLUMN "extracted_data" SET DEFAULT '{"taskName":null,"purpose":null,"legalBasis":null,"stakeholders":[],"steps":[],"connections":[],"exceptions":[],"gaps":[],"incidents":[],"cautionFlags":[]}'::jsonb;--> statement-breakpoint
UPDATE "sessions"
SET "extracted_data" = "extracted_data" || '{"cautionFlags":[]}'::jsonb
WHERE NOT ("extracted_data" ? 'cautionFlags');
