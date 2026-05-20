ALTER TABLE "sessions"
ADD COLUMN "flow_layout" jsonb DEFAULT '{"nodes":[],"edges":[],"groups":[]}'::jsonb NOT NULL;
