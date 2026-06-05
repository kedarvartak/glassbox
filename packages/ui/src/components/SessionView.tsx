import type { SessionDetail, SegmentStatus } from "../api.js";
import { basename, fmtInt, fmtPct, fmtTokens, fmtUsd, sourceColor, statusColor } from "../format.js";

const STATUSES: SegmentStatus[] = ["gone", "stale", "spent", "duplicate"];

const COST_PARTS = [
  { key: "input", color: "#5b8def", pick: (b: Cost["breakdown"]) => b.inputUsd },
  { key: "output", color: "#45c4b8", pick: (b: Cost["breakdown"]) => b.outputUsd },
  { key: "cache read", color: "#e0a23a", pick: (b: Cost["breakdown"]) => b.cacheReadUsd },
  { key: "cache write", color: "#9b8cff", pick: (b: Cost["breakdown"]) => b.cacheWriteUsd },
] as const;

type Cost = SessionDetail["cost"];

export function SessionView({ d }: { d: SessionDetail }) {
  return (
    <div className="detail stagger">
      <Header d={d} />
      <CostCard cost={d.cost} accuracy={d.accuracy} />
      <XrayCard xray={d.xray} />
      <CompactionCard compaction={d.compaction} />
      <ReclaimableCard r={d.reclaimable} />
    </div>
  );
}

function Header({ d }: { d: SessionDetail }) {
  const { meta } = d;
  const model = d.cost.models.map((m) => m.model).join(", ") || "—";
  return (
    <div className="dhead">
      <div className="pid">{meta.sessionId}</div>
      <h1>{basename(meta.projectPath)}</h1>
      <div className="facts">
        <span className="chip">{meta.projectPath}</span>
        {meta.gitBranch && (
          <span className="chip">
            <span className="k">branch </span>
            {meta.gitBranch}
          </span>
        )}
        <span className="chip">
          <span className="k">model </span>
          {model}
        </span>
        <span className="chip">
          <span className="k">turns </span>
          {fmtInt(meta.turnCount)}
        </span>
        <span className="chip">
          <span className="k">tools </span>
          {fmtInt(meta.toolCallCount)}
        </span>
        <span className="chip">
          <span className="k">files </span>
          {fmtInt(meta.fileOpCount)}
        </span>
        {meta.memoryOpCount > 0 && (
          <span className="chip">
            <span className="k">memory </span>
            {fmtInt(meta.memoryOpCount)}
          </span>
        )}
        <span className="chip">
          <span className="k">compactions </span>
          {fmtInt(meta.compactionCount)}
        </span>
      </div>
    </div>
  );
}

function CostCard({ cost, accuracy }: { cost: Cost; accuracy: SessionDetail["accuracy"] }) {
  const total = cost.totalUsd || 1;
  const parts = COST_PARTS.map((p) => ({ ...p, usd: p.pick(cost.breakdown) }));
  return (
    <section className="card">
      <div className="card-title">
        Cost <span className="hint">provider actuals × pricing — exact</span>
      </div>
      <div className="bignum">{fmtUsd(cost.totalUsd)}</div>
      <div className="stackbar" style={{ marginTop: 14 }}>
        {parts.map((p) => (
          <span
            key={p.key}
            style={{ width: `${(p.usd / total) * 100}%`, background: p.color }}
            title={`${p.key} ${fmtUsd(p.usd)}`}
          />
        ))}
      </div>
      <div className="legend">
        {parts.map((p) => (
          <div className="legend-row" key={p.key}>
            <span className="sw" style={{ background: p.color }} />
            <span className="lk">{p.key}</span>
            <span className="lv">{fmtUsd(p.usd)}</span>
            <span className="lp">{fmtPct(p.usd / total)}</span>
          </div>
        ))}
      </div>
      <div className="saved">
        prompt cache saved <b>{fmtUsd(cost.cacheSavingsUsd)}</b> vs paying full input rate for
        re-reads
        {cost.unpricedMessages > 0 && ` · ${cost.unpricedMessages} message(s) unpriced`}
      </div>
      <div className="note">{accuracy.note}</div>
    </section>
  );
}

