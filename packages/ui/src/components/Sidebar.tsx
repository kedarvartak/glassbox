import { useMemo, useState } from "react";
import type { SessionListItem } from "../api.js";
import { basename, fmtInt, relativeTime } from "../format.js";

interface Props {
  sessions: readonly SessionListItem[];
  selected: string | null;
  onSelect: (locator: string) => void;
}

export function Sidebar({ sessions, selected, onSelect }: Props) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return sessions;
    return sessions.filter(
      (s) =>
        s.projectPath.toLowerCase().includes(needle) ||
        s.sessionId.toLowerCase().includes(needle),
    );
  }, [sessions, q]);

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="label">
          Sessions <span className="count">{filtered.length}</span>
        </div>
        <input
          className="s-search mono"
          placeholder="filter by project…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {filtered.map((s) => (
        <button
          key={s.locator}
          className={`s-item${s.locator === selected ? " active" : ""}`}
          onClick={() => onSelect(s.locator)}
        >
          <div className="proj">{basename(s.projectPath)}</div>
          <div className="sub">
            <span>{fmtInt(s.messageCount)} msg</span>
            <span>{fmtInt(s.toolCallCount)} tool</span>
            {s.memoryOpCount > 0 && <span>{s.memoryOpCount} mem</span>}
            <span className="when">{relativeTime(s.endedAt)}</span>
          </div>
        </button>
      ))}
    </aside>
  );
}
