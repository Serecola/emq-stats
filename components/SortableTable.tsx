'use client';

export type SortDir = 'asc' | 'desc';

/**
 * Tighter cell padding for the very wide stats tables. The match Guess Rate
 * table spans ~20 columns, where the default 0.75rem side gutters alone add a
 * few hundred pixels of horizontal scroll — this halves the per-column cost.
 * Exported so the header and the body cells of one table can never drift apart.
 */
export const DENSE_CELL_PAD = 'px-2 py-1.5';

/**
 * Clickable <th> that toggles ascending/descending sort on click and shows
 * an arrow when it's the active sort column. First click on a new column
 * uses `defaultDir` (numeric stat columns default to descending — highest
 * first — while name/text columns default to ascending).
 */
export function SortableHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onClick,
  align = 'right',
  title,
  className = '',
  highlighted = false,
  onMouseEnter,
  onMouseLeave,
  pad = 'px-3 py-2',
}: {
  label: React.ReactNode;
  sortKey: string;
  activeKey: string | null;
  dir: SortDir;
  onClick: (key: string) => void;
  align?: 'left' | 'right';
  title?: string;
  className?: string;
  highlighted?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  /** Cell padding override — pass DENSE_CELL_PAD for the wide stats tables. */
  pad?: string;
}) {
  const active = activeKey === sortKey;
  return (
    <th
      className={`cursor-pointer select-none whitespace-nowrap ${pad} font-medium hover:text-textSub ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${highlighted ? 'bg-white/5' : ''} ${className}`}
      title={title}
      onClick={() => onClick(sortKey)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* The arrow slot is always reserved (fixed width, empty when inactive)
          so clicking a header never reflows the row around it. */}
      <span className="inline-flex items-center gap-0.5">
        {label}
        <span className="w-2 text-[0.6rem] text-textDim">{active ? (dir === 'asc' ? '▲' : '▼') : ''}</span>
      </span>
    </th>
  );
}

export function toggleSort(
  key: string,
  activeKey: string | null,
  dir: SortDir,
  defaultDir: SortDir,
  setKey: (k: string) => void,
  setDir: (d: SortDir) => void
) {
  if (activeKey === key) {
    setDir(dir === 'asc' ? 'desc' : 'asc');
  } else {
    setKey(key);
    setDir(defaultDir);
  }
}

export function compareValues(a: number | string, b: number | string, dir: SortDir): number {
  let cmp: number;
  if (typeof a === 'number' && typeof b === 'number') {
    cmp = a - b;
  } else {
    cmp = String(a).localeCompare(String(b));
  }
  return dir === 'asc' ? cmp : -cmp;
}

// percentHeat now lives in lib/percent-heat.ts — outside the 'use client'
// boundary, so the server-rendered /players list can call it too. Re-exported
// here so client tables keep one import site for the shared table helpers.
export { percentHeat } from '@/lib/percent-heat';
