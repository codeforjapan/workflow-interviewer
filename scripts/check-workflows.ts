import { listAllWorkflows } from "@/lib/kb/loader";

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

async function main() {
  console.log("D1 workflow listing check");

  const workflows = await listAllWorkflows();
  assert(workflows.length > 0, "expected at least one workflow");

  // inkan-toroku は必ず含まれる (MVP 初期スコープ)
  const inkan = workflows.find((w) => w.slug === "inkan-toroku");
  assert(inkan != null, "inkan-toroku should be listed");
  assert(
    inkan!.displayName === "印鑑登録",
    `inkan-toroku displayName should be '印鑑登録', got ${inkan!.displayName}`,
  );
  assert(
    inkan!.psidServiceCategory === "C1",
    `inkan-toroku PSID category should be C1, got ${inkan!.psidServiceCategory}`,
  );
  assert(
    inkan!.psidLifecycle.includes("L5"),
    `inkan-toroku lifecycle should include L5, got ${inkan!.psidLifecycle.join(",")}`,
  );
  assert(inkan!.specRef.length > 0, "specRef should be non-empty");

  // 全エントリの sanity check
  for (const w of workflows) {
    assert(w.slug.length > 0, `slug empty for ${JSON.stringify(w)}`);
    assert(w.displayName.length > 0, `displayName empty for ${w.slug}`);
    assert(w.psidServiceCategory.length > 0, `psid_service_category empty for ${w.slug}`);
    assert(w.psidLifecycle.length > 0, `psid_lifecycle empty for ${w.slug}`);
  }

  console.log(`  workflows: ${workflows.length}`);
  for (const w of workflows.slice(0, 5)) {
    console.log(`    [${w.psidServiceCategory}] ${w.slug} -> ${w.displayName}`);
  }
  if (workflows.length > 5) console.log(`    ... (+ ${workflows.length - 5} more)`);

  console.log("PASS");
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`FAIL: ${msg}`);
  process.exit(1);
});
