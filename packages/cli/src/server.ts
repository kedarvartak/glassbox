import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, extname, join, normalize } from "node:path";
import type { Session, TokenCounter } from "@glassbox/core";
import {
  analyzeSessionReclaimable,
  analyzeSessionCost,
  checkTokenAccuracy,
  composition,
  FsRepoState,
  planEviction,
  pricingFor,
} from "@glassbox/analysis";
import {
  forkTranscript,
  newProblems,
  parseClaudeSession,
  validateTranscript,
} from "@glassbox/adapter-claude-code";
import type { SessionIndex } from "@glassbox/store";

/**
 * The local inspector server (doc 17 §2.1): a zero-dependency `node:http` server
 * that exposes the engine's analyses as JSON and serves the built `@glassbox/ui`
 * dashboard. Bound to 127.0.0.1 — nothing leaves the machine.
 *
 * The server is thin: every number it returns comes from the same analysis
 * functions the CLI's `cost`/`xray` commands use, so the UI and the terminal
 * agree by construction.
 */
export interface ServeOptions {
  readonly index: SessionIndex;
  readonly tokens: TokenCounter;
  readonly port: number;
  readonly host?: string;
}

export async function startServer(opts: ServeOptions): Promise<{ url: string; close: () => void }> {
  const uiDist = resolveUiDist();
  const repo = new FsRepoState();
  const host = opts.host ?? "127.0.0.1";

  const server = createServer((req, res) => {
    handle(req, res, opts, repo, uiDist).catch((err: unknown) => {
      sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  return {
    url: `http://${host}:${opts.port}`,
    close: () => server.close(),
  };
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  opts: ServeOptions,
  repo: FsRepoState,
  uiDist: string,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (url.pathname === "/api/sessions") {
    const rows = opts.index.list();
    sendJson(
      res,
      200,
      rows.map((m) => ({
        locator: m.locator,
        sessionId: m.sessionId,
        projectPath: m.projectPath,
        tool: m.tool,
        endedAt: m.endedAt,
        messageCount: m.messageCount,
        toolCallCount: m.toolCallCount,
        memoryOpCount: m.memoryOpCount,
      })),
    );
    return;
  }

  if (url.pathname === "/api/session") {
    const locator = url.searchParams.get("locator");
    const indexed = locator ? opts.index.get(locator) : null;
    if (!indexed) {
      sendJson(res, 404, { error: "session not indexed" });
      return;
    }
    sendJson(res, 200, await buildDetail(indexed.session, opts.tokens, repo));
    return;
  }

  // The one *write* endpoint: produce a cleaned sibling session (provable
  // eviction). It only ever writes a NEW file — the original is never touched —
  // and refuses to write if the fork introduces any structural problem.
  if (url.pathname === "/api/fork" && req.method === "POST") {
    const locator = url.searchParams.get("locator");
    const indexed = locator ? opts.index.get(locator) : null;
    if (!locator || !indexed) {
      sendJson(res, 404, { error: "session not indexed" });
      return;
    }
    const result = await runFork(locator, indexed.session, opts.tokens, repo, opts.index);
    sendJson(res, result.ok ? 200 : 422, result);
    return;
  }

  await serveStatic(res, uiDist, url.pathname);
}

/**
 * Write a cleaned fork of `locator` to a fresh sibling session. Mirrors the CLI
 * `clean --fork` path: plan provable eviction → tombstone in a derived copy →
 * validate it introduces no new structural problems → write a new `<id>.jsonl`
 * → re-parse as an integrity proof. The original is never modified.
 */
async function runFork(
  locator: string,
  session: Session,
  tokens: TokenCounter,
  repo: FsRepoState,
  index: SessionIndex,
): Promise<
  | {
      ok: true;
      newSessionId: string;
      outPath: string;
      copies: number;
      netReclaimedTokens: number;
      beforeTokens: number;
      afterTokens: number;
    }
  | { ok: false; error: string }
> {
  const pricing = pricingFor(session.messages.find((m) => m.model)?.model);
  const { snapshot, report } = await analyzeSessionReclaimable(session, {
    repo,
    tokens,
    ...(pricing ? { pricing } : {}),
  });
  const eviction = planEviction(report, snapshot);
  const evictions = new Map<string, string>();
  for (const a of eviction.actions) {
    if (a.originToolCallId) evictions.set(a.originToolCallId, a.tombstone);
  }
  if (evictions.size === 0)
    return { ok: false, error: "nothing to evict — no provable garbage in this session" };

  let raw: string;
  try {
    raw = await readFile(locator, "utf8");
  } catch {
    return { ok: false, error: `cannot read transcript at ${locator}` };
  }

  const newSessionId = randomUUID();
  const { text } = forkTranscript(raw, evictions, { newSessionId });

  // Safety gate: refuse if the fork introduces a new structural problem.
  const introduced = newProblems(validateTranscript(raw), validateTranscript(text));
  if (introduced.length > 0) {
    return {
      ok: false,
      error: `fork would introduce ${introduced.length} structural problem(s) — refusing to write`,
    };
  }

  const outPath = locator.endsWith(".jsonl")
    ? join(dirname(locator), `${newSessionId}.jsonl`)
    : `${locator}.${newSessionId}.jsonl`;
  await writeFile(outPath, text, "utf8");

  // Integrity proof: re-parse the fork. If it throws, the rewrite is unsafe.
  // On success, index the new session so the dashboard can show its (clean) stats.
  let afterTokens = snapshot.totalTokens - eviction.netReclaimedTokens;
  try {
    const cleaned = parseClaudeSession(text, { tool: "claude-code", locator: outPath }, tokens);
    const after = await analyzeSessionReclaimable(cleaned, {
      repo,
      tokens,
      ...(pricing ? { pricing } : {}),
    });
    afterTokens = after.snapshot.totalTokens;
    const st = await stat(outPath).catch(() => null);
    index.upsert({
      locator: outPath,
      session: cleaned,
      source: {
        modifiedAt: st ? new Date(st.mtimeMs).toISOString() : null,
        sizeBytes: st ? st.size : null,
      },
    });
  } catch (e) {
    return {
      ok: false,
      error: `fork failed to re-parse: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  return {
    ok: true,
    newSessionId,
    outPath,
    copies: eviction.actions.length,
    netReclaimedTokens: eviction.netReclaimedTokens,
    beforeTokens: snapshot.totalTokens,
    afterTokens,
  };
}

async function buildDetail(session: Session, tokens: TokenCounter, repo: FsRepoState) {
  const cost = analyzeSessionCost(session);
  const pricing = pricingFor(session.messages.find((m) => m.model)?.model);
  const { snapshot, report } = await analyzeSessionReclaimable(session, {
    repo,
    tokens,
    ...(pricing ? { pricing } : {}),
  });
  const accuracy = checkTokenAccuracy(session, tokens);
  const eviction = planEviction(report, snapshot);

  return {
    meta: {
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
      compactionCount: session.compactions.length,
      warningCount: session.warnings.length,
    },
    compaction:
      session.compactions.length > 0
        ? {
            observed: true,
            count: session.compactions.length,
            events: session.compactions.map((c) => ({
              id: c.id,
              timestamp: c.timestamp,
              tokensBefore: c.tokensBefore,
              tokensAfter: c.tokensAfter,
              evictedMessageCount: c.evictedMessageIds.length,
              summary: c.summary,
            })),
          }
        : {
            observed: false,
            count: 0,
            note: "No compaction marker was observed in this session. Claude Code compaction diff is represented as an explicit limitation until a compacted fixture proves the schema.",
          },
    cost: {
      totalUsd: cost.totalUsd,
      breakdown: {
        inputUsd: cost.breakdown.inputUsd,
        outputUsd: cost.breakdown.outputUsd,
        cacheReadUsd: cost.breakdown.cacheReadUsd,
        cacheWriteUsd: cost.breakdown.cacheWriteUsd,
      },
      cacheSavingsUsd: cost.cacheSavingsUsd,
      models: cost.models,
      unpricedMessages: cost.unpricedMessages,
    },
    xray: {
      totalTokens: snapshot.totalTokens,
      segmentCount: snapshot.segments.length,
      composition: composition(snapshot),
    },
    reclaimable: {
      totalTokens: report.totalTokens,
      reclaimableTokens: report.reclaimableTokens,
      reclaimablePct: report.reclaimablePct,
      byStatus: report.byStatus,
      wastedUsdPerTurn: report.wastedUsdPerTurn,
      items: report.items.slice(0, 40).map((i) => ({
        status: i.status,
        label: i.label,
        reason: i.reason,
        tokens: i.tokens,
      })),
    },
    accuracy: {
      note: accuracy.note,
      ratio: accuracy.ratio,
      sampleResponses: accuracy.sampleResponses,
    },
    clean: {
      actions: eviction.actions.slice(0, 40).map((a) => ({
        detail: a.detail,
        path: a.path ?? null,
        reclaimableTokens: a.reclaimableTokens,
        tombstoneTokens: a.tombstoneTokens,
      })),
      summary: {
        copies: eviction.actions.length,
        reclaimableTokens: eviction.reclaimableTokens,
        tombstoneTokens: eviction.tombstoneTokens,
        netReclaimedTokens: eviction.netReclaimedTokens,
      },
    },
  };
}

// ───────────────────────────── static + helpers ─────────────────────────────

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ico": "image/x-icon",
};

async function serveStatic(res: ServerResponse, root: string, pathname: string): Promise<void> {
  // Resolve within the dist root; fall back to index.html (SPA).
  const rel = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  let file = join(root, rel === "/" || rel === "." ? "index.html" : rel);
  if (!file.startsWith(root)) file = join(root, "index.html");

  let body = await readFile(file).catch(() => null);
  let type = CONTENT_TYPES[extname(file)] ?? "application/octet-stream";
  if (body === null) {
    body = await readFile(join(root, "index.html")).catch(() => null);
    type = CONTENT_TYPES[".html"] as string;
  }
  if (body === null) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Glassbox UI not built — run `pnpm build` (vite build) first.");
    return;
  }
  res.writeHead(200, { "content-type": type });
  res.end(body);
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

/** Locate the built UI (`@glassbox/ui/dist`) via module resolution. */
function resolveUiDist(): string {
  const require = createRequire(import.meta.url);
  const pkg = require.resolve("@glassbox/ui/package.json");
  return join(dirname(pkg), "dist");
}

/** Best-effort: ensure a file exists; used to warn if the UI isn't built. */
export async function uiIsBuilt(): Promise<boolean> {
  try {
    const dist = resolveUiDist();
    return (await stat(join(dist, "index.html"))) !== null;
  } catch {
    return false;
  }
}
