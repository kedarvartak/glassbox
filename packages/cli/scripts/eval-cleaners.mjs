// @ts-check
/**
 * Offline counterfactual eval of the two context-cleanup strategies, run over the
 * real Claude Code session corpus on this machine. Read-only: it parses
 * transcripts and runs the *exact* production analysis path
 * (analyzeSessionReclaimable → plan) — it never writes CLAUDE.md, never compacts,
 * never calls a model. The output is the predicted recovery of each strategy.
 *
 *   node packages/cli/scripts/eval-cleaners.mjs [--min-kb 200] [--limit 50] [--json <path>]
 *
 * The two strategies and the garbage each one owns (doc 21 §3):
 *   1. CLAUDE.md injection → file garbage:  gone + stale-drift
 *   2. /compact trigger    → accumulated bulk: spent-tool/spent-mcp + duplicate
 *   neither (self-healed)  → stale-superseded (agent already re-read it in-session)
 */
import { writeFileSync } from "node:fs";
import { ClaudeCodeAdapter } from "@glassbox/adapter-claude-code";
import {
  analyzeSessionReclaimable,
  planEviction,
  FsRepoState,
  pricingFor,
} from "@glassbox/analysis";
import { EstimateTokenCounter } from "../dist/token-counter.js";

// ─────────────────────────── the one modeling decision ───────────────────────────
// `wastedUsdPerTurn` (per session) is assumption-free: it's what the resident
// garbage costs every single turn it stays in the window. To report a single
// headline "$ saved by cleaning", we must assume HOW LONG that garbage would have
// kept being re-carried if you hadn't cleaned. That horizon is a judgement call,
// not a fact in the transcript — so it lives here, isolated, as the knob you own.
//
// TODO(kedar): implement the horizon you want to defend in the writeup.
//   perTurnUsd  — USD this strategy's garbage wastes each turn it stays resident.
//   turnCount   — total turns in the session.
//   returns     — projected total USD this strategy would have saved.
//
// Options to consider (trade-off: optimism vs. defensibility):
//   • Upper bound:   perTurnUsd * turnCount        (garbage lived the whole session)
//   • Mid estimate:  perTurnUsd * turnCount * 0.5  (cleaned, on average, mid-way)
//   • Conservative:  perTurnUsd * 1                (only the final turn's waste)
function projectSavings(perTurnUsd, turnCount) {
  // Default placeholder — REPLACE with your chosen horizon.
  return perTurnUsd * turnCount * 0.5;
}
// ──────────────────────────────────────────────────────────────────────────────────

/** Map an item's fine-grained `detail` to the strategy that owns it. */
function strategyFor(detail) {
  if (detail === "gone" || detail === "stale-drift") return "injection";
  if (detail === "spent-tool" || detail === "spent-mcp" || detail === "duplicate") return "compact";
  if (detail === "stale-superseded") return "neither";
  return "other";
}

/**
 * Is this garbage label provable, or an inference? `spent` is the only heuristic
 * (we guess a one-shot output is "never referenced again"); every other class is
 * checkable against ground truth — file stat, mtime, content hash, or a later
 * in-session read of the same path. The provable share is how much of the
 * predicted win is safe to act on without risking a false positive.
 */
