/**
 * mem0 hygiene spike — orchestrator.
 *
 * Pipeline: reset store → replay seeded conversation → getAll → embed →
 * measure (bloat / near-dups / surviving contradictions / dead) → report.
 *
 *   OPENAI_API_KEY=sk-... pnpm spike
 *
 * The verdict it prints is the falsifiable claim: does mem0's curated store
 * still carry garbage despite its write-time reconciliation?
 */
import { seed } from "./seed.js";
import { Mem0Harness } from "./mem0-client.js";
import { embedAll } from "./embed.js";
import { buildReport, type EmbeddedMemory } from "./metrics.js";

const NEAR_DUP_THRESHOLD = Number(process.env.NEAR_DUP_THRESHOLD ?? "0.85");

async function main(): Promise<void> {
  if (seed.conversation.length === 0) {
    console.error("seed.ts has an empty conversation — fill it in before running the spike.");
    process.exitCode = 2;
    return;
  }

  const harness = Mem0Harness.create();

  console.log(`\n▸ resetting store for user "${seed.userId}"`);
  await harness.reset(seed.userId);

  console.log(`▸ replaying ${seed.conversation.length} messages into mem0…`);
  await harness.replay(seed.userId, seed.conversation);

  const memories = await harness.getAll(seed.userId);
  console.log(`▸ mem0 kept ${memories.length} memories`);

  console.log(`▸ embedding memories for near-duplicate detection…`);
  const embeddings = await embedAll(memories.map((m) => m.text));
  const embedded: EmbeddedMemory[] = memories.map((m, i) => ({ ...m, embedding: embeddings[i] ?? [] }));

  console.log(`▸ running ${seed.probes.length} probe queries for the dead-memory set…`);
  const retrieved = new Set<string>();
  for (const probe of seed.probes) {
    for (const id of await harness.searchIds(seed.userId, probe.query)) retrieved.add(id);
  }

  const report = buildReport({
    memories: embedded,
    expectedUniqueFacts: seed.expectedUniqueFacts,
    contradictions: seed.contradictions,
    retrievedIds: retrieved,
    nearDupThreshold: NEAR_DUP_THRESHOLD,
  });

  printReport(report);
}

function printReport(r: ReturnType<typeof buildReport>): void {
  const bar = "─".repeat(60);
  console.log(`\n${bar}\n  mem0 HYGIENE SPIKE — RESULTS\n${bar}`);

  console.log(`\n  Bloat`);
  console.log(`    stored memories ........ ${r.storedCount}`);
  console.log(`    expected unique facts .. ${r.expectedUniqueFacts}`);
  console.log(`    bloat ratio ............ ${r.bloatRatio.toFixed(2)}×  ${r.bloatRatio > 1.3 ? "⚠ bloated" : "ok"}`);

  console.log(`\n  Surviving near-duplicates (cosine ≥ ${NEAR_DUP_THRESHOLD})`);
  if (r.nearDuplicateClusters.length === 0) {
    console.log(`    none — mem0 deduped cleanly`);
  } else {
    for (const c of r.nearDuplicateClusters) {
      console.log(`    cluster of ${c.members.length} (min sim ${c.minSimilarity.toFixed(2)}):`);
      for (const m of c.members) console.log(`      • ${m.text}`);
    }
  }

  console.log(`\n  Surviving contradictions`);
  const survived = r.contradictions.filter((c) => c.survivors.length > 0);
  if (survived.length === 0) {
    console.log(`    none — mem0 reconciled every planted contradiction`);
  } else {
    for (const c of survived) {
      console.log(`    ✗ ${c.topic}: stale value still present (should be "${c.currentText}")`);
      for (const s of c.survivors) console.log(`      • ${s.text}`);
    }
  }

  console.log(`\n  Dead memories (never surfaced by any probe)`);
  if (r.deadMemories.length === 0) {
    console.log(`    none — every memory was retrievable`);
  } else {
    for (const m of r.deadMemories) console.log(`    • ${m.text}`);
  }

  console.log(`\n${bar}`);
  console.log(
    r.garbageFound
      ? `  VERDICT: garbage present in mem0's store → the hygiene gap is real ✓`
      : `  VERDICT: store is clean on this seed → strengthen the seed or threshold`,
  );
  console.log(`${bar}\n`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exitCode = 1;
});
