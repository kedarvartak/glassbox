/**
 * Tier 3 summarizer — calls the Anthropic messages API to compress cold
 * reasoning prose into a structured digest.
 *
 * Uses native fetch (Node 18+), no SDK dep. Reads ANTHROPIC_API_KEY from the
 * environment — the same key Claude Code itself uses.
 *
 * Model choice: claude-haiku-4-5-20251001. The doc's "smaller model preferred"
 * guidance: larger models overwrite stated facts with learned priors and drift
 * more under paraphrase. Haiku is fast, cheap, and more literal.
 */

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const SUMMARIZE_MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 1024;

export class SummarizerError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "SummarizerError";
  }
}

/**
 * Compress `coldText` (cold reasoning prose) into a structured digest.
 * `ledger` is the artifact ledger — shown as read-only context so the model
 * stays consistent with extracted hard facts without re-emitting them.
 *
 * Returns the digest string, or throws `SummarizerError` on API failure.
 */
export async function callSummarizer(
  coldText: string,
  ledger: string,
): Promise<string> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    throw new SummarizerError(
      "ANTHROPIC_API_KEY not set — Tier 3 requires an API key to call the summarizer.",
    );
  }

  const prompt = buildPrompt(coldText, ledger);

  const resp = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: SUMMARIZE_MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new SummarizerError(
      `Anthropic API error ${resp.status}: ${body.slice(0, 200)}`,
      resp.status,
    );
  }

  const data = (await resp.json()) as {
    content?: { type: string; text?: string }[];
  };

  const text = data.content?.find((b) => b.type === "text")?.text ?? "";
  if (!text.trim()) throw new SummarizerError("Summarizer returned empty response.");
  return text.trim();
}

function buildPrompt(coldText: string, ledger: string): string {
  return `You are a context compressor for a coding assistant session. Your job is to compress earlier reasoning into a concise, structured digest that a future instance of the same assistant can use to resume work accurately.

## Read-only context (artifact ledger — do NOT re-summarize or paraphrase these)
${ledger}

## Instructions

Compress the reasoning below into:
1. **Decisions made** — numbered list, one per line. Keep exact file names, function names, error codes, and technical values verbatim.
2. **Open questions** — any unresolved questions or TODOs present at the end of this phase.
3. **Key findings** — patterns noticed, constraints discovered, important observations.

Rules:
- Do NOT paraphrase technical names, file paths, function signatures, or error strings. Copy them exactly.
- Do NOT invent anything not present in the text.
- Be specific and concrete. "Updated auth.ts line 42" beats "made some auth changes."
- If something in the ledger above already covers a point, skip it — no duplication.
- Target 150–400 tokens total.

## Reasoning to compress

${coldText}`;
}
