import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readdir } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import {
  asIsoTimestamp,
  asSessionId,
  type Adapter,
  type DiscoverOptions,
  type Session,
  type SessionRef,
} from "@glassbox/core";
import { SessionIndex } from "./session-index.js";
import { SessionIndexer } from "./indexer.js";

function sessionFor(locator: string, projectPath: string): Session {
  return {
    id: asSessionId(locator),
    tool: "claude-code",
    toolVersion: null,
    projectPath,
    gitBranch: null,
    startedAt: asIsoTimestamp("2026-06-04T10:00:00Z"),
    endedAt: asIsoTimestamp("2026-06-04T10:00:00Z"),
    messages: [],
    turns: [],
    toolCalls: [],
    fileOps: [],
    memoryOps: [],
    compactions: [],
    warnings: [],
  };
}

/** In-memory adapter — lets us control mtime/size and count parse calls. */
class MemAdapter implements Adapter {
  readonly tool = "claude-code";
  parseCalls = 0;
  readonly files = new Map<string, { mtime: string; size: number; project: string }>();

  async discover(opts: DiscoverOptions = {}): Promise<SessionRef[]> {
    return [...this.files.entries()]
      .filter(([, f]) => !opts.projectPath || f.project === opts.projectPath)
      .map(([locator, f]) => ({
        tool: this.tool,
        locator,
        modifiedAt: f.mtime,
        sizeBytes: f.size,
        projectPath: f.project,
      }));
  }
  async canParse(): Promise<boolean> {
    return true;
  }
  async parse(ref: SessionRef): Promise<Session> {
    this.parseCalls++;
    const f = this.files.get(ref.locator);
    return sessionFor(ref.locator, f?.project ?? "/unknown");
  }
}

describe("SessionIndexer.sync (incremental)", () => {
  it("parses only new/changed files and prunes vanished ones", async () => {
    const adapter = new MemAdapter();
    adapter.files.set("/a", { mtime: "t1", size: 1, project: "/p" });
    adapter.files.set("/b", { mtime: "t1", size: 1, project: "/p" });
    const index = SessionIndex.open(":memory:");
    const indexer = new SessionIndexer(adapter, index);

    const first = await indexer.sync();
    expect(first).toMatchObject({ scanned: 2, parsed: 2, unchanged: 0, removed: 0 });
    expect(adapter.parseCalls).toBe(2);

    // Nothing changed → no re-parse at all.
    const second = await indexer.sync();
    expect(second).toMatchObject({ scanned: 2, parsed: 0, unchanged: 2, removed: 0 });
    expect(adapter.parseCalls).toBe(2);

    // Touch /a (new mtime) → only /a re-parses.
    adapter.files.set("/a", { mtime: "t2", size: 9, project: "/p" });
    const third = await indexer.sync();
    expect(third).toMatchObject({ parsed: 1, unchanged: 1 });
    expect(adapter.parseCalls).toBe(3);

    // /b disappears from disk → pruned from the index.
    adapter.files.delete("/b");
    const fourth = await indexer.sync();
    expect(fourth).toMatchObject({ removed: 1 });
    expect(index.get("/b")).toBeNull();
    index.close();
  });

  it("a project-scoped sync never prunes another project's sessions", async () => {
    const adapter = new MemAdapter();
    adapter.files.set("/x1", { mtime: "t", size: 1, project: "/proj/x" });
    adapter.files.set("/y1", { mtime: "t", size: 1, project: "/proj/y" });
    const index = SessionIndex.open(":memory:");
    const indexer = new SessionIndexer(adapter, index);
    await indexer.sync();

    // Re-sync scoped to project x only — project y must survive untouched.
    const r = await indexer.sync({ projectPath: "/proj/x" });
    expect(r.removed).toBe(0);
    expect(index.get("/y1")).not.toBeNull();
    index.close();
  });
});

// ───────────────────────────── watch (real fs) ─────────────────────────────

/** Adapter that genuinely reads the file — exercises the watch→parse path. */
class FsFakeAdapter implements Adapter {
  readonly tool = "claude-code";
  constructor(private readonly dir: string) {}
  async discover(): Promise<SessionRef[]> {
    const names = (await readdir(this.dir)).filter((n) => n.endsWith(".jsonl"));
    const refs: SessionRef[] = [];
    for (const n of names) {
      const p = join(this.dir, n);
      const st = await stat(p);
      refs.push({ tool: this.tool, locator: p, modifiedAt: st.mtime.toISOString(), sizeBytes: st.size });
    }
    return refs;
  }
  async canParse(): Promise<boolean> {
    return true;
  }
  async parse(ref: SessionRef): Promise<Session> {
    return sessionFor(ref.locator, this.dir);
  }
}

async function until(cond: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error("condition not met in time");
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe("SessionIndexer.watch (live)", () => {
  let cleanup: (() => void) | null = null;
  afterEach(() => {
    cleanup?.();
    cleanup = null;
  });

  it("indexes existing files, picks up new ones, and drops deleted ones", async () => {
    const dir = await mkdtemp(join(tmpdir(), "glassbox-watch-"));
    const adapter = new FsFakeAdapter(dir);
    const index = SessionIndex.open(":memory:");
    const indexer = new SessionIndexer(adapter, index);

    await writeFile(join(dir, "a.jsonl"), "{}");
    const watcher = await indexer.watch({ roots: [dir], debounceMs: 20 });
    cleanup = () => {
      watcher.close();
      index.close();
      void rm(dir, { recursive: true, force: true });
    };

    // Initial sync indexed the pre-existing file.
    expect(index.get(join(dir, "a.jsonl"))).not.toBeNull();

    // A new file appears → indexed live.
    await writeFile(join(dir, "b.jsonl"), "{}");
    await until(() => index.get(join(dir, "b.jsonl")) !== null);

    // A file is deleted → dropped live.
    await rm(join(dir, "a.jsonl"));
    await until(() => index.get(join(dir, "a.jsonl")) === null);
  }, 10000);
});