function isProvable(detail) {
  return detail !== "spent-tool" && detail !== "spent-mcp";
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

async function main() {
  const minKb = Number(arg("--min-kb", "150"));
  const limit = Number(arg("--limit", "1000"));
  const jsonOut = arg("--json", undefined);

  const tokens = new EstimateTokenCounter();
  const adapter = new ClaudeCodeAdapter(tokens);
  const repo = new FsRepoState();

  const refs = (await adapter.discover({}))
    .filter((r) => (r.sizeBytes ?? 0) >= minKb * 1024)
    .sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0))
    .slice(0, limit);

  console.log(`\nGlassbox cleaner eval — ${refs.length} sessions ≥ ${minKb}kb\n`);

  const rows = [];
  for (const ref of refs) {
    try {
      const session = await adapter.parse({ tool: "claude-code", locator: ref.locator });
      const pricing = pricingFor(session.messages.find((m) => m.model)?.model);
      const { snapshot, report } = await analyzeSessionReclaimable(session, {
        repo,
        tokens,
        ...(pricing ? { pricing } : {}),
      });
      // The single cleanup strategy: provable, lossless eviction.
      const eviction = planEviction(report, snapshot);

      // Coverage split: which strategy owns each reclaimable token.
      const domain = { injection: 0, compact: 0, neither: 0, other: 0 };
      let provableTokens = 0;
      for (const it of report.items) {
        domain[strategyFor(it.detail)] += it.tokens;
        if (isProvable(it.detail)) provableTokens += it.tokens;
      }

      const recl = report.reclaimableTokens || 0;
      const perTurn = report.wastedUsdPerTurn; // null if no pricing
      const turns = session.turns.length || 1;
      // Split per-turn waste proportionally to each strategy's token share.
      const share = (d) => (recl > 0 ? domain[d] / recl : 0);
      const injPerTurn = perTurn == null ? null : perTurn * share("injection");
      const cmpPerTurn = perTurn == null ? null : perTurn * share("compact");

      rows.push({
        project: session.projectPath.split("/").slice(-2).join("/"),
        sessionId: session.id.slice(0, 8),
        turns,
        totalTokens: report.totalTokens,
        reclaimableTokens: recl,
        reclaimablePct: report.reclaimablePct,
        provableTokens,
        domain,
        evictNetTokens: eviction.netReclaimedTokens,
        evictTombstoneTokens: eviction.tombstoneTokens,
        evictCount: eviction.actions.length,
        perTurnUsd: perTurn,
        injection: {
          tokens: domain.injection,
          perTurnUsd: injPerTurn,
          projectedUsd: injPerTurn == null ? null : projectSavings(injPerTurn, turns),
        },
        compact: {
          tokens: domain.compact,
          perTurnUsd: cmpPerTurn,
          projectedUsd: cmpPerTurn == null ? null : projectSavings(cmpPerTurn, turns),
        },
      });
    } catch (e) {
      console.log(
        `  ! skip ${ref.locator.split("/").pop()}: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  printTable(rows);
  printAggregate(rows);

  if (jsonOut) {
    writeFileSync(jsonOut, JSON.stringify(rows, null, 2));
    console.log(`\nwrote per-session JSON → ${jsonOut}\n`);
  }
}

function usd(n) {
  return n == null ? "  —  " : "$" + n.toFixed(n < 1 ? 4 : 2);
}
function pct(n) {
  return (n * 100).toFixed(1) + "%";
}
function k(n) {
  return n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);
}

function printTable(rows) {
  const head = ["PROJECT", "SES", "TRN", "CTX", "RECL", "%", "→INJ", "→CMP", "→SELF", "$/TURN"];
  const w = [22, 9, 4, 7, 7, 6, 6, 6, 6, 8];
  const fmt = (cells) => cells.map((c, i) => String(c).padEnd(w[i])).join(" ");
  console.log(fmt(head));
  console.log("─".repeat(w.reduce((a, b) => a + b + 1, 0)));
  for (const r of rows) {
    const recl = r.reclaimableTokens || 1;
    console.log(
      fmt([
        r.project.slice(0, 21),
        r.sessionId,
        r.turns,
        k(r.totalTokens),
        k(r.reclaimableTokens),
        pct(r.reclaimablePct),
        pct(r.domain.injection / recl),
        pct(r.domain.compact / recl),
        pct(r.domain.neither / recl),
        usd(r.perTurnUsd),
      ]),
    );
  }
}

function printAggregate(rows) {
  const sum = (f) => rows.reduce((a, r) => a + (f(r) || 0), 0);
  const totalRecl = sum((r) => r.reclaimableTokens);
  const totalCtx = sum((r) => r.totalTokens);
  const inj = sum((r) => r.domain.injection);
  const cmp = sum((r) => r.domain.compact);
  const self = sum((r) => r.domain.neither);
  const injProj = sum((r) => r.injection.projectedUsd);
  const cmpProj = sum((r) => r.compact.projectedUsd);

  const provable = sum((r) => r.provableTokens);
  const evictNet = sum((r) => r.evictNetTokens);
  const evictTomb = sum((r) => r.evictTombstoneTokens);
  const evictCount = sum((r) => r.evictCount);
  // What each mechanism can act on, now that eviction exists:
  //   injection clears gone+drift; /compact clears spent+duplicate;
  //   eviction (fork+tombstone) clears stale-superseded surgically.
  const actionableToday = inj + cmp + self;

  console.log("\n══ CORPUS TOTALS ════════════════════════════════════════");
  console.log(`  sessions analyzed     ${rows.length}`);
  console.log(`  context tokens        ${k(totalCtx)}`);
  console.log(
    `  reclaimable tokens    ${k(totalRecl)}  (${pct(totalRecl / (totalCtx || 1))} of context)`,
  );

  console.log("\n  ── DOES IT WORK? predicted effectiveness ──");
  console.log(`  1. problem size       ${pct(totalRecl / (totalCtx || 1))} of context is garbage`);
  console.log(
    `  2. detection trust    ${pct(provable / (totalRecl || 1))} of garbage is PROVABLE (rest is the spent heuristic)`,
  );
  console.log(
    `  3. mechanism reach    ${pct(actionableToday / (totalRecl || 1))} of garbage a solution can now clear`,
  );
  console.log(
    `        ├ injection     ${pct(inj / (totalRecl || 1))}  (gone + stale-drift, provable)`,
  );
  console.log(`        ├ /compact      ${pct(cmp / (totalRecl || 1))}  (spent + duplicate)`);
  console.log(
    `        └ eviction NEW  ${pct(self / (totalRecl || 1))}  (stale-superseded, surgical fork+tombstone)`,
  );
  console.log(
    `  4. eviction detail    ${evictCount} copies tombstoned; ${k(evictTomb)} tok tombstone cost → ${k(evictNet)} tok net reclaimed`,
  );
  console.log(
    `  5. net context win    cleaning all addressable garbage shrinks context by ${pct((inj + cmp + evictNet) / (totalCtx || 1))}`,
  );

  console.log("\n  ── projected $ saved (priced sessions only; horizon = projectSavings) ──");
  console.log(`  via CLAUDE.md inject  ${usd(injProj)}`);
  console.log(`  via /compact          ${usd(cmpProj)}`);
  console.log(`  combined              ${usd(injProj + cmpProj)}`);
  console.log("═════════════════════════════════════════════════════════\n");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
