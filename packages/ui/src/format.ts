import type { SegmentStatus } from "./api.js";

export const fmtInt = (n: number): string => n.toLocaleString("en-US");

/** Compact token count: 1234 → "1.2k", 1_750_000 → "1.75M". */
export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Dollars, honest down to sub-cent agent costs. */
export function fmtUsd(n: number): string {
  if (n === 0) return "$0";
  if (n >= 0.01) return `$${n.toFixed(2)}`;
  if (n >= 0.0001) return `$${n.toFixed(4)}`;
  return `$${n.toExponential(1)}`;
}

export const fmtPct = (frac: number): string => `${Math.round(frac * 100)}%`;

export function basename(path: string): string {
  const b = path.split(/[/\\]/).filter(Boolean).pop();
  return b || path;
}

export function relativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(t).toISOString().slice(0, 10);
}

export const sourceColor = (source: string): string =>
  `var(--src-${source}, var(--src-unknown))`;

export const statusColor = (status: SegmentStatus): string => `var(--${status})`;
