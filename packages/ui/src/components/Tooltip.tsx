import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * A single cursor-following hover chip, shared across the whole dashboard.
 * One floating element (rendered via portal) is driven by any number of
 * <Tip> wrappers — works for both HTML elements and SVG chart shapes.
 */

interface TipState {
  content: ReactNode;
  x: number;
  y: number;
}
type ShowFn = (content: ReactNode | null, x?: number, y?: number) => void;

const TipCtx = createContext<ShowFn>(() => {});

const EST_W = 240; // for edge-clamping
const EST_H = 120;

export function TooltipProvider({ children }: { children: ReactNode }) {
  const [tip, setTip] = useState<TipState | null>(null);

  const show = useCallback<ShowFn>((content, x = 0, y = 0) => {
    if (content == null) {
      setTip(null);
      return;
    }
    const left = Math.min(x + 14, window.innerWidth - EST_W);
    const top = Math.min(y + 14, window.innerHeight - EST_H);
    setTip({ content, x: Math.max(8, left), y: Math.max(8, top) });
  }, []);

  return (
    <TipCtx.Provider value={show}>
      {children}
      {tip &&
        createPortal(
          <div className="tip" style={{ left: tip.x, top: tip.y }}>
            {tip.content}
          </div>,
          document.body,
        )}
    </TipCtx.Provider>
  );
}

/**
 * Wrap any element to show `content` as a hover chip. Use `svg` for chart
 * shapes (renders a <g>); otherwise renders a display:contents <span> so it
 * doesn't disturb grid/flex layout.
 */
export function Tip({
  content,
  children,
  svg = false,
}: {
  content: ReactNode;
  children: ReactNode;
  svg?: boolean;
}) {
  const show = useContext(TipCtx);
  const handlers = {
    onMouseMove: (e: { clientX: number; clientY: number }) => show(content, e.clientX, e.clientY),
    onMouseLeave: () => show(null),
  };
  return svg ? (
    <g {...handlers}>{children}</g>
  ) : (
    <span className="tip-wrap" {...handlers}>
      {children}
    </span>
  );
}

/** Standard chip content: optional title + colored key/value rows. */
export function TipChip({
  title,
  rows,
}: {
  title?: string;
  rows: { sw?: string; k: string; v?: string }[];
}) {
  return (
    <>
      {title && <div className="tip-title">{title}</div>}
      {rows.map((r, i) => (
        <div className="tip-row" key={i}>
          {r.sw && <span className="tip-sw" style={{ background: r.sw }} />}
          <span className="tip-k">{r.k}</span>
          {r.v != null && <span className="tip-v">{r.v}</span>}
        </div>
      ))}
    </>
  );
}
