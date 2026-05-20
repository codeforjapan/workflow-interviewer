# Workflow Interviewer

自治体職員の暗黙知を可視化する AI インタビューアプリ。
AI が業務についてヒアリングし、その場で React Flow キャンバス上にフロー図を生成する。

> Sprint 0-1 (MVP v0.1) の段階。テキストチャットのみ・固定 5 問の業務概要把握フェーズ。

## スタック

- Next.js 16 (App Router) / React 19 / Tailwind v4 / shadcn
- Hono (`app/api/[[...route]]`) + Drizzle ORM + ローカル Supabase (Postgres)
- OpenAI Structured Outputs (zod) で業務情報を抽出
- @xyflow/react でフロー図を描画

## セットアップ

前提: Node 20+ / pnpm / Docker (Supabase ローカル用) / [Supabase CLI](https://supabase.com/docs/guides/cli)

```bash
pnpm install

# ローカル Supabase を起動 (初回はイメージ pull で数分)
supabase start

# .env.local を作成
cp .env.example .env.local
# OPENAI_API_KEY と、supabase status の Anon key を埋める
```

`DATABASE_URL` は `supabase status` の DB URL（デフォルトで `.env.example` の値と一致）。

### マイグレーション適用

```bash
pnpm drizzle-kit migrate
```

### 開発サーバー起動

```bash
pnpm dev
```

[http://localhost:3000](http://localhost:3000) を開く。

## 動作確認 (Sprint 0-1 受け入れシナリオ)

1. トップで「新しいセッションを開始」
2. AI から最初の質問が表示される
3. チャットに業務名・目的・根拠法令・主要ステップ・関係者を順に入力
4. 各ターンで右側のキャンバスにノードが増えていく
5. 5 問終わったら「完了して JSON 出力」ボタンが押せるようになる
6. クリックで `session-{id}.json` がダウンロードされる
7. Supabase Studio (`http://127.0.0.1:54323`) で `sessions` / `messages` テーブルを確認

## ディレクトリ

```
app/
  page.tsx                          トップ (セッション開始)
  sessions/[id]/page.tsx            セッション画面
  api/[[...route]]/route.ts         Hono mount
components/
  session/SessionView.tsx           2カラムレイアウト + 状態管理
  chat/{Transcript,ChatInput}.tsx   チャット UI
  canvas/FlowCanvas.tsx             React Flow 描画
  ui/                               shadcn 生成物
lib/
  db/{client,schema}.ts             Drizzle
  server/
    app.ts                          Hono ルート集約
    routes/sessions.ts              REST エンドポイント
    interview/{questions,schema,extract,controller}.ts
    openai.ts
drizzle/                            マイグレーション
supabase/                           ローカル Supabase 設定
```

## スコープ外 (後続スプリント)

- 音声 / LiveKit / STT / TTS
- 認証 / ユーザー管理
- 動的質問生成 (深掘り)
- ファシリテータによる手動ノード編集 / リアルタイム同期
- Markdown / Mermaid / tldraw エクスポート
- dagre / ELK 自動レイアウト
