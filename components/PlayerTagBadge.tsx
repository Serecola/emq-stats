import { resolvePlayerTag, type PlayerTagOverrides } from '@/lib/player-tags';

/**
 * The public "bot" pill shown next to a username that resolves to a bot. It
 * takes the username rather than a pre-resolved tag so the automatic
 * "username contains Bot" rule (lib/player-tags.ts) is applied in exactly one
 * place — every view that shows a name gets the same answer for free, and
 * nobody has to tag ordinary players.
 *
 * Renders nothing for anyone who isn't a bot, so callers can drop it next to
 * any name unconditionally — public views only ever call out bots, never
 * confirm the ordinary case.
 */
export default function PlayerTagBadge({
  uname,
  overrides,
  className = '',
}: {
  uname: string;
  /** Stored decisions from listPlayerTags(); omit for the name rule alone. */
  overrides?: PlayerTagOverrides;
  className?: string;
}) {
  if (resolvePlayerTag(uname, overrides) !== 'Bot') return null;
  // Say where the badge came from — an admin can override either way in the
  // Player Manager, and a surprise auto-badge is worth explaining.
  const manual = overrides?.[uname.trim().toLowerCase()] === 'Bot';
  return (
    <span
      title={
        manual
          ? 'Tagged as a Bot in the Player Manager'
          : 'Bot — matched automatically from the username; an admin can override this in the Player Manager'
      }
      className={`inline-block rounded-full border border-border bg-surfaceAlt px-1.5 py-0.5 align-middle text-[0.65rem] font-medium text-textMuted ${className}`}
    >
      bot
    </span>
  );
}