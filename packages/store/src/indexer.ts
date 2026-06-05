import { watch, type FSWatcher } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { Adapter, DiscoverOptions, SessionRef } from "@glassbox/core";
import type { SessionIndex, SourceFingerprint } from "./session-index.js";

export interface SyncResult {
  /** Sessions discovered on disk this run. */
  readonly scanned: number;
  /** Parsed + (re)indexed because they were new or changed. */
  readonly parsed: number;
  /** Skipped because (mtime, size) matched the index — never opened. */
  readonly unchanged: number;
  /** Removed because their source file no longer exists (in scope). */
  readonly removed: number;
  /** Sessions that failed to parse — surfaced, not swallowed. */
  readonly failed: readonly { readonly locator: string; readonly error: string }[];
}

export type WatchEvent =
  | { readonly type: "ready"; readonly result: SyncResult }
  | { readonly type: "upserted"; readonly locator: string }
  | { readonly type: "removed"; readonly locator: string }
  | { readonly type: "error"; readonly locator: string; readonly error: string };

export interface WatchOptions {
  /** Directories to watch recursively (e.g. the adapter's storage root). */
  readonly roots: readonly string[];
  /** Discovery scope for the initial sync. */
  readonly discover?: DiscoverOptions;
  /** Coalesce rapid writes to one file (Claude Code appends often). Default 250ms. */
  readonly debounceMs?: number;
  readonly onEvent?: (event: WatchEvent) => void;
}

export interface Watcher {
  close(): void;
}

/**
 * Drives an {@link Adapter} against a {@link SessionIndex}: a one-shot
 * incremental {@link sync}, and a live {@link watch}. Tool-agnostic — it speaks
 * only the core `Adapter` port, so the same indexer serves Claude Code, Codex,
 * and any future adapter.
 */
export class SessionIndexer {
  constructor(
    private readonly adapter: Adapter,
    private readonly index: SessionIndex,
  ) {}

  /**
   * Reconcile the index with disk. Cheap by design: discovery only `stat`s
   * files, and a session whose (mtime, size) is unchanged is **never opened** —
   * so re-syncing a 500-session tree re-parses only what actually changed.
   */
  async sync(opts: DiscoverOptions = {}): Promise<SyncResult> {
    const refs = await this.adapter.discover(opts);
    const known = this.index.fingerprints();
    const seen = new Set<string>();
    const failed: { locator: string; error: string }[] = [];
    let parsed = 0;
    let unchanged = 0;

    for (const ref of refs) {
      seen.add(ref.locator);
      const prev = known.get(ref.locator);
      if (prev && isUnchanged(prev, ref)) {
        unchanged++;
        continue;
      }
      try {
        await this.reindex(ref);
        parsed++;
      } catch (err) {
        failed.push({ locator: ref.locator, error: errorMessage(err) });
      }
    }

    const removed = this.pruneMissing(seen, opts);
    return { scanned: refs.length, parsed, unchanged, removed, failed };
  }

  /**
   * Sync once, then keep the index live: a recursive `fs.watch` on each root,
   * with a per-file debounce so a burst of appends collapses into one re-parse.
   * Returns a {@link Watcher}; call `close()` to stop.
   */
  async watch(opts: WatchOptions): Promise<Watcher> {
    const debounceMs = opts.debounceMs ?? 250;
    const emit = opts.onEvent ?? (() => {});

    const result = await this.sync(opts.discover ?? {});
    emit({ type: "ready", result });

    const timers = new Map<string, NodeJS.Timeout>();
    const watchers: FSWatcher[] = [];

    for (const root of opts.roots) {
      const w = watch(root, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        const name = filename.toString();
        if (!name.endsWith(".jsonl")) return;
        const locator = join(root, name);

        const existing = timers.get(locator);
        if (existing) clearTimeout(existing);
        timers.set(
          locator,
          setTimeout(() => {
            timers.delete(locator);
            void this.handleChange(locator, emit);
          }, debounceMs),
        );
      });
      watchers.push(w);
    }

    return {
      close() {
        for (const t of timers.values()) clearTimeout(t);
        timers.clear();
        for (const w of watchers) w.close();
      },
    };
  }

  // ───────────────────────────── internals ─────────────────────────────

  /** Re-parse one ref and upsert it, recording its freshness fingerprint. */
  private async reindex(ref: SessionRef): Promise<void> {
    const session = await this.adapter.parse(ref);
    this.index.upsert({
      locator: ref.locator,
      session,
      source: { modifiedAt: ref.modifiedAt ?? null, sizeBytes: ref.sizeBytes ?? null },
    });
  }

  /** A single file changed on disk: re-parse if it exists, drop it if it's gone. */
  private async handleChange(locator: string, emit: (e: WatchEvent) => void): Promise<void> {
    const st = await stat(locator).catch(() => null);
    if (!st) {
      if (this.index.remove(locator)) emit({ type: "removed", locator });
      return;
    }
    try {
      await this.reindex({
        tool: this.adapter.tool,
        locator,
        modifiedAt: st.mtime.toISOString(),
        sizeBytes: st.size,
      });
      emit({ type: "upserted", locator });
    } catch (err) {
      emit({ type: "error", locator, error: errorMessage(err) });
    }
  }

  /**
   * Remove indexed sessions whose source file vanished. Scoped honestly: a
   * project-scoped sync only prunes within that project, so it never deletes
   * another project's sessions just because they weren't in this scan.
   */
  private pruneMissing(seen: Set<string>, opts: DiscoverOptions): number {
    const candidates = opts.projectPath
      ? this.index.list({ projectPath: opts.projectPath }).map((m) => m.locator)
      : [...this.index.fingerprints().keys()];
    let removed = 0;
    for (const locator of candidates) {
      if (!seen.has(locator) && this.index.remove(locator)) removed++;
    }
    return removed;
  }
}

function isUnchanged(prev: SourceFingerprint, ref: SessionRef): boolean {
  return prev.modifiedAt === (ref.modifiedAt ?? null) && prev.sizeBytes === (ref.sizeBytes ?? null);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
