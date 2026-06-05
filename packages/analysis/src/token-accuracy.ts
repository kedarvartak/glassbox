import type { Message, Session, TokenCounter } from "@glassbox/core";

/**
 * How trustworthy is our *estimated* token sizing? (doc 17 §1.2: "validate
 * against provider truth.")
 *
 * Cost (see cost.ts) uses provider actuals and is exact. But the context x-ray
 * sizes individual segments — tool outputs, file contents — with the swappable
 * {@link TokenCounter} (today a ~4-chars/token estimate, because there is no
 * accurate *local* Claude tokenizer; the only exact count is the network
 * `count_tokens` endpoint, which we won't call by default — local-first). This
 * analyzer measures that estimator's error so the UI can put an honest error
 * bar on every segment size instead of presenting a guess as fact.
 *
 * Method — the only clean apples-to-apples signal in a transcript: a model
 * **response made of plain text only**. For such a response, the provider's
 * `output_tokens` is exactly the tokens of that text, so `count(text)` vs
 * `output_tokens` is a fair comparison. We deliberately exclude responses that
 * contain:
 *   - **thinking** — `output_tokens` counts the full reasoning the model
 *     generated, but transcripts store only a summary (or nothing), so our text
 *     would undercount through no fault of the estimator; and
 *   - **tool_use** — the tool-call JSON contributes to `output_tokens` but its
 *     exact serialization (whitespace, escaping) isn't recoverable from the
 *     parsed input.
 *
 * One transcript "response" can be several JSONL events sharing a provider
 * message id (Claude Code splits them); we regroup on `providerMessageId` so the
 * single `output_tokens` for the response is compared against the response's
 * combined text.
 */
export interface TokenAccuracyReport {
  /** estimated ÷ provider over the clean sample; null if no clean responses. */
  readonly ratio: number | null;
  /** Mean per-response |estimate − provider| ÷ provider; null if no sample. */
  readonly meanAbsPctError: number | null;
  /** Plain-text responses actually compared. */
  readonly sampleResponses: number;
  readonly estimatedTokens: number;
  readonly providerTokens: number;

  /** All distinct responses that reported `output_tokens`. */
  readonly totalResponses: number;
  /** Responses excluded because they contained thinking. */
  readonly excludedWithThinking: number;
  /** Responses excluded because they contained tool calls. */
  readonly excludedWithToolUse: number;

  /** Human-readable summary, caveats included — for the CLI/UI to print. */
  readonly note: string;
}

interface ResponseAccumulator {
  outputTokens: number | null;
  text: string;
  hasThinking: boolean;
  hasToolUse: boolean;
}

export function checkTokenAccuracy(session: Session, counter: TokenCounter): TokenAccuracyReport {
  const groups = new Map<string, ResponseAccumulator>();

  for (const message of session.messages) {
    if (message.role !== "assistant" || !message.providerMessageId) continue;
    const g = groups.get(message.providerMessageId) ?? fresh();
    if (message.usage && g.outputTokens === null) g.outputTokens = message.usage.outputTokens;
    accumulate(g, message);
    groups.set(message.providerMessageId, g);
  }

  let sampleResponses = 0;
  let estimatedTokens = 0;
  let providerTokens = 0;
  let pctErrorSum = 0;
  let totalResponses = 0;
  let excludedWithThinking = 0;
  let excludedWithToolUse = 0;

  for (const g of groups.values()) {
    if (g.outputTokens === null || g.outputTokens <= 0) continue;
    totalResponses++;
    if (g.hasThinking) excludedWithThinking++;
    if (g.hasToolUse) excludedWithToolUse++;
    if (g.hasThinking || g.hasToolUse) continue; // not a clean plain-text response

    const est = counter.count(g.text);
    sampleResponses++;
    estimatedTokens += est;
    providerTokens += g.outputTokens;
    pctErrorSum += Math.abs(est - g.outputTokens) / g.outputTokens;
  }

  const ratio = providerTokens > 0 ? estimatedTokens / providerTokens : null;
  const meanAbsPctError = sampleResponses > 0 ? pctErrorSum / sampleResponses : null;

  return {
    ratio,
    meanAbsPctError,
    sampleResponses,
    estimatedTokens,
    providerTokens,
    totalResponses,
    excludedWithThinking,
    excludedWithToolUse,
    note: summarize(ratio, meanAbsPctError, sampleResponses, totalResponses),
  };
}

function fresh(): ResponseAccumulator {
  return { outputTokens: null, text: "", hasThinking: false, hasToolUse: false };
}

function accumulate(g: ResponseAccumulator, message: Message): void {
  for (const block of message.blocks) {
    switch (block.kind) {
      case "text":
        g.text += block.text;
        break;
      case "thinking":
        g.hasThinking = true;
        break;
      case "tool_use":
        g.hasToolUse = true;
        break;
      // tool_result / unknown don't occur on assistant output; ignore.
    }
  }
}

function summarize(
  ratio: number | null,
  meanAbsPctError: number | null,
  sample: number,
  total: number,
): string {
  if (ratio === null || meanAbsPctError === null) {
    return (
      `No plain-text responses to calibrate against (of ${total} priced responses, ` +
      `all contained thinking or tool calls). Segment sizes are directional estimates ` +
      `(~4 chars/token); validate on a session with plain-text replies.`
    );
  }
  const pct = (meanAbsPctError * 100).toFixed(0);
  const dir = ratio >= 1 ? "over" : "under";
  return (
    `Estimate counter ${dir}counts by ~${pct}% vs provider output tokens ` +
    `(ratio ${ratio.toFixed(2)}× over ${sample} plain-text responses). ` +
    `Treat segment token sizes as ±${pct}%; cost figures use provider actuals and are exact.`
  );
}
