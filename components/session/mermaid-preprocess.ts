/**
 * Mermaid 11 は subgraph タイトルを ID として字句解析するため、
 * 非 ASCII 文字 (例: "住民・申請者", "担当課（審査）") や記号を含むタイトルが
 * `Lexical error` でレンダ失敗する。KB は古い Mermaid 慣習に従って
 * `subgraph 住民・申請者` のような非クォート表記を採用しているため、
 * クライアント側で `subgraph "住民・申請者"` に書き換えてから渡す。
 *
 * - 既にクォート / 角括弧 `[...]` で囲まれているタイトルは触らない
 * - シンプル英数字 ID (`[A-Za-z0-9_-]+`) はそのまま残す
 * - それ以外は double quote で包んで内部の `"` をエスケープする
 */
const SUBGRAPH_LINE = /^(\s*subgraph\s+)(.+?)\s*$/gm;
const SIMPLE_ID = /^[A-Za-z0-9_-]+$/;
// "id [display]" の複合形式 (mermaid が標準で受け付ける)
const ID_WITH_BRACKETS = /^[A-Za-z0-9_-]+\s+\[.+\]$/;

export function preprocessMermaidSource(source: string): string {
  return source.replace(SUBGRAPH_LINE, (full, prefix, rawTitle) => {
    const title = rawTitle.trim();
    if (!title) return full;
    if (title.startsWith('"') && title.endsWith('"')) return full;
    if (title.startsWith("[") && title.endsWith("]")) return full;
    if (SIMPLE_ID.test(title)) return full;
    if (ID_WITH_BRACKETS.test(title)) return full;
    return `${prefix}"${title.replace(/"/g, '\\"')}"`;
  });
}
