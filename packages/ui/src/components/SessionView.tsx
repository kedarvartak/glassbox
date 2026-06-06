import { useState } from "react";
import type { SessionDetail, SegmentStatus } from "../api.js";
import { basename, fmtInt, fmtPct, fmtTokens, fmtUsd, sourceColor, statusColor } from "../format.js";

const STATUSES: SegmentStatus[] = ["gone", "stale", "spent", "duplicate"];

const COST_PARTS = [
  { key: "input",       color: "#5b8af5", pick: (b: SessionDetail["cost"]["breakdown"]) => b.inputUsd },
  { key: "output",      color: "#4caf7d", pick: (b: SessionDetail["cost"]["breakdown"]) => b.outputUsd },
  { key: "cache read",  color: "#e8a838", pick: (b: SessionDetail["cost"]["breakdown"]) => b.cacheReadUsd },
  { key: "cache write", color: "#9b7ce8", pick: (b: SessionDetail["cost"]["breakdown"]) => b.cacheWriteUsd },
] as const;

export function SessionView({ d }: { d: SessionDetail }) {
  return (
    <>
      <DashHeader d={d} />
      <StatRow d={d} />
      <div className="panel-grid">
        <CompositionPanel xray={d.xray} />
        <CostPanel cost={d.cost} />
        <ReclaimablePanel r={d.reclaimable} />
        <HygienePanel clean={d.clean} />
      </div>
    </>
  );
}

function cleanModel(raw: string): string {
  // take the first model, strip anything after comma, drop synthetic/internal tags
  const first = raw.split(",")[0]?.trim() ?? raw;
  return first.replace(/<[^>]+>/g, "").replace(/,.*$/, "").trim() || raw;
}

function DashHeader({ d }: { d: SessionDetail }) {
  const { meta } = d;
  const model = d.cost.models.map((m) => m.model).join(", ") || "—";
  return (
    <div className="dh">
      <div className="dh-left">
        <div className="dh-project">{basename(meta.projectPath)}</div>
        <div className="dh-tags">
          <span className="dh-tag-model">{cleanModel(model)}</span>
        </div>
      </div>
    </div>
  );
}

function StatRow({ d }: { d: SessionDetail }) {
  const { meta, cost, xray, reclaimable } = d;
  return (
    <div className="stat-row">
      <div className="stat">
        <div className="stat-label">Session cost</div>
        <div className="stat-value hi">{fmtUsd(cost.totalUsd)}</div>
        <div className="stat-sub">actuals · exact</div>
      </div>
      <div className="stat">
        <div className="stat-label">Resident context</div>
        <div className="stat-value">{fmtTokens(xray.totalTokens)}<span className="unit">tok</span></div>
        <div className="stat-sub">{fmtInt(xray.segmentCount)} segments</div>
      </div>
      <div className="stat">
        <div className="stat-label">Reclaimable</div>
        <div className={`stat-value${reclaimable.reclaimablePct > 0.15 ? " warn" : ""}`}>
          {fmtPct(reclaimable.reclaimablePct)}
        </div>
        <div className="stat-sub">{fmtInt(reclaimable.reclaimableTokens)} tokens</div>
      </div>
      <div className="stat">
        <div className="stat-label">Wasted / turn</div>
        <div className="stat-value">
          {reclaimable.wastedUsdPerTurn !== null ? fmtUsd(reclaimable.wastedUsdPerTurn) : "—"}
        </div>
        <div className="stat-sub">
          {meta.turnCount} turns · {meta.toolCallCount} tools · {meta.fileOpCount} files
        </div>
      </div>
    </div>
  );
}

