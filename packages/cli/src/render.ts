/**
 * CLI renderer — all terminal output lives here.
 * Pure ANSI/Unicode, zero dependencies.
 */
import type { CleanPlan } from "@glassbox/analysis";

// ─── ANSI ────────────────────────────────────────────────────────────────────

const A = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  // foreground
  white:  "\x1b[97m",
  gray:   "\x1b[90m",
  blue:   "\x1b[94m",
  green:  "\x1b[92m",
  yellow: "\x1b[93m",
  red:    "\x1b[91m",
  purple: "\x1b[95m",
  cyan:   "\x1b[96m",
  orange: "\x1b[33m",
};

const USE_COLOR = process.stdout.isTTY !== false;

function c(code: string, text: string): string {
  return USE_COLOR ? `${code}${text}${A.reset}` : text;
}

export const bold   = (t: string) => c(A.bold,   t);
export const dim    = (t: string) => c(A.dim,    t);
export const white  = (t: string) => c(A.white,  t);
export const gray   = (t: string) => c(A.gray,   t);
export const blue   = (t: string) => c(A.blue,   t);
export const green  = (t: string) => c(A.green,  t);
export const yellow = (t: string) => c(A.yellow, t);
export const red    = (t: string) => c(A.red,    t);
export const purple = (t: string) => c(A.purple, t);
export const cyan   = (t: string) => c(A.cyan,   t);
export const orange = (t: string) => c(A.orange, t);

// ─── layout helpers ───────────────────────────────────────────────────────────

const W = Math.min(process.stdout.columns ?? 80, 100);

export function hr(label = ""): void {
  if (label) {
    const line = `── ${label} `;
    const rest = "─".repeat(Math.max(0, W - stripAnsi(line).length));
    console.log(gray(line + rest));
  } else {
    console.log(gray("─".repeat(W)));
  }
}

export function nl(): void { console.log(); }

/** Strip ANSI codes from a string for length measurement. */
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

/** Pad right to `n` visible characters. */
function rpad(s: string, n: number): string {
  const vis = stripAnsi(s).length;
  return s + " ".repeat(Math.max(0, n - vis));
}

/** Pad left to `n` visible characters. */
function lpad(s: string, n: number): string {
  const vis = stripAnsi(s).length;
  return " ".repeat(Math.max(0, n - vis)) + s;
}

// ─── number formatters ────────────────────────────────────────────────────────

export function fmtUsd(n: number): string {
  if (n === 0) return "$0.00";
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  if (n >= 0.0001) return `$${n.toFixed(6)}`;
  return `$${n.toExponential(2)}`;
}

