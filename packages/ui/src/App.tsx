import { useEffect, useRef, useState } from "react";
import { api, type SessionDetail, type SessionListItem } from "./api.js";
import { SessionView } from "./components/SessionView.js";
import { basename, fmtInt, fmtPct, fmtTokens, fmtUsd, relativeTime } from "./format.js";

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
    return () => {
      live = false;
    };
  }, [selected]);

  return (
    <div className="term">
      <Hud sessions={sessions} selected={selected} onSelect={setSelected} detail={detail} />
      {error ? (
        <div className="screen-center">
          <div>
            <div className="err">SIGNAL LOST</div>
            {error}
          </div>
        </div>
      ) : !sessions ? (
        <div className="screen-center">
          <div>
            <div className="spin" />
            READING INDEX…
          </div>
        </div>
      ) : sessions.length === 0 ? (
        <div className="screen-center">
          <div>
            NO SESSIONS INDEXED — run <span className="amber">glassbox index</span> first.
          </div>
        </div>
      ) : loadingDetail || !detail ? (
        <div className="screen-center">
          <div>
            <div className="spin" />
            ANALYZING SESSION…
          </div>
        </div>
      ) : (
        <SessionView
          d={detail}
          locator={selected}
          onForked={(loc) => {
            // Refresh the list (the cleaned session is freshly indexed) and
            // switch to it so the dashboard shows the cleaned stats.
            api.sessions().then((list) => {
              setSessions(list);
              setSelected(loc);
            });
          }}
        />
      )}
    </div>
  );
}

function Hud({
  sessions,
  selected,
  onSelect,
  detail,
}: {
  sessions: SessionListItem[] | null;
  selected: string | null;
  onSelect: (l: string) => void;
  detail: SessionDetail | null;
}) {
  const m = detail?.meta;
  const cur = sessions?.find((s) => s.locator === selected) ?? null;
  const model =
    detail?.cost.models
      .map((x) => x.model)
      .join(",")
      .split(",")[0]
      ?.replace(/<[^>]+>/g, "") ?? "—";
  const reclPct = detail?.reclaimable.reclaimablePct ?? 0;

  return (
    <header className="hud">
      <div className="hud-top">
        <div className="hud-logo">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="30"
            height="23"
            viewBox="0 0 50 39"
            fill="none"
          >
            <path d="M16.4992 2H37.5808L22.0816 24.9729H1L16.4992 2Z" fill="#007AFF" />
            <path
              d="M17.4231 27.1022L11.4199 36.0002H33.5015L49.0007 13.0273H32.7031L23.2071 27.1022H17.4231Z"
              fill="#312ECB"
            />
          </svg>
        </div>
        <div className="hud-symwrap">
          <span className="hud-prompt">&gt;</span>
          {sessions && sessions.length > 0 && (
            <SessionMenu sessions={sessions} selected={selected} onSelect={onSelect} />
          )}
        </div>
        <div className="hud-meta">
          {model !== "—" && (
            <span>
              <b>{model}</b>
            </span>
          )}
          {m?.gitBranch && (
            <span>
              BR <b>{m.gitBranch}</b>
            </span>
          )}
          {cur && <span>{cur.projectPath}</span>}
        </div>
        <div className="hud-live">
          <span className="dot" />
          LIVE · LOCAL
        </div>
      </div>

      <div className="hud-quotes">
        <Quote
          k="Cost"
          v={detail ? fmtUsd(detail.cost.totalUsd) : "—"}
          cls="amber"
          sub="provider actuals"
        />
        <Quote
          k="Context"
          v={detail ? fmtTokens(detail.xray.totalTokens) : "—"}
          sub={detail ? `${detail.xray.segmentCount} segments` : ""}
        />
        <Quote
          k="Reclaim"
          v={detail ? fmtPct(reclPct) : "—"}
          cls={reclPct > 0.25 ? "red" : reclPct > 0.1 ? "amber" : "green"}
          sub={detail ? `${fmtInt(detail.reclaimable.reclaimableTokens)} tok` : ""}
        />
        <Quote
          k="Waste/Turn"
          v={
            detail?.reclaimable.wastedUsdPerTurn != null
              ? fmtUsd(detail.reclaimable.wastedUsdPerTurn)
              : "—"
          }
          cls="red"
          sub="recarried/turn"
        />
        <Quote
          k="Turns"
          v={m ? fmtInt(m.turnCount) : "—"}
          sub={m ? `${m.messageCount} msgs` : ""}
        />
        <Quote
          k="Tools"
          v={m ? fmtInt(m.toolCallCount) : "—"}
          sub={m ? `${m.fileOpCount} file ops` : ""}
        />
        <Quote
          k="Evict"
          v={detail ? fmtInt(detail.clean?.summary.copies ?? 0) : "—"}
          cls="amber"
          sub={
            detail ? `${fmtTokens(detail.clean?.summary.netReclaimedTokens ?? 0)} net` : "lossless"
          }
        />
      </div>
    </header>
  );
}

function SessionMenu({
  sessions,
  selected,
  onSelect,
}: {
  sessions: SessionListItem[];
  selected: string | null;
  onSelect: (locator: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = sessions.find((s) => s.locator === selected) ?? sessions[0] ?? null;

  useEffect(() => {
    function closeOnOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutside);
    return () => document.removeEventListener("mousedown", closeOnOutside);
  }, []);

  const currentName = current
    ? (basename(current.projectPath) || current.sessionId.slice(0, 8)).toUpperCase()
    : "NO SESSION";

  return (
    <div className="session-menu" ref={ref}>
      <button
        className={`session-trigger${open ? " open" : ""}`}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="session-trigger-main">{currentName}</span>
        {current && (
          <span className="session-trigger-meta">
            {relativeTime(current.endedAt)} · {current.messageCount}MSG
          </span>
        )}
        <span className="session-caret" aria-hidden="true" />
      </button>

      {open && (
        <div className="session-popover" role="listbox">
          {sessions.map((session) => {
            const active = session.locator === selected;
            const name = (
              basename(session.projectPath) || session.sessionId.slice(0, 8)
            ).toUpperCase();
            return (
              <button
                className={`session-option${active ? " active" : ""}`}
                key={session.locator}
                role="option"
                aria-selected={active}
                type="button"
                onClick={() => {
                  onSelect(session.locator);
                  setOpen(false);
                }}
              >
                <span className="session-option-name">{name}</span>
                <span className="session-option-meta">
                  {relativeTime(session.endedAt)} · {session.messageCount}MSG ·{" "}
                  {session.toolCallCount}TOOLS
                </span>
                <span className="session-option-path">{session.projectPath}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Quote({ k, v, cls, sub }: { k: string; v: string; cls?: string; sub?: string }) {
  return (
    <div className="quote">
      <span className="quote-k">{k}</span>
      <span className={`quote-v${cls ? " " + cls : ""}`}>{v}</span>
      {sub && <span className="quote-sub">{sub}</span>}
    </div>
  );
}
