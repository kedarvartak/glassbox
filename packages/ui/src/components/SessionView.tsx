import { useState } from "react";
import { api, type ForkResult, type SessionDetail, type SegmentStatus } from "../api.js";
import { fmtInt, fmtPct, fmtTokens, fmtUsd, statusColor } from "../format.js";
import { Tip, TipChip } from "./Tooltip.js";

const STATUSES: SegmentStatus[] = ["gone", "stale", "spent", "duplicate"];

const STATUS_HEX: Record<string, string> = {
  gone: "#ff5765", stale: "#ff9f43", spent: "#b18cf2", duplicate: "#5b8af5", live: "#25d07d",
};
const SRC_HEX: Record<string, string> = {
  file: "#5b8af5", tool_result: "#25d07d", user: "#ffd23f", assistant: "#e8e8ec",
  thinking: "#b18cf2", memory: "#ff9f43", system: "#74747e", mcp: "#ff5765",
  history: "#36c5d6", unknown: "#43434c",
};
const srcHex = (s: string) => SRC_HEX[s] ?? SRC_HEX.unknown ?? "#43434c";

const COST_PARTS = [
  { key: "input",       color: "#5b8af5", pick: (b: SessionDetail["cost"]["breakdown"]) => b.inputUsd },
  { key: "output",      color: "#25d07d", pick: (b: SessionDetail["cost"]["breakdown"]) => b.outputUsd },
  { key: "cache read",  color: "#ffa028", pick: (b: SessionDetail["cost"]["breakdown"]) => b.cacheReadUsd },
  { key: "cache write", color: "#b18cf2", pick: (b: SessionDetail["cost"]["breakdown"]) => b.cacheWriteUsd },
] as const;

export function SessionView({ d, locator, onForked }: {
  d: SessionDetail;
  locator: string | null;
  onForked?: (locator: string) => void;
}) {
  return (
    <div className="grid">
      <div className="pnl area-comp"><CompositionPanel xray={d.xray} /></div>
      <div className="pnl area-cost"><CostPanel cost={d.cost} /></div>
      <div className="pnl area-recl"><ReclaimablePanel r={d.reclaimable} /></div>
      <div className="pnl area-clean"><CleanerPanel clean={d.clean} locator={locator} onForked={onForked} /></div>
      <div className="pnl area-tape"><TapePanel items={d.reclaimable.items} /></div>
    </div>
  );
}

/* ════════════════ charts ════════════════ */

function Donut({ data, size = 104, thick = 16, unit = "tok", money = false }: {
  data: { value: number; color: string; label?: string }[];
  size?: number; thick?: number; unit?: string; money?: boolean;
}) {
  const total = data.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thick) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#15151c" strokeWidth={thick} />
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {data.filter((x) => x.value > 0).map((x, i) => {
          const len = (x.value / total) * c;
          const seg = (
            <Tip
              key={i}
              svg
              content={<TipChip title={x.label} rows={[
                { sw: x.color, k: money ? "cost" : unit, v: money ? fmtUsd(x.value) : `${fmtInt(x.value)} ${unit}` },
                { k: "share", v: fmtPct(x.value / total) },
              ]} />}
            >
              <circle
                cx={size / 2} cy={size / 2} r={r}
                fill="none" stroke={x.color} strokeWidth={thick}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                style={{ cursor: "pointer" }}
              />
            </Tip>
          );
          offset += len;
          return seg;
        })}
      </g>
    </svg>
  );
}

