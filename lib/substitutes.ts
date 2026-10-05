import { extractUsernames, norm } from './stats';
import type { Team } from './types';

/**
 * Substitute detection: the question the admin form asks when an upload's
 * roster *almost* matches.
 *
 * A game rooms a fixed six players (two teams of three), so an export whose
 * participants are 4–5 of the roster's own names with 1–2 names changed is
 * never random: either the roster player is playing under a new username
 * (that's a **rename** — the `renames` map, identity merges), or a different
 * person took their slot for that game (that's a **substitute** — the
 * `substitutes` map, identity stays separate but the team slot is filled).
 * The two answers lead to opposite stats, so the form asks instead of
 * guessing; this module is what tells it when to ask and what to suggest.
 *
 * Deliberately pure — no React, no DB — so the same check can run wherever a
 * raw export meets a roster. Detection reads `renames`/`substitutes` only
 * (never the global aliases): it runs in the admin form, which has no access
 * to them, and a name already reconciled either way must not re-trigger the
 * question.
 */
export interface SubstituteQuestion {
  /** Normalized key of the changed name — the key both maps are keyed by. */
  key: string;
  /** The name exactly as it appears in the export, for display. */
  rawName: string;
  /** How many of this file's participants matched the roster. */
  matched: number;
  /** Total participants in the file (a full game: 6). */
  total: number;
  /**
   * The roster player the changed name most likely stood in for — the one
   * open slot on the team the matched names point at — or null when the
   * evidence doesn't identify a single player (two open slots, or the
   * participants don't line up with any one team).
   */
  suggest: string | null;
}

/**
 * Questions to ask about one raw export, empty when it isn't a substitute
 * candidate.
 *
 * Triggers exactly on the pattern the feature exists for: a full six-player
 * game where 4–5 participants match the pasted roster (directly, through an
 * existing rename, or through an already-recorded substitute) and 1–2 don't.
 * Anything else — a partial room, a wildly different roster, an export the
 * admin already reconciled — returns nothing, so uploads stay silent until
 * there is genuinely a question to answer.
 *
 * `suggest` falls back to the single player missing from a team that
 * otherwise fielded two of its three members: in the common one-sub game
 * that's the person the sub replaced, and preselecting them is what makes
 * the ask one click instead of a lookup. When two teams each lost a player
 * (a sub on each side), there is no way to pair names to slots from the
 * export alone and the admin picks — hence null.
 */
export function detectSubstituteQuestions(
  data: unknown,
  teams: Team[],
  renames: Record<string, string> = {},
  substitutes: Record<string, string> = {}
): SubstituteQuestion[] {
  const participants = extractUsernames(data);
  if (participants.length === 0) return [];

  const rosterKeys = new Set<string>();
  for (const team of teams) for (const name of team) rosterKeys.add(norm(name));

  // Matched roster keys (for the suggestion walk) and the odd names out.
  const matchedKeys = new Set<string>();
  const changed: { key: string; rawName: string }[] = [];
  let matched = 0;
  for (const raw of participants) {
    const key = norm(renames[norm(raw)] || raw);
    if (rosterKeys.has(key)) {
      matchedKeys.add(key);
      matched++;
      continue;
    }
    const subTarget = substitutes[norm(raw)];
    if (subTarget && rosterKeys.has(norm(subTarget))) {
      matchedKeys.add(norm(subTarget));
      matched++;
      continue;
    }
    const subKey = norm(raw);
    if (!changed.some((c) => c.key === subKey)) changed.push({ key: subKey, rawName: raw });
  }

  // The pattern is defined on a full room: 4–5 matched *of six*, with the
  // remaining 1–2 being the names worth asking about.
  if (participants.length !== 6) return [];
  if (matched < 4 || matched > 5) return [];
  if (changed.length < 1 || changed.length > 2) return [];

  // A team that fielded all but one of its members names its missing player —
  // the slot the changed name most plausibly filled.
  const openSlots: string[] = [];
  for (const team of teams) {
    const members = team.map(norm);
    const hit = members.filter((m) => matchedKeys.has(m)).length;
    if (hit >= 2 && hit === members.length - 1) {
      for (let i = 0; i < team.length; i++) {
        if (!matchedKeys.has(members[i])) openSlots.push(team[i]);
      }
    }
  }
  const suggest = openSlots.length === 1 ? openSlots[0] : null;

  return changed.map((c) => ({
    key: c.key,
    rawName: c.rawName,
    matched,
    total: participants.length,
    suggest,
  }));
}
