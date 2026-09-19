'use client';

export type SortDir = 'asc' | 'desc';

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
}) {
  const active = activeKey === sortKey;
  return (
    <th
      className={`cursor-pointer select-none px-3 py-2 font-medium hover:text-textSub ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${highlighted ? 'bg-white/5' : ''} ${className}`}
      title={title}
      onClick={() => onClick(sortKey)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className="w-2.5 text-[0.6rem] text-textDim">{active ? (dir === 'asc' ? '▲' : '▼') : ''}</span>
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