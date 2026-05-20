import { preprocessMermaidSource } from "@/components/session/mermaid-preprocess";

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

function main() {
  console.log("mermaid preprocess check");

  // 1) 非 ASCII (`・` 含む) のタイトルがクォートで包まれる
  {
    const input = `flowchart TD\n    subgraph 住民・申請者\n        Start\n    end`;
    const out = preprocessMermaidSource(input);
    assert(
      out.includes('subgraph "住民・申請者"'),
      `expected quoted subgraph title, got:\n${out}`,
    );
    console.log("  non-ASCII subgraph -> quoted ✓");
  }

  // 2) 全角パーレン (担当課（審査）) も包まれる
  {
    const input = `flowchart TD\n    subgraph 担当課（審査）\n        Decision\n    end`;
    const out = preprocessMermaidSource(input);
    assert(out.includes('subgraph "担当課（審査）"'), `expected quoted, got:\n${out}`);
    console.log("  fullwidth paren subgraph -> quoted ✓");
  }

  // 3) シンプル ID (英数字のみ) は触らない
  {
    const input = `flowchart TD\n    subgraph MainFlow\n        A\n    end`;
    const out = preprocessMermaidSource(input);
    assert(out.includes("subgraph MainFlow") && !out.includes('"MainFlow"'), "simple ID kept as-is");
    console.log("  simple ASCII subgraph -> untouched ✓");
  }

  // 4) 既にクォート済みのタイトルは触らない
  {
    const input = `flowchart TD\n    subgraph "既存"\n        A\n    end`;
    const out = preprocessMermaidSource(input);
    assert(out === input, "already-quoted should not change");
    console.log("  already-quoted -> untouched ✓");
  }

  // 5) `[bracketed title]` 形式も触らない
  {
    const input = `flowchart TD\n    subgraph sg1 [住民・申請者]\n        A\n    end`;
    const out = preprocessMermaidSource(input);
    // `sg1 [住民・申請者]` 全体がタイトルとしてマッチ -> [] で始まらないので
    // クォート対象になるかも。仕様としては「[...]` で囲まれていれば触らない」が
    // 厳密には部分一致のため、安全側で何もしないことを保証
    assert(
      !out.includes('subgraph "sg1'),
      `bracketed title compound should not be double-quoted, got:\n${out}`,
    );
    console.log("  `id [bracketed]` compound -> untouched ✓");
  }

  // 6) inkan-toroku 実データ風: 全 subgraph タイトルが quoted になる
  {
    const realistic = [
      "flowchart TD",
      "    Start([印鑑登録の申請\\n本人が来庁]) --> CheckResidence",
      "",
      "    subgraph 住民・申請者",
      "        Start",
      "    end",
      "",
      "    subgraph 窓口担当",
      "        CheckResidence[住所確認]",
      "    end",
      "",
      "    subgraph システム",
      "        Register",
      "    end",
      "",
      "    subgraph 担当課（審査）",
      "        Decision",
      "    end",
    ].join("\n");
    const out = preprocessMermaidSource(realistic);
    assert(out.includes('subgraph "住民・申請者"'), "first subgraph quoted");
    assert(out.includes('subgraph "窓口担当"'), "second subgraph quoted");
    assert(out.includes('subgraph "システム"'), "third subgraph quoted");
    assert(out.includes('subgraph "担当課（審査）"'), "fourth subgraph quoted");
    // 非 subgraph 行は変更なし
    assert(out.includes("CheckResidence[住所確認]"), "node lines untouched");
    console.log("  inkan-toroku realistic block ✓");
  }

  console.log("PASS");
}

try {
  main();
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}
