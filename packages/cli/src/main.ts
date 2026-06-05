#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { ClaudeCodeAdapter, claudeProjectsRoot } from "@glassbox/adapter-claude-code";
import {
  analyzeReclaimable,
  analyzeSessionCost,
  checkTokenAccuracy,
  composition,
  FsRepoState,
  PRICING_AS_OF,
  pricingFor,
  reconstructContext,
} from "@glassbox/analysis";
import { SessionIndex, SessionIndexer } from "@glassbox/store";
import { EstimateTokenCounter } from "./token-counter.js";

/**
 * `glassbox` entry point. Hand-rolled dispatch (no arg-parsing dep) keeps the
 * skeleton lean; we add a real command framework if/when subcommands multiply.
 *
 * Working today: `list` (discovery). `parse` is wired to the adapter but the
 * parser itself is the Phase-1 build (it currently throws a clear NotImplemented).
 */
async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  const tokens = new EstimateTokenCounter();
  const adapter = new ClaudeCodeAdapter(tokens);

  switch (command) {
    case "list": {
      const projectPath = flag(rest, "--project");
      const refs = await adapter.discover(projectPath ? { projectPath } : {});
      if (refs.length === 0) {
        console.log("No Claude Code sessions found under ~/.claude/projects.");
        return 0;
      }
      refs
        .sort((a, b) => (b.modifiedAt ?? "").localeCompare(a.modifiedAt ?? ""))
        .forEach((r) => {
          const kb = r.sizeBytes ? `${Math.round(r.sizeBytes / 1024)}kb` : "?";
          console.log(`${r.modifiedAt ?? "????"}  ${kb.padStart(7)}  ${r.locator}`);
        });
      return 0;
    }

    case "parse": {
      const locator = rest[0];
      if (!locator) {
        console.error("usage: glassbox parse <session.jsonl>");
        return 2;
      }
      const session = await adapter.parse({ tool: "claude-code", locator });
      console.log(JSON.stringify(session, null, 2));
      return 0;
    }

    case "cost": {
      const locator = rest[0];
      if (!locator) {
        console.error("usage: glassbox cost <session.jsonl>");
        return 2;
      }
      const session = await adapter.parse({ tool: "claude-code", locator });
      const cost = analyzeSessionCost(session);
      const accuracy = checkTokenAccuracy(session, tokens);

      const { breakdown } = cost;
      console.log(`session ${session.id}  (pricing as of ${PRICING_AS_OF})`);
      console.log(`  model(s):     ${cost.models.map((m) => `${m.model}${m.priced ? "" : " (unpriced)"}`).join(", ") || "—"}`);
      console.log(`  total cost:   ${usd(cost.totalUsd)}`);
      console.log(`    input:      ${usd(breakdown.inputUsd)}`);
      console.log(`    output:     ${usd(breakdown.outputUsd)}`);
      console.log(`    cache read: ${usd(breakdown.cacheReadUsd)}   (context re-ingested every turn — the recarry tax)`);
      console.log(`    cache write:${usd(breakdown.cacheWriteUsd)}`);
      console.log(`  cache saved:  ${usd(cost.cacheSavingsUsd)}   (vs paying full input rate for re-reads)`);
      if (cost.unpricedMessages > 0) {
        console.log(`  note: ${cost.unpricedMessages} message(s) had an unknown model and are excluded from cost.`);
      }
      console.log(`  token check:  ${accuracy.note}`);
      return 0;
    }

    case "xray": {
      const locator = rest[0];
      if (!locator) {
        console.error("usage: glassbox xray <session.jsonl>");
        return 2;
      }
      const session = await adapter.parse({ tool: "claude-code", locator });
      const snapshot = reconstructContext(session, { tokens });
      const pricing = pricingFor(session.messages.find((m) => m.model)?.model);
      const repo = new FsRepoState();
      const report = await analyzeReclaimable(snapshot, { repo, ...(pricing ? { pricing } : {}) });

      console.log(`session ${session.id}`);
      console.log(
        `  resident (attributed): ${snapshot.totalTokens.toLocaleString("en-US")} tokens in ` +
          `${snapshot.segments.length} segments`,
      );
      console.log("  composition by source:");
      for (const { source, tokens: t } of composition(snapshot)) {
        const pct = snapshot.totalTokens ? Math.round((100 * t) / snapshot.totalTokens) : 0;
        console.log(`    ${source.padEnd(12)} ${String(t).padStart(8)}  ${String(pct).padStart(3)}%`);
      }
      console.log(
        `  reclaimable: ${report.reclaimableTokens.toLocaleString("en-US")} tokens ` +
          `(${Math.round(report.reclaimablePct * 100)}% of attributed)` +
          (report.wastedUsdPerTurn !== null
            ? ` — ~${usd(report.wastedUsdPerTurn)}/turn it persists`
            : ""),
      );
      const bs = report.byStatus;
      console.log(`    gone ${bs.gone}  stale ${bs.stale}  spent ${bs.spent}  duplicate ${bs.duplicate}`);
      for (const item of report.items.slice(0, 8)) {
        console.log(`    - ${item.status} ${String(item.tokens).padStart(6)} tok  ${item.label}`);
      }
      if (report.items.length === 0) {
        console.log("    (nothing reclaimable detected — needs deleted/overwritten files to flag)");
      }
      return 0;
    }

    case "index": {
      const index = SessionIndex.open(openDbPath(flag(rest, "--db")));
      try {
        const indexer = new SessionIndexer(adapter, index);
        const projectPath = flag(rest, "--project");
        const r = await indexer.sync(projectPath ? { projectPath } : {});
        console.log(
          `indexed: scanned ${r.scanned}, parsed ${r.parsed}, unchanged ${r.unchanged}, ` +
            `removed ${r.removed}, failed ${r.failed.length}  (${index.stats().sessions} total)`,
        );
        for (const f of r.failed.slice(0, 10)) console.log(`  ! ${f.locator}: ${f.error}`);
      } finally {
        index.close();
      }
      return 0;
    }

    case "sessions": {
      const index = SessionIndex.open(openDbPath(flag(rest, "--db")));
      try {
        const projectPath = flag(rest, "--project");
        const limit = flag(rest, "--limit");
        const rows = index.list({
          ...(projectPath ? { projectPath } : {}),
          ...(limit ? { limit: Number(limit) } : {}),
        });
        if (rows.length === 0) {
          console.log("index empty — run `glassbox index` first.");
          return 0;
        }
        for (const m of rows) {
          console.log(
            `${m.endedAt}  ${m.sessionId.slice(0, 8)}  ` +
              `${String(m.messageCount).padStart(4)} msg ${String(m.toolCallCount).padStart(3)} tool ` +
              `${String(m.memoryOpCount).padStart(2)} mem  ${m.projectPath}`,
          );
        }
        console.log(`(${rows.length} sessions, from the index — no re-parse)`);
      } finally {
        index.close();
      }
      return 0;
    }

    case "watch": {
      const index = SessionIndex.open(openDbPath(flag(rest, "--db")));
      const indexer = new SessionIndexer(adapter, index);
      const root = claudeProjectsRoot();
      const projectPath = flag(rest, "--project");
      const watcher = await indexer.watch({
        roots: [root],
        ...(projectPath ? { discover: { projectPath } } : {}),
        onEvent: (e) => {
          if (e.type === "ready") {
            const r = e.result;
            console.log(
              `watching ${root}\n  initial sync: ${r.parsed} parsed, ${r.unchanged} unchanged, ` +
                `${r.removed} removed (${index.stats().sessions} indexed). Ctrl-C to stop.`,
            );
          } else if (e.type === "upserted") console.log(`  + ${e.locator}`);
          else if (e.type === "removed") console.log(`  - ${e.locator}`);
          else console.log(`  ! ${e.locator}: ${e.error}`);
        },
      });
      await new Promise<void>((resolve) => {
        process.once("SIGINT", () => {
          watcher.close();
          index.close();
          console.log("\nstopped.");
          resolve();
        });
      });
      return 0;
    }

    default:
      console.log(
        [
          "glassbox — x-ray & hygiene monitor for AI agent context",
          "",
          "commands:",
          "  list [--project <path>]   discover Claude Code sessions on disk",
          "  parse <session.jsonl>     parse a session into the normalized model (Phase 1)",
          "  cost <session.jsonl>      cost from provider actuals + token-estimate accuracy",
          "  xray <session.jsonl>      context composition by source + reclaimable tokens",
          "  index [--project <p>]     parse + (incrementally) index sessions into SQLite",
          "  sessions [--project <p>]  list indexed sessions fast (metadata only, no re-parse)",
          "  watch [--project <p>]     index, then keep it live on file changes (Ctrl-C to stop)",
          "",
          "  (index/sessions/watch take --db <path>; default ~/.glassbox/index.db)",
        ].join("\n"),
      );
      return command ? 1 : 0;
  }
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

/** Format USD with enough precision to show sub-cent agent costs honestly. */
function usd(n: number): string {
  return n >= 0.01 || n === 0 ? `$${n.toFixed(4)}` : `$${n.toExponential(2)}`;
}

/**
 * Resolve the index db path (default `~/.glassbox/index.db`) and ensure its
 * directory exists. Our own store dir — never the user's project (doc 17 §6).
 */
function openDbPath(override: string | undefined): string {
  const path = override ?? join(homedir(), ".glassbox", "index.db");
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

// Set `exitCode` rather than calling `process.exit()`: a parsed session can be
// many MB of JSON, and `console.log` to a pipe is async — force-exiting would
// truncate stdout at the OS pipe-buffer boundary. Letting the event loop drain
// guarantees the full normalized model is written before we exit.
main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
