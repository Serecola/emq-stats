import type { PlayerTag } from './types';

/**
 * Stored per-username decisions from `player_tags`, keyed by normalized
 * username (what lib/store.ts returns). A missing key is the common case and
 * is meaningful: it means "no decision", so the name rule below applies.
 */
export type PlayerTagOverrides = Record<string, PlayerTag>;

/**
 * The automatic rule: a username containing "bot" is a bot. Essentially every
 * bot account in these tournaments is named for it (AisuBot, KreiBot, ColdBot),
 * so this catches them with no admin work at all. It deliberately also fires
 * on false friends like "RobotFan" — an admin overrides one of those with a
 * `NotBot` row, which is what resolvePlayerTag exists to make possible.
 */
const AUTO_BOT = /bot/i;

/** Whether a username matches the automatic bot rule on its own. */
export function isAutoBot(uname: string): boolean {
  return AUTO_BOT.test(uname);
}

/**
 * A username's effective tag — the single rule every view must agree on, so
 * the match tables, the player list, a player page and the Player Manager can
 * never disagree about who is a bot.
 *
 * A stored row always wins, in both directions: `Bot` forces the badge on, and
 * `NotBot` silences the name rule for a false alarm. Only with no row at all
 * does the name rule apply — which is what makes tagging ordinary players
 * unnecessary, since they fall through to "not a bot" for free.
 */
export function resolvePlayerTag(
  uname: string,
  overrides?: PlayerTagOverrides
): PlayerTag | null {
  const stored = overrides?.[uname.trim().toLowerCase()];
  if (stored === 'Bot') return 'Bot';
  if (stored === 'NotBot') return null;
  return isAutoBot(uname) ? 'Bot' : null;
}
