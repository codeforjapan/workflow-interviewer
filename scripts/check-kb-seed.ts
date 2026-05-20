import { loadSeedConnections } from "@/lib/server/interview/seed";

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

async function main() {
  console.log("B2 KB seed check");

  // inkan-toroku: frontmatter に triggers / depends_on なし → 0 件
  {
    const c = await loadSeedConnections("inkan-toroku");
    assert(c.length === 0, `inkan-toroku should seed 0 connections, got ${c.length}`);
    console.log("  inkan-toroku -> 0 connections ✓");
  }

  // jyumin-ido: triggers と depends_on が複数定義されている
  {
    const c = await loadSeedConnections("jyumin-ido");
    assert(c.length > 0, `jyumin-ido should seed >0 connections, got ${c.length}`);

    const triggers = c.filter((x) => x.id.startsWith("kb-t"));
    const dependsOn = c.filter((x) => x.id.startsWith("kb-d"));
    assert(triggers.length > 0, "jyumin-ido should have at least one trigger-derived connection");
    assert(dependsOn.length > 0, "jyumin-ido should have at least one dependsOn-derived connection");

    for (const conn of c) {
      assert(conn.fromStepId === null, `KB-seeded ${conn.id} should have fromStepId=null`);
      assert(conn.target.label.length > 0, `${conn.id} should have non-empty label`);
      assert(conn.target.ref !== null, `${conn.id} should have ref set to KB path`);
    }

    for (const t of triggers) {
      assert(
        t.target.type === "workflow",
        `triggers should map to target.type=workflow, got ${t.target.type} for ${t.id}`,
      );
    }
    for (const d of dependsOn) {
      assert(
        d.target.type === "system",
        `depends_on should map to target.type=system, got ${d.target.type} for ${d.id}`,
      );
    }

    console.log(
      `  jyumin-ido -> ${c.length} connections (triggers=${triggers.length}, depends_on=${dependsOn.length}) ✓`,
    );
    for (const conn of c) {
      console.log(`    ${conn.id}: [${conn.target.type}] ${conn.target.label} <- ${conn.target.ref}`);
    }
  }

  // 不存在スラッグ: 例外を投げず空配列
  {
    const c = await loadSeedConnections("nonexistent-slug-zzz");
    assert(c.length === 0, "missing slug should return [] not throw");
    console.log("  nonexistent slug -> [] ✓");
  }

  console.log("PASS");
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`FAIL: ${msg}`);
  process.exit(1);
});
