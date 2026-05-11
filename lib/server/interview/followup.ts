import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { MODELS, openai } from "@/lib/server/openai";
import type { ExtractedBusinessInfo } from "./schema";

const WORKFLOW_DOCS_ROOT = path.join(process.cwd(), "docs", "workflow");
const MAX_SNIPPETS = 5;
const MAX_SNIPPET_CHARS = 700;

type WorkflowSnippet = { file: string; content: string };

let snippetsCache: Promise<WorkflowSnippet[]> | null = null;

type InterviewMessage = { role: "user" | "assistant"; content: string };

export async function generateAdaptiveQuestion(params: {
  sessionId: string;
  sessionStatus: "active" | "completed";
  guideQuestion: string;
  questionIndex: number;
  conversation: InterviewMessage[];
  extracted: ExtractedBusinessInfo;
}) {
  const { sessionId, sessionStatus, guideQuestion, questionIndex, conversation, extracted } = params;
  try {
    const snippets = await getWorkflowSnippets();
    const lastUserInput =
      [...conversation].reverse().find((m) => m.role === "user")?.content ?? "";
    const selected = selectRelevantSnippets(snippets, [
      extracted.taskName ?? "",
      lastUserInput,
      guideQuestion,
    ]);
    const context = selected.map((s) => `- ${s.file}\n${s.content}`).join("\n\n");
    const conversationText = conversation
      .slice(-8)
      .map((m) => `${m.role === "user" ? "職員" : "AI"}: ${m.content}`)
      .join("\n");

    const completion = await openai.chat.completions.create({
      model: MODELS.chat,
      temperature: 0.5,
      messages: [
        {
          role: "system",
          content: `あなたは自治体業務ヒアリングのインタビュアーです。
次に聞くべき質問を1つだけ生成してください。

ルール:
- docs/workflow の文脈に沿った具体化を優先し、固定質問は参考程度に扱う
- 推測や断定はしない
- 1文・120文字以内
- 職員が答えやすい自然な口調
- 目的は、taskName/purpose/legalBasis/stakeholders/steps を埋めること`,
        },
        {
          role: "user",
          content: `セッション情報:
- sessionId: ${sessionId}
- sessionStatus: ${sessionStatus}
- currentQuestionIndex: ${questionIndex}

現在の固定質問番号: ${questionIndex + 1}
参考ガイド質問:
${guideQuestion}

直近の会話:
${conversationText || "(まだ会話なし)"}

抽出済み情報:
${JSON.stringify(extracted)}

docs/workflow 抜粋:
${context}`,
        },
      ],
    });

    const question = completion.choices[0]?.message.content?.trim() ?? "";
    if (!question) return guideQuestion;
    return question;
  } catch {
    return guideQuestion;
  }
}

async function getWorkflowSnippets() {
  if (!snippetsCache) snippetsCache = loadWorkflowSnippets();
  return snippetsCache;
}

async function loadWorkflowSnippets(): Promise<WorkflowSnippet[]> {
  const files = await collectMarkdownFiles(WORKFLOW_DOCS_ROOT);
  const snippets: WorkflowSnippet[] = [];
  for (const file of files) {
    const raw = await readFile(file, "utf-8");
    const normalized = raw.replace(/\r\n/g, "\n").trim();
    if (!normalized) continue;
    snippets.push({
      file: path.relative(WORKFLOW_DOCS_ROOT, file),
      content: normalized.slice(0, MAX_SNIPPET_CHARS),
    });
  }
  return snippets;
}

async function collectMarkdownFiles(rootDir: string): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const all = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(rootDir, entry.name);
      if (entry.isDirectory()) return collectMarkdownFiles(full);
      if (entry.isFile() && full.endsWith(".md")) return [full];
      return [] as string[];
    }),
  );
  return all.flat();
}

function selectRelevantSnippets(snippets: WorkflowSnippet[], queries: string[]) {
  const terms = queries
    .flatMap((query) => query.toLowerCase().split(/\s+/))
    .map((t) => t.trim())
    .filter(Boolean);

  const scored = snippets.map((snippet) => {
    const text = `${snippet.file}\n${snippet.content}`.toLowerCase();
    const score = terms.reduce((sum, term) => (text.includes(term) ? sum + 1 : sum), 0);
    return { snippet, score };
  });

  const top = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SNIPPETS)
    .map((x) => x.snippet);

  if (top.some((s) => s.file === "README.md")) return top;
  const readme = snippets.find((s) => s.file === "README.md");
  return readme ? [readme, ...top.slice(0, MAX_SNIPPETS - 1)] : top;
}
