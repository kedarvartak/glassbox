import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Where Claude Code keeps session transcripts (doc 14 §1, confirmed on the
 * spike machine, doc 19): `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`.
 *
 * The directory name is the project's absolute path with separators replaced by
 * `-` (e.g. `/home/kedar/Desktop/Projects/md` → `-home-kedar-Desktop-Projects-md`).
 */
export function claudeProjectsRoot(root?: string): string {
  return root ?? join(homedir(), ".claude", "projects");
}

/** Encode an absolute project path the way Claude Code names its dirs. */
export function encodeProjectDir(projectPath: string): string {
  return projectPath.replace(/[/\\]/g, "-");
}