function XrayCard({ xray }: { xray: SessionDetail["xray"] }) {
  const max = Math.max(1, ...xray.composition.map((c) => c.tokens));
  const total = xray.totalTokens || 1;
  return (
    <section className="card">
      <div className="card-title">
        Context x-ray <span className="hint">{xray.segmentCount} resident segments</span>
      </div>
      <div className="bignum">
        {fmtInt(xray.totalTokens)}
        <span className="unit">tokens resident (attributed)</span>
      </div>
      <div className="bars" style={{ marginTop: 16 }}>
        {xray.composition.map((c) => (
          <div className="barrow" key={c.source}>
            <span className="bk">{c.source}</span>
            <span className="bartrack">
              <span
                className="barfill"
                style={{ width: `${(c.tokens / max) * 100}%`, background: sourceColor(c.source) }}
              />
            </span>
            <span className="bv">{fmtTokens(c.tokens)}</span>
            <span className="bp">{fmtPct(c.tokens / total)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function CompactionCard({ compaction }: { compaction: SessionDetail["compaction"] }) {
  return (
    <section className="card compact-card">
      <div className="card-title">
        Compaction diff <span className="hint">schema-ready · adapter-limited</span>
      </div>
      {compaction.observed ? (
        <div className="compactions">
          {compaction.events.map((event) => {
            const delta = event.tokensAfter - event.tokensBefore;
            return (
              <div className="compaction-row" key={event.id}>
                <div className="mono cid">{event.timestamp}</div>
                <div className="mono cdiff">
                  {fmtInt(event.tokensBefore)} → {fmtInt(event.tokensAfter)}
                  <span className={delta <= 0 ? "good" : "waste"}>
                    {delta <= 0 ? " -" : " +"}
                    {fmtInt(Math.abs(delta))}
                  </span>
                </div>
                <div className="rsn">
                  {event.evictedMessageCount} message(s) evicted
                  {event.summary ? ` · ${event.summary}` : ""}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="limitation">
          <div className="limitation-k">No compaction event observed</div>
          <div>{compaction.note}</div>
        </div>
      )}
    </section>
  );
}

function ReclaimableCard({ r }: { r: SessionDetail["reclaimable"] }) {
  const reclaimable = r.reclaimableTokens || 1;
  return (
    <section className="card">
      <div className="card-title">
        Reclaimable context <span className="hint">gone · stale · spent · duplicate (doc 20)</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
        <div className="bignum waste">
          {fmtInt(r.reclaimableTokens)}
          <span className="unit">tokens · {fmtPct(r.reclaimablePct)} of window</span>
        </div>
        {r.wastedUsdPerTurn !== null && (
          <div className="mono" style={{ color: "var(--waste)", fontSize: 13 }}>
            ~{fmtUsd(r.wastedUsdPerTurn)}/turn it persists
          </div>
        )}
      </div>

      {r.reclaimableTokens > 0 && (
        <div className="stackbar" style={{ marginTop: 14 }}>
          {STATUSES.map((s) =>
            r.byStatus[s] > 0 ? (
              <span
                key={s}
                style={{ width: `${(r.byStatus[s] / reclaimable) * 100}%`, background: statusColor(s) }}
                title={`${s} ${fmtInt(r.byStatus[s])}`}
              />
            ) : null,
          )}
        </div>
      )}

      <div className="statusgrid">
        {STATUSES.map((s) => (
          <div className="sbox" key={s} style={{ borderColor: "var(--line)" }}>
            <div className="sk" style={{ color: statusColor(s) }}>
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
              <span className="tag" style={{ color: statusColor(it.status) }}>
                {it.status}
              </span>
              <span className="it">{fmtInt(it.tokens)}</span>
              <span className="il">
                <div className="lbl">{it.label}</div>
                <div className="rsn">{it.reason}</div>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="note" style={{ marginTop: 14 }}>
          Nothing reclaimable detected — every resident file still exists, unchanged, and
          referenced. Clean window.
        </div>
      )}
    </section>
  );
}