function CompositionPanel({ xray }: { xray: SessionDetail["xray"] }) {
  const total = xray.totalTokens || 1;
  const max = Math.max(1, ...xray.composition.map((c) => c.tokens));
  return (
    <section className="panel p4">
      <div className="panel-header">
        <span className="panel-title">Context X-Ray</span>
        <span className="panel-hint">{fmtTokens(xray.totalTokens)} tok · {xray.segmentCount} segments</span>
      </div>

      {/* stacked proportion bar */}
      <div className="xray-stack">
        {xray.composition.map((c) => (
          <span
            key={c.source}
            className="xray-stack-seg"
            style={{ width: `${(c.tokens / total) * 100}%`, background: sourceColor(c.source) }}
            title={`${c.source} · ${fmtInt(c.tokens)} tok · ${fmtPct(c.tokens / total)}`}
          />
        ))}
      </div>

      {/* rows */}
      <div className="xray-rows">
        {xray.composition.map((c) => {
          const pct = c.tokens / total;
          const barW = (c.tokens / max) * 100;
          return (
            <div className="xray-row" key={c.source}>
              <div className="xray-row-left">
                <span className="xray-swatch" style={{ background: sourceColor(c.source) }} />
                <span className="xray-source">{c.source}</span>
              </div>
              <div className="xray-bar-track">
                <div
                  className="xray-bar-fill"
                  style={{ width: `${barW}%`, background: sourceColor(c.source) }}
                />
              </div>
              <div className="xray-row-right">
                <span className="xray-tokens">{fmtTokens(c.tokens)}</span>
                <span className="xray-pct">{fmtPct(pct)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CostPanel({ cost }: { cost: SessionDetail["cost"] }) {
  const total = cost.totalUsd || 1;
  const parts = COST_PARTS.map((p) => ({ ...p, usd: p.pick(cost.breakdown) }));
  return (
    <section className="panel p2">
      <div className="panel-header">
        <span className="panel-title">Cost breakdown</span>
        <span className="panel-hint">actuals × pricing</span>
      </div>
      <div className="panel-body">
        <div className="cost-total">{fmtUsd(cost.totalUsd)}</div>
        <div className="bar-strip">
          {parts.map((p) => (
            <span key={p.key} style={{ width: `${(p.usd / total) * 100}%`, background: p.color }} />
          ))}
        </div>
        <div className="cost-rows">
          {parts.map((p) => (
            <div className="cost-row" key={p.key}>
              <span className="cost-dot" style={{ background: p.color }} />
              <span className="cost-name">{p.key}</span>
              <span className="cost-amount">{fmtUsd(p.usd)}</span>
              <span className="cost-pct">{fmtPct(p.usd / total)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}


function ReclaimablePanel({ r }: { r: SessionDetail["reclaimable"] }) {
  const reclaimable = r.reclaimableTokens || 1;
  return (
    <section className="panel p-full">
      <div className="panel-header">
        <span className="panel-title">Reclaimable context</span>
        <span className="panel-hint">
          {r.reclaimableTokens > 0
            ? `${fmtInt(r.reclaimableTokens)} tokens · ${fmtPct(r.reclaimablePct)} of window${r.wastedUsdPerTurn !== null ? ` · ~${fmtUsd(r.wastedUsdPerTurn)}/turn` : ""}`
            : "clean"}
        </span>
      </div>
      <div className="panel-body">
        {r.reclaimableTokens > 0 && (
          <div className="bar-strip">
            {STATUSES.map((s) =>
              r.byStatus[s] > 0 ? (
                <span
                  key={s}
                  style={{ width: `${(r.byStatus[s] / reclaimable) * 100}%`, background: `var(--${s})` }}
                  title={`${s} · ${fmtInt(r.byStatus[s])}`}
                />
              ) : null,
            )}
          </div>
        )}

        <div className="status-tiles">
          {STATUSES.map((s) => (
            <div className="status-tile" key={s}>
              <div className="status-tile-label">
                <span className="status-dot" style={{ background: `var(--${s})` }} />
                {s}
              </div>
              <div className="status-tile-val">{fmtInt(r.byStatus[s])}</div>
            </div>
          ))}
        </div>

        {r.items.length > 0 ? (
          <div className="items-table">
            <div className="items-table-head">
              <span className="col-h">status</span>
              <span className="col-h" style={{ textAlign: "right" }}>tokens</span>
              <span className="col-h">segment</span>
            </div>
            {r.items.map((it, i) => (
              <div className="items-row" key={i}>
                <span
                  className="status-badge"
                  style={{ color: statusColor(it.status), border: `1px solid ${statusColor(it.status)}` }}
                >
                  {it.status}
                </span>
                <span className="tok-val" style={{ color: statusColor(it.status) }}>
                  {fmtInt(it.tokens)}
                </span>
                <div className="item-detail">
                  <div className="item-label">{it.label}</div>
                  <div className="item-reason">{it.reason}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="clean-state">
            Clean window — every resident file still exists, unchanged, and in use. Nothing to reclaim.
          </div>
        )}
      </div>
    </section>
  );
}

function HygienePanel({ clean }: { clean?: SessionDetail["clean"] }) {
  // Older server builds don't emit `clean`; render nothing rather than crash.
  if (!clean) return null;
  const { actions, compact, summary } = clean;
  const hasWork = actions.length > 0 || compact !== null;

  return (
    <section className="panel p-full">
      <div className="panel-header">
        <span className="panel-title">Context Cleaner</span>
        <span className="panel-hint">
          {hasWork
            ? `${summary.actionCount} file fix${summary.actionCount !== 1 ? "es" : ""}${compact ? " · compact advised" : ""}`
            : "nothing to clean"}
        </span>
      </div>
      <div className="panel-body">
        {!hasWork ? (
          <div className="clean-state">
            Nothing to clean — no deleted or drifted files, and the window isn’t garbage-heavy enough to compact.
          </div>
        ) : (
          <div className="hyg">
            {/* CLAUDE.md actions */}
            {actions.length > 0 && (
              <div className="hyg-block">
                <div className="hyg-block-head">
                  <span className="hyg-block-title">CLAUDE.md fixes</span>
                  <span className="hyg-block-sub">tell the agent which files to stop trusting</span>
                </div>
                <div className="hyg-actions">
                  {actions.map((a, i) => (
                    <div className="hyg-action" key={i}>
                      <span className={`hyg-verb ${a.type}`}>
                        {a.type === "stop_referencing" ? "STOP" : "RE-READ"}
                      </span>
                      <div className="hyg-action-body">
                        <div className="hyg-action-path">{a.path}</div>
                        <div className="hyg-action-reason">{a.reason}</div>
                      </div>
                      <span className="hyg-action-tok">{fmtTokens(a.reclaimableTokens)}</span>
                    </div>
                  ))}
                </div>
                <CopyButton
                  label="Copy CLAUDE.md block"
                  text={buildClaudeMdBlock(actions)}
                />
              </div>
            )}

            {/* Compact recommendation */}
            {compact && (
              <div className="hyg-block">
                <div className="hyg-block-head">
                  <span className="hyg-block-title">Compact recommended</span>
                  <span className="hyg-block-sub">
                    window is {fmtPct(compact.reclaimablePct)} reclaimable
                  </span>
                </div>
                <div className="hyg-compact-stats">
                  <div className="hyg-cstat">
                    <span className="hyg-cstat-k">spent</span>
                    <span className="hyg-cstat-v">{fmtTokens(compact.spentTokens)}</span>
                  </div>
                  <div className="hyg-cstat">
                    <span className="hyg-cstat-k">duplicate</span>
                    <span className="hyg-cstat-v">{fmtTokens(compact.duplicateTokens)}</span>
                  </div>
                  {compact.estimatedUsdSaved !== null && (
                    <div className="hyg-cstat">
                      <span className="hyg-cstat-k">stops wasting</span>
                      <span className="hyg-cstat-v pos">~{fmtUsd(compact.estimatedUsdSaved)}/turn</span>
                    </div>
                  )}
                </div>
                <div className="hyg-compact-cmd">{compact.command}</div>
                <div className="hyg-note">
                  Run this inside your live Claude Code session — Glassbox can’t compact for you.
                </div>
                <CopyButton label="Copy /compact command" text={compact.command} />
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function CopyButton({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => setCopied(false),
    );
  };
  return (
    <button className="hyg-copy" onClick={onCopy} type="button">
      {copied ? "✓ Copied" : label}
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
  if (stop.length > 0) {
    lines.push("", "**Deleted — do not read or reference:**", ...stop.map((a) => a.claudeMdSnippet));
  }
  if (reread.length > 0) {
    lines.push("", "**Changed on disk — re-read before relying on the cached copy:**", ...reread.map((a) => a.claudeMdSnippet));
  }
  lines.push("<!-- glassbox:hygiene:end -->");
  return lines.join("\n");
}
