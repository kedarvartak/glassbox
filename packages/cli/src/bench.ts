/**
 * Compaction quality evaluator — replays probe questions into the original and
 * cleaned transcript, then uses an LLM judge to score whether the cleaned model
 * answers as well as the original.
 *
 * If all probes are equivalent → garbage was garbage, compaction is safe.
 * If probes degrade → the classifier over-reached, something still needed was
 * cleaned. That's signal worth surfacing before the user resumes from the fork.
 *
 * Call path: runBench → generateProbes + replayProbe (×2 per probe) + judgeEquivalence
 * Cost: dominated by replay calls (full transcript × number of probes × 2).
 */

import type { EvictionPlan } from "@glassbox/analysis";
import type { Session } from "@glassbox/core";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const BENCH_MODEL = "claude-haiku-4-5-20251001";
const REPLAY_MAX_TOKENS = 512;
const JUDGE_MAX_TOKENS = 256;
export const MAX_PROBES = 5;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProbeQuestion {
  readonly id: string;
  readonly question: string;
  readonly toolName: string;
  /** Why this content was cleaned — shapes how the judge scores "I can re-run" answers. */
  readonly cleanedDetail: string;
  readonly command?: string;
  readonly path?: string;
}

export interface ProbeResult {
  readonly probe: ProbeQuestion;
  readonly originalAnswer: string;
  readonly cleanedAnswer: string;
  readonly verdict: "equivalent" | "partial" | "degraded";
  readonly reason: string;
}

export interface BenchResult {
  readonly probes: readonly ProbeResult[];
  readonly equivalent: number;
  readonly partial: number;
  readonly degraded: number;
  readonly tokensBefore: number;
  readonly tokensAfter: number;
}

// ─── Probe generation ─────────────────────────────────────────────────────────

/**
 * Generate probe questions from the eviction plan. Each probe targets one
 * cleaned tool call — phrased naturally so the model answers from memory, not
 * from reasoning about the compaction.
 *
 * Skips Write/Edit calls (their output is on disk, not in context) and calls
 * with no locatable input. Caps at `max` to keep API costs predictable.
 */
export function generateProbes(
  evictionPlan: EvictionPlan,
  session: Session,
  max = MAX_PROBES,
): ProbeQuestion[] {
  const toolCallMap = new Map(session.toolCalls.map((tc) => [tc.id as string, tc]));
  const probes: ProbeQuestion[] = [];

  for (const action of evictionPlan.actions) {
    if (probes.length >= max) break;
    if (!action.originToolCallId) continue;

    const tc = toolCallMap.get(action.originToolCallId);
    if (!tc) continue;

    // Write/Edit: output is the file on disk, not a result we can probe
    if (["Write", "Edit", "MultiEdit"].includes(tc.name)) continue;

    const inp = tc.input as Record<string, unknown>;
    const command = typeof inp["command"] === "string" ? inp["command"] : undefined;
    const filePath =
      typeof inp["file_path"] === "string" ? inp["file_path"] :
      typeof inp["path"] === "string" ? inp["path"] : undefined;
    const pattern = typeof inp["pattern"] === "string" ? inp["pattern"] : undefined;

    let question: string;

    if (tc.name === "Bash" || tc.name === "bash") {
      if (!command) continue;
      const short = command.length > 100 ? command.slice(0, 100) + "…" : command;
      question = `Earlier in this session you ran: \`${short}\`. What was the output?`;
    } else if (tc.name === "Read" || tc.name === "read_file") {
      const p = filePath ?? action.path;
      if (!p) continue;
      question = `Earlier in this session you read \`${p}\`. What did that file contain?`;
    } else if (tc.name === "Grep" || tc.name === "grep") {
      const where = filePath ? ` in \`${filePath}\`` : "";
      question = `Earlier you searched for \`${pattern ?? "a pattern"}\`${where}. What did the search find?`;
    } else {
      // Generic: MCP tools, LS, etc.
      question = `Earlier in this session you used the \`${tc.name}\` tool. What did it return?`;
    }

    probes.push({
      id: action.originToolCallId,
      question,
      toolName: tc.name,
      cleanedDetail: action.detail,
      ...(command ? { command } : {}),
      ...(action.path ? { path: action.path } : {}),
    });
  }

  return probes;
}

