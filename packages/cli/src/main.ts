#!/usr/bin/env node
import { ClaudeCodeAdapter } from "@glassbox/adapter-claude-code";
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
  const adapter = new ClaudeCodeAdapter(new EstimateTokenCounter());

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

    default:
      console.log(
        [
          "glassbox — x-ray & hygiene monitor for AI agent context",
          "",
          "commands:",
          "  list [--project <path>]   discover Claude Code sessions on disk",
          "  parse <session.jsonl>     parse a session into the normalized model (Phase 1)",
        ].join("\n"),
      );
      return command ? 1 : 0;
  }
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
