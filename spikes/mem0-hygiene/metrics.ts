/**
 * The measurement engine — pure, no mem0 dependency.
 *
 * Everything here operates on plain data (stored memories, embeddings, the seed
 * labels) so it's unit-testable and portable into a real `@glassbox/adapter-mem0`
 * later. The harness (`run.ts`) does the I/O; this file does the math.
 */
import type { ContradictionLabel, ProbeQuery, StoredMemory } from "./types.js";

/** Cosine similarity of two equal-length vectors. */
export function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export interface EmbeddedMemory extends StoredMemory {
  readonly embedding: readonly number[];
}

export interface DuplicateCluster {
  readonly members: readonly StoredMemory[];
  /** Lowest pairwise similarity inside the cluster (how tight it is). */
  readonly minSimilarity: number;
}

/**
 * Group memories whose pairwise cosine similarity meets `threshold` into
 * clusters via union-find. Clusters of size ≥ 2 are *surviving near-duplicates*
 * — facts mem0 stored separately that mean the same thing.
 */
export function findNearDuplicateClusters(
  memories: readonly EmbeddedMemory[],
  threshold: number,
): DuplicateCluster[] {
  const parent = memories.map((_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r] as number;
    return r;
  };
  const union = (i: number, j: number): void => {
    parent[find(i)] = find(j);
  };

  for (let i = 0; i < memories.length; i++) {
    for (let j = i + 1; j < memories.length; j++) {
      const sim = cosine(memories[i]!.embedding, memories[j]!.embedding);
      if (sim >= threshold) union(i, j);
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < memories.length; i++) {
    const root = find(i);
    (groups.get(root) ?? groups.set(root, []).get(root)!).push(i);
  }

  const clusters: DuplicateCluster[] = [];
  for (const idxs of groups.values()) {
    if (idxs.length < 2) continue;
    let minSim = 1;
    for (let a = 0; a < idxs.length; a++) {
      for (let b = a + 1; b < idxs.length; b++) {
        minSim = Math.min(minSim, cosine(memories[idxs[a]!]!.embedding, memories[idxs[b]!]!.embedding));
      }
    }
    clusters.push({ members: idxs.map((i) => memories[i]!), minSimilarity: minSim });
  }
  return clusters.sort((x, y) => y.members.length - x.members.length);
}

export interface ContradictionResult {
  readonly topic: string;
  readonly currentText: string;
  readonly staleText: string;
  /** Stored memories that still assert the stale value (empty = reconciled). */
  readonly survivors: readonly StoredMemory[];
}

/**
 * For each planted contradiction, find stored memories that still contain the
 * stale assertion. Substring match (case/space-normalized) — deterministic and
 * good enough for a spike where you control `staleText`.
 */
export function findContradictionSurvivors(
  memories: readonly StoredMemory[],
  contradictions: readonly ContradictionLabel[],
): ContradictionResult[] {
  const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, " ").trim();
  return contradictions.map((c) => {
    const needle = norm(c.staleText);
    const survivors = memories.filter((m) => norm(m.text).includes(needle));
    return { topic: c.topic, currentText: c.currentText, staleText: c.staleText, survivors };
  });
}

/**
 * Memories never returned by any probe query — dead weight relative to the
 * realistic query set. `retrievedIds` is the union of IDs every probe surfaced.
 */
export function computeDeadSet(
  all: readonly StoredMemory[],
  retrievedIds: ReadonlySet<string>,
): StoredMemory[] {
  return all.filter((m) => !retrievedIds.has(m.id));
}

export interface SpikeReport {
  readonly storedCount: number;
  readonly expectedUniqueFacts: number;
  /** storedCount / expectedUniqueFacts — > 1 means the store is bloated. */
  readonly bloatRatio: number;
  readonly nearDuplicateClusters: readonly DuplicateCluster[];
  readonly contradictions: readonly ContradictionResult[];
  readonly deadMemories: readonly StoredMemory[];
  /** True if any garbage class is present — the spike's pass/fail headline. */
  readonly garbageFound: boolean;
}

export interface BuildReportArgs {
  readonly memories: readonly EmbeddedMemory[];
  readonly expectedUniqueFacts: number;
  readonly contradictions: readonly ContradictionLabel[];
  readonly retrievedIds: ReadonlySet<string>;
  readonly nearDupThreshold: number;
}

/** Assemble the full report from measured inputs. Pure. */
export function buildReport(args: BuildReportArgs): SpikeReport {
  const clusters = findNearDuplicateClusters(args.memories, args.nearDupThreshold);
  const contradictions = findContradictionSurvivors(args.memories, args.contradictions);
  const deadMemories = computeDeadSet(args.memories, args.retrievedIds);
  const storedCount = args.memories.length;
  const bloatRatio = args.expectedUniqueFacts > 0 ? storedCount / args.expectedUniqueFacts : 0;
  const garbageFound =
    clusters.length > 0 ||
    contradictions.some((c) => c.survivors.length > 0) ||
    deadMemories.length > 0 ||
    bloatRatio > 1.3;
  return {
    storedCount,
    expectedUniqueFacts: args.expectedUniqueFacts,
    bloatRatio,
    nearDuplicateClusters: clusters,
    contradictions,
    deadMemories,
    garbageFound,
  };
}
