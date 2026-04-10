import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error("OPENAI_API_KEY is not set");
}

export const openai = new OpenAI({ apiKey });

// 抽出には推論強めのモデル、応答生成には軽量モデルを使う想定
export const MODELS = {
  extract: "gpt-4o-2024-08-06",
  chat: "gpt-4o-mini",
} as const;
