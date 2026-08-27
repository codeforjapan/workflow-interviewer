# Workflow Interviewer

自治体職員の暗黙知を可視化する AI インタビューアプリ。
AI が業務についてヒアリングし、その場で React Flow キャンバス上にフロー図を生成する。

> Sprint 0-1 (MVP v0.1) の段階。テキストチャットのみ・固定 5 問の業務概要把握フェーズ。

## スタック

- Next.js 16 (App Router) / React 19 / Tailwind v4 / shadcn
- Hono (`app/api/[[...route]]`) + Drizzle ORM + Postgres
- OpenAI Structured Outputs (zod) で業務情報を抽出
- @xyflow/react でフロー図を描画

## Claude デスクトップ版で使う（非エンジニア向け）

**このリポジトリを渡されたら、Claude に「セットアップして」と言うだけで環境が整います。**

1. [Claude デスクトップ](https://claude.ai/download) をインストールしてログイン
2. このリポジトリのフォルダを Claude に共有（ドラッグ＆ドロップ または「Add files」）
3. 「セットアップして」と送信 → Claude が手順を案内してくれます

Claude はコマンドを提示するので、それを Mac の「ターミナル」アプリに貼り付けて実行してください。

> ターミナルの開き方: Spotlight（Cmd+Space）→「ターミナル」と入力 → Enter

機能開発は「〇〇機能を作って」と言えば Claude が対応します。

---

## セットアップ（手動でやる場合）

**前提: [Docker Desktop](https://www.docker.com/products/docker-desktop/) のみ**（Node / pnpm / Supabase CLI は不要）

### 1. リポジトリを取得

```bash
git clone <このリポジトリの URL>
cd workflow-interviewer
```

### 2. 環境変数を設定

```bash
cp .env.example .env.local
```

`.env.local` をテキストエディタで開き、`OPENAI_API_KEY=` の右側に API キーを貼り付ける。  
キーは https://platform.openai.com/api-keys で取得できます。

### 3. 開発環境を起動

```bash
docker compose up -d
```

初回はイメージのビルドと依存パッケージのインストールで **3〜10 分** かかります。  
データベースのマイグレーションも自動で適用されます。

### 4. 起動確認

ブラウザで http://localhost:3000 を開く。または:

```bash
curl http://localhost:3000/api/health
# {"ok":true} が返れば完了
```

### 開発サーバーの停止

```bash
docker compose down
```

### DB をまるごとリセットしたいとき

```bash
docker compose down -v   # データも含めて削除
docker compose up -d     # 新しく起動（マイグレーション自動適用）
```

## 動作確認 (Sprint 0-1 受け入れシナリオ)

1. トップで「新しいセッションを開始」
2. AI から最初の質問が表示される
3. チャットに業務名・目的・根拠法令・主要ステップ・関係者を順に入力
4. 各ターンで右側のキャンバスにノードが増えていく
5. 5 問終わったら「完了して JSON 出力」ボタンが押せるようになる
6. クリックで `session-{id}.json` がダウンロードされる

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
docker-compose.yml                  ローカル開発環境 (app + postgres)
```

## デプロイ (Vercel + Supabase) — デモ用

### A. Supabase クラウド DB を作成

1. [supabase.com](https://supabase.com) で新規プロジェクトを作成（リージョンは Tokyo `ap-northeast-1` 推奨）。DB パスワードを控える。
2. プロジェクトの **Connect** から 2 種類の接続文字列を控える:
   - **Session / Direct**（port `5432`）… マイグレーション適用用
   - **Transaction pooler**（port `6543`、末尾 `?pgbouncer=true`）… アプリ実行用（サーバーレス向け）

### B. マイグレーションを本番 DB へ適用（ローカルから）

```bash
DATABASE_URL="<Session/Direct 接続文字列 (5432)>" pnpm db:migrate
```

Supabase Studio の Table Editor で `sessions` / `messages` ができていれば OK。

### C. Vercel にデプロイ

1. Vercel で GitHub リポジトリをインポート（Framework は Next.js が自動検出。`main` ブランチを指定）。
2. **Environment Variables** を設定:
   - `DATABASE_URL` … Transaction pooler 接続文字列（port `6543`, `?pgbouncer=true`）
   - `OPENAI_API_KEY` … OpenAI API キー
3. Deploy。

> KB（`docs/kb/`）は実行時にファイル読み込みするため、`next.config.ts` の `outputFileTracingIncludes` でサーバー関数にバンドルしている。

### 動作確認

- `https://<デプロイ先>/api/health` が 200 を返す
- 新規セッション → 業務選択 → 回答 でキャンバスにフロー図が描画される
- Vercel の Function ログに `KB workflow not found` / `DATABASE_URL is not set` が出ていない

## スコープ外 (後続スプリント)

- 音声 / LiveKit / STT / TTS
- 認証 / ユーザー管理
- 動的質問生成 (深掘り)
- ファシリテータによる手動ノード編集 / リアルタイム同期
- Markdown / Mermaid / tldraw エクスポート
- dagre / ELK 自動レイアウト