export function fmtTok(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function fmtPct(frac: number): string {
  return `${Math.round(frac * 100)}%`;
}

export function fmtInt(n: number): string {
  return n.toLocaleString("en-US");
}

// ─── mini bar chart ───────────────────────────────────────────────────────────

const BAR_CHARS = ["▏","▎","▍","▌","▋","▊","▉","█"];
const BAR_WIDTH = 20;

function bar(frac: number, colorFn: (s: string) => string): string {
  const total = BAR_WIDTH * 8;
  const filled = Math.round(Math.min(frac, 1) * total);
  const full = Math.floor(filled / 8);
  const partial = filled % 8;
  const empty = BAR_WIDTH - full - (partial > 0 ? 1 : 0);
  const b = "█".repeat(full) + (partial > 0 ? (BAR_CHARS[partial - 1] ?? "") : "") + " ".repeat(empty);
  return colorFn(b);
}

// ─── source → color ───────────────────────────────────────────────────────────

function sourceColor(src: string): (s: string) => string {
  const map: Record<string, (s: string) => string> = {
    file:        blue,
    tool_result: green,
    user:        yellow,
    assistant:   white,
    thinking:    purple,
    memory:      orange,
    system:      gray,
    mcp:         red,
    history:     blue,
  };
  return map[src] ?? gray;
}

function statusColor(s: string): (t: string) => string {
  return ({ gone: red, stale: orange, spent: purple, duplicate: blue } as Record<string, (t: string) => string>)[s] ?? gray;
}

// ─── panels ───────────────────────────────────────────────────────────────────

export interface SessionMeta {
  sessionId: string;
  projectPath: string;
  gitBranch: string | null;
  toolVersion: string | null;
  startedAt: string;
  endedAt: string;
  messageCount: number;
  turnCount: number;
  toolCallCount: number;
  fileOpCount: number;
  memoryOpCount: number;
}

export function renderHeader(meta: SessionMeta, model: string): void {
  nl();
  const project = meta.projectPath.split("/").pop() ?? meta.projectPath;
  console.log(`${bold(white(project))}  ${gray(meta.sessionId.slice(0, 8))}`);
  console.log(gray(meta.projectPath));

  const tags = [
    model && `model ${cyan(model)}`,
    `started ${gray(meta.startedAt.replace("T", " ").slice(0, 19))}`,
    meta.gitBranch && `branch ${gray(meta.gitBranch)}`,
    meta.toolVersion && `v${gray(meta.toolVersion)}`,
  ].filter(Boolean).join("  ");
  console.log(tags);
  nl();
}

export interface StatItem { label: string; value: string; sub?: string }

export function renderStats(stats: StatItem[]): void {
  const colW = Math.floor(W / stats.length);
  const top = stats.map((s) => rpad(bold(s.value), colW)).join("");
  const mid = stats.map((s) => rpad(gray(s.label.toUpperCase()), colW)).join("");
  const bot = stats.map((s) => rpad(dim(s.sub ?? ""), colW)).join("");
  console.log(top);
  console.log(mid);
  console.log(bot);
  nl();
}

export interface CompositionRow { source: string; tokens: number }

export function renderXray(rows: CompositionRow[], totalTokens: number): void {
  hr("CONTEXT X-RAY");
  nl();

  const total = totalTokens || 1;
  const maxTok = Math.max(1, ...rows.map((r) => r.tokens));
  const srcW = Math.max(12, ...rows.map((r) => r.source.length));

  for (const row of rows) {
    const colorFn = sourceColor(row.source);
    const b = bar(row.tokens / maxTok, colorFn);
    const src  = rpad(colorFn(row.source), srcW + 10); // +10 for ANSI
    const tok  = lpad(bold(fmtTok(row.tokens)), 8);
    const pct  = lpad(gray(fmtPct(row.tokens / total)), 5);
    console.log(`  ${src}  ${b}  ${tok}  ${pct}`);
  }

  nl();
  console.log(`  ${gray("total")}  ${bold(fmtTok(totalTokens))} tokens  ${dim(`(${fmtInt(totalTokens)} exact)`)}`);
  nl();
}

export interface CostBreakdown {
  totalUsd: number;
  inputUsd: number;
  outputUsd: number;
  cacheReadUsd: number;
  cacheWriteUsd: number;
  cacheSavingsUsd: number;
  unpricedMessages: number;
}

export function renderCost(cost: CostBreakdown): void {
  hr("COST BREAKDOWN");
  nl();

  console.log(`  ${bold(yellow(fmtUsd(cost.totalUsd)))}  ${gray("total")}`);
  nl();

  const parts = [
    { label: "input",       usd: cost.inputUsd,      colorFn: blue   },
    { label: "output",      usd: cost.outputUsd,      colorFn: green  },
    { label: "cache read",  usd: cost.cacheReadUsd,   colorFn: yellow },
    { label: "cache write", usd: cost.cacheWriteUsd,  colorFn: purple },
  ];
  const total = cost.totalUsd || 1;

  for (const p of parts) {
    const b   = bar(p.usd / total, p.colorFn);
    const lbl = rpad(gray(p.label), 14);
    const amt = lpad(bold(fmtUsd(p.usd)), 12);
    const pct = lpad(dim(fmtPct(p.usd / total)), 5);
    console.log(`  ${lbl}  ${b}  ${amt}  ${pct}`);
  }

  nl();
  console.log(`  ${dim(`cache saved ${green(fmtUsd(cost.cacheSavingsUsd))} vs full input rate`)}`);
  if (cost.unpricedMessages > 0) {
    console.log(`  ${dim(`${cost.unpricedMessages} message(s) unpriced`)}`);
  }
  nl();
}

export interface ReclaimableReport {
  reclaimableTokens: number;
  reclaimablePct: number;
  wastedUsdPerTurn: number | null;
  byStatus: Record<string, number>;
  items: { status: string; label: string; reason: string; tokens: number }[];
}

export function renderReclaimable(r: ReclaimableReport, totalTokens: number): void {
  hr("RECLAIMABLE CONTEXT");
  nl();

  if (r.reclaimableTokens === 0) {
    console.log(`  ${green("✓")}  ${bold("Clean window")} — nothing reclaimable detected.`);
    nl();
    return;
  }

  const pctColor = r.reclaimablePct > 0.25 ? red : r.reclaimablePct > 0.10 ? orange : yellow;
  console.log(
    `  ${bold(pctColor(fmtPct(r.reclaimablePct)))}  ${bold(fmtTok(r.reclaimableTokens))} tokens reclaimable` +
    (r.wastedUsdPerTurn !== null ? `  ${dim("~" + fmtUsd(r.wastedUsdPerTurn) + "/turn")}` : "")
  );
  nl();

  // status summary tiles
  const statuses = ["gone", "stale", "spent", "duplicate"] as const;
  const tiles = statuses.map((s) => {
    const n = r.byStatus[s] ?? 0;
    const colorFn = statusColor(s);
    return rpad(`${colorFn(s.toUpperCase())}  ${bold(fmtTok(n))}`, 22 + 10);
  });
  console.log("  " + tiles.join("  "));
  nl();

  // items table
  const topItems = r.items.slice(0, 12);
  if (topItems.length > 0) {
    const colStatus = 10;
    const colTok    = 8;
    console.log(
      "  " +
      rpad(dim("STATUS"),  colStatus) + "  " +
      lpad(dim("TOKENS"),  colTok)    + "  " +
      dim("SEGMENT")
    );
    console.log("  " + gray("─".repeat(W - 4)));

    for (const it of topItems) {
      const colorFn = statusColor(it.status);
      const status = rpad(colorFn(it.status), colStatus + 9); // +9 ANSI
      const tok    = lpad(bold(fmtTok(it.tokens)), colTok);
      const lbl    = bold(it.label.length > 36 ? it.label.slice(0, 35) + "…" : it.label);
      const rsn    = gray(it.reason.length > 55 ? it.reason.slice(0, 54) + "…" : it.reason);
      console.log(`  ${status}  ${tok}  ${lbl}`);
      console.log(`  ${" ".repeat(colStatus)}  ${" ".repeat(colTok)}  ${rsn}`);
    }

    if (r.items.length > 12) {
      nl();
      console.log(`  ${dim(`… and ${r.items.length - 12} more items`)}`);
    }
  }
  nl();
}

// ─── clean plan ───────────────────────────────────────────────────────────────

export function renderCleanPlan(plan: CleanPlan, dryRun: boolean): void {
  hr("CLEAN PLAN");
  nl();

  if (dryRun) {
    console.log(`  ${dim("dry run — nothing is written. add")} ${bold("--apply")} ${dim("to act.")}`);
    nl();
  }

  // CLAUDE.md actions
  if (plan.claudeMdBlocks.length === 0) {
    console.log(`  ${green("✓")}  ${gray("no file-level fixes — no deleted or drifted files in the window.")}`);
  } else {
    console.log(`  ${bold("CLAUDE.md")} ${gray("— tell the agent which files to stop trusting:")}`);
    nl();
    const verb = (t: string) => (t === "stop_referencing" ? red("STOP") : yellow("RE-READ"));
    for (const a of plan.claudeMdBlocks) {
      const tag = rpad(verb(a.type), 7 + 9); // +9 ANSI
      const tok = lpad(bold(fmtTok(a.reclaimableTokens)), 7);
      console.log(`  ${tag}  ${tok}  ${bold(a.path)}  ${dim("(" + a.confidence + ")")}`);
      console.log(`  ${" ".repeat(7)}  ${" ".repeat(7)}  ${gray(a.reason)}`);
    }
  }
  nl();

  // compact recommendation
  const c = plan.compactRecommendation;
  if (c) {
    console.log(`  ${bold("COMPACT")} ${gray("— window is")} ${bold(red(fmtPct(c.reclaimablePct)))} ${gray("reclaimable; a compact would clear the bulk:")}`);
    nl();
    console.log(`    ${gray("spent tool/MCP output")}   ${bold(fmtTok(c.spentTokens))} tok`);
    console.log(`    ${gray("duplicate copies")}        ${bold(fmtTok(c.duplicateTokens))} tok`);
    if (c.estimatedUsdSaved !== null) {
      console.log(`    ${gray("stops wasting")}           ${bold(green("~" + fmtUsd(c.estimatedUsdSaved) + "/turn"))}`);
    }
    nl();
    console.log(`    ${dim("suggested /compact focus:")}`);
    console.log(`    ${cyan(wrap(c.suggestedSummaryFocus, 4))}`);
  } else {
    console.log(`  ${gray("no compact recommended — reclaimable% is below the threshold.")}`);
  }
  nl();

  // summary
  const usd = plan.summary.estimatedUsdSaved;
  console.log(
    `  ${dim("plan:")} ${bold(String(plan.summary.actionCount))} file action(s)` +
    (c ? ` ${dim("+ 1 compact")}` : "") +
    `  ${dim("·")}  ${bold(fmtTok(plan.summary.reclaimableTokens))} tok reclaimable` +
    (usd !== null ? `  ${dim("·")}  ${green("~" + fmtUsd(usd) + "/turn")}` : "")
  );
  nl();
}

/**
 * Render the ready-to-run `/compact` command. Glassbox is read-only and cannot
 * compact a finished transcript — this is a command to paste into the *live*
 * session, optionally pre-copied to the clipboard.
 */
export function renderCompactCommand(command: string, opts: { copied: boolean; belowThreshold: boolean }): void {
  hr("COMPACT COMMAND");
  nl();
  if (opts.belowThreshold) {
    console.log(`  ${dim("note: this window is below the compact threshold — a compact may be premature.")}`);
    nl();
  }
  console.log(`  ${gray("run this inside your")} ${bold("live")} ${gray("Claude Code session:")}`);
  nl();
  console.log(`  ${cyan(wrap(command, 2))}`);
  nl();
  console.log(
    opts.copied
      ? `  ${green("✓ copied to clipboard")}`
      : `  ${dim("(copy it manually — no clipboard tool found)")}`,
  );
  console.log(`  ${dim("Glassbox never compacts for you; it can't mutate a session. This just stages the command.")}`);
  nl();
}

/** Soft-wrap a long string with a left indent, for the compact focus line. */
function wrap(text: string, indent: number): string {
  const pad = " ".repeat(indent);
  const max = W - indent - 2;
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > max) {
      lines.push(line.trim());
      line = w;
    } else {
      line += " " + w;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines.join("\n" + pad);
}

export interface SessionRow {
  locator: string;
  sessionId: string;
  projectPath: string;
  endedAt: string;
  messageCount: number;
  toolCallCount: number;
  memoryOpCount: number;
}

export function renderSessions(rows: SessionRow[]): void {
  nl();
  hr("SESSIONS");
  nl();

  if (rows.length === 0) {
    console.log(`  ${gray("index empty — run")} ${bold("glassbox index")} ${gray("first.")}`);
    nl();
    return;
  }

  const projW = Math.min(28, Math.max(12, ...rows.map((r) => {
    const p = r.projectPath.split("/").pop() ?? r.projectPath;
    return p.length;
  })));

  // header
  console.log(
    "  " +
    rpad(dim("PROJECT"),  projW) + "  " +
    rpad(dim("DATE / TIME"),       20) + "  " +
    lpad(dim("MSG"),  4) + "  " +
    lpad(dim("TOOL"), 4) + "  " +
    lpad(dim("MEM"),  3) + "  " +
    dim("ID")
  );
  console.log("  " + gray("─".repeat(W - 4)));

  for (const r of rows) {
    const proj  = (r.projectPath.split("/").pop() ?? r.projectPath).slice(0, projW);
    const dt    = r.endedAt.replace("T", " ").slice(0, 19);
    const mem   = r.memoryOpCount > 0 ? yellow(String(r.memoryOpCount)) : dim("0");
    const id    = dim(r.sessionId.slice(0, 8));

    console.log(
      "  " +
      rpad(bold(proj),               projW) + "  " +
      rpad(gray(dt),                     20) + "  " +
      lpad(bold(String(r.messageCount)), 4) + "  " +
      lpad(gray(String(r.toolCallCount)),4) + "  " +
      lpad(mem,                           3) + "  " +
      id
    );
  }

  nl();
  console.log(`  ${dim(`${rows.length} session${rows.length !== 1 ? "s" : ""} · local index`)}`);
  nl();
}
