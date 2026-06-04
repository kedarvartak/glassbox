/**
 * Cross-tool source enums.
 *
 * `SourceTool` answers "which agent produced this session". `SegmentSource`
 * answers "what *kind* of thing is occupying the context window" — the axis the
 * context x-ray (doc 07, Job 1) breaks spend down by, and the axis the
 * reclaimable-tokens analyzer (doc 20) attributes garbage to.
 *
 * Both are open string unions rather than TS `enum`s so adapters can emit a
 * value we haven't enumerated yet and we degrade gracefully (doc 17 principle:
 * "unknown formats → partial results, never a crash") instead of throwing.
 */

export type SourceTool =
  | "claude-code"
  | "codex"
  | "cursor"
  | "cline"
  | (string & {});

/**
 * Where a resident chunk of context came from. Mirrors the categories Claude
 * Code's own `/context` surfaces, plus the ones that matter for hygiene
 * analysis (file content, tool output) that `/context` lumps together.
 */
export type SegmentSource =
  | "system" // system prompt / harness instructions
  | "tools" // tool *definitions* injected into the window
  | "memory" // CLAUDE.md / memory files / memory-tool recalls
  | "mcp" // context contributed by MCP servers
  | "file" // file *contents* pulled in via Read/Write/Edit
  | "tool_result" // output returned by a tool call
  | "user" // user-authored prompt text
  | "assistant" // model-authored text
  | "thinking" // extended-thinking blocks
  | "history" // prior turns carried forward
  | "unknown"
  | (string & {});
