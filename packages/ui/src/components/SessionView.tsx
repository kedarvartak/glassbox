import type { SessionDetail, SegmentStatus } from "../api.js";
import { basename, fmtInt, fmtPct, fmtTokens, fmtUsd, sourceColor, statusColor } from "../format.js";

const STATUSES: SegmentStatus[] = ["gone", "stale", "spent", "duplicate"];

type Cost = SessionDetail["cost"];
const COST_PARTS = [
  { key: "input", color: "#2d6fb3", pick: (b: Cost["breakdown"]) => b.inputUsd },
  { key: "output", color: "#1f998c", pick: (b: Cost["breakdown"]) => b.outputUsd },
  { key: "cache read", color: "#c98a1e", pick: (b: Cost["breakdown"]) => b.cacheReadUsd },
  { key: "cache write", color: "#6a55cf", pick: (b: Cost["breakdown"]) => b.cacheWriteUsd },
] as const;

export function SessionView({ d }: { d: SessionDetail }) {
  return (
    <div className="sv">
      <SvHead d={d} />
      <Kpis d={d} />
      <div className="panels">
        <CompositionPanel xray={d.xray} />
        <CostPanel cost={d.cost} accuracy={d.accuracy} />
        <CompactionPanel compaction={d.compaction} />
        <ReclaimablePanel r={d.reclaimable} />
      </div>
    </div>
  );
}

function SvHead({ d }: { d: SessionDetail }) {
  const { meta } = d;
  const model = d.cost.models.map((m) => m.model).join(", ") || "—";
  return (
    <div className="sv-head">
      <div className="eyebrow">{meta.sessionId}</div>
      <h1>{basename(meta.projectPath)}</h1>
      <div className="facts">
        <span className="fact">{meta.projectPath}</span>
        {meta.gitBranch && (
          <span className="fact">
            <span className="k">branch </span>
            {meta.gitBranch}
          </span>
        )}
        <Fact k="model" v={model} />
        <Fact k="turns" v={fmtInt(meta.turnCount)} />
        <Fact k="tools" v={fmtInt(meta.toolCallCount)} />
        <Fact k="files" v={fmtInt(meta.fileOpCount)} />
        {meta.memoryOpCount > 0 && <Fact k="memory" v={fmtInt(meta.memoryOpCount)} />}
      </div>
    </div>
  );
}

const Fact = ({ k, v }: { k: string; v: string }) => (
  <span className="fact">
    <span className="k">{k} </span>
    {v}
  </span>
);

function Kpis({ d }: { d: SessionDetail }) {
  const { cost, xray, reclaimable } = d;
  return (
    <div className="kpis">
      <div className="kpi accent">
        <div className="k">session cost</div>
        <div className="v">{fmtUsd(cost.totalUsd)}</div>
        <div className="s">provider actuals · exact</div>
      </div>
      <div className="kpi">
        <div className="k">resident context</div>
        <div className="v">
          {fmtTokens(xray.totalTokens)}
          <span className="u">tok</span>
        </div>
        <div className="s">{fmtInt(xray.segmentCount)} attributed segments</div>
      </div>
      <div className="kpi waste">
        <div className="k">reclaimable</div>
        <div className="v">{fmtPct(reclaimable.reclaimablePct)}</div>
        <div className="s">{fmtInt(reclaimable.reclaimableTokens)} tokens of the window</div>
      </div>
      <div className="kpi">
        <div className="k">wasted / turn</div>
        <div className="v">
          {reclaimable.wastedUsdPerTurn !== null ? fmtUsd(reclaimable.wastedUsdPerTurn) : "—"}
        </div>
        <div className="s">recarried every turn it persists</div>
      </div>
    </div>
  );
}