// ─── Message extraction ───────────────────────────────────────────────────────

interface ApiMessage {
  role: "user" | "assistant";
  content: unknown[];
}

/**
 * Extract conversation messages from raw JSONL for replay. Strips `thinking`
 * and `signature` blocks — they're the model's private scratchpad and require
 * special beta headers if passed back. All tool_use/tool_result pairs are kept
 * intact (the API validates pairing). Non-conversation events (summary, etc.)
 * are skipped.
 */
export function extractApiMessages(rawText: string): ApiMessage[] {
  const out: ApiMessage[] = [];
  for (const line of rawText.split("\n")) {
    if (line.trim() === "") continue;
    let ev: unknown;
    try { ev = JSON.parse(line); } catch { continue; }

    const event = ev as Record<string, unknown>;
    if (event["type"] !== "user" && event["type"] !== "assistant") continue;

    const msg = event["message"] as { role?: string; content?: unknown } | undefined;
    if (!msg?.role || !Array.isArray(msg.content)) continue;
    if (msg.role !== "user" && msg.role !== "assistant") continue;

    // Strip thinking/signature — opaque to API without beta headers
    const content = (msg.content as Record<string, unknown>[]).filter(
      (b) => b["type"] !== "thinking" && b["type"] !== "signature",
    );
    if (content.length === 0) continue;

    out.push({ role: msg.role as "user" | "assistant", content });
  }
  return out;
}

// ─── Replay ───────────────────────────────────────────────────────────────────

/**
 * Append a probe question to the transcript and call the bench model for an
 * answer. The model sees the full conversation history so its recall should
 * match what it actually had access to during the session.
 */
