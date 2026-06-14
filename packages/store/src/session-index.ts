import type { Session } from "@glassbox/core";
import { DatabaseSync, type Database } from "./sqlite.js";

/**
 * The freshness key for a source file: cheap `stat` fields the adapter already
 * collects during discovery. We treat (mtime, size) as the change signal — the
 * same heuristic make/rsync use — so an unchanged session is skipped without
 * ever opening it (see SessionIndexer.sync).
 */
export interface SourceFingerprint {
  readonly modifiedAt: string | null;
  readonly sizeBytes: number | null;
}

/** Queryable metadata for a session — everything a picker needs without the blob. */
export interface IndexedSessionMeta {
  readonly locator: string;
  readonly tool: string;
  readonly sessionId: string;
  readonly projectPath: string;
  readonly gitBranch: string | null;
  readonly toolVersion: string | null;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly messageCount: number;
  readonly turnCount: number;
  readonly toolCallCount: number;
  readonly fileOpCount: number;
  readonly memoryOpCount: number;
  readonly warningCount: number;
  readonly source: SourceFingerprint;
  readonly parsedAt: string;
}

/** A full indexed row: metadata plus the complete normalized model. */
export interface IndexedSession extends IndexedSessionMeta {
  readonly session: Session;
}

export interface UpsertInput {
  readonly locator: string;
  readonly session: Session;
  readonly source: SourceFingerprint;
  /** When the parse happened (defaults to now). */
  readonly parsedAt?: string;
}

export interface ListOptions {
  readonly projectPath?: string;
  readonly tool?: string;
  readonly limit?: number;
}

/**
 * A SQLite-backed index over parsed sessions.
 *
 * Design (ADR 0004's "reconstruct on demand, index only if perf demands"): we do
 * **not** shred the model into relational tables — the model is still young and
 * is the contract, so a per-table schema would mean a migration on every model
 * change. Instead we store the whole `Session` as a JSON blob and lift just the
 * fields a session-picker filters/sorts on into real columns. Fast list/filter,
 * zero coupling to the model's internal shape, trivial to evolve.
 *
 * This is **our** store (default `~/.glassbox/index.db`), never the user's
 * project — local-first and read-only toward their data (doc 17 §6).
 */
export class SessionIndex {
  private constructor(private readonly db: Database) {}

  static open(path: string): SessionIndex {
    const db = new DatabaseSync(path);
    db.exec(SCHEMA);
    return new SessionIndex(db);
  }

