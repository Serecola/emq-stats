'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { norm } from '@/lib/stats';
import { isAutoBot, resolvePlayerTag, type PlayerTagOverrides } from '@/lib/player-tags';
import type { PlayerAliases } from '@/lib/player-aliases';
import type { PlayerTag } from '@/lib/types';
import { withBasePath } from '@/lib/base-path';
import { TABLE_ROW_CLASS } from '@/lib/table-row';

type Filter = 'all' | 'bot' | 'human';
type SaveStatus = 'saving' | 'saved' | 'error';

/**
 * The Player Manager's "Player Tags" tab: one row per username known from
 * any uploaded tournament, with a single Bot toggle. Tags are global (not per
 * mode + sub-mode) — see player_tags in lib/db.ts — so this list deliberately
 * ignores the ModeToggle filter.
 *
 * Bots are not listed individually: any username containing "Bot" is already
 * badged automatically (lib/player-tags.ts), so the only thing this tab has to
 * do is record the exceptions. Clicking Bot on a name the rule already caught
 * stores a `NotBot` override that silences it, and "auto" drops an override
 * to hand the name back to the rule.
 *
 * The Aliases column is the cross-match identity link (lib/player-aliases.ts):
 * adding one merges two names everywhere at once — aggregated stats, player
 * pages, Expected Ranks, autodraft — and carries the alias's Set Ranks onto
 * the canonical player. It's listed on the *canonical* row, so a name that has
 * been folded into someone else shows as a chip you can remove, and no longer
 * appears as its own row.
 *
 * The pencil next to a username is that same alias write aimed the other way:
 * it renames the player, so the current name becomes an alias of the new one
 * and every tournament that recorded the old name keeps resolving to this
 * person. It is how a corrected spelling or a changed in-game name is fixed
 * even when the new name has never appeared in an upload. A change of casing
 * counts as a rename too — the displayed spelling is the thing being corrected.
 *
 * Each alias chip carries a ⇄ next to its ×: swapping makes the folded name the
 * main name and demotes the current one, which is how a rename that went the
 * wrong way is undone while keeping the history that caused it.
 *
 * Saving follows the PlayerRankInput pattern: PUT a single cell, keep the
 * result in local state for instant feedback, then router.refresh() so the
 * server-rendered badges on the public views catch up.
 */
