// What a *fully-widened* fork can physically remove vs. what it cannot.
// The fork tombstones detected reclaimable segments (gone/drift/superseded/
// spent/duplicate). Everything the detector calls "live" stays — so this prints
// the live residual by source, i.e. exactly the garbage a fork can NEVER reach.
import { ClaudeCodeAdapter } from "@glassbox/adapter-claude-code";
import { analyzeSessionReclaimable, FsRepoState, pricingFor } from "@glassbox/analysis";
import { EstimateTokenCounter } from "../dist/token-counter.js";

const tokens = new EstimateTokenCounter();
const adapter = new ClaudeCodeAdapter(tokens);
const repo = new FsRepoState();

const refs = (await adapter.discover({}))
  .filter((r) => (r.sizeBytes ?? 0) >= 150 * 1024)
  .sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0));

let totalCtx = 0;
let detectedGarbage = 0; // fork ceiling (all reclaimable classes)
const liveBySource = {}; // what remains after a full fork, by source

for (const ref of refs) {
  try {
    const session = await adapter.parse({ tool: "claude-code", locator: ref.locator });
    const pricing = pricingFor(session.messages.find((m) => m.model)?.model);
    const { snapshot, report } = await analyzeSessionReclaimable(session, {
      repo, tokens, ...(pricing ? { pricing } : {}),
    });
    const reclaimableIds = new Set(report.items.map((i) => i.segmentId));
    totalCtx += snapshot.totalTokens;
    detectedGarbage += report.reclaimableTokens;
    for (const seg of snapshot.segments) {
      if (reclaimableIds.has(seg.id)) continue; // fork removes these
      liveBySource[seg.source] = (liveBySource[seg.source] ?? 0) + seg.sizeTokens;
    }
  } catch {}
}

const k = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n));
const pc = (n) => ((n / totalCtx) * 100).toFixed(1) + "%";

console.log(`\nFork ceiling across ${refs.length} sessions (${k(totalCtx)} ctx tokens)\n`);
console.log(`  fork removes (all detected garbage)   ${k(detectedGarbage)}  ${pc(detectedGarbage)}`);
const liveTotal = Object.values(liveBySource).reduce((a, b) => a + b, 0);
console.log(`  fork CANNOT touch (live residual)     ${k(liveTotal)}  ${pc(liveTotal)}\n`);

// Conversational live = semantically compressible by /compact; the rest is
// (mostly) necessary scaffolding.
const CONVO = new Set(["assistant", "thinking", "history", "user"]);
let convo = 0, scaffold = 0;
console.log("  live residual by source (what a fork leaves behind):");
for (const [src, tok] of Object.entries(liveBySource).sort((a, b) => b[1] - a[1])) {
  const tag = CONVO.has(src) ? "  ← only /compact can shrink this" : "";
  if (CONVO.has(src)) convo += tok; else scaffold += tok;
  console.log(`    ${src.padEnd(12)} ${k(tok).padStart(7)}  ${pc(tok).padStart(6)}${tag}`);
}
console.log(`\n  of the residual: ${k(convo)} (${pc(convo)}) is stale-able conversation only /compact reaches;`);
console.log(`                   ${k(scaffold)} (${pc(scaffold)}) is system/tools/current scaffolding.\n`);
