import { useState } from "react";
import type { SessionDetail, SegmentStatus } from "../api.js";
import { fmtInt, fmtPct, fmtTokens, fmtUsd, statusColor } from "../format.js";

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

export function SessionView({ d }: { d: SessionDetail }) {
  return (
    <div className="grid">
      <div className="pnl area-comp"><CompositionPanel xray={d.xray} /></div>
      <div className="pnl area-cost"><CostPanel cost={d.cost} /></div>
      <div className="pnl area-recl"><ReclaimablePanel r={d.reclaimable} /></div>
      <div className="pnl area-clean"><CleanerPanel clean={d.clean} /></div>
      <div className="pnl area-tape"><TapePanel items={d.reclaimable.items} /></div>
    </div>
  );
}

/* ════════════════ charts ════════════════ */

function Donut({ data, size = 104, thick = 16 }: {
  data: { value: number; color: string }[];
  size?: number; thick?: number;
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
            <circle
              key={i}
              cx={size / 2} cy={size / 2} r={r}
              fill="none" stroke={x.color} strokeWidth={thick}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
            />
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
            <span key={c.source} style={{ width: `${(c.tokens / total) * 100}%`, background: srcHex(c.source) }}
              title={`${c.source} · ${fmtInt(c.tokens)}`} />
          ))}
        </div>
        <div className="comp-list">
          {xray.composition.map((c) => (
            <div className="comp-row" key={c.source}>
              <span className="comp-sw" style={{ background: srcHex(c.source) }} />
              <span className="comp-src">{c.source}</span>
              <span className="comp-track">
                <span className="comp-fill" style={{ width: `${(c.tokens / max) * 100}%`, background: srcHex(c.source) }} />
              </span>
              <span className="comp-tok">{fmtTokens(c.tokens)}</span>
              <span className="comp-pct">{fmtPct(c.tokens / total)}</span>
            </div>
          ))}
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
            <Donut data={parts.map((p) => ({ value: p.usd, color: p.color }))} />
            <div className="donut-center">
              <span className="big">{fmtUsd(cost.totalUsd)}</span>
              <span className="lbl">total</span>
            </div>
          </div>
          <div className="legend">
            {parts.map((p) => (
              <div className="legend-row" key={p.key}>
                <span className="legend-sw" style={{ background: p.color }} />
                <span className="legend-k">{p.key}</span>
                <span className="legend-v">{fmtUsd(p.usd)}</span>
                <span className="legend-p">{fmtPct(p.usd / total)}</span>
              </div>
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
          <Gauge pct={r.reclaimablePct} color={pctColor} />
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
            <div className="statbar" key={s}>
              <span className="statbar-k" style={{ color: STATUS_HEX[s] }}>
                <span className="d" style={{ background: STATUS_HEX[s] }} />{s}
              </span>
              <span className="statbar-track">
                <span className="statbar-fill" style={{ width: `${(r.byStatus[s] / maxStatus) * 100}%`, background: STATUS_HEX[s] }} />
              </span>
              <span className="statbar-v" style={{ color: STATUS_HEX[s] }}>{fmtTokens(r.byStatus[s])}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function CleanerPanel({ clean }: { clean?: SessionDetail["clean"] }) {
  return (
    <>
      <div className="pnl-h">
        <span className="bar" /><span className="t">Context Cleaner</span>
        <span className="hint">
          {clean
            ? `${clean.summary.actionCount} FIX${clean.summary.actionCount !== 1 ? "ES" : ""}${clean.compact ? " · COMPACT" : ""}`
            : "—"}
        </span>
      </div>
      <div className="pnl-body">
        {!clean || (clean.actions.length === 0 && !clean.compact) ? (
          <div className="clean-empty">
            ✓ NOTHING TO CLEAN — no deleted or drifted files, and the window isn’t garbage-heavy enough to compact.
          </div>
        ) : (
          <div className="clean-stack">
            {clean.compact && (
              <div className="compact-strip">
                <div className="compact-strip-head">
                  <div className="clean-sec-h">Compact <span className="c">— reset the window</span></div>
                  <CopyButton label="COPY /compact" text={clean.compact.command} />
                </div>
                <div className="compact-strip-body">
                  <div className="compact-stats">
                    <div className="compact-stat"><span className="k">spent</span><span className="v">{fmtTokens(clean.compact.spentTokens)}</span></div>
                    <div className="compact-stat"><span className="k">duplicate</span><span className="v">{fmtTokens(clean.compact.duplicateTokens)}</span></div>
                    {clean.compact.estimatedUsdSaved != null && (
                      <div className="compact-stat"><span className="k">saves</span><span className="v pos">~{fmtUsd(clean.compact.estimatedUsdSaved)}/t</span></div>
                    )}
                  </div>
                  <div className="compact-cmd">{clean.compact.command}</div>
                  <div className="compact-note">Run inside your live Claude Code session — Glassbox can’t compact for you.</div>
                </div>
              </div>
            )}

            <div>
              <div className="clean-sec-h">CLAUDE.md fixes <span className="c">— stop trusting these files</span></div>
              {clean.actions.length === 0 ? (
                <div className="compact-note">No deleted or drifted files in the window.</div>
              ) : (
                <>
                  <div className="act-table">
                    {clean.actions.map((a, i) => (
                      <div className="act-row" key={i}>
                        <span className={`act-verb ${a.type}`}>{a.type === "stop_referencing" ? "STOP" : "RE-READ"}</span>
                        <span className="act-path" title={a.path}>{a.path}</span>
                        <span className="act-tok">{fmtTokens(a.reclaimableTokens)}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <CopyButton label="COPY CLAUDE.md BLOCK" text={buildClaudeMdBlock(clean.actions)} />
                  </div>
                </>
              )}
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
              <div className="tape-row" key={i}>
                <span className="tape-badge" style={{ color: statusColor(it.status) }}>
                  {it.status}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="tape-label">{it.label}</div>
                  <div className="tape-reason">{it.reason}</div>
                </div>
                <span className="tape-tok" style={{ color: statusColor(it.status) }}>{fmtTokens(it.tokens)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/* ════════════════ helpers ════════════════ */

function CopyButton({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    navigator.clipboard?.writeText(text).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 1500); },
      () => setCopied(false),
    );
  };
  return (
    <button className={`copy-btn${copied ? " ok" : ""}`} onClick={onCopy} type="button">
      {copied ? "✓ COPIED" : label}
    </button>
  );
}

function buildClaudeMdBlock(actions: SessionDetail["clean"]["actions"]): string {
  const stop = actions.filter((a) => a.type === "stop_referencing");
  const reread = actions.filter((a) => a.type === "re_read");
  const lines: string[] = [
    "<!-- glassbox:hygiene:start -->",
    "## Context hygiene — Glassbox",
    "These files drifted from or left the workspace after they entered context.",
  ];
  if (stop.length > 0) lines.push("", "**Deleted — do not read or reference:**", ...stop.map((a) => a.claudeMdSnippet));
  if (reread.length > 0) lines.push("", "**Changed on disk — re-read before relying on the cached copy:**", ...reread.map((a) => a.claudeMdSnippet));
  lines.push("<!-- glassbox:hygiene:end -->");
  return lines.join("\n");
}
