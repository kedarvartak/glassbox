/**
 * THE SEED — your experiment. (This is the file you own.)
 *
 * Everything else in the spike is fixed machinery; this is the variable. The
 * conclusion the harness can draw is only as strong as the garbage you plant
 * here, so the design choices below are *yours*:
 *
 *   1. conversation        — the stream mem0 ingests, in order. Plant your
 *                            garbage here: restate a fact 3 ways (near-dup),
 *                            change a preference mid-stream (contradiction),
 *                            mention a project once and never again (dead).
 *   2. expectedUniqueFacts — how many genuinely-distinct facts you planted.
 *                            storedCount / this = the bloat ratio.
 *   3. contradictions      — for each one you planted, the stale phrase that
 *                            must NOT survive and the current value that should.
 *   4. probes              — the queries a real app would ask. Any memory no
 *                            probe surfaces is counted "dead". Be honest here —
 *                            cover the facts you'd actually retrieve.
 *
 * The starter below is a minimal, runnable example that plants one of each
 * garbage class. Replace it with your real seed.
 */
import type { Seed } from "./types.js";

export const seed: Seed = {
  userId: "spike-user",

  // ───────────────────────────────────────────────────────────────────────
  // TODO(you): replace this starter conversation with your seed.
  // Annotations show which garbage class each block is meant to plant.
  // ───────────────────────────────────────────────────────────────────────
  conversation: [
    // near-duplicate: the same preference, three phrasings, across the stream.
    { role: "user", content: "I prefer dark mode in all my apps." },
    { role: "user", content: "By the way, I always use dark theme everywhere." },
    { role: "user", content: "Light backgrounds hurt my eyes, so I keep things dark." },

    // contradiction: an editor choice, later reversed. Only the latest is true.
    { role: "user", content: "My main editor is VS Code." },
    { role: "assistant", content: "Got it — VS Code is your editor." },
    { role: "user", content: "Actually I switched to Neovim last week, that's my editor now." },

    // dead: stated once, never queried by any probe below.
    { role: "user", content: "I once worked on a project called Heliotrope in 2019." },
  ],

  // Distinct facts above: (1) prefers dark mode, (2) editor = Neovim,
  // (3) worked on Heliotrope. The three dark-mode lines are ONE fact.
  expectedUniqueFacts: 3,

  contradictions: [
    {
      topic: "primary editor",
      staleText: "VS Code", // if this survives in the store, reconciliation failed
      currentText: "Neovim",
    },
  ],

  probes: [
    { query: "What UI theme does the user prefer?", expect: "dark mode" },
    { query: "Which code editor does the user use?", expect: "Neovim" },
    // note: no probe asks about "Heliotrope" → it should fall into the dead set.
  ],
};
