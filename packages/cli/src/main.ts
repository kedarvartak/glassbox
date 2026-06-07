#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { ClaudeCodeAdapter, claudeProjectsRoot, forkTranscript } from "@glassbox/adapter-claude-code";
import {
  analyzeSessionCost,
  analyzeSessionReclaimable,
  checkTokenAccuracy,
  composition,
  FsRepoState,
  PRICING_AS_OF,
  compactCommand,
  plan,
  planEviction,
  pricingFor,
  suggestedCompactFocus,
  upsertHygieneBlock,
} from "@glassbox/analysis";
import { SessionIndex, SessionIndexer } from "@glassbox/store";
import { startServer, uiIsBuilt } from "./server.js";
import { EstimateTokenCounter } from "./token-counter.js";
import {
  bold, dim, gray, green, yellow, red, nl, hr,
  fmtUsd, fmtTok, fmtPct, fmtInt,
  renderHeader, renderStats, renderXray, renderCost, renderReclaimable, renderSessions,
  renderCleanPlan, renderCompactCommand,
} from "./render.js";

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
      const model = session.messages.find((m) => m.model)?.model ?? "—";

      renderHeader({
        sessionId: session.id,
        projectPath: session.projectPath,
        gitBranch: session.gitBranch,
        toolVersion: session.toolVersion,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        messageCount: session.messages.length,
        turnCount: session.turns.length,
        toolCallCount: session.toolCalls.length,
        fileOpCount: session.fileOps.length,
        memoryOpCount: session.memoryOps.length,
      }, model);

      renderCost({
        totalUsd: cost.totalUsd,
        inputUsd: cost.breakdown.inputUsd,
        outputUsd: cost.breakdown.outputUsd,
        cacheReadUsd: cost.breakdown.cacheReadUsd,
        cacheWriteUsd: cost.breakdown.cacheWriteUsd,
        cacheSavingsUsd: cost.cacheSavingsUsd,
        unpricedMessages: cost.unpricedMessages,
      });
      return 0;
    }

    case "xray": {
      const locator = rest[0];
      if (!locator) {
        console.error("usage: glassbox xray <session.jsonl>");
        return 2;
      }
      const session = await adapter.parse({ tool: "claude-code", locator });
      const pricing = pricingFor(session.messages.find((m) => m.model)?.model);
      const model = session.messages.find((m) => m.model)?.model ?? "—";
      const { snapshot, report } = await analyzeSessionReclaimable(session, {
        repo: new FsRepoState(),
        tokens,
        ...(pricing ? { pricing } : {}),
      });

      renderHeader({
        sessionId: session.id,
        projectPath: session.projectPath,
        gitBranch: session.gitBranch,
        toolVersion: session.toolVersion,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        messageCount: session.messages.length,
        turnCount: session.turns.length,
        toolCallCount: session.toolCalls.length,
        fileOpCount: session.fileOps.length,
        memoryOpCount: session.memoryOps.length,
      }, model);

      renderXray(composition(snapshot), snapshot.totalTokens);
      renderReclaimable({
        reclaimableTokens: report.reclaimableTokens,
        reclaimablePct: report.reclaimablePct,
        wastedUsdPerTurn: report.wastedUsdPerTurn,
        byStatus: report.byStatus as Record<string, number>,
        items: report.items.slice(0, 12),
      }, snapshot.totalTokens);
      return 0;
    }

    case "inspect": {
      const locator = rest[0];
      if (!locator) {
        console.error("usage: glassbox inspect <session.jsonl>");
        return 2;
      }
      const session = await adapter.parse({ tool: "claude-code", locator });
      const cost = analyzeSessionCost(session);
      const pricing = pricingFor(session.messages.find((m) => m.model)?.model);
      const model = session.messages.find((m) => m.model)?.model ?? "—";
      const { snapshot, report } = await analyzeSessionReclaimable(session, {
        repo: new FsRepoState(),
        tokens,
        ...(pricing ? { pricing } : {}),
      });

      renderHeader({
        sessionId: session.id,
        projectPath: session.projectPath,
        gitBranch: session.gitBranch,
        toolVersion: session.toolVersion,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        messageCount: session.messages.length,
        turnCount: session.turns.length,
        toolCallCount: session.toolCalls.length,
        fileOpCount: session.fileOps.length,
        memoryOpCount: session.memoryOps.length,
      }, model);

      renderStats([
        { label: "session cost",    value: fmtUsd(cost.totalUsd),                           sub: "actuals · exact" },
        { label: "context window",  value: fmtTok(snapshot.totalTokens) + " tok",            sub: `${snapshot.segments.length} segments` },
        { label: "reclaimable",     value: fmtPct(report.reclaimablePct),                    sub: `${fmtInt(report.reclaimableTokens)} tokens` },
        { label: "wasted / turn",   value: report.wastedUsdPerTurn !== null ? fmtUsd(report.wastedUsdPerTurn) : "—", sub: `${session.turns.length} turns` },
      ]);

      renderXray(composition(snapshot), snapshot.totalTokens);
      renderCost({
        totalUsd: cost.totalUsd,
        inputUsd: cost.breakdown.inputUsd,
        outputUsd: cost.breakdown.outputUsd,
        cacheReadUsd: cost.breakdown.cacheReadUsd,
        cacheWriteUsd: cost.breakdown.cacheWriteUsd,
        cacheSavingsUsd: cost.cacheSavingsUsd,
        unpricedMessages: cost.unpricedMessages,
      });
      renderReclaimable({
        reclaimableTokens: report.reclaimableTokens,
        reclaimablePct: report.reclaimablePct,
        wastedUsdPerTurn: report.wastedUsdPerTurn,
        byStatus: report.byStatus as Record<string, number>,
        items: report.items.slice(0, 12),
      }, snapshot.totalTokens);
      return 0;
    }

    case "clean": {
      const locator = rest[0];
      if (!locator) {
        console.error("usage: glassbox clean <session.jsonl> [--apply] [--compact] [--fork] [--yes] [--json]");
        return 2;
      }
      const session = await adapter.parse({ tool: "claude-code", locator });
      const pricing = pricingFor(session.messages.find((m) => m.model)?.model);
      const model = session.messages.find((m) => m.model)?.model ?? "—";
      const { snapshot, report } = await analyzeSessionReclaimable(session, {
        repo: new FsRepoState(),
        tokens,
        ...(pricing ? { pricing } : {}),
      });
      const cleanPlan = plan(report, session);

      if (rest.includes("--json")) {
        console.log(JSON.stringify(cleanPlan, null, 2));
        return 0;
      }

      const apply = rest.includes("--apply");
      const doCompact = rest.includes("--compact");
      const doFork = rest.includes("--fork");
      const assumeYes = rest.includes("--yes") || rest.includes("-y");

      renderHeader({
        sessionId: session.id,
        projectPath: session.projectPath,
        gitBranch: session.gitBranch,
        toolVersion: session.toolVersion,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        messageCount: session.messages.length,
        turnCount: session.turns.length,
        toolCallCount: session.toolCalls.length,
        fileOpCount: session.fileOps.length,
        memoryOpCount: session.memoryOps.length,
      }, model);

      renderCleanPlan(cleanPlan, !apply && !doCompact && !doFork);

      // ── Phase C: write the CLAUDE.md hygiene block (user-confirmed) ──
      if (apply) {
        if (cleanPlan.claudeMdBlocks.length === 0) {
          console.log(gray("  nothing to write — no file-level fixes in this plan."));
        } else {
          const claudeMdPath = join(session.projectPath, "CLAUDE.md");
          const existing = safeRead(claudeMdPath);
          const next = upsertHygieneBlock(existing, cleanPlan, new Date());
          if (next === existing) {
            console.log(green("  ✓ CLAUDE.md already up to date — nothing to write."));
          } else {
            console.log(`  ${bold("Target:")} ${claudeMdPath}`);
            console.log(`  ${dim(existing.trim() === "" ? "(new file)" : "appends/updates a managed Glassbox block; your content is untouched")}`);
            nl();
            const ok = assumeYes || await confirm(`  Write ${cleanPlan.claudeMdBlocks.length} hygiene line(s) to CLAUDE.md?`);
            if (ok) {
              writeFileSync(claudeMdPath, next, "utf8");
              console.log(green(`  ✓ wrote hygiene block to ${claudeMdPath}`));
            } else {
              console.log(gray("  aborted — no changes written."));
            }
          }
          nl();
        }
      }

      // ── Phase D: stage the /compact command (read-only — never auto-run) ──
      if (doCompact) {
        const focus = cleanPlan.compactRecommendation?.suggestedSummaryFocus
          ?? suggestedCompactFocus(session);
        const command = compactCommand(focus);
        const copied = assumeYes || await confirm("  Copy the /compact command to your clipboard?")
          ? await copyToClipboard(command)
          : false;
        renderCompactCommand(command, {
          copied,
          belowThreshold: cleanPlan.compactRecommendation === undefined,
        });
      }

      // ── Layer 2: write a cleaned fork with superseded copies tombstoned ──
      // Never mutates the original; produces a *new* <name>.cleaned.jsonl the
      // user can `claude --resume` from with a lighter window.
      if (doFork) {
        const eviction = planEviction(report, snapshot);
        const evictions = new Map<string, string>();
        for (const a of eviction.actions) {
          if (a.originToolCallId) evictions.set(a.originToolCallId, a.tombstone);
        }
        nl();
        hr("CLEANED FORK (Layer 2)");
        nl();
        if (evictions.size === 0) {
          console.log(gray("  nothing to evict — no superseded copies in this session."));
          nl();
          return 0;
        }

        const raw = safeRead(locator);
        if (raw === "") {
          console.log(red(`  cannot read transcript at ${locator}`));
          return 1;
        }
        const { text, summary } = forkTranscript(raw, evictions);
        const outPath = locator.endsWith(".jsonl")
          ? locator.replace(/\.jsonl$/, ".cleaned.jsonl")
          : `${locator}.cleaned.jsonl`;

        console.log(`  ${bold("Source:")} ${dim(locator)}  ${dim("(untouched)")}`);
        console.log(`  ${bold("Output:")} ${outPath}`);
        console.log(`  tombstoned ${green(String(summary.evicted))} superseded ` +
          `cop${summary.evicted === 1 ? "y" : "ies"}; ` +
          `${fmtInt(eviction.netReclaimedTokens)} tokens net reclaimed`);
        if (summary.notFound.length > 0) {
          console.log(gray(`  (${summary.notFound.length} planned eviction(s) had no locatable bytes — skipped)`));
        }
        nl();

        const ok = assumeYes || await confirm(`  Write cleaned fork to ${outPath}?`);
        if (!ok) {
          console.log(gray("  aborted — no file written."));
          return 0;
        }
        writeFileSync(outPath, text, "utf8");
        console.log(green(`  ✓ wrote ${outPath}`));

        // Integrity proof: re-parse the fork and re-measure. If this throws, the
        // rewrite broke the transcript; if it loads, resume is safe.
        try {
          const cleaned = await adapter.parse({ tool: "claude-code", locator: outPath });
          const after = await analyzeSessionReclaimable(cleaned, {
            repo: new FsRepoState(),
            tokens,
            ...(pricing ? { pricing } : {}),
          });
          const before = snapshot.totalTokens;
          const now = after.snapshot.totalTokens;
          console.log(green(`  ✓ fork re-parses cleanly (${cleaned.messages.length} messages intact)`));
          console.log(`  context tokens  ${fmtTok(before)} → ${fmtTok(now)}  ` +
            `(${fmtPct((before - now) / (before || 1))} lighter)`);
        } catch (e) {
          console.log(red(`  ! fork failed to re-parse: ${e instanceof Error ? e.message : String(e)}`));
          console.log(red(`    the original is untouched; do not resume from the fork.`));
          return 1;
        }
        nl();
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
        renderSessions(rows);
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

    case undefined:
    case "serve": {
      const index = SessionIndex.open(openDbPath(flag(rest, "--db")));
      try {
        const indexer = new SessionIndexer(adapter, index);
        const projectPath = flag(rest, "--project");
        const sync = await indexer.sync(projectPath ? { projectPath } : {});
        console.log(
          `indexed: scanned ${sync.scanned}, parsed ${sync.parsed}, unchanged ${sync.unchanged}, ` +
            `removed ${sync.removed}, failed ${sync.failed.length}  (${index.stats().sessions} total)`,
        );
        for (const f of sync.failed.slice(0, 10)) console.log(`  ! ${f.locator}: ${f.error}`);

        if (!(await uiIsBuilt())) {
          console.log("warning: built UI not found. Run `pnpm --filter @glassbox/ui build` before serving the dashboard.");
        }

        const requestedPort = Number(flag(rest, "--port") ?? "4317");
        const host = flag(rest, "--host") ?? "127.0.0.1";
        const server = await startAvailableServer(index, tokens, requestedPort, host);
        console.log(`Glassbox inspector: ${server.url}`);
        console.log("local-only, read-only. Press Ctrl-C to stop.");
        await new Promise<void>((resolve) => {
          process.once("SIGINT", () => {
            server.close();
            console.log("\nstopped.");
            resolve();
          });
        });
      } finally {
        index.close();
      }
      return 0;
    }

    case "help":
    case "--help":
    case "-h": {
      nl();
      console.log(bold("glassbox") + "  " + gray("x-ray & hygiene monitor for AI agent context"));
      nl();
      hr("COMMANDS");
      nl();
      const cmds: [string, string][] = [
        ["glassbox",                       "index sessions and launch the local web inspector"],
        ["serve [--port <n>]",             "launch the web inspector (default port 4317)"],
        ["inspect <session.jsonl>",        "full dashboard: stats + x-ray + cost + reclaimable"],
        ["xray <session.jsonl>",           "context composition by source + reclaimable tokens"],
        ["cost <session.jsonl>",           "cost breakdown from provider actuals"],
        ["clean <session.jsonl>",          "hygiene plan; --apply writes CLAUDE.md, --compact stages /compact, --fork writes a cleaned transcript"],
        ["sessions [--project <p>]",       "list indexed sessions (fast, no re-parse)"],
        ["index [--project <p>]",          "parse + incrementally index sessions into SQLite"],
        ["watch [--project <p>]",          "index then keep it live on file changes"],
        ["list [--project <p>]",           "discover Claude Code sessions on disk"],
        ["parse <session.jsonl>",          "dump the full normalized model as JSON"],
      ];
      const maxCmd = Math.max(...cmds.map(([c]) => c.length));
      for (const [cmd, desc] of cmds) {
        const parts = cmd.split(" ");
        const name = bold(parts[0] ?? "");
        const args = parts.slice(1).join(" ");
        const left = `  ${name}${args ? " " + gray(args) : ""}`;
        const pad  = " ".repeat(Math.max(1, maxCmd - cmd.length + 4));
        console.log(`${left}${pad}${gray(desc)}`);
      }
      nl();
      console.log(dim("  index/sessions/watch accept --db <path>  (default ~/.glassbox/index.db)"));
      nl();
      return 0;
    }

    default:
      console.error(`unknown command: ${command}`);
      console.error("run `glassbox help` for usage.");
      return 1;
  }
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

/** Read a file, returning "" if it doesn't exist (the CLAUDE.md-may-be-new case). */
function safeRead(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

/** Interactive y/N confirmation. Defaults to No on empty input or non-TTY. */
async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${question} ${dim("[y/N]")} `)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

/**
 * Best-effort copy to the system clipboard. Tries the platform's native tool;
 * returns false if none is available (the caller then tells the user to copy
 * manually). Never throws.
 */
function copyToClipboard(text: string): Promise<boolean> {
  const candidates: [string, string[]][] =
    platform() === "darwin"
      ? [["pbcopy", []]]
      : platform() === "win32"
        ? [["clip", []]]
        : [["wl-copy", []], ["xclip", ["-selection", "clipboard"]], ["xsel", ["--clipboard", "--input"]]];

  return new Promise((resolve) => {
    const tryNext = (i: number): void => {
      const entry = candidates[i];
      if (!entry) return resolve(false);
      const [cmd, args] = entry;
      const child = spawn(cmd, args, { stdio: ["pipe", "ignore", "ignore"] });
      child.on("error", () => tryNext(i + 1));
      child.on("close", (code) => (code === 0 ? resolve(true) : tryNext(i + 1)));
      child.stdin.end(text);
    };
    tryNext(0);
  });
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

async function startAvailableServer(
  index: SessionIndex,
  tokens: EstimateTokenCounter,
  requestedPort: number,
  host: string,
): Promise<{ url: string; close: () => void }> {
  const base = Number.isFinite(requestedPort) ? requestedPort : 4317;
  let lastError: unknown;
  for (let port = base; port < base + 10; port++) {
    try {
      return await startServer({ index, tokens, port, host });
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code !== "EADDRINUSE") throw err;
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`no available port from ${base} to ${base + 9}`);
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
