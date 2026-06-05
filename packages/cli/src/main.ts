#!/usr/bin/env node
import { ClaudeCodeAdapter } from "@glassbox/adapter-claude-code";
import { analyzeSessionCost, checkTokenAccuracy, PRICING_AS_OF } from "@glassbox/analysis";
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

    default:
      console.log(
        [
          "glassbox — x-ray & hygiene monitor for AI agent context",
          "",
          "commands:",
          "  list [--project <path>]   discover Claude Code sessions on disk",
          "  parse <session.jsonl>     parse a session into the normalized model (Phase 1)",
          "  cost <session.jsonl>      cost from provider actuals + token-estimate accuracy",
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
