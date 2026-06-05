import { useMemo, useState } from "react";
import type { SessionListItem } from "../api.js";
import { basename } from "../format.js";

interface Props {
  sessions: readonly SessionListItem[];
  selected: string | null;
  onSelect: (locator: string) => void;
}

type Enriched = SessionListItem & { title: string; ago: string };
type Group = { label: string; items: Enriched[] };

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function avatarColor(name: string): string {
  const palette = ["#3274d9", "#7358ff", "#f2495c", "#ff780a", "#56a64b", "#1f998c", "#c98a1e"];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return palette[Math.abs(h) % palette.length];
}

function groupSessions(sessions: readonly SessionListItem[], query: string): Group[] {
  const needle = query.trim().toLowerCase();
  const now = new Date();
  const todayStr = now.toDateString();
  const ydStr = new Date(now.getTime() - 86_400_000).toDateString();

  const enriched: Enriched[] = sessions
    .map((s) => ({
      ...s,
      title: basename(s.projectPath) || s.sessionId.slice(0, 8),
      ago: timeAgo(s.endedAt),
    }))
    .filter((s) => {
      if (!needle) return true;
      return (
        s.title.toLowerCase().includes(needle) ||
        s.sessionId.toLowerCase().includes(needle) ||
        s.projectPath.toLowerCase().includes(needle)
      );
    });

  const buckets: Record<string, Enriched[]> = { Today: [], Yesterday: [], Earlier: [] };
  for (const s of enriched) {
    const d = new Date(s.endedAt).toDateString();
    if (d === todayStr) buckets["Today"].push(s);
    else if (d === ydStr) buckets["Yesterday"].push(s);
    else buckets["Earlier"].push(s);
  }

  return (["Today", "Yesterday", "Earlier"] as const)
    .filter((k) => buckets[k].length > 0)
    .map((label) => ({ label, items: buckets[label] }));
}

export function Sidebar({ sessions, selected, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  const groups = useMemo(() => groupSessions(sessions, query), [sessions, query]);

  return (
    <aside className={`sb${collapsed ? " sb-col" : ""}`}>
      {/* ── brand row ── */}
      <div className="sb-top">
        <div className="sb-brand" style={{ justifyContent: collapsed ? "center" : "flex-end" }}>
          <button
            className="sb-tog"
            type="button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed((v) => !v)}
          >
            <CollapseIcon />
          </button>
        </div>

        {!collapsed && (
          <label className="sb-search">
            <SearchIcon />
            <input
              placeholder="Search sessions…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <span className="sb-search-hint">⌘K</span>
          </label>
        )}
      </div>

      {/* ── session list ── */}
      <div className="sb-list">
        {collapsed
          ? sessions.slice(0, 30).map((s) => {
              const title = basename(s.projectPath) || s.sessionId.slice(0, 8);
              const color = avatarColor(title);
              return (
                <button
                  key={s.locator}
                  className={`sb-mini${s.locator === selected ? " active" : ""}`}
                  onClick={() => onSelect(s.locator)}
                  title={`${title} · ${timeAgo(s.endedAt)}`}
                  type="button"
                >
                  <span className="sb-av" style={{ background: color }}>
                    {title.charAt(0).toUpperCase()}
                  </span>
                </button>
              );
            })
          : groups.length === 0
            ? <div className="sb-empty">No sessions match</div>
            : groups.map((g) => (
                <div className="sb-group" key={g.label}>
                  <div className="sb-gh">{g.label}</div>
                  {g.items.map((s) => {
                    const color = avatarColor(s.title);
                    return (
                      <button
                        key={s.locator}
                        className={`sb-row${s.locator === selected ? " active" : ""}`}
                        onClick={() => onSelect(s.locator)}
                        title={s.projectPath}
                        type="button"
                      >
                        <span className="sb-av" style={{ background: color }}>
                          {s.title.charAt(0).toUpperCase()}
                        </span>
                        <span className="sb-row-body">
                          <span className="sb-row-top">
                            <span className="sb-title">{s.title}</span>
                            <span className="sb-ago">{s.ago}</span>
                          </span>
                          <span className="sb-row-meta">
                            <span className="sb-chip">{s.messageCount} msgs</span>
                            <span className="sb-chip">{s.toolCallCount} tools</span>
                            {s.memoryOpCount > 0 && (
                              <span className="sb-chip mem">{s.memoryOpCount} mem</span>
                            )}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
      </div>

      {/* ── footer status ── */}
      {!collapsed && (
        <div className="sb-foot">
          <span className="sb-dot" />
          <span>
            {sessions.length} session{sessions.length !== 1 ? "s" : ""} · local
          </span>
        </div>
      )}
    </aside>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="2" />
      <path d="m16 16 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="3" stroke="currentColor" strokeWidth="1.9" />
      <path d="M11 5v14" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}
