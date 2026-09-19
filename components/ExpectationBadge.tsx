import { EXPECTATION_STYLES, type ExpectationLabel } from '@/lib/expectation';

/**
 * Renders a promotion verdict: a tinted pill for the notable labels and
 * plain muted text for EXPECTED (see EXPECTATION_STYLES). Shared by the
 * match Guess Rate table and the admin Player Manager so both views show
 * the same verdict identically.
 */
export default function ExpectationBadge({ label }: { label: ExpectationLabel }) {
  const style = EXPECTATION_STYLES[label];
  if (!style) {
    return <span className="whitespace-nowrap text-xs text-textMuted">{label}</span>;
  }
  return (
    <span
      className="inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[0.65rem] font-semibold"
      style={{ background: style.bg, color: style.text }}
    >
      {label}
    </span>
  );
}
