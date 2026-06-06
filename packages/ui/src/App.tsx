import { useEffect, useRef, useState } from "react";
import { api, type SessionDetail, type SessionListItem } from "./api.js";
import { SessionView } from "./components/SessionView.js";
import { basename, relativeTime } from "./format.js";

export function App() {
  const [sessions, setSessions] = useState<SessionListItem[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    api
      .sessions()
      .then((list) => {
        setSessions(list);
        if (list[0]) setSelected(list[0].locator);
      })
      .catch((e: unknown) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!selected) return;
    setLoadingDetail(true);
    setDetail(null);
    let live = true;
    api
      .session(selected)
      .then((d) => live && setDetail(d))
      .catch((e: unknown) => live && setError(String(e)))
      .finally(() => live && setLoadingDetail(false));
    return () => { live = false; };
  }, [selected]);

  const selectedSession = sessions?.find((s) => s.locator === selected) ?? null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-brand">
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="31" viewBox="0 0 50 39" fill="none">
            <path d="M16.4992 2H37.5808L22.0816 24.9729H1L16.4992 2Z" fill="#007AFF"/>
            <path d="M17.4231 27.1022L11.4199 36.0002H33.5015L49.0007 13.0273H32.7031L23.2071 27.1022H17.4231Z" fill="#312ECB"/>
          </svg>
        </div>

        <div className="topbar-sep" />

        {sessions && sessions.length > 0 && (
          <SessionPicker
            sessions={sessions}
            selected={selected}
            onSelect={setSelected}
            current={selectedSession}
          />
        )}

        <div className="topbar-right">
          <span className="topbar-badge">{sessions?.length ?? 0} sessions</span>
          <span className="topbar-dot" title="local · read-only" />
        </div>
      </header>

      <div className="app-body">
        {error ? (
          <div className="fullscreen-center">
            <div><div className="err-msg">failed to load</div>{error}</div>
          </div>
        ) : !sessions ? (
          <div className="fullscreen-center">
            <div><div className="spin" />reading index…</div>
          </div>
        ) : sessions.length === 0 ? (
          <div className="fullscreen-center">
            <div>no sessions indexed — run <code>glassbox index</code> first.</div>
          </div>
        ) : loadingDetail || !detail ? (
          <div className="fullscreen-center">
            <div><div className="spin" />analyzing session…</div>
          </div>
        ) : (
          <div className="dashboard">
            <SessionView d={detail} />
          </div>
        )}
      </div>
    </div>
  );
}

interface PickerProps {
  sessions: SessionListItem[];
  selected: string | null;
  onSelect: (locator: string) => void;
  current: SessionListItem | null;
}

function SessionPicker({ sessions, selected, onSelect, current }: PickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const name = current ? basename(current.projectPath) || current.sessionId.slice(0, 8) : "—";
  const ago  = current ? relativeTime(current.endedAt) : "";

  return (
    <div className="sp" ref={ref}>
      <button className={`sp-trigger${open ? " open" : ""}`} onClick={() => setOpen((v) => !v)} type="button">
        <div className="sp-trigger-inner">
          <span className="sp-name">{name}</span>
          <span className="sp-meta">{ago}{current ? ` · ${current.messageCount} msgs` : ""}</span>
        </div>
        <svg className="sp-caret" width="10" height="6" viewBox="0 0 10 6" fill="none">
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div className="sp-dropdown">
          {sessions.map((s) => {
            const n = basename(s.projectPath) || s.sessionId.slice(0, 8);
            const t = relativeTime(s.endedAt);
            const active = s.locator === selected;
            return (
              <button
                key={s.locator}
                className={`sp-option${active ? " active" : ""}`}
                onClick={() => { onSelect(s.locator); setOpen(false); }}
                type="button"
              >
                <span className="sp-opt-name">{n}</span>
                <span className="sp-opt-meta">{t} · {s.messageCount} msgs · {s.toolCallCount} tools</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
