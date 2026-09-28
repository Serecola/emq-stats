import { norm } from './stats';

/**
 * Global alternate-name map: normalized alias -> canonical display name.
 * Same shape as a match's `renames`, but database-wide instead of scoped to
 * one tournament's roster paste — which is what makes it a real identity link
 * (see player_aliases in lib/db.ts).
 */
export type PlayerAliases = Record<string, string>;

/**
 * Chains collapsed to their end, so a lookup never has to walk. A name may be
 * aliased onto a name that is itself an alias (you point "Sere2" at "Sere"
 * before deciding what "Sere" is really called). Cycles can't be created
 * through the API, but a hand-edited row could hold one, so the walk stops on
 * revisiting a key rather than spinning.
 */
export function canonicalAliases(aliases: PlayerAliases): PlayerAliases {
  const flat: PlayerAliases = {};
  for (const key of Object.keys(aliases)) {
    // `cursor` is the key we're standing on, `target` the name it points at.
    // They're the same thing until the first step; tracking the target
    // separately is what lets a plain one-hop alias (patt2 -> patt) resolve,
    // since the end of the walk is a *value* and is never a key of the map.
    let cursor = key;
    let target = aliases[key];
    const seen = new Set<string>([key]);
    for (;;) {
      const next = aliases[norm(target)];
      if (!next) break;
      const nextKey = norm(next);
      if (nextKey === cursor || seen.has(nextKey)) break;
      seen.add(nextKey);
      cursor = nextKey;
      target = next;
    }
    // Kept even when the target normalizes onto its own key. That case is a
    // *casing* rename — "Sere" displayed as "sere", "sere" as "SERE" — and it
    // has to survive flattening or the rename never reaches the views. A true
    // self-alias (the identical string) is refused by the API, so no row here
    // can be a pointless one; the key is normalized, which is exactly why the
    // override is otherwise indistinguishable from a no-op at this point.
    flat[key] = target;
  }
  return flat;
}

/**
 * The normalized key a username ultimately belongs to — its own, unless it's an
 * alias. Lets a player page reached by an old name resolve to the canonical
 * player instead of 404ing.
 */
export function resolveAliasKey(uname: string, aliases: PlayerAliases): string {
  const target = canonicalAliases(aliases)[norm(uname)];
  return target ? norm(target) : norm(uname);
}

/**
 * Folds the global aliases *under* a match's own `renames`.
 *
 * A match's renames win wherever both name the same player: they're the more
 * specific statement, made by someone reading that exact tournament's roster
 * against its raw JSON. Aliases only fill in the names the match itself says
 * nothing about.
 */
export function withAliases(
  renames: Record<string, string>,
  aliases: PlayerAliases
): Record<string, string> {
  const flat = canonicalAliases(aliases);
  if (Object.keys(flat).length === 0) return renames;
  return { ...flat, ...renames };
}
