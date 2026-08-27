import OpenAI from "openai";

// OpenRouter は OpenAI 互換 API なので、OpenAI SDK の baseURL を差し替えて使う。
// （structured outputs / streaming ヘルパーもそのまま動く）
const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  throw new Error("OPENROUTER_API_KEY is not set");
}

export const llm = new OpenAI({
  apiKey,
  baseURL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
  defaultHeaders: {
    // OpenRouter のダッシュボード上でアプリを識別するための任意ヘッダー
    "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "http://localhost:3000",
    "X-Title": "workflow-interviewer",
  },
});

// 使うモデルは環境変数の文字列だけで差し替えられる。
// OPENROUTER_MODEL … 全体のデフォルト
// OPENROUTER_MODEL_EXTRACT / OPENROUTER_MODEL_CHAT … 用途別に上書きしたいとき
const DEFAULT_MODEL = "google/gemini-3.1-flash-lite";
const defaultModel = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;

export const MODELS = {
  extract: process.env.OPENROUTER_MODEL_EXTRACT || defaultModel,
  chat: process.env.OPENROUTER_MODEL_CHAT || defaultModel,
} as const;