export default function PlayerTagManager({
  players,
  tags,
  aliases,
}: {
  /** Every username across every match, with tournament counts for context. */
  players: { uname: string; matchesPlayed: number }[];
  /** Stored overrides from listPlayerTags(); absent = the name rule decides. */
  tags: PlayerTagOverrides;
  /** Global alias map from listPlayerAliases(); alias key -> canonical name. */
  aliases: PlayerAliases;
}) {
  const router = useRouter();
  // Local mirror so a click lands instantly; router.refresh() re-renders the
  // server props underneath, which match it after the save.
  const [localTags, setLocalTags] = useState<PlayerTagOverrides>(tags);
  const [localAliases, setLocalAliases] = useState<PlayerAliases>(aliases);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [statuses, setStatuses] = useState<Record<string, SaveStatus>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Which row's alias input is open, and what has been typed into it. One at a
  // time: adding an alias is a deliberate act, not something to leave half-
  // finished on every row.
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [aliasDraft, setAliasDraft] = useState('');
  // Which row's rename box is open, and what has been typed into it. Renaming
  // is the same alias write read backwards — this row's name becomes an alias
  // of the new one — so it gets the same one-at-a-time treatment.
  const [renamingFor, setRenamingFor] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  // Canonical key -> the names folded into it, so each row can list its own.
  const aliasesByTarget = useMemo(() => {
    const grouped: Record<string, string[]> = {};
    for (const [aliasKey, target] of Object.entries(localAliases)) {
      const key = norm(target);
      (grouped[key] ??= []).push(aliasKey);
    }
    return grouped;
  }, [localAliases]);

  const counts = useMemo(() => {
    const c = { all: players.length, bot: 0, human: 0 };
    for (const p of players) {
      if (resolvePlayerTag(p.uname, localTags) === 'Bot') c.bot++;
      else c.human++;
    }
    return c;
  }, [players, localTags]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return players.filter((p) => {
      const isBot = resolvePlayerTag(p.uname, localTags) === 'Bot';
      if (filter === 'bot' && !isBot) return false;
      if (filter === 'human' && isBot) return false;
      if (q && !p.uname.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [players, localTags, query, filter]);

  async function save(uname: string, next: PlayerTag | null) {
    const key = norm(uname);
    setStatuses((prev) => ({ ...prev, [key]: 'saving' }));
    setErrors((prev) => ({ ...prev, [key]: '' }));
    try {
      const res = await fetch(withBasePath('/api/admin/player-tags'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerKey: key, tag: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? 'Could not save tag.');
      }
      setLocalTags((prev) => {
        const copy = { ...prev };
        if (next === null) delete copy[key];
        else copy[key] = next;
        return copy;
      });
      setStatuses((prev) => ({ ...prev, [key]: 'saved' }));
      router.refresh();
    } catch (err) {
      setStatuses((prev) => ({ ...prev, [key]: 'error' }));
      setErrors((prev) => ({
        ...prev,
        [key]: err instanceof Error ? err.message : 'Could not save tag.',
      }));
    }
  }

  /**
   * Adds an alias pointing at this player, or (with `target === null`) splits
   * one back out. Both directions report through the row's own status/error
   * state, so a rejected alias — a self-alias, say — says why on the row it was
   * typed into instead of failing silently.
   */
  async function saveAlias(alias: string, target: string | null, rowKey: string) {
    setStatuses((prev) => ({ ...prev, [rowKey]: 'saving' }));
    setErrors((prev) => ({ ...prev, [rowKey]: '' }));
    try {
      const res = await fetch(withBasePath('/api/admin/player-aliases'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias, target }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? 'Could not save alias.');
      }
      setLocalAliases((prev) => {
        const copy = { ...prev };
        if (target === null) delete copy[norm(alias)];
        else copy[norm(alias)] = target;
        return copy;
      });
      setAddingFor(null);
      setAliasDraft('');
      setStatuses((prev) => ({ ...prev, [rowKey]: 'saved' }));
      router.refresh();
    } catch (err) {
      setStatuses((prev) => ({ ...prev, [rowKey]: 'error' }));
      setErrors((prev) => ({
        ...prev,
        [rowKey]: err instanceof Error ? err.message : 'Could not save alias.',
      }));
    }
  }

  function cancelRename() {
    setRenamingFor(null);
    setRenameDraft('');
  }

  /**
   * Renames a player by pointing their current name at the new one — the same
   * alias write as above, read the other way round. Everything the old name
   * touched follows: stats from every tournament, the player page, Set Ranks
   * and the bot/override row all move, and the old name stays resolvable as an
   * alias (so links to it and past rosters still land on the right person).
   *
   * A new name that already belongs to somebody else's row is refused rather
   * than merged: that is a different operation, it isn't reversible, and the
   * Aliases "+" is the control that says "these two are the same person" on
   * purpose.
   */
  function commitRename(uname: string, rowKey: string) {
    const next = renameDraft.trim();
    // Only an unchanged name is a no-op. A change of casing is a real rename —
    // the displayed spelling is exactly what the admin is correcting — so
    // "Sere" -> "sere" has to be recorded, not waved through.
    if (!next || next === uname) {
      cancelRename();
      return;
    }
    // Another *row* under the new name would merge two people, so that's
    // refused. The row itself is skipped: a case-only rename normalizes onto
    // its own key and would otherwise look like a collision with itself.
    const clash = players.find((o) => norm(o.uname) !== rowKey && norm(o.uname) === norm(next));
    if (clash) {
      setStatuses((prev) => ({ ...prev, [rowKey]: 'error' }));
      setErrors((prev) => ({
        ...prev,
        [rowKey]: `"${clash.uname}" is already a player of their own — renaming to it would merge the two. Use + in Aliases to merge them on purpose.`,
      }));
      return;
    }
    saveAlias(uname, next, rowKey);
    cancelRename();
  }

  /**
   * Removes an alias chip: the two names split back into separate players and
   * their stats separate with them. Confirmed, because the button is a small ×
   * beside a name and the consequence lands on every aggregate view at once —
   * this is the one delete in the app whose effect isn't confined to the row
   * it was clicked in.
   */
  function removeAlias(alias: string, mainName: string, rowKey: string) {
    if (
      !confirm(
        `Stop treating "${alias}" as ${mainName}?\n\n` +
          `Their tournaments split into two separate players, and the stats shown for ` +
          `${mainName} will drop to the ones recorded under that name only.`
      )
    ) {
      return;
    }
    saveAlias(alias, null, rowKey);
  }

  /**
   * Inverts one alias: the folded name becomes the main name, and the name it
   * was folded into becomes its alias. That is the way back from a rename that
   * went the wrong way — "I renamed Sere to Sere2, that was a typo, put Sere
   * back" — without deleting the history that made the rename.
   *
   * Two writes, and the order matters: dropping the old claim first leaves the
   * two names briefly *separate*, which is harmless, whereas writing the
   * reverse claim first would have them pointing at each other and every
   * lookup would have to walk a cycle until the second write landed. The
   * second write is what carries the Set Ranks and bot row onto the name that
   * is now canonical. If it fails the names are simply left split, which is
   * the state that loses nothing.
   */
  async function swapAlias(aliasName: string, mainName: string, rowKey: string) {
    // A swap reassigns which name is canonical, carrying that name's Set Ranks
    // and bot row across — so it's confirmed, even though it loses no data: the
    // point is that the admin has to notice *which* two names it applies to.
    if (
      !confirm(
        `Swap these two names?\n\n"${aliasName}" becomes the main name and ${mainName} becomes its ` +
          `alias, with their Set Ranks and bot tag following.`
      )
    ) {
      return;
    }
    setStatuses((prev) => ({ ...prev, [rowKey]: 'saving' }));
    setErrors((prev) => ({ ...prev, [rowKey]: '' }));
    const put = (alias: string, target: string | null) =>
      fetch(withBasePath('/api/admin/player-aliases'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias, target }),
      });
    try {
      const drop = await put(aliasName, null);
      if (!drop.ok) {
        const body = await drop.json().catch(() => null);
        throw new Error(body?.error ?? 'Could not un-alias that name.');
      }
      const add = await put(mainName, aliasName);
      if (!add.ok) {
        const body = await add.json().catch(() => null);
        throw new Error(body?.error ?? 'Could not swap the two names.');
      }
      setLocalAliases((prev) => {
        const copy = { ...prev };
        delete copy[norm(aliasName)];
        copy[norm(mainName)] = aliasName;
        return copy;
      });
      setStatuses((prev) => ({ ...prev, [rowKey]: 'saved' }));
      router.refresh();
    } catch (err) {
      setStatuses((prev) => ({ ...prev, [rowKey]: 'error' }));
      setErrors((prev) => ({
        ...prev,
        [rowKey]: err instanceof Error ? err.message : 'Could not swap the two names.',
      }));
    }
  }

  const filterChip = (value: Filter, label: string, count: number): React.ReactNode => (
    <button
      type="button"
      onClick={() => setFilter(value)}
      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
        filter === value
          ? 'bg-accent text-bg'
          : 'border border-border text-textMuted hover:border-textSub hover:text-text'
      }`}
    >
      {label} <span className="opacity-70">{count}</span>
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search username…"
          aria-label="Search usernames"
          className="w-56 rounded-md border border-border bg-surfaceAlt px-3 py-1.5 text-sm outline-none placeholder:text-textDim focus:border-accent"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          {filterChip('all', 'All', counts.all)}
          {filterChip('bot', 'Bot', counts.bot)}
          {filterChip('human', 'Player', counts.human)}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full border-collapse text-[0.75rem] sm:text-sm">
          <thead>
            <tr className="border-b border-border bg-surfaceAlt text-left text-[0.65rem] uppercase tracking-wide text-textMuted sm:text-xs">
              <th className="px-3 py-2 font-medium">Username</th>
              <th
                className="px-3 py-2 text-right font-medium"
                title="Tournaments this username has appeared in"
              >
                Tours
              </th>
              <th
                className="px-3 py-2 font-medium"
                title="Other names for this same player. Adding one merges them everywhere — stats, player pages, Expected Ranks, autodraft — and moves that name's Set Ranks here."
              >
                Aliases
              </th>
              <th className="px-3 py-2 text-right font-medium">Tag</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => {
              const key = norm(p.uname);
              const isBot = resolvePlayerTag(p.uname, localTags) === 'Bot';
              // No stored row means the name rule already decided — worth
              // showing, so a surprise auto-badge can be traced back to here.
              const auto = localTags[key] === undefined && isAutoBot(p.uname);
              const overridden = localTags[key] !== undefined;
              const aliasesOf = aliasesByTarget[key] ?? [];
              const status = statuses[key];
              return (
                <tr
                  key={key}
                  className={TABLE_ROW_CLASS}
                >
                  <td className="px-3 py-2 font-medium">
                    {renamingFor === key ? (
                      <input
                        autoFocus
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onBlur={cancelRename}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename(p.uname, key);
                          else if (e.key === 'Escape') cancelRename();
                        }}
                        placeholder="new username…"
                        aria-label={`Rename ${p.uname}`}
                        className="w-36 rounded border border-border bg-surfaceAlt px-1.5 py-0.5 text-xs text-text outline-none placeholder:text-textDim focus:border-accent"
                      />
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        {p.uname}
                        {/* Correcting someone's real name — they changed it, or
                            it was mistyped. The old name is kept as an alias
                            so every tournament that recorded it still lands on
                            this player. */}
                        <button
                          type="button"
                          title={`Rename ${p.uname} — the old name keeps working as an alias`}
                          aria-label={`Rename ${p.uname}`}
                          onClick={() => {
                            setRenamingFor(key);
                            setRenameDraft(p.uname);
                          }}
                          className="leading-none text-textDim transition-colors hover:text-text"
                        >
                          ✎
                        </button>
                        {auto && (
                          <span
                            className="text-[0.65rem] font-normal text-textDim"
                            title="Badged as a bot automatically because the username contains &quot;Bot&quot;"
                          >
                            auto
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-textMuted">{p.matchesPlayed}</td>
                  <td className="px-3 py-2">
                    <span className="flex flex-wrap items-center gap-1">
                      {aliasesOf.map((a) => (
                        <span
                          key={a}
                          className="inline-flex items-center gap-1 rounded-full border border-border bg-surfaceAlt px-1.5 py-0.5 text-[0.65rem] font-medium text-textMuted"
                        >
                          {a}
                          {/* Swap: makes this alias the main name and the
                              current main name its alias. */}
                          <button
                            type="button"
                            title={`Swap: make "${a}" the main name and ${p.uname} the alias`}
                            aria-label={`Swap ${a} and ${p.uname}`}
                            onClick={() => swapAlias(a, p.uname, key)}
                            className="cursor-pointer leading-none text-textDim hover:text-text"
                          >
                            ⇄
                          </button>
                          <button
                            type="button"
                            title={`Stop treating "${a}" as ${p.uname} — their stats split back out`}
                            aria-label={`Remove alias ${a}`}
                            onClick={() => removeAlias(a, p.uname, key)}
                            className="cursor-pointer leading-none text-textDim hover:text-taken"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      {addingFor === key ? (
                        <input
                          autoFocus
                          value={aliasDraft}
                          onChange={(e) => setAliasDraft(e.target.value)}
                          onBlur={() => {
                            setAddingFor(null);
                            setAliasDraft('');
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const draft = aliasDraft.trim();
                              if (draft) saveAlias(draft, p.uname, key);
                              else {
                                setAddingFor(null);
                                setAliasDraft('');
                              }
                            } else if (e.key === 'Escape') {
                              setAddingFor(null);
                              setAliasDraft('');
                            }
                          }}
                          placeholder="other name…"
                          aria-label={`New alias for ${p.uname}`}
                          className="w-28 rounded border border-border bg-surfaceAlt px-1.5 py-0.5 text-[0.65rem] text-text outline-none placeholder:text-textDim focus:border-accent"
                        />
                      ) : (
                        <button
                          type="button"
                          title={`Treat another name as ${p.uname}`}
                          onClick={() => {
                            setAddingFor(key);
                            setAliasDraft('');
                          }}
                          className="rounded-full border border-border px-1.5 py-0.5 text-[0.65rem] leading-none text-textDim transition-colors hover:border-textSub hover:text-text"
                        >
                          +
                        </button>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex items-center justify-end gap-1.5">
                      {status === 'saving' && (
                        <span className="text-[0.65rem] text-textDim">…</span>
                      )}
                      {status === 'saved' && (
                        <span className="text-[0.65rem] text-textDim">saved</span>
                      )}
                      {status === 'error' && (
                        <span
                          className="cursor-help text-[0.65rem] font-semibold text-taken"
                          title={errors[key] || ''}
                        >
                          !
                        </span>
                      )}
                      {overridden && (
                        <button
                          type="button"
                          title={`Forget this override and let the "Bot in the name" rule decide ${p.uname}`}
                          onClick={() => {
                            // Dropping the override hands the name back to the
                            // automatic rule, so a name like "AisuBot" reverts
                            // to being badged a bot. Cheap to redo, but the
                            // button sits beside the Bot toggle and looks like
                            // part of it, so it asks first.
                            if (!confirm(`Forget the saved tag for ${p.uname}?`)) return;
                            save(p.uname, null);
                          }}
                          className="rounded-full border border-border px-2.5 py-0.5 text-[0.65rem] font-medium text-textDim transition-colors hover:border-textSub hover:text-text"
                        >
                          auto
                        </button>
                      )}
                      <button
                        type="button"
                        title={
                          isBot
                            ? `${p.uname} shows as a bot — click to mark it as a real player (false alarm)`
                            : `Mark ${p.uname} as a bot everywhere`
                        }
                        onClick={() => save(p.uname, isBot ? 'NotBot' : 'Bot')}
                        className={`rounded-full border px-2.5 py-0.5 text-[0.65rem] font-medium transition-colors ${
                          isBot
                            ? 'border-taken/50 bg-taken/10 text-taken'
                            : 'border-border text-textMuted hover:border-textSub hover:text-text'
                        }`}
                      >
                        Bot
                      </button>
                    </span>
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-sm text-textMuted">
                  {players.length === 0
                    ? 'No usernames yet — upload a tournament first.'
                    : 'No usernames match this filter.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