export async function replayProbe(
  rawText: string,
  probe: ProbeQuestion,
  apiKey: string,
): Promise<string> {
  const messages = extractApiMessages(rawText);
  messages.push({
    role: "user",
    content: [{ type: "text", text: probe.question }],
  });

  const resp = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: BENCH_MODEL,
      max_tokens: REPLAY_MAX_TOKENS,
      messages,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Bench replay API error ${resp.status}: ${body.slice(0, 200)}`);
  }

  const data = (await resp.json()) as { content?: { type: string; text?: string }[] };
  return data.content?.find((b) => b.type === "text")?.text?.trim() ?? "";
}

// ─── Judge ────────────────────────────────────────────────────────────────────

/**
 * Build the judge prompt comparing the original and cleaned answers for one probe.
 *
 * ── YOUR CONTRIBUTION ──────────────────────────────────────────────────────────
 * This function is the heart of the eval. Write a prompt that instructs the
 * judge model to score the cleaned answer as:
 *
 *   equivalent  — cleaned model has all important facts, OR correctly defers
 *                 ("that output was cleaned, I can re-run") for spent-tool/spent-mcp
 *   partial     — cleaned model has the right idea but is missing specific details
 *                 that a future coding task might need
 *   degraded    — cleaned model gives wrong information, hallucinates, or misses
 *                 something critical that stale/gone probes should still know
 *
 * The `probe.cleanedDetail` field tells you WHY it was cleaned:
 *   "spent-tool"      → output was never referenced again (garbage) — deferral is fine
 *   "spent-mcp"       → same, but an MCP tool
 *   "stale-superseded"→ a later read in-session has the current version — model
 *                       should still know from that later read
 *   "stale-drift"     → file changed on disk; model should know it needs a re-read
 *   "gone"            → file was deleted; model should know the file is gone
 *   "duplicate"       → identical copy already in context; model should still know
 *
 * End the prompt with instructions to respond in EXACTLY this format:
 *   VERDICT: equivalent
 *   REASON: one sentence
 * ──────────────────────────────────────────────────────────────────────────────
 */
function buildJudgePrompt(
  probe: ProbeQuestion,
  original: string,
  cleaned: string,
): string {
  // Spell out what the cleaned model is allowed to not know, per eviction type.
  const detailContext: Record<string, string> = {
    "spent-tool":       "The output was classified as spent (never referenced again) and tombstoned. The cleaned model may not recall the output — saying 'that output was cleaned, I can re-run' is CORRECT behavior and counts as equivalent.",
    "spent-mcp":        "The MCP tool output was classified as spent and tombstoned. Same rule as spent-tool: deferral is correct and counts as equivalent.",
    "stale-superseded": "A later read in the same session holds the current version. The cleaned model should still know the content from that later read. If it can't answer, that is degraded.",
    "stale-drift":      "The file changed on disk after it was read. The cleaned model should know the copy it read is outdated and say so — 'the file may have changed, I should re-read' is equivalent. Confidently stating stale content as current is degraded.",
    "gone":             "The file was deleted. The cleaned model should know the file no longer exists. Saying 'that file is gone' is equivalent. Not knowing the file is gone is degraded.",
    "duplicate":        "A duplicate copy was removed but an identical copy remains in context. The cleaned model should still know the content from the surviving copy.",
  };

  const rule = detailContext[probe.cleanedDetail] ??
    "Some content was cleaned. Score based on whether the cleaned model still has the key facts.";

  return `You are evaluating whether a context compaction operation preserved important information.

A coding assistant answered the same question twice — once with full session context (original), and once after the session was compacted (cleaned). Your job is to score whether the cleaned answer is as useful as the original.

## Why this content was cleaned
${rule}

## Question asked
${probe.question}

## Original answer
${original}

## Cleaned answer
${cleaned}

## Scoring rules
- equivalent  : Cleaned answer has all key facts, OR correctly defers in a way that is expected given the eviction type above.
- partial     : Cleaned answer has the right general idea but is missing specific values, names, or details a future coding task might need.
- degraded    : Cleaned answer is wrong, hallucinates content, or misses something critical that the eviction type says it should still know.

Do not penalise the cleaned model for being shorter or for acknowledging that output was cleaned — that is intentional and correct. Only penalise for missing facts that the model should still have had access to.

Respond in EXACTLY this format (two lines, no other text):
VERDICT: equivalent
REASON: one sentence explaining the verdict`;
}

async function judgeEquivalence(
  probe: ProbeQuestion,
  original: string,
  cleaned: string,
  apiKey: string,
): Promise<{ verdict: "equivalent" | "partial" | "degraded"; reason: string }> {
  const prompt = buildJudgePrompt(probe, original, cleaned);

  const resp = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: BENCH_MODEL,
      max_tokens: JUDGE_MAX_TOKENS,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Bench judge API error ${resp.status}: ${body.slice(0, 200)}`);
  }

  const data = (await resp.json()) as { content?: { type: string; text?: string }[] };
  const text = data.content?.find((b) => b.type === "text")?.text ?? "";

  // Parse "VERDICT: equivalent\nREASON: ..."
  const verdictMatch = /^VERDICT:\s*(equivalent|partial|degraded)/im.exec(text);
  const reasonMatch = /^REASON:\s*(.+)/im.exec(text);

  const verdict = (verdictMatch?.[1] ?? "partial") as "equivalent" | "partial" | "degraded";
  const reason = reasonMatch?.[1]?.trim() ?? text.slice(0, 120).trim();

  return { verdict, reason };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

/**
 * Run the bench eval: generate probes, replay into both transcripts, judge.
 * `tokensBefore` and `tokensAfter` are passed in from the caller (already
 * computed during compaction planning) rather than re-measured here.
 */
export async function runBench(
  originalRaw: string,
  cleanedRaw: string,
  session: Session,
  evictionPlan: EvictionPlan,
  tokensBefore: number,
  tokensAfter: number,
  apiKey: string,
): Promise<BenchResult> {
  const probes = generateProbes(evictionPlan, session);
  if (probes.length === 0) {
    return { probes: [], equivalent: 0, partial: 0, degraded: 0, tokensBefore, tokensAfter };
  }

  const results: ProbeResult[] = [];

  for (const probe of probes) {
    const [originalAnswer, cleanedAnswer] = await Promise.all([
      replayProbe(originalRaw, probe, apiKey),
      replayProbe(cleanedRaw, probe, apiKey),
    ]);
    const { verdict, reason } = await judgeEquivalence(probe, originalAnswer, cleanedAnswer, apiKey);
    results.push({ probe, originalAnswer, cleanedAnswer, verdict, reason });
  }

  return {
    probes: results,
    equivalent: results.filter((r) => r.verdict === "equivalent").length,
    partial: results.filter((r) => r.verdict === "partial").length,
    degraded: results.filter((r) => r.verdict === "degraded").length,
    tokensBefore,
    tokensAfter,
  };
}
