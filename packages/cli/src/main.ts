#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  ClaudeCodeAdapter,
  claudeProjectsRoot,
  forkTranscript,
  applyTrimTranscript,
  extractColdText,
  composeCompactedTranscript,
  validateTranscript,
  newProblems,
} from "@glassbox/adapter-claude-code";
import {
  analyzeSessionCost,
  analyzeSessionReclaimable,
  checkTokenAccuracy,
  composition,
  FsRepoState,
  PRICING_AS_OF,
  planEviction,
  planTrim,
  planSummarize,
  buildArtifactLedger,
  pricingFor,
  PROVABLE_CLASSES,
  TIER1_CLASSES,
} from "@glassbox/analysis";
import { callSummarizer, SummarizerError } from "./summarize.js";
import { runBench, MAX_PROBES, type BenchResult } from "./bench.js";

const SUMMARIZE_MODEL_DISPLAY = "claude-haiku-4-5";

function buildPreambleContent(originalSessionId: string, ledger: string, digest: string): string {
  return [
    `[glassbox: digest of earlier context — original session ${originalSessionId} preserved and untouched]`,
    "",
    ledger,
    "## Summary of earlier reasoning",
    "",
    digest,
  ].join("\n");
}
import { SessionIndex, SessionIndexer } from "@glassbox/store";
import { EstimateTokenCounter } from "./token-counter.js";
import {
  bold,
  dim,
  gray,
  green,
  yellow,
  red,
  nl,
  hr,
  fmtUsd,
  fmtTok,
  fmtPct,
  fmtInt,
  renderHeader,
  renderStats,
  renderXray,
  renderCost,
  renderReclaimable,
  renderSessions,
  renderEvictionPlan,
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
      const locator = rest[0] ?? (await pickSession(adapter));
      if (!locator) {
        console.error("usage: glassbox parse <session.jsonl>");
        return 2;
      }
      const session = await adapter.parse({ tool: "claude-code", locator });
      console.log(JSON.stringify(session, null, 2));
      return 0;
    }

    case "cost": {
      const locator = rest[0] ?? (await pickSession(adapter));
      if (!locator) {
        console.error("usage: glassbox cost <session.jsonl>");
        return 2;
      }
      const session = await adapter.parse({ tool: "claude-code", locator });
      const cost = analyzeSessionCost(session);
      const model = session.messages.find((m) => m.model)?.model ?? "—";

      renderHeader(
        {
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
        },
        model,
      );

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
      const locator = rest[0] ?? (await pickSession(adapter));
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

      renderHeader(
        {
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
        },
        model,
      );

      renderXray(composition(snapshot), snapshot.totalTokens);
      renderReclaimable(
        {
          reclaimableTokens: report.reclaimableTokens,
          reclaimablePct: report.reclaimablePct,
          wastedUsdPerTurn: report.wastedUsdPerTurn,
          byStatus: report.byStatus as Record<string, number>,
          items: report.items.slice(0, 12),
        },
        snapshot.totalTokens,
      );
      return 0;
    }

    case "inspect": {
      const locator = rest[0] ?? (await pickSession(adapter));
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

      renderHeader(
        {
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
        },
        model,
      );

      renderStats([
        { label: "session cost", value: fmtUsd(cost.totalUsd), sub: "actuals · exact" },
        {
          label: "context window",
          value: fmtTok(snapshot.totalTokens) + " tok",
          sub: `${snapshot.segments.length} segments`,
        },
        {
          label: "reclaimable",
          value: fmtPct(report.reclaimablePct),
          sub: `${fmtInt(report.reclaimableTokens)} tokens`,
        },
        {
          label: "wasted / turn",
          value: report.wastedUsdPerTurn !== null ? fmtUsd(report.wastedUsdPerTurn) : "—",
          sub: `${session.turns.length} turns`,
        },
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
      renderReclaimable(
        {
          reclaimableTokens: report.reclaimableTokens,
          reclaimablePct: report.reclaimablePct,
          wastedUsdPerTurn: report.wastedUsdPerTurn,
          byStatus: report.byStatus as Record<string, number>,
          items: report.items.slice(0, 12),
        },
        snapshot.totalTokens,
      );
      return 0;
    }

    case "clean": {
      const locator = rest[0] ?? (await pickSession(adapter));
      if (!locator) {
        console.error("usage: glassbox clean <session.jsonl> [--fork] [--yes] [--json]");
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
      const eviction = planEviction(report, snapshot);

      if (rest.includes("--json")) {
        console.log(JSON.stringify(eviction, null, 2));
        return 0;
      }

      const doFork = rest.includes("--fork");
      const assumeYes = rest.includes("--yes") || rest.includes("-y");

      renderHeader(
        {
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
        },
        model,
      );

      renderEvictionPlan(eviction, { dryRun: !doFork });

      // ── Write a cleaned fork: provable garbage tombstoned into a new session ──
      // Never mutates the original; produces a *new* <newId>.jsonl the user can
      // `claude --resume` from with a lighter, lossless window.
      if (doFork) {
        const evictions = new Map<string, string>();
        for (const a of eviction.actions) {
          if (a.originToolCallId) evictions.set(a.originToolCallId, a.tombstone);
        }
        nl();
        hr("CLEANED FORK");
        nl();
        if (evictions.size === 0) {
          console.log(gray("  nothing to evict — no provable garbage in this session."));
          nl();
          return 0;
        }

        const raw = safeRead(locator);
        if (raw === "") {
          console.log(red(`  cannot read transcript at ${locator}`));
          return 1;
        }
        // Mint a fresh session id so Claude Code lists the fork as its own
        // resumable session; the filename must equal that id (doc: filename ==
        // internal sessionId). The original session is left fully intact.
        const newSessionId = randomUUID();
        const { text, summary } = forkTranscript(raw, evictions, { newSessionId });
        const outPath = join(dirname(locator), `${newSessionId}.jsonl`);

        console.log(`  ${bold("Source:")} ${dim(locator)}  ${dim("(untouched)")}`);
        console.log(`  ${bold("New session:")} ${green(newSessionId)}`);
        console.log(`  ${bold("Output:")} ${outPath}`);
        console.log(
          `  tombstoned ${green(String(summary.evicted))} superseded ` +
            `cop${summary.evicted === 1 ? "y" : "ies"}; ` +
            `${fmtInt(eviction.netReclaimedTokens)} tokens net reclaimed`,
        );
        if (summary.notFound.length > 0) {
          console.log(
            gray(
              `  (${summary.notFound.length} planned eviction(s) had no locatable bytes — skipped)`,
            ),
          );
        }
        nl();

        // ── Safety gate: the fork must introduce no new structural problems ──
        // (orphaned tool pairs, dangling parentUuid, empty content, bad JSON).
        const before = validateTranscript(raw);
        const after = validateTranscript(text);
        const introduced = newProblems(before, after);
        console.log(
          `  ${bold("Integrity:")} ${after.toolUses} tool_use / ${after.toolResults} tool_result · ${after.messages} messages`,
        );
        if (introduced.length > 0) {
          console.log(
            red(
              `  ✗ fork would introduce ${introduced.length} structural problem(s) — refusing to write:`,
            ),
          );
          for (const p of introduced.slice(0, 8)) console.log(red(`      ${p.code}  ${p.detail}`));
          console.log(
            gray(
              `  your original is untouched. This is a bug in the fork-writer; please report it.`,
            ),
          );
          return 1;
        }
        console.log(
          green(
            `  ✓ no new structural problems vs the original (pairing, threading, content all intact)`,
          ),
        );
        if (before.problems.length > 0) {
          console.log(
            gray(
              `  (the original already has ${before.problems.length} pre-existing oddit(ies); carried over unchanged)`,
            ),
          );
        }
        nl();

        const ok = assumeYes || (await confirm(`  Write cleaned fork to ${outPath}?`));
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
          const reAnalyzed = await analyzeSessionReclaimable(cleaned, {
            repo: new FsRepoState(),
            tokens,
            ...(pricing ? { pricing } : {}),
          });
          const beforeTok = snapshot.totalTokens;
          const nowTok = reAnalyzed.snapshot.totalTokens;
          console.log(
            green(`  ✓ fork re-parses cleanly (${cleaned.messages.length} messages intact)`),
          );
          console.log(
            `  context tokens  ${fmtTok(beforeTok)} → ${fmtTok(nowTok)}  ` +
              `(${fmtPct((beforeTok - nowTok) / (beforeTok || 1))} lighter)`,
          );
        } catch (e) {
          console.log(
            red(`  ! fork failed to re-parse: ${e instanceof Error ? e.message : String(e)}`),
          );
          console.log(red(`    the original is untouched; do not resume from the fork.`));
          return 1;
        }
        nl();
        console.log(
          `  ${bold("To try it:")} from this project's directory, run ${green("claude --resume")}`,
        );
        console.log(
          `  and pick the newest session (${dim(newSessionId.slice(0, 8))}…). Your original is still there.`,
        );
        nl();
      }
      return 0;
    }

    case "compact": {
      const locator = rest[0] ?? (await pickSession(adapter));
      if (!locator) {
        console.error("usage: glassbox compact <session.jsonl> [--fork] [--yes]");
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

      const doFork = rest.includes("--fork");
      const assumeYes = rest.includes("--yes") || rest.includes("-y");

      renderHeader(
        {
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
        },
        model,
      );

      // Tier 0: provable garbage (lossless)
      const tier0 = planEviction(report, snapshot, { classes: PROVABLE_CLASSES });
      // Tier 1: + spent observations (verbatim deletion, no model)
      const tier1 = planEviction(report, snapshot, { classes: TIER1_CLASSES });
      const spentActions = tier1.actions.filter(
        (a) => a.detail === "spent-tool" || a.detail === "spent-mcp",
      );
      // Tier 2: verbatim line-trim of cold live bulk segments
      const trimPlan = planTrim(snapshot, session);

      renderEvictionPlan(tier0, { dryRun: !doFork });

      // ── Tier 1 ──────────────────────────────────────────────────────────────
      nl();
      hr("TIER 1 — OBSERVATION CLEARING");
      nl();
      if (spentActions.length === 0) {
        console.log(gray("  no spent tool outputs outside the working set."));
      } else {
        console.log(
          `  ${dim("tool call stays intact; only the heavy result bytes are cleared — no model call, no risk")}`,
        );
        nl();
        for (const a of spentActions.slice(0, 14)) {
          const tok = bold(fmtTok(a.reclaimableTokens)).padStart(7);
          console.log(
            `  ${yellow("SPENT")}  ${tok}  ${gray(a.detail === "spent-mcp" ? "mcp output" : (a.path ?? "tool output"))}`,
          );
        }
        if (spentActions.length > 14) console.log(dim(`  … and ${spentActions.length - 14} more`));
        nl();
        const spentTokens = spentActions.reduce((s, a) => s + a.reclaimableTokens, 0);
        const spentTombstones = spentActions.reduce((s, a) => s + a.tombstoneTokens, 0);
        console.log(
          `  ${dim("tier 1:")} ${bold(String(spentActions.length))} spent outputs` +
            `  ${dim("·")}  ${bold(fmtTok(spentTokens))} tok cleared` +
            `  ${dim("·")}  ${green(fmtTok(spentTokens - spentTombstones) + " net")}`,
        );
      }

      // ── Tier 2 ──────────────────────────────────────────────────────────────
      nl();
      hr("TIER 2 — VERBATIM LINE TRIM");
      nl();
      if (trimPlan.actions.length === 0) {
        console.log(gray("  no cold live bulk segments above the size floor."));
      } else {
        console.log(
          `  ${dim("cold live segments trimmed to skeleton: head + tail + artifact lines — no model, no fabrication risk")}`,
        );
        nl();
        for (const a of trimPlan.actions.slice(0, 14)) {
          const tok = bold(fmtTok(a.currentTokens)).padStart(7);
          console.log(`  ${yellow("TRIM")}   ${tok}  ${gray(a.label)}`);
        }
        if (trimPlan.actions.length > 14)
          console.log(dim(`  … and ${trimPlan.actions.length - 14} more`));
        nl();
        console.log(
          `  ${dim("tier 2:")} ${bold(String(trimPlan.actions.length))} segments` +
            `  ${dim("·")}  ${bold(fmtTok(trimPlan.trimCandidateTokens))} tok in candidates` +
            `  ${dim("·")}  ${green("actual savings at write time")}`,
        );
      }

      // ── Tier 3 ──────────────────────────────────────────────────────────────
      const summarizePlan = planSummarize(snapshot, session);
      nl();
      hr("TIER 3 — GUIDED SUMMARIZATION");
      nl();
      if (!summarizePlan || !summarizePlan.hasContent) {
        console.log(
          gray(
            "  no cold reasoning prose above the threshold (session too short, or reasoning already cold-cleared).",
          ),
        );
      } else {
        const hasApiKey = !!process.env["ANTHROPIC_API_KEY"];
        console.log(
          `  ${dim("cold reasoning from turns 0–")}${bold(String(summarizePlan.boundaryTurnIndex - 1))}` +
            `  ${dim("·")}  ${bold(fmtTok(summarizePlan.coldReasoningTokens))} tok` +
            `  ${dim("·")}  ${bold(String(summarizePlan.coldMessageIds.size))} messages in cold prefix`,
        );
        console.log(
          `  working set: ${dim("turns ")}${bold(String(summarizePlan.boundaryTurnIndex))}${dim("–end preserved verbatim")}`,
        );
        if (!hasApiKey) {
          console.log(
            yellow(`  ⚠  ANTHROPIC_API_KEY not set — Tier 3 will be skipped at write time`),
          );
        } else {
          console.log(
            dim(
              `  will call ${SUMMARIZE_MODEL_DISPLAY} to compress cold reasoning → structured digest`,
            ),
          );
        }
      }
      nl();

      // ── Combined summary ─────────────────────────────────────────────────────
      hr("COMBINED");
      nl();
      console.log(
        `  ${dim("tier 0:")}  ${bold(fmtTok(tier0.netReclaimedTokens))} tok` +
          `  ${dim("  tier 1:")}  ${bold(fmtTok(tier1.netReclaimedTokens - tier0.netReclaimedTokens))} tok` +
          `  ${dim("  tier 2:")}  ${bold(fmtTok(trimPlan.trimCandidateTokens))} tok in` +
          (summarizePlan?.hasContent
            ? `  ${dim("  tier 3:")}  ${bold(fmtTok(summarizePlan.coldReasoningTokens))} tok in`
            : ""),
      );
      console.log(
        `  ${bold("eviction net:")}  ${green(fmtTok(tier1.netReclaimedTokens))} tok` +
          `  ${dim("(")}${fmtPct(tier1.netReclaimedTokens / (snapshot.totalTokens || 1))} of window${dim(")")}`,
      );
      nl();

      if (!doFork) {
        console.log(dim(`  dry run — add ${bold("--fork")} to write a compacted session.`));
        nl();
        return 0;
      }

      if (
        tier1.actions.length === 0 &&
        trimPlan.actions.length === 0 &&
        (!summarizePlan || !summarizePlan.hasContent)
      ) {
        console.log(gray("  nothing to compact."));
        nl();
        return 0;
      }

      const raw = safeRead(locator);
      if (raw === "") {
        console.log(red(`  cannot read transcript at ${locator}`));
        return 1;
      }

      // Apply Tier 0 + Tier 1 (tombstones) then Tier 2 (line trim) in sequence.
      const newSessionId = randomUUID();
      const evictions = new Map<string, string>();
      for (const a of tier1.actions) {
        if (a.originToolCallId) evictions.set(a.originToolCallId, a.tombstone);
      }
      const { text: afterTier1, summary: evictSummary } = forkTranscript(raw, evictions, {
        newSessionId,
      });
      const { text: afterTier2, summary: trimSummary } = applyTrimTranscript(
        afterTier1,
        trimPlan.actions,
      );

      // Apply Tier 3: summarize cold reasoning, compose synthetic preamble.
      let finalText = afterTier2;
      let tier3Applied = false;
      if (summarizePlan?.hasContent && process.env["ANTHROPIC_API_KEY"]) {
        hr("TIER 3 — SUMMARIZING");
        nl();
        try {
          const coldText = extractColdText(raw, summarizePlan.coldMessageIds);
          const ledger = buildArtifactLedger(session, summarizePlan.coldMessageIds);
          console.log(
            dim(
              `  calling ${SUMMARIZE_MODEL_DISPLAY} to compress ${fmtTok(summarizePlan.coldReasoningTokens)} tok…`,
            ),
          );
          const digest = await callSummarizer(coldText, ledger);
          const preambleContent = buildPreambleContent(session.id, ledger, digest);
          const { text: compacted, droppedLines } = composeCompactedTranscript(
            afterTier2,
            preambleContent,
            summarizePlan.boundaryMessageId,
            newSessionId,
          );
          finalText = compacted;
          tier3Applied = true;
          console.log(
            green(
              `  ✓ summarized — dropped ${droppedLines} cold lines, synthetic preamble inserted`,
            ),
          );
        } catch (e) {
          if (e instanceof SummarizerError) {
            console.log(
              yellow(`  ⚠ summarizer failed: ${e.message} — writing Tier 0–2 result only`),
            );
          } else {
            throw e;
          }
        }
        nl();
      }

      const outPath = join(dirname(locator), `${newSessionId}.jsonl`);
      console.log(`  ${bold("Source:")} ${dim(locator)}  ${dim("(untouched)")}`);
      console.log(`  ${bold("New session:")} ${green(newSessionId)}`);
      console.log(`  ${bold("Output:")} ${outPath}`);
      console.log(
        `  tombstoned ${green(String(evictSummary.evicted))} segment(s)` +
          `  ·  trimmed ${green(String(trimSummary.trimmed))} block(s)` +
          `  ·  ${green(String(trimSummary.linesRemoved))} lines removed` +
          (tier3Applied ? `  ·  ${green("cold prefix summarized")}` : ""),
      );
      if (evictSummary.notFound.length > 0) {
        console.log(
          gray(`  (${evictSummary.notFound.length} eviction(s) had no locatable bytes — skipped)`),
        );
      }
      if (trimSummary.notFound.length > 0) {
        console.log(
          gray(`  (${trimSummary.notFound.length} trim(s) had no locatable content — skipped)`),
        );
      }
      nl();

      const before = validateTranscript(raw);
      const after = validateTranscript(finalText);
      const introduced = newProblems(before, after);
      console.log(
        `  ${bold("Integrity:")} ${after.toolUses} tool_use / ${after.toolResults} tool_result · ${after.messages} messages`,
      );
      if (introduced.length > 0) {
        console.log(
          red(
            `  ✗ compaction would introduce ${introduced.length} structural problem(s) — refusing to write:`,
          ),
        );
        for (const p of introduced.slice(0, 8)) console.log(red(`      ${p.code}  ${p.detail}`));
        console.log(gray(`  your original is untouched.`));
        return 1;
      }
      console.log(green(`  ✓ no new structural problems (tool pairing intact)`));
      nl();

      const ok = assumeYes || (await confirm(`  Write compacted session to ${outPath}?`));
      if (!ok) {
        console.log(gray("  aborted — no file written."));
        return 0;
      }
      writeFileSync(outPath, finalText, "utf8");
      console.log(green(`  ✓ wrote ${outPath}`));

      try {
        const compacted = await adapter.parse({ tool: "claude-code", locator: outPath });
        const reAnalyzed = await analyzeSessionReclaimable(compacted, {
          repo: new FsRepoState(),
          tokens,
          ...(pricing ? { pricing } : {}),
        });
        const beforeTok = snapshot.totalTokens;
        const nowTok = reAnalyzed.snapshot.totalTokens;
        console.log(
          green(
            `  ✓ compacted session re-parses cleanly (${compacted.messages.length} messages intact)`,
          ),
        );
        console.log(
          `  context tokens  ${fmtTok(beforeTok)} → ${fmtTok(nowTok)}  (${fmtPct((beforeTok - nowTok) / (beforeTok || 1))} lighter)`,
        );
      } catch (e) {
        console.log(
          red(
            `  ! compacted session failed to re-parse: ${e instanceof Error ? e.message : String(e)}`,
          ),
        );
        console.log(
          red(`    the original is untouched; do not resume from the compacted session.`),
        );
        return 1;
      }
      nl();
      console.log(
        `  ${bold("To try it:")} from this project's directory, run ${green("claude --resume")}`,
      );
      console.log(
        `  and pick the newest session (${dim(newSessionId.slice(0, 8))}…). Your original is still there.`,
      );
      nl();
      return 0;
    }

    case "bench": {
      const locator = rest[0] ?? (await pickSession(adapter));
      if (!locator) {
        console.error("usage: glassbox bench <session.jsonl> [--vs <cleaned.jsonl>]");
        return 2;
      }

      const apiKey = process.env["ANTHROPIC_API_KEY"];
      if (!apiKey) {
        console.error("ANTHROPIC_API_KEY not set — bench requires API access to replay probes.");
        return 1;
      }

      const session = await adapter.parse({ tool: "claude-code", locator });
      const pricing = pricingFor(session.messages.find((m) => m.model)?.model);
      const { snapshot, report } = await analyzeSessionReclaimable(session, {
        repo: new FsRepoState(),
        tokens,
        ...(pricing ? { pricing } : {}),
      });

      const originalRaw = safeRead(locator);
      if (originalRaw === "") {
        console.error(`cannot read transcript at ${locator}`);
        return 1;
      }

      // Either use a provided cleaned fork or produce one in-memory.
      const vsPath = flag(rest, "--vs");
      let cleanedRaw: string;
      const tokensBefore = snapshot.totalTokens;

      if (vsPath) {
        cleanedRaw = safeRead(vsPath);
        if (cleanedRaw === "") {
          console.error(`cannot read cleaned transcript at ${vsPath}`);
          return 1;
        }
      } else {
        // Run Tier 0+1 in-memory to get cleaned text (no file written).
        const tier1 = planEviction(report, snapshot, { classes: TIER1_CLASSES });
        const evictions = new Map<string, string>();
        for (const a of tier1.actions) {
          if (a.originToolCallId) evictions.set(a.originToolCallId, a.tombstone);
        }
        const { text } = forkTranscript(originalRaw, evictions, {});
        cleanedRaw = text;
      }

      const tier1Plan = planEviction(report, snapshot, { classes: TIER1_CLASSES });
      const probeCount = Math.min(
        tier1Plan.actions.filter((a) => a.originToolCallId).length,
        MAX_PROBES,
      );

      renderHeader(
        {
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
        },
        session.messages.find((m) => m.model)?.model ?? "—",
      );

      nl();
      hr("COMPACTION BENCH");
      nl();
      console.log(`  ${bold("Source:")} ${dim(locator)}`);
      if (vsPath) console.log(`  ${bold("Cleaned:")} ${dim(vsPath)}`);
      console.log(
        `  ${bold("Context:")} ${fmtTok(tokensBefore)} tok  ·  ${bold(String(tier1Plan.actions.length))} cleaned segments`,
      );
      console.log(
        `  ${dim("Generating")} ${bold(String(probeCount))} ${dim(`probe${probeCount === 1 ? "" : "s"} — replaying into both transcripts via ${SUMMARIZE_MODEL_DISPLAY}…`)}`,
      );
      nl();

      let result: BenchResult;
      try {
        result = await runBench(
          originalRaw,
          cleanedRaw,
          session,
          tier1Plan,
          tokensBefore,
          0,
          apiKey,
        );
      } catch (e) {
        console.error(red(`  bench failed: ${e instanceof Error ? e.message : String(e)}`));
        return 1;
      }

      // ── Per-probe output ──────────────────────────────────────────────────
      for (const r of result.probes) {
        const icon =
          r.verdict === "equivalent"
            ? green("✓")
            : r.verdict === "partial"
              ? yellow("⚠")
              : red("✗");
        const label =
          r.verdict === "equivalent"
            ? green("equivalent")
            : r.verdict === "partial"
              ? yellow("partial")
              : red("degraded");

        console.log(
          `  ${icon} ${bold(r.probe.toolName.padEnd(12))} ${dim(`[${r.probe.cleanedDetail}]`)}`,
        );
        console.log(`    ${dim("Q:")} ${r.probe.question}`);
        console.log(
          `    ${dim("original:")}  ${r.originalAnswer.slice(0, 120).replace(/\n/g, " ")}`,
        );
        console.log(
          `    ${dim("cleaned:")}   ${r.cleanedAnswer.slice(0, 120).replace(/\n/g, " ")}`,
        );
        console.log(`    ${label}  ${dim("—")}  ${r.reason}`);
        nl();
      }

      if (result.probes.length === 0) {
        console.log(gray("  no probeable tool calls found in the eviction plan."));
        nl();
        return 0;
      }

      // ── Summary ───────────────────────────────────────────────────────────
      hr("VERDICT");
      nl();
      console.log(
        `  ${green(String(result.equivalent))} equivalent` +
          `  ${yellow(String(result.partial))} partial` +
          `  ${red(String(result.degraded))} degraded` +
          `  ${dim("/")}  ${result.probes.length} probes`,
      );

      const overallVerdict =
        result.degraded > 0
          ? red("✗  degraded — compaction removed content the model still needed")
          : result.partial > 0
            ? yellow("⚠  partial — some detail lost, but no critical information missing")
            : green("✓  safe — all cleaned content was genuinely garbage");
      console.log(`  ${overallVerdict}`);
      nl();

      return result.degraded > 0 ? 1 : 0;
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

    case "search": {
      const term = rest[0];
      if (!term) {
        console.error("usage: glassbox search <term>");
        return 2;
      }
      const refs = await adapter.discover({});
      const matches = refs
        .filter((r) => sessionMatchesFilter(r.locator, term))
        .sort((a, b) => (b.modifiedAt ?? "").localeCompare(a.modifiedAt ?? ""));
      if (matches.length === 0) {
        console.log(`No sessions matching "${term}".`);
        return 0;
      }
      matches.forEach((r) => {
        const kb = r.sizeBytes ? `${Math.round(r.sizeBytes / 1024)}kb` : "?";
        const project = decodeProjectName(r.locator);
        console.log(
          `${r.modifiedAt ?? "????"}  ${kb.padStart(7)}  ${bold(project.padEnd(24))}  ${dim(r.locator)}`,
        );
      });
      return 0;
    }

    case undefined:
    case "help":
    case "--help":
    case "-h": {
      nl();
      console.log(bold("glassbox") + "  " + gray("x-ray & hygiene monitor for AI agent context"));
      nl();
      hr("COMMANDS");
      nl();
      const cmds: [string, string][] = [
        ["inspect <session.jsonl>", "full dashboard: stats + x-ray + cost + reclaimable"],
        ["xray <session.jsonl>", "context composition by source + reclaimable tokens"],
        ["cost <session.jsonl>", "cost breakdown from provider actuals"],
        [
          "clean <session.jsonl>",
          "eviction plan of provable garbage; --fork writes a cleaned, lossless session",
        ],
        [
          "compact <session.jsonl>",
          "tier 0–3: evicts garbage, clears spent outputs, trims cold bulk, summarizes cold reasoning; --fork writes result",
        ],
        [
          "bench <session.jsonl>",
          "eval compaction quality: replay probes into original + cleaned, judge whether answers degrade",
        ],
        ["sessions [--project <p>]", "list indexed sessions (fast, no re-parse)"],
        ["index [--project <p>]", "parse + incrementally index sessions into SQLite"],
        ["watch [--project <p>]", "index then keep it live on file changes"],
        ["list [--project <p>]", "discover Claude Code sessions on disk"],
        ["search <term>", "find sessions by project name or path"],
        ["parse <session.jsonl>", "dump the full normalized model as JSON"],
      ];
      const maxCmd = Math.max(...cmds.map(([c]) => c.length));
      for (const [cmd, desc] of cmds) {
        const parts = cmd.split(" ");
        const name = bold(parts[0] ?? "");
        const args = parts.slice(1).join(" ");
        const left = `  ${name}${args ? " " + gray(args) : ""}`;
        const pad = " ".repeat(Math.max(1, maxCmd - cmd.length + 4));
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

/** Decode an encoded project dir to a human-readable project name. */
function decodeProjectName(locator: string): string {
  const dir = locator.split("/").at(-2) ?? "";
  return dir.replace(/^-/, "").replace(/-/g, "/").split("/").at(-1) ?? dir;
}

/** Case-insensitive match: term against project name and full locator path. */
function sessionMatchesFilter(locator: string, term: string): boolean {
  const t = term.toLowerCase();
  return decodeProjectName(locator).toLowerCase().includes(t) || locator.toLowerCase().includes(t);
}

/**
 * Interactive session picker. Discovers sessions, optionally prompts for a
 * search filter to narrow the list, then lets the user pick by number.
 * Returns undefined if stdin is not a TTY or no sessions match.
 */
async function pickSession(adapter: ClaudeCodeAdapter): Promise<string | undefined> {
  if (!process.stdin.isTTY) return undefined;

  const refs = await adapter.discover({});
  if (refs.length === 0) {
    console.error("No Claude Code sessions found under ~/.claude/projects.");
    return undefined;
  }

  const allSorted = refs.sort((a, b) => (b.modifiedAt ?? "").localeCompare(a.modifiedAt ?? ""));

  console.log("");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const filterRaw = (await rl.question(gray("  Search sessions (or Enter for all): "))).trim();
    const filtered =
      filterRaw === ""
        ? allSorted
        : allSorted.filter((r) => sessionMatchesFilter(r.locator, filterRaw));

    if (filtered.length === 0) {
      console.log(gray(`  no sessions matching "${filterRaw}"`));
      return undefined;
    }

    const page = filtered.slice(0, 15);
    console.log("");
    console.log(bold(`  ${filterRaw ? `Sessions matching "${filterRaw}"` : "Recent sessions"}`));
    console.log(gray("  " + "─".repeat(60)));

    for (let i = 0; i < page.length; i++) {
      const r = page[i]!;
      const projectName = decodeProjectName(r.locator);
      const date = r.modifiedAt
        ? r.modifiedAt.slice(0, 16).replace("T", "  ")
        : "????-??-??  ??:??";
      const kb = r.sizeBytes ? `${Math.round(r.sizeBytes / 1024)}kb` : "?";
      const num = String(i + 1).padStart(2);
      console.log(
        `  ${gray(num)}  ${dim(date)}  ${bold(projectName.padEnd(20))}  ${gray(kb.padStart(7))}`,
      );
    }
    if (filtered.length > 15) {
      console.log(dim(`  … ${filtered.length - 15} more — narrow your search to see them`));
    }

    console.log("");
    const raw = (await rl.question(gray("  Pick session [1]: "))).trim();
    const n = raw === "" ? 1 : parseInt(raw, 10);
    if (isNaN(n) || n < 1 || n > page.length) {
      console.error(`  invalid selection`);
      return undefined;
    }
    return page[n - 1]!.locator;
  } finally {
    rl.close();
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
