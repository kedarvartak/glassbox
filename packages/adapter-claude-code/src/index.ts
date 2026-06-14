export { ClaudeCodeAdapter } from "./adapter.js";
export { discoverClaudeSessions } from "./discover.js";
export { forkTranscript, type ForkOptions, type ForkResult, type ForkSummary } from "./fork.js";
export { applyTrimTranscript, type TrimTranscriptResult, type TrimTranscriptSummary } from "./apply-trim.js";
export { extractColdText, composeCompactedTranscript, type ComposeResult } from "./compose-compact.js";
export { parseClaudeSession } from "./parse.js";
export {
  validateTranscript,
  newProblems,
  type ValidationProblem,
  type ValidationReport,
} from "./validate.js";
export { claudeProjectsRoot, encodeProjectDir } from "./paths.js";
