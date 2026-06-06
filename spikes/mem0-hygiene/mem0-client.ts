/**
 * The only file that talks to mem0. Isolating it here means:
 *  - the measurement engine (metrics.ts) stays pure and mem0-agnostic, and
 *  - if the mem0 SDK surface drifts between versions, there's exactly one place
 *    to adjust.
 *
 * Uses mem0's open-source / self-hosted `Memory` class (local, no hosted API
 * key) — it still needs OPENAI_API_KEY for its extraction LLM + embedder.
 *
 * NOTE: mem0's TS SDK has moved its export path across versions. If the import
 * below fails after `pnpm install`, check the installed package's entry points
 * (`node -e "console.log(require.resolve('mem0ai/oss'))"`) and adjust this one
 * import — nothing else in the spike imports mem0.
 */
import { Memory } from "mem0ai/oss";
import type { SeedMessage, StoredMemory } from "./types.js";

export class Mem0Harness {
  private constructor(private readonly mem: InstanceType<typeof Memory>) {}

  static create(): Mem0Harness {
    // Default config: OpenAI LLM + embedder, in-memory vector store. Good enough
    // for a single-run spike; swap the store in the config if you want it durable.
    const mem = new Memory();
    return new Mem0Harness(mem);
  }

  /** Wipe this user's memories so each spike run starts from a clean store. */
  async reset(userId: string): Promise<void> {
    await this.mem.deleteAll({ userId });
  }

  /**
   * Replay the conversation message-by-message so mem0's incremental
   * ADD/UPDATE/DELETE reconciliation runs across the whole stream — exactly the
   * path that's supposed to prevent contradictions and duplicates.
   */
  async replay(userId: string, conversation: readonly SeedMessage[]): Promise<void> {
    for (const msg of conversation) {
      await this.mem.add([{ role: msg.role, content: msg.content }], { userId });
    }
  }

  /** All memories mem0 decided to keep, normalized for the metrics. */
  async getAll(userId: string): Promise<StoredMemory[]> {
    const res = await this.mem.getAll({ userId });
    return normalizeMemories(res);
  }

  /** IDs of the memories a single query surfaces (drives the dead-set metric). */
  async searchIds(userId: string, query: string, limit = 10): Promise<string[]> {
    const res = await this.mem.search(query, { userId, limit });
    return normalizeMemories(res).map((m) => m.id);
  }
}

/**
 * mem0 has returned either a bare array or `{ results: [...] }`, and the text
 * field has been `memory` or `text` across versions. Normalize defensively.
 */
function normalizeMemories(res: unknown): StoredMemory[] {
  const arr: unknown[] = Array.isArray(res)
    ? res
    : Array.isArray((res as { results?: unknown[] })?.results)
      ? (res as { results: unknown[] }).results
      : [];
  const out: StoredMemory[] = [];
  for (const r of arr) {
    const o = r as { id?: unknown; memory?: unknown; text?: unknown };
    const id = typeof o.id === "string" ? o.id : undefined;
    const text =
      typeof o.memory === "string" ? o.memory : typeof o.text === "string" ? o.text : undefined;
    if (id && text) out.push({ id, text });
  }
  return out;
}
