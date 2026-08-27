<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# エージェント向けランブック（非エンジニア対応）

このプロジェクトの利用者は非エンジニアを想定しています。以下の手順をそのまま実行し、専門用語を避けた言葉で状況を報告しながら進めてください。

---

## Claude デスクトップ版を使っている場合の注意

Claude デスクトップアプリ（claude.ai）はターミナルコマンドを**自動実行できません**。
その場合は「このコマンドをターミナルに貼り付けて実行してください」と案内し、利用者にコピペしてもらいながら進めてください。

ターミナルの開き方: Mac の場合は Spotlight（Cmd+Space）→「ターミナル」と入力 → Enter。

---

## 最初の一回だけ必要な準備（リポジトリを受け取ったとき）

利用者が「はじめてこのプロジェクトを受け取った」状況では、以下の順に確認・案内してください。

### 0. Git のインストール確認

```bash
git --version
```

見つからない場合: `brew install git`（Homebrew がない場合は https://brew.sh からインストールを案内）

### 0-1. リポジトリの取得

```bash
git clone <リポジトリの URL>
cd workflow-interviewer
```

### 0-2. OpenRouter API キーの取得（費用がかかります）

このアプリは OpenRouter 経由で AI（既定では Google の Gemini）を使います。利用には API キー（パスワードのようなもの）が必要で、使用量に応じて費用が発生します。

1. https://openrouter.ai/keys をブラウザで開く
2. 「Sign in」でアカウント作成・ログイン
3. 「Credits」でクレジットカードを登録し、$5 ほどチャージする（安いモデルを使うので試験利用なら $5 で十分）
4. 「Create Key」でキーを発行し、コピーする（一度しか表示されないので必ずメモ）
5. キーは `sk-or-v1-...` のような形式

---

## 「セットアップして」と言われたとき

以下を **上から順番に** 実行します。途中で詰まった場合は利用者に状況を伝えて指示を仰いでください。

### 1. Docker の確認

```bash
docker --version
docker compose version
docker info
```

- コマンドが見つからない場合（`command not found`）: 利用者に許可を取ってから以下を実行
  ```bash
  brew install --cask docker
  open -a Docker
  ```
- `docker info` が「Cannot connect to the Docker daemon」を返す場合: Docker が起動していないので `open -a Docker` を実行し、1〜2 分待つ。

### 2. 環境変数ファイルの準備

```bash
# .env.local がなければ作成
cp .env.example .env.local
```

`.env.local` をテキストエディタで開きます:

```bash
open -e .env.local   # Mac の TextEdit で開く
```

`OPENROUTER_API_KEY=` の右側に API キー（`sk-or-v1-...`）を貼り付けて保存します。
キーが揃うまで次のステップには進まないこと。API キーの取得方法は「最初の一回だけ必要な準備 → 0-2」を参照。

使う AI モデルを変えたい場合は `OPENROUTER_MODEL=` の行のコメント（先頭の `#`）を外し、
https://openrouter.ai/models で選んだモデル名を書きます。省略時は `google/gemini-3.1-flash-lite` です。

### 3. 開発環境の起動

```bash
docker compose up -d
```

初回は Docker イメージのビルドと依存パッケージのインストールで数分かかります。

### 4. 起動確認

```bash
curl -s http://localhost:3000/api/health
```

`{"ok":true}` が返ってきたら起動完了です。返ってこない場合はログを確認します:

```bash
docker compose logs -f app
```

### 5. 完了報告

利用者に以下を伝えてください:

> 「開発環境が起動しました。ブラウザで http://localhost:3000 を開いてください。」

---

## 「xx 機能を作って」と言われたとき（開発フロー）

### ステップ 1: 作業ブランチを作る

```bash
git checkout -b feat/機能名-の-英語表記
```

→ 利用者へ:「作業用のブランチ（変更の保存場所）を作りました」

### ステップ 2: コードを変更する

実装を進めます。

### ステップ 3: 動作確認

開発サーバーが起動していなければ:
```bash
docker compose up -d
```

ブラウザで http://localhost:3000 を開いて動作確認する。ソースを編集すると自動でブラウザに反映されます。

### ステップ 4: コード品質チェック

```bash
pnpm lint
```

エラーが出たら修正してから次へ進む。

### ステップ 5: 変更を保存（コミット）

```bash
git add .
git commit -m '変更内容を一言で説明するメッセージ'
```

→ 利用者へ:「変更を記録しました」

### ステップ 6: GitHub へ送る

```bash
git push -u origin HEAD
```

→ 利用者へ:「変更を GitHub に送りました」

### ステップ 7: プルリクエストを作成する

```bash
gh pr create --title "機能名" --body "変更の説明"
```

→ 利用者へ:「レビュー依頼（プルリクエスト）を作成しました。URL: 〇〇」

---

## 環境変数一覧

| キー | 必須 | 誰が用意するか | 説明 |
|------|------|--------------|------|
| `OPENROUTER_API_KEY` | 必須 | 利用者 | AI 機能に使う OpenRouter の API キー。https://openrouter.ai/keys で取得 |
| `OPENROUTER_MODEL` | 任意 | 利用者 | 使う AI モデル名。省略時は `google/gemini-3.1-flash-lite`。一覧は https://openrouter.ai/models |
| `OPENROUTER_MODEL_EXTRACT` / `OPENROUTER_MODEL_CHAT` | 任意 | 利用者 | 情報抽出用・会話生成用で別モデルにしたいときだけ設定 |
| `DATABASE_URL` | 必須 | 自動（docker compose が設定） | データベースの接続先。docker compose 使用時は変更不要 |

---

## よくある詰まりポイント

### Docker が起動していない

**症状**: `docker info` が `Cannot connect to the Docker daemon` を返す  
**対処**: `open -a Docker` で Docker Desktop を起動し、メニューバーに Docker のアイコンが表示されるまで待つ（1〜2 分）

### ポートが使用中

**症状**: `docker compose up` が `bind: address already in use` で失敗する  
**対処**: ポート 3000 または 5432 を使っているプロセスを停止する。または `docker compose down` してから再起動する

### データベースをリセットしたい

```bash
docker compose down -v   # データも含めて全部消去
docker compose up -d     # 新しく起動（マイグレーションも自動適用）
```

### OPENROUTER_API_KEY が設定されていない

**症状**: チャットを送ると「Error: API key not configured」などのエラーが出る  
**対処**: `.env.local` を開いて `OPENROUTER_API_KEY=sk-or-v1-...` の形で設定してから `docker compose down && docker compose up -d` で再起動する

### モデル名が間違っている

**症状**: チャットを送ると 400 エラーや「model not found」が出る  
**対処**: `.env.local` の `OPENROUTER_MODEL` を https://openrouter.ai/models にあるモデル名（`提供元/モデル名` の形式）に直し、`docker compose down && docker compose up -d` で再起動する

### コンテナのログを見たい

```bash
docker compose logs -f app   # アプリのログをリアルタイム表示（Ctrl+C で終了）
docker compose logs -f db    # データベースのログ
```

### アプリを停止したい

```bash
docker compose down
```
