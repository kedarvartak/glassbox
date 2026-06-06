/**
 * Minimal OpenAI embeddings client (no SDK dependency — just fetch).
 *
 * We embed stored memory texts ourselves to detect *near*-duplicates that mem0
 * stored as separate facts. Uses the same OPENAI_API_KEY mem0 already needs for
 * fact extraction, so the spike adds no new credentials.
 */
const EMBED_MODEL = "text-embedding-3-small";
const ENDPOINT = "https://api.openai.com/v1/embeddings";

/** Embed a batch of texts, preserving order. */
export async function embedAll(texts: readonly string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required (used for embeddings).");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });
  if (!res.ok) {
    throw new Error(`embeddings request failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { data: { index: number; embedding: number[] }[] };
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}
