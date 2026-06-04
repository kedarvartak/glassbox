import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { DiscoverOptions, SessionRef } from "@glassbox/core";
import { claudeProjectsRoot, encodeProjectDir } from "./paths.js";

const TOOL = "claude-code";

/**
 * Cheap discovery: walk the projects root, list `*.jsonl` files, stat each for
 * ordering metadata — but never open/parse them. This is the part of the adapter
 * that's safe to run eagerly to populate a session picker.
 */
export async function discoverClaudeSessions(opts: DiscoverOptions = {}): Promise<SessionRef[]> {
  const root = claudeProjectsRoot(opts.root);

  const projectDirs = opts.projectPath
    ? [encodeProjectDir(opts.projectPath)]
    : await listDirs(root);

  const refs: SessionRef[] = [];
  for (const dir of projectDirs) {
    const abs = join(root, dir);
    let entries: string[];
    try {
      entries = await readdir(abs);
    } catch {
      continue; // dir vanished or unreadable — skip, don't crash
    }
    for (const name of entries) {
      if (!name.endsWith(".jsonl")) continue;
      const locator = join(abs, name);
      const meta = await safeStat(locator);
      refs.push({
        tool: TOOL,
        locator,
        ...(meta && { modifiedAt: meta.mtime.toISOString(), sizeBytes: meta.size }),
      });
    }
  }
  return refs;
}

async function listDirs(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

async function safeStat(path: string) {
  try {
    return await stat(path);
  } catch {
    return null;
  }
}