function CompositionPanel({ xray }: { xray: SessionDetail["xray"] }) {
  const total = xray.totalTokens || 1;
  const max = Math.max(1, ...xray.composition.map((c) => c.tokens));
  return (
    <section className="panel wide">
      <div className="panel-h">
        <span className="t">Context x-ray</span>
        <span className="hint">what occupies the window, by source</span>
      </div>
      <div className="panel-body">
        <div className="stack">
          {xray.composition.map((c) => (
            <span
              key={c.source}
              style={{ width: `${(c.tokens / total) * 100}%`, background: sourceColor(c.source) }}
              title={`${c.source} · ${fmtInt(c.tokens)}`}
            />
          ))}
        </div>
        <div className="comp">
          {xray.composition.map((c) => (
            <div className="comp-row" key={c.source}>
              <span className="ck">{c.source}</span>
              <span className="track">
                <span
                  className="fill"
                  style={{ width: `${(c.tokens / max) * 100}%`, background: sourceColor(c.source) }}
                />
              </span>
              <span className="cv">{fmtTokens(c.tokens)}</span>
              <span className="cp">{fmtPct(c.tokens / total)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CostPanel({ cost, accuracy }: { cost: Cost; accuracy: SessionDetail["accuracy"] }) {
  const total = cost.totalUsd || 1;
  const parts = COST_PARTS.map((p) => ({ ...p, usd: p.pick(cost.breakdown) }));
  return (
    <section className="panel">
      <div className="panel-h">
        <span className="t">Cost</span>
        <span className="hint">actuals × pricing</span>
      </div>
      <div className="panel-body">
        <div className="bignum">{fmtUsd(cost.totalUsd)}</div>
        <div className="stack" style={{ marginTop: 13 }}>
          {parts.map((p) => (
            <span key={p.key} style={{ width: `${(p.usd / total) * 100}%`, background: p.color }} />
          ))}
        </div>
        <div className="legend">
          {parts.map((p) => (
            <div className="leg" key={p.key}>
              <span className="sw" style={{ background: p.color }} />
              <span className="lk">{p.key}</span>
              <span className="lv">{fmtUsd(p.usd)}</span>
              <span className="lp">{fmtPct(p.usd / total)}</span>
            </div>
          ))}
        </div>
        <div className="saved">
          cache saved <b>{fmtUsd(cost.cacheSavingsUsd)}</b> vs full input rate on re-reads
          {cost.unpricedMessages > 0 && ` · ${cost.unpricedMessages} unpriced`}
        </div>
        <div className="micro">{accuracy.note}</div>
      </div>
    </section>
  );
}

function CompactionPanel({ compaction }: { compaction: SessionDetail["compaction"] }) {
  return (
    <section className="panel">
      <div className="panel-h">
        <span className="t">Compaction</span>
        <span className="hint">before / after</span>
      </div>
      <div className="panel-body">
        {compaction.observed ? (
          <div>
            {compaction.events.map((e) => {
              const delta = e.tokensAfter - e.tokensBefore;
              const dropped = delta <= 0;
              return (
                <div className="cev" key={e.id}>
                  <span className="ts">{e.timestamp}</span>
                  <span className="delta">
                    {fmtInt(e.tokensBefore)} → {fmtInt(e.tokensAfter)}{" "}
                    <span className={dropped ? "down" : "up"}>
                      {dropped ? "−" : "+"}
                      {fmtInt(Math.abs(delta))}
                    </span>
                  </span>
                  <span className="ev">
                    {e.evictedMessageCount} message(s) evicted
                    {e.summary ? ` · ${e.summary}` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty">
            <div className="ek">no compaction observed</div>
            {compaction.note}
          </div>
        )}
      </div>
    </section>
  );
}

function ReclaimablePanel({ r }: { r: SessionDetail["reclaimable"] }) {
  const reclaimable = r.reclaimableTokens || 1;
  return (
    <section className="panel wide">
      <div className="panel-h">
        <span className="t">Reclaimable context</span>
        <span className="hint">gone · stale · spent · duplicate</span>
      </div>
      <div className="panel-body">
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
          <div className="bignum" style={{ color: "var(--gone)", fontSize: 28 }}>
            {fmtInt(r.reclaimableTokens)}
            <span className="u">tokens · {fmtPct(r.reclaimablePct)} of window</span>
          </div>
          {r.wastedUsdPerTurn !== null && (
            <span className="mono" style={{ color: "var(--gone)", fontSize: 13 }}>
              ~{fmtUsd(r.wastedUsdPerTurn)}/turn
            </span>
          )}
        </div>

        {r.reclaimableTokens > 0 && (
          <div className="stack" style={{ marginTop: 14 }}>
            {STATUSES.map((s) =>
              r.byStatus[s] > 0 ? (
                <span
                  key={s}
                  style={{ width: `${(r.byStatus[s] / reclaimable) * 100}%`, background: statusColor(s) }}
                  title={`${s} · ${fmtInt(r.byStatus[s])}`}
                />
              ) : null,
            )}
          </div>
        )}

        <div className="stiles">
          {STATUSES.map((s) => (
            <div className="stile" key={s}>
              <div className="sk" style={{ color: statusColor(s) }}>
                <span className="d" style={{ background: statusColor(s) }} />
                {s}
              </div>
              <div className="sv">{fmtInt(r.byStatus[s])}</div>
            </div>
          ))}
        </div>

        {r.items.length > 0 ? (
          <div className="items">
            {r.items.map((it, i) => (
              <div className="item" key={i}>
                <span className="tag" style={{ background: statusColor(it.status) }}>
                  {it.status}
                </span>
                <span className="tok">{fmtInt(it.tokens)}</span>
                <span>
                  <div className="lbl">{it.label}</div>
                  <div className="rsn">{it.reason}</div>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="clean">
            Clean window — every resident file still exists, unchanged, and in use. Nothing to
            reclaim.
          </div>
        )}
      </div>
    </section>
  );
}
