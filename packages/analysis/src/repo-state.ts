import { readFile, stat } from "node:fs/promises";
import type { RepoState } from "@glassbox/core";

/**
 * The concrete, **read-only** {@link RepoState}: the project filesystem as the
 * analyzers see it. This is the one place analysis touches the disk (doc 17 §6:
 * "local-first & read-only" — we never write to or mutate the user's project).
 *
 * It's what turns the reclaimable analyzer's `classifySegment` from a stub into
 * a real detector: resident file content whose path no longer `exists()` is
 * provably *gone* (doc 20), and `modifiedAt` will back source-drift/staleness
 * checks once those land. Every method degrades to a safe "absent" answer rather
 * than throwing, so a permissions hiccup never crashes a report.
 */
export class FsRepoState implements RepoState {
  async exists(path: string): Promise<boolean> {
    return (await stat(path).catch(() => null)) !== null;
  }

  async read(path: string): Promise<string | null> {
    return readFile(path, "utf8").catch(() => null);
  }

  async modifiedAt(path: string): Promise<number | null> {
    const s = await stat(path).catch(() => null);
    return s ? s.mtimeMs : null;
  }
}
