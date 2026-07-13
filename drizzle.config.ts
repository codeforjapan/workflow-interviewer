import { defineConfig } from "drizzle-kit";

// 環境変数は npm script の `node --env-file-if-exists=.env.local` 経由で読み込む
// (本番マイグレーションは `DATABASE_URL=... pnpm db:migrate` のようにインラインで渡す)。

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  casing: "snake_case",
});