  /** Insert or replace a parsed session. Returns the stored metadata. */
  upsert(input: UpsertInput): IndexedSessionMeta {
    const s = input.session;
    const meta: IndexedSessionMeta = {
      locator: input.locator,
      tool: s.tool,
      sessionId: s.id,
      projectPath: s.projectPath,
      gitBranch: s.gitBranch,
      toolVersion: s.toolVersion,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      messageCount: s.messages.length,
      turnCount: s.turns.length,
      toolCallCount: s.toolCalls.length,
      fileOpCount: s.fileOps.length,
      memoryOpCount: s.memoryOps.length,
      warningCount: s.warnings.length,
      source: input.source,
      parsedAt: input.parsedAt ?? new Date().toISOString(),
    };

    this.db
      .prepare(
        `INSERT OR REPLACE INTO sessions (
           locator, tool, session_id, project_path, git_branch, tool_version,
           started_at, ended_at, message_count, turn_count, tool_call_count,
           file_op_count, memory_op_count, warning_count,
           source_mtime, source_size, parsed_at, model_json
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        meta.locator,
        meta.tool,
        meta.sessionId,
        meta.projectPath,
        meta.gitBranch,
        meta.toolVersion,
        meta.startedAt,
        meta.endedAt,
        meta.messageCount,
        meta.turnCount,
        meta.toolCallCount,
        meta.fileOpCount,
        meta.memoryOpCount,
        meta.warningCount,
        meta.source.modifiedAt,
        meta.source.sizeBytes,
        meta.parsedAt,
        JSON.stringify(s),
      );

    return meta;
  }

  /** Full session (metadata + model), or null if not indexed. */
  get(locator: string): IndexedSession | null {
    const row = this.db
      .prepare(`SELECT * FROM sessions WHERE locator = ?`)
      .get(locator) as unknown as SessionRow | undefined;
    if (!row) return null;
    return { ...rowToMeta(row), session: JSON.parse(row.model_json) as Session };
  }

  /** Stored freshness key for a locator — for incremental sync, no blob load. */
  fingerprint(locator: string): SourceFingerprint | null {
    const row = this.db
      .prepare(`SELECT source_mtime, source_size FROM sessions WHERE locator = ?`)
      .get(locator) as unknown as Pick<SessionRow, "source_mtime" | "source_size"> | undefined;
    if (!row) return null;
    return { modifiedAt: row.source_mtime, sizeBytes: row.source_size };
  }

  /** All known locators → fingerprint, in one query (sync diffs against this). */
  fingerprints(): Map<string, SourceFingerprint> {
    const rows = this.db
      .prepare(`SELECT locator, source_mtime, source_size FROM sessions`)
      .all() as unknown as Pick<SessionRow, "locator" | "source_mtime" | "source_size">[];
    const map = new Map<string, SourceFingerprint>();
    for (const r of rows) {
      map.set(r.locator, { modifiedAt: r.source_mtime, sizeBytes: r.source_size });
    }
    return map;
  }

  /** Metadata rows (no model blob), newest-ended first. The fast picker query. */
  list(opts: ListOptions = {}): IndexedSessionMeta[] {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (opts.projectPath) {
      where.push("project_path = ?");
      params.push(opts.projectPath);
    }
    if (opts.tool) {
      where.push("tool = ?");
      params.push(opts.tool);
    }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const limit = opts.limit ? `LIMIT ${Math.max(0, Math.floor(opts.limit))}` : "";
    const rows = this.db
      .prepare(`SELECT ${META_COLUMNS} FROM sessions ${clause} ORDER BY ended_at DESC ${limit}`)
      .all(...params) as unknown as SessionRow[];
    return rows.map(rowToMeta);
  }

  /** Remove a session (e.g. its source file was deleted). Returns true if removed. */
  remove(locator: string): boolean {
    return this.db.prepare(`DELETE FROM sessions WHERE locator = ?`).run(locator).changes > 0;
  }

  stats(): { sessions: number } {
    const row = this.db.prepare(`SELECT COUNT(*) AS n FROM sessions`).get() as unknown as {
      n: number;
    };
    return { sessions: Number(row.n) };
  }

  close(): void {
    this.db.close();
  }
}

// ───────────────────────────── schema + row mapping ─────────────────────────────

const SCHEMA = `
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  CREATE TABLE IF NOT EXISTS sessions (
    locator         TEXT PRIMARY KEY,
    tool            TEXT NOT NULL,
    session_id      TEXT NOT NULL,
    project_path    TEXT NOT NULL,
    git_branch      TEXT,
    tool_version    TEXT,
    started_at      TEXT NOT NULL,
    ended_at        TEXT NOT NULL,
    message_count   INTEGER NOT NULL,
    turn_count      INTEGER NOT NULL,
    tool_call_count INTEGER NOT NULL,
    file_op_count   INTEGER NOT NULL,
    memory_op_count INTEGER NOT NULL,
    warning_count   INTEGER NOT NULL,
    source_mtime    TEXT,
    source_size     INTEGER,
    parsed_at       TEXT NOT NULL,
    model_json      TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_path);
  CREATE INDEX IF NOT EXISTS idx_sessions_ended ON sessions(ended_at DESC);
  CREATE INDEX IF NOT EXISTS idx_sessions_tool ON sessions(tool);
`;

const META_COLUMNS = `
  locator, tool, session_id, project_path, git_branch, tool_version,
  started_at, ended_at, message_count, turn_count, tool_call_count,
  file_op_count, memory_op_count, warning_count, source_mtime, source_size, parsed_at
`;

interface SessionRow {
  locator: string;
  tool: string;
  session_id: string;
  project_path: string;
  git_branch: string | null;
  tool_version: string | null;
  started_at: string;
  ended_at: string;
  message_count: number;
  turn_count: number;
  tool_call_count: number;
  file_op_count: number;
  memory_op_count: number;
  warning_count: number;
  source_mtime: string | null;
  source_size: number | null;
  parsed_at: string;
  model_json: string;
}

function rowToMeta(row: SessionRow): IndexedSessionMeta {
  return {
    locator: row.locator,
    tool: row.tool,
    sessionId: row.session_id,
    projectPath: row.project_path,
    gitBranch: row.git_branch,
    toolVersion: row.tool_version,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    messageCount: Number(row.message_count),
    turnCount: Number(row.turn_count),
    toolCallCount: Number(row.tool_call_count),
    fileOpCount: Number(row.file_op_count),
    memoryOpCount: Number(row.memory_op_count),
    warningCount: Number(row.warning_count),
    source: { modifiedAt: row.source_mtime, sizeBytes: row.source_size },
    parsedAt: row.parsed_at,
  };
}
