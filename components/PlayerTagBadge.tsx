import type { PlayerTag } from '@/lib/types';

/**
 * The public "bot" pill shown next to a username an admin has tagged as a
 * Bot in the Player Manager. Renders nothing for Player/untagged, so
 * callers can drop it next to any name unconditionally — public views only
 * ever call out bots, never confirm the ordinary case.
 */
export default function PlayerTagBadge({
  tag,
  className = '',
}: {
  tag?: PlayerTag | null;
  className?: string;
}) {
  if (tag !== 'Bot') return null;
  return (
    <span
      title="Tagged as a Bot in the Player Manager"
      className={`inline-block rounded-full border border-border bg-surfaceAlt px-1.5 py-0.5 align-middle text-[0.65rem] font-medium text-textMuted ${className}`}
    >
      bot
    </span>
  );
}