function Gauge({ pct, color, size = 120 }: { pct: number; color: string; size?: number }) {
  const w = size, h = size * 0.62;
  const r = size * 0.42, cx = w / 2, cy = h - 6, thick = 13;
  const polar = (deg: number) => ({
    x: cx + r * Math.cos((deg * Math.PI) / 180),
    y: cy - r * Math.sin((deg * Math.PI) / 180),
  });
  const a = polar(180), b = polar(0);
  const endDeg = 180 - Math.min(Math.max(pct, 0), 1) * 180;
  const e = polar(endDeg);
  const track = `M ${a.x} ${a.y} A ${r} ${r} 0 0 1 ${b.x} ${b.y}`;
  const val = `M ${a.x} ${a.y} A ${r} ${r} 0 0 1 ${e.x} ${e.y}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="gauge-svg">
      <path d={track} fill="none" stroke="#15151c" strokeWidth={thick} strokeLinecap="round" />
      <path d={val} fill="none" stroke={color} strokeWidth={thick} strokeLinecap="round" />
    </svg>
  );
}

/* ════════════════ panels ════════════════ */

function CompositionPanel({ xray }: { xray: SessionDetail["xray"] }) {
  const total = xray.totalTokens || 1;
  const max = Math.max(1, ...xray.composition.map((c) => c.tokens));
  return (
    <>
      <div className="pnl-h">
        <span className="bar" /><span className="t">Context X-Ray</span>
        <span className="hint">{fmtTokens(xray.totalTokens)} TOK · {xray.segmentCount} SEG</span>
      </div>
      <div className="pnl-body">
        <div className="comp-stack">
          {xray.composition.map((c) => (
            <Tip key={c.source} content={<TipChip title={c.source} rows={[
              { sw: srcHex(c.source), k: "tokens", v: fmtInt(c.tokens) },
              { k: "share", v: fmtPct(c.tokens / total) },
            ]} />}>
              <span style={{ display: "block", height: "100%", width: `${(c.tokens / total) * 100}%`, background: srcHex(c.source) }} />
            </Tip>
          ))}
        </div>
        <div className="comp-split">
          <div className="donut-wrap">
            <Donut data={xray.composition.map((c) => ({ value: c.tokens, color: srcHex(c.source), label: c.source }))} size={150} thick={22} />
            <div className="donut-center">
              <span className="big">{fmtTokens(xray.totalTokens)}</span>
              <span className="lbl">tokens</span>
            </div>
          </div>
          <div className="comp-list">
            {xray.composition.map((c) => (
              <Tip key={c.source} content={<TipChip title={c.source} rows={[
                { sw: srcHex(c.source), k: "tokens", v: fmtInt(c.tokens) },
                { k: "share", v: fmtPct(c.tokens / total) },
              ]} />}>
                <div className="comp-row">
                  <span className="comp-sw" style={{ background: srcHex(c.source) }} />
                  <span className="comp-src">{c.source}</span>
                  <span className="comp-track">
                    <span className="comp-fill" style={{ width: `${(c.tokens / max) * 100}%`, background: srcHex(c.source) }} />
                  </span>
                  <span className="comp-tok">{fmtTokens(c.tokens)}</span>
                  <span className="comp-pct">{fmtPct(c.tokens / total)}</span>
                </div>
              </Tip>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function CostPanel({ cost }: { cost: SessionDetail["cost"] }) {
  const total = cost.totalUsd || 1;
  const parts = COST_PARTS.map((p) => ({ ...p, usd: p.pick(cost.breakdown) }));
  return (
    <>
      <div className="pnl-h">
        <span className="bar" /><span className="t">Cost</span>
        <span className="hint">ACTUALS × PRICING</span>
      </div>
      <div className="pnl-body">
        <div className="chart-row">
          <div className="donut-wrap">
            <Donut money data={parts.map((p) => ({ value: p.usd, color: p.color, label: p.key }))} />
            <div className="donut-center">
              <span className="big">{fmtUsd(cost.totalUsd)}</span>
              <span className="lbl">total</span>
            </div>
          </div>
          <div className="legend">
            {parts.map((p) => (
              <Tip key={p.key} content={<TipChip title={p.key} rows={[
                { sw: p.color, k: "cost", v: fmtUsd(p.usd) },
                { k: "share", v: fmtPct(p.usd / total) },
              ]} />}>
                <div className="legend-row">
                  <span className="legend-sw" style={{ background: p.color }} />
                  <span className="legend-k">{p.key}</span>
                  <span className="legend-v">{fmtUsd(p.usd)}</span>
                  <span className="legend-p">{fmtPct(p.usd / total)}</span>
                </div>
              </Tip>
            ))}
          </div>
        </div>
        <div className="cost-note">
          CACHE SAVED <span className="pos">{fmtUsd(cost.cacheSavingsUsd)}</span> vs full input rate
          {cost.unpricedMessages > 0 && ` · ${cost.unpricedMessages} unpriced`}
        </div>
      </div>
    </>
  );
}

function ReclaimablePanel({ r }: { r: SessionDetail["reclaimable"] }) {
  const maxStatus = Math.max(1, ...STATUSES.map((s) => r.byStatus[s]));
  const pctColor = r.reclaimablePct > 0.25 ? "#ff5765" : r.reclaimablePct > 0.1 ? "#ffa028" : "#25d07d";
  return (
    <>
      <div className="pnl-h">
        <span className="bar" /><span className="t">Reclaimable</span>
        <span className="hint">GONE·STALE·SPENT·DUP</span>
      </div>
      <div className="pnl-body">
        <div className="gauge-wrap">
          <Tip content={<TipChip title="reclaimable" rows={[
            { k: "share", v: fmtPct(r.reclaimablePct) },
            { k: "tokens", v: `${fmtInt(r.reclaimableTokens)} / ${fmtInt(r.totalTokens)}` },
            ...(r.wastedUsdPerTurn != null ? [{ k: "waste/turn", v: fmtUsd(r.wastedUsdPerTurn) }] : []),
          ]} />}>
            <Gauge pct={r.reclaimablePct} color={pctColor} />
          </Tip>
          <div className="gauge-info">
            <span className="gauge-big" style={{ color: pctColor }}>{fmtPct(r.reclaimablePct)}</span>
            <span className="gauge-sub">{fmtTokens(r.reclaimableTokens)} of {fmtTokens(r.totalTokens)} tok</span>
            {r.wastedUsdPerTurn != null && (
              <span className="gauge-sub" style={{ color: "#ff5765" }}>~{fmtUsd(r.wastedUsdPerTurn)}/turn</span>
            )}
          </div>
        </div>
        <div className="statbars">
          {STATUSES.map((s) => (
            <Tip key={s} content={<TipChip title={s} rows={[
              { sw: STATUS_HEX[s], k: "tokens", v: fmtInt(r.byStatus[s]) },
              { k: "of reclaimable", v: r.reclaimableTokens ? fmtPct(r.byStatus[s] / r.reclaimableTokens) : "0%" },
            ]} />}>
              <div className="statbar">
                <span className="statbar-k" style={{ color: STATUS_HEX[s] }}>
                  <span className="d" style={{ background: STATUS_HEX[s] }} />{s}
                </span>
                <span className="statbar-track">
                  <span className="statbar-fill" style={{ width: `${(r.byStatus[s] / maxStatus) * 100}%`, background: STATUS_HEX[s] }} />
                </span>
                <span className="statbar-v" style={{ color: STATUS_HEX[s] }}>{fmtTokens(r.byStatus[s])}</span>
              </div>
            </Tip>
          ))}
        </div>
      </div>
    </>
  );
}

const EVICT_LABEL: Record<SessionDetail["clean"]["actions"][number]["detail"], string> = {
  gone: "GONE",
  "stale-drift": "DRIFT",
  "stale-superseded": "OLD",
  duplicate: "DUP",
  "spent-tool": "SPENT",
  "spent-mcp": "SPENT",
};
const EVICT_HEX: Record<string, string> = {
  GONE: "#ff5765", DRIFT: "#ff9f43", OLD: "#b18cf2", DUP: "#5b8af5", SPENT: "#8a93a6",
};

function CleanerPanel({ clean, locator, onForked }: {
  clean?: SessionDetail["clean"];
  locator: string | null;
  onForked?: (locator: string) => void;
}) {
  const empty = !clean || clean.actions.length === 0;
  const [forking, setForking] = useState(false);
  const [result, setResult] = useState<ForkResult | null>(null);

  const runFork = () => {
    if (!locator || forking) return;
    setForking(true);
    setResult(null);
    api.fork(locator)
      .then((res) => {
        setResult(res);
        // On success the cleaned session is indexed; switch the dashboard to it
        // so its (clean) stats are what the user sees — proof it worked.
        if (res.ok && res.outPath) onForked?.(res.outPath);
      })
      .catch((e: unknown) => setResult({ ok: false, error: String(e) }))
      .finally(() => setForking(false));
  };

  // roll up provable garbage by class for the KPI strip.
  const byClass = new Map<string, { count: number; tokens: number }>();
  for (const a of clean?.actions ?? []) {
    const tag = EVICT_LABEL[a.detail];
    const e = byClass.get(tag) ?? { count: 0, tokens: 0 };
    byClass.set(tag, { count: e.count + 1, tokens: e.tokens + a.reclaimableTokens });
  }
  return (
    <>
      <div className="pnl-h">
        <span className="bar" /><span className="t">Context Cleaner</span>
        {!empty && (
          <button className={`fork-btn${forking ? " busy" : ""}`} type="button" onClick={runFork} disabled={forking || !locator}>
            {forking ? "CLEANING…" : "RUN FORK ▸"}
          </button>
        )}
        <span className="hint">
          {clean ? `${clean.summary.copies} COP${clean.summary.copies !== 1 ? "IES" : "Y"} · LOSSLESS` : "—"}
        </span>
      </div>
      <div className="pnl-body">
        {result && (
          <div className={`fork-result${result.ok ? " ok" : " err"}`}>
            {result.ok ? (
              <>
                ✓ WROTE CLEANED SESSION <b>{result.newSessionId?.slice(0, 8)}…</b> ·{" "}
                {fmtTokens(result.beforeTokens ?? 0)} → {fmtTokens(result.afterTokens ?? 0)} tokens ·{" "}
                resume it with <span className="amber">claude --resume</span>. Original untouched.
              </>
            ) : (
              <>✗ {result.error}</>
            )}
          </div>
        )}
        {empty ? (
          <div className="clean-empty">✓ NOTHING TO CLEAN — no provable garbage in this session.</div>
        ) : (
          <div className="cln">
            {/* summary strip */}
            <div className="cln-kpis">
              <div className="cln-kpi"><span className="k">copies</span><span className="v">{fmtInt(clean!.summary.copies)}</span></div>
              <div className="cln-kpi"><span className="k">removed</span><span className="v">{fmtTokens(clean!.summary.reclaimableTokens)}</span></div>
              <div className="cln-kpi"><span className="k">net reclaimed</span><span className="v" style={{ color: "#25d07d" }}>{fmtTokens(clean!.summary.netReclaimedTokens)}</span></div>
            </div>

            {/* class rollup chips */}
            <div className="cln-cmp-chips" style={{ padding: "0 2px 6px" }}>
              {[...byClass.entries()].map(([tag, { count, tokens }]) => (
                <span className="chip" key={tag}>
                  <i style={{ background: EVICT_HEX[tag] ?? "#8a93a6" }} />{tag} {count}× · {fmtTokens(tokens)}
                </span>
              ))}
            </div>

            {/* eviction list */}
            <div className="cln-fixes">
              {clean!.actions.map((a, i) => {
                const tag = EVICT_LABEL[a.detail];
                return (
                  <Tip key={i} content={<TipChip title={tag} rows={[
                    { sw: EVICT_HEX[tag] ?? "#8a93a6", k: a.path ?? a.detail, v: fmtTokens(a.reclaimableTokens) },
                  ]} />}>
                    <div className="cln-fix">
                      <span className="act-verb" style={{ color: EVICT_HEX[tag] ?? "#8a93a6" }}>{tag}</span>
                      <span className="act-path">{a.path ?? a.detail}</span>
                      <span className="act-tok">{fmtTokens(a.reclaimableTokens)}</span>
                    </div>
                  </Tip>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function TapePanel({ items }: { items: SessionDetail["reclaimable"]["items"] }) {
  return (
    <>
      <div className="pnl-h">
        <span className="bar" /><span className="t">Reclaim Tape</span>
        <span className="hint">{items.length} ITEMS · BY SIZE</span>
      </div>
      <div className="pnl-body">
        {items.length === 0 ? (
          <div className="clean-empty">✓ CLEAN — every resident segment is live and in use.</div>
        ) : (
          <div className="tape">
            {items.map((it, i) => (
              <Tip key={i} content={<TipChip title={it.status.toUpperCase()} rows={[
                { sw: STATUS_HEX[it.status], k: it.label, v: `${fmtInt(it.tokens)} tok` },
                { k: it.reason },
              ]} />}>
                <div className="tape-row">
                  <span className="tape-badge" style={{ color: statusColor(it.status) }}>
                    {it.status}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div className="tape-label">{it.label}</div>
                    <div className="tape-reason">{it.reason}</div>
                  </div>
                  <span className="tape-tok" style={{ color: statusColor(it.status) }}>{fmtTokens(it.tokens)}</span>
                </div>
              </Tip>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/* ════════════════ helpers ════════════════ */

