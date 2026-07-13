import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { loadStandardFlowSummary } from "@/lib/kb/loader";
import { MODELS, openai } from "@/lib/server/openai";
import type { SessionExtractedData } from "@/lib/db/schema";
import type { NodeCoverageResult } from "./nodeCoverage";

const WORKFLOW_DOCS_ROOT = path.join(process.cwd(), "docs", "workflow");
const MAX_SNIPPETS = 5;
const MAX_SNIPPET_CHARS = 700;
const MAX_KB_FLOW_CHARS = 2400;
const MAX_CHOICES = 5;

type WorkflowSnippet = { file: string; content: string };

let snippetsCache: Promise<WorkflowSnippet[]> | null = null;

type InterviewMessage = { role: "user" | "assistant"; content: string };

const FollowupSchema = z.object({
  content: z.string(),
  choices: z.array(z.string()),
});

export type FollowupResult = {
  content: string;
  choices: string[];
};

export async function generateAdaptiveQuestion(params: {
  sessionId: string;
  sessionStatus: "active" | "completed";
  guideQuestion: string;
  questionIndex: number;
  conversation: InterviewMessage[];
  extracted: SessionExtractedData;
  taskSlug?: string | null;
  nodeCoverage?: NodeCoverageResult | null;
}): Promise<FollowupResult> {
  const {
    sessionId,
    sessionStatus,
    guideQuestion,
    questionIndex,
    conversation,
    extracted,
    taskSlug,
    nodeCoverage,
  } = params;
  try {
    const [snippets, kbStandardFlow] = await Promise.all([
      getWorkflowSnippets(),
      taskSlug ? loadStandardFlowSummary(taskSlug) : Promise.resolve(null),
    ]);
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

    const kbFlowSection = kbStandardFlow && kbStandardFlow.mermaidSources.length > 0
      ? `\n\n対象業務「${kbStandardFlow.displayName}」の標準フロー (mermaid 抜粋):\n${kbStandardFlow.mermaidSources
          .join("\n---\n")
          .slice(0, MAX_KB_FLOW_CHARS)}`
      : "";
    const nodeCoverageSection = buildNodeCoverageSection(nodeCoverage);

    const completion = await openai.chat.completions.parse({
      model: MODELS.chat,
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(taskSlug),
        },
        {
          role: "user",
          content: `セッション情報:
- sessionId: ${sessionId}
- sessionStatus: ${sessionStatus}
- currentQuestionIndex: ${questionIndex}

参考ガイド質問:
${guideQuestion}

直近の会話:
${conversationText || "(まだ会話なし)"}

抽出済み情報:
${JSON.stringify(extracted)}

docs/workflow 抜粋:
${context}${kbFlowSection}${nodeCoverageSection}`,
        },
      ],
      response_format: zodResponseFormat(FollowupSchema, "next_followup"),
    });

    const parsed = completion.choices[0]?.message.parsed;
    if (!parsed || !parsed.content.trim()) {
      return { content: guideQuestion, choices: [] };
    }
    const dedupedChoices = uniq(parsed.choices)
      .map((c) => c.trim())
      .filter((c) => c.length > 0 && c.length <= 40)
      .slice(0, MAX_CHOICES);
    return { content: parsed.content.trim(), choices: dedupedChoices };
  } catch {
    return { content: guideQuestion, choices: [] };
  }
}

/**
 * 未確認の本筋ノードラベルをプロンプトに埋め込む。kbFlowSection (生 mermaid ダンプ) と違い
 * 構造化済みで、質問選択がどの標準ステップを優先すべきかを明示する主たる誘導シグナル。
 */
function buildNodeCoverageSection(nodeCoverage: NodeCoverageResult | null | undefined): string {
  if (!nodeCoverage || nodeCoverage.totalNodes === 0) return "";
  const unconfirmed = nodeCoverage.items.filter((i) => i.status === "unconfirmed");
  if (unconfirmed.length === 0) return "";
  const lines = unconfirmed
    .slice(0, 8)
    .map((i) => `- ${i.label}${i.subgraph ? `（${i.subgraph}）` : ""}`)
    .join("\n");
  return `\n\n標準フロー主要ステップの確認状況: ${nodeCoverage.confirmedNodes}/${nodeCoverage.totalNodes} 件確認済み。
未確認の主要ステップ（優先して確認する。担保物件・例外運用など周辺的な詳細より優先）:
${lines}`;
}

function uniq(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

async function getWorkflowSnippets() {
  if (!snippetsCache) snippetsCache = loadWorkflowSnippets();
  return snippetsCache;
}

async function loadWorkflowSnippets(): Promise<WorkflowSnippet[]> {
  try {
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
  } catch {
    // docs/workflow が存在しなくても falback して動作する (KB に統一する移行期)
    return [];
  }
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

/** taskSlug に応じてインタビュアーの役割・ルールを切り替える */
function buildSystemPrompt(taskSlug?: string | null): string {
  const isSonota = taskSlug === "sonota";

  const role = isSonota
    ? "あなたは組織内業務のヒアリング担当AIです。相談受付から入金・案件終了までの業務フローについてインタビューします。"
    : "あなたは自治体業務ヒアリングのインタビュアーです。";

  const fillGoal = isSonota
    ? "- 目的は、taskName（業務・案件名）/ purpose（目的・背景）/ stakeholders（関係者・担当部署）/ steps（フローのステップ）を埋めること"
    : "- 目的は、taskName/purpose/legalBasis/stakeholders/steps を埋めること";

  const choiceHint = isSonota
    ? `- 「曖昧な短い回答のあとに具体名を尋ねる」追い質問では、標準フロー（相談受付・提案・社内承認・契約・稼働・請求など）で想定される具体名を choices として 2〜5 件挙げる`
    : `- 「曖昧な短い回答 (例: 必要書類があります / 担当課に回します) を職員がしたあとに、具体名を尋ねる」ような追い質問のときは、標準フロー/抜粋で想定される具体名を choices として 2〜5 件挙げる`;

  return `${role}
次に聞くべき質問を1つだけ生成してください。

質問本文のルール:
- 標準フローや docs/workflow 抜粋の文脈に沿った具体化を優先する
- 標準フロー主要ステップがまだ未確認の間は、その確認を最優先し、周辺的な詳細（担保・例外・過去のミス等）を深追いしない
- 推測や断定はしない
- 1文・120文字以内
- 回答者が答えやすい自然な口調
${fillGoal}

選択肢 (choices) の出し方:
${choiceHint}
- 自由記述が必要な質問 (理由・経緯・課題感など) では choices は空配列にする
- 各 choice は 1〜30 文字、回答者が即答できる短い名詞句にする
- 「その他」は含めない (UI 側で自動的に追加される)
- 提示済みの選択肢と重複させない`;
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
