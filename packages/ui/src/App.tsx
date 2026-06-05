import { useEffect, useState } from "react";
import { api, type SessionDetail, type SessionListItem } from "./api.js";
import { Sidebar } from "./components/Sidebar.js";
import { SessionView } from "./components/SessionView.js";

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
    <div className="app">
      <div className="body">
        <Sidebar
          sessions={sessions ?? []}
          selected={selected}
          onSelect={setSelected}
        />
        <main className="main">
          {error ? (
            <div className="center">
              <div>
                <div style={{ color: "var(--gone)", marginBottom: 6 }}>failed to load</div>
                {error}
              </div>
            </div>
          ) : !sessions ? (
            <Loading text="reading index…" />
          ) : sessions.length === 0 ? (
            <div className="center">index is empty — run `glassbox index` first.</div>
          ) : loadingDetail || !detail ? (
            <Loading text="analyzing session…" />
          ) : (
            <SessionView d={detail} />
          )}
        </main>
      </div>
    </div>
  );
}

function Loading({ text }: { text: string }) {
  return (
    <div className="center">
      <div>
        <div className="spin" />
        {text}
      </div>
    </div>
  );
}
