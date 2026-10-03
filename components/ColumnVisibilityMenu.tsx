'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * The "Columns" popup: a small toolbar button that opens a checklist of the
 * table's hideable columns. The table owns the visibility set — it's the one
 * that has to filter its columns and park a sort whose column disappeared —
 * so this component only owns the open/close and draws the checklist it is
 * handed.
 *
 * The panel is fixed-positioned from the button's measured rect rather than
 * absolutely placed inside the toolbar: the toolbars sit in the tables' own
 * `overflow-x-auto` cards, and an absolutely-positioned panel would be
 * clipped to the card's box (or spawn a vertical scrollbar on it). While
 * open it re-anchors on scroll and resize, so a horizontally scrolled wide
 * table can't strand it away from its button.
 *
 * Click-outside and Escape close it — the two affordances a checklist
 * floating over rows owes the reader. Nothing persists: like the sort and
 * the search, which columns are shown is session view state, not a
 * shareable URL.
 */
export default function ColumnVisibilityMenu({
  items,
  hidden,
  onToggle,
  onShowAll,
}: {
  /**
   * Every hideable column, hidden ones included — a folded-away column has
   * to stay listed, or there would be no way back. The caller leaves out the
   * identity column and anything another control owns (VN Exp on the players
   * list, which the VN cell fold drives).
   */
  items: { key: string; label: ReactNode }[];
  hidden: ReadonlySet<string>;
  onToggle: (key: string) => void;
  /** Clears the whole set — the panel's "Show all". */
  onShowAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  // Panel coordinates measured from the button (see the note above on why it
  // isn't just absolutely positioned in the toolbar).
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  function place() {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  }

  useEffect(() => {
    if (!open) return;
    place();
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    // Capture-phase scroll: the table cards scroll horizontally themselves,
    // and those scrolls only reach a window listener in the capture phase.
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  const hiddenCount = items.reduce((n, item) => n + (hidden.has(item.key) ? 1 : 0), 0);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => {
          // Measure before the state lands so the first paint already has a
          // home for the panel — no one-frame gap between click and popup.
          if (!open) place();
          setOpen(!open);
        }}
        aria-haspopup="true"
        aria-expanded={open}
        title="Choose which columns to show"
        className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-medium text-textMuted transition-colors hover:border-textSub hover:text-text"
      >
        Columns
        {hiddenCount > 0 && (
          <span className="rounded-full bg-accent/15 px-1.5 py-px text-[0.65rem] text-accent">
            {hiddenCount}
          </span>
        )}
        <span className="w-2 text-[0.6rem] text-textDim">{open ? '▾' : '▸'}</span>
      </button>
      {open && pos && (
        <div
          style={{ top: pos.top, right: pos.right }}
          className="fixed z-30 w-44 rounded-md border border-border bg-surface p-2 shadow-lg"
        >
          <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
            <span className="text-[0.65rem] font-medium uppercase tracking-wide text-textDim">
              Show columns
            </span>
            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={onShowAll}
                className="text-[0.65rem] text-accent underline-offset-2 hover:underline"
              >
                Show all
              </button>
            )}
          </div>
          <ul className="max-h-72 space-y-px overflow-y-auto">
            {items.map((item) => (
              <li key={item.key}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs text-textMuted transition-colors hover:bg-surfaceAlt hover:text-text">
                  <input
                    type="checkbox"
                    checked={!hidden.has(item.key)}
                    onChange={() => onToggle(item.key)}
                    className="h-3.5 w-3.5 flex-shrink-0 accent-accent"
                  />
                  <span className="truncate">{item.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
