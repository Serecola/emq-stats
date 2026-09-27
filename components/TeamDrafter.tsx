'use client';

import { useMemo, useState } from 'react';
import { parsePlayerList, parseRankList } from '@/lib/teams';
import { balanceTeams, mergeHiddenRanks, type DraftPlayer, type TeamDraft } from '@/lib/balance';
import { VALID_TEAM_COUNTS } from '@/lib/schedule';

const norm = (s: string) => s.toLowerCase().trim();

/**
 * Which table the autodraft balances with (the "rank source" pills):
 *
 *   - `set`      — the admin's saved Set Ranks for the tournament's gamemode
 *                  + sub-mode (default). A player without one is asked for a
 *                  rank right in the drafter, via an inline input.
 *   - `expected` — the player's Expected Rank from their last 5 tournaments
 *                  in this gamemode + sub-mode, falling back to their Set
 *                  Rank when they have no games to compute one from.
 *   - `pasted`   — only the table pasted into the Ranks box, in
 *                  "11: karira, patt" format.
 */
type RankSource = 'set' | 'expected' | 'pasted';

const RANK_SOURCES: { id: RankSource; label: string; hint: string }[] = [
  { id: 'set', label: 'Set Ranks', hint: 'Saved Set Ranks for this mode + sub-mode (default)' },
  {
    id: 'expected',
    label: 'Expected (last 5)',
    hint: "Each player's Expected Rank from their last 5 tournaments, falling back to their Set Rank",
  },
  { id: 'pasted', label: 'Pasted table', hint: 'Only the rank table pasted into the Ranks box' },
];

/**
 * Auto-draft helper for the Teams box. The host pastes the `players.txt`
 * list (names, optionally with their letter tier), picks which rank source
 * to balance with, then picks one of the balanced splits the partitioner
 * finds — the same workflow as the host scripts, except the result is
 * written straight back into the Teams box.
 *
 * `savedRanks` is the admin's Set Ranks and `expectedRanks` the
 * last-5-tournaments Expected Ranks for the tournament's current gamemode +
 * sub-mode (see the Player Manager / listSetRanks / listRecentExpectedRanks).
 * Which table leads is the rank-source choice above the players box; either
 * way the Ranks box pastes on top as a one-off override, and a player the
 * chosen source can't rank is shown with an inline input so the admin can
 * type a rank for the draft (save it in the Player Manager to keep it).
 *
 * `onApply` receives the team arrays plus a normalized-name -> rank map so
 * the caller can emit the annotated "Name (rank) ... = total" format the
 * rest of the app already parses (which is also how the ranks get saved).
 */
export default function TeamDrafter({
  onApply,
  savedRanks,
  expectedRanks,
  savedRanksLabel,
}: {
  onApply: (teams: string[][], ranks: Record<string, number>) => void;
  savedRanks?: Record<string, number> | null;
  expectedRanks?: Record<string, number> | null;
  savedRanksLabel?: string;
}) {
  const [playersText, setPlayersText] = useState('');
  const [ranksText, setRanksText] = useState('');
  const [teamSize, setTeamSize] = useState(3);
  const [drafts, setDrafts] = useState<TeamDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<number | null>(null);
  // Which table the draft reads underneath the Ranks box; see RankSource.
  const [rankSource, setRankSource] = useState<RankSource>('set');
  // Ranks typed next to a player the chosen source couldn't rank, keyed by
  // normalized name and kept as the raw input string while being edited.
  const [manualRanks, setManualRanks] = useState<Record<string, string>>({});

  const listed = useMemo(() => parsePlayerList(playersText), [playersText]);
  const rankList = useMemo(() => parseRankList(ranksText), [ranksText]);
  // Only valid numbers count as typed — an in-progress entry like "1." just
  // leaves the player unranked (and their input flagged) for the moment.
  const typedRanks = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [key, raw] of Object.entries(manualRanks)) {
      const text = raw.trim();
      if (!text) continue;
      const value = Number(text);
      if (Number.isFinite(value) && value >= 0) out[key] = value;
    }
    return out;
  }, [manualRanks]);
  // Layering of the chosen source (see mergeHiddenRanks): typed ranks win
  // over everything, then the pasted Ranks box, then the source's own table
  // (Set Ranks, or Expected Ranks with Set Ranks as the fallback).
  const ranks = useMemo(() => {
    const primary =
      rankSource === 'set' ? savedRanks : rankSource === 'expected' ? expectedRanks : null;
    const fallback = rankSource === 'expected' ? savedRanks : null;
    const merged = mergeHiddenRanks(listed, rankList.ranks, primary, fallback);
    for (const player of listed) {
      const key = norm(player.name);
      const typed = typedRanks[key];
      if (typed !== undefined) merged[key] = typed;
    }
    return merged;
  }, [listed, rankList, typedRanks, rankSource, savedRanks, expectedRanks]);

  const { ranked, unranked, unsupported, counts } = useMemo(() => {
    const ranked: DraftPlayer[] = [];
    // Players the chosen source couldn't rank — each one gets an inline
    // input below so the admin can be asked for a rank right here.
    const unranked: { key: string; label: string }[] = [];
    const unsupported: string[] = [];
    // Which merge layer each ranked player's rank came from (mirrors the
    // priority in `ranks` above), for the summary next to the player count.
    const counts = { pasted: 0, primary: 0, fallback: 0, typed: 0 };
    const primary =
      rankSource === 'set' ? savedRanks : rankSource === 'expected' ? expectedRanks : null;
    const fallback = rankSource === 'expected' ? savedRanks : null;
    for (const player of listed) {
      const label = player.grade ? `${player.name} (${player.grade})` : player.name;
      // The Teams box is whitespace-delimited ("Name (rank) ..."), so a name
      // containing spaces can't survive the round-trip through it.
      if (/\s/.test(player.name)) {
        unsupported.push(label);
        continue;
      }
      const key = norm(player.name);
      const rank = ranks[key];
      if (rank === undefined) {
        unranked.push({ key, label });
        continue;
      }
      ranked.push({ name: player.name, rank, grade: player.grade });
      if (typedRanks[key] !== undefined) counts.typed++;
      else if (rankList.ranks[key] !== undefined) counts.pasted++;
      else if (primary && primary[key] !== undefined) counts.primary++;
      else if (fallback && fallback[key] !== undefined) counts.fallback++;
    }
    return { ranked, unranked, unsupported, counts };
  }, [listed, ranks, typedRanks, rankList, rankSource, savedRanks, expectedRanks]);

  const summaryBits = useMemo(() => {
    const bits: string[] = [];
    if (counts.pasted) bits.push(`${counts.pasted} pasted`);
    if (counts.primary)
      bits.push(rankSource === 'expected' ? `${counts.primary} expected` : `${counts.primary} from Set Ranks`);
    if (counts.fallback) bits.push(`${counts.fallback} from Set Ranks`);
    if (counts.typed) bits.push(`${counts.typed} typed below`);
    return bits;
  }, [counts, rankSource]);

  // Offer only the team sizes that actually split this roster into a legal
  // tournament (4 or 6 teams), so a generated draft always fits the bracket.
  const sizeOptions = useMemo(() => {
    const sizes: number[] = [];
    for (let size = 2; size <= ranked.length; size++) {
      const teams = ranked.length / size;
      if (Number.isInteger(teams) && (VALID_TEAM_COUNTS as readonly number[]).includes(teams)) {
        sizes.push(size);
      }
    }
    return sizes;
  }, [ranked.length]);

  const effectiveSize = sizeOptions.includes(teamSize) ? teamSize : sizeOptions[0] ?? 0;

  function generate() {
    setApplied(null);
    setError(null);
    if (!ranked.length) {
      setDrafts([]);
      setError(
        !listed.length
          ? 'Paste a players list first.'
          : unsupported.length === listed.length
            ? 'Every listed name contains spaces, which the Teams box can\u2019t represent.'
            : 'No player has a rank yet — type one next to each player below, or fill the Ranks box.'
      );
      return;
    }
    if (!effectiveSize) {
      setDrafts([]);
      setError(
        `${ranked.length} ranked player${ranked.length !== 1 ? 's' : ''} can't be split into ` +
          `${VALID_TEAM_COUNTS.join(' or ')} equal teams — a tournament needs exactly 4 or 6 teams.`
      );
      return;
    }
    const result = balanceTeams(ranked, effectiveSize);
    setDrafts(result);
    if (!result.length) setError('Could not find a balanced split for that roster.');
  }

  function apply(draft: TeamDraft, index: number) {
    const ranks: Record<string, number> = {};
    for (const team of draft.teams) for (const player of team) ranks[norm(player.name)] = player.rank;
    setApplied(index);
    onApply(
      draft.teams.map((team) => team.map((player) => player.name)),
      ranks
    );
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <label className="block text-xs font-medium text-textMuted">
        Auto-draft teams{' '}
        <span className="text-textDim">
          (paste a players list, pick a rank source, then pick a balanced split)
        </span>
      </label>

      {/* Rank source — which table the balance reads underneath the Ranks
          box. Pills match the Paste/Auto-draft toggle in MatchForm. */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-textMuted">Rank source</span>
        {RANK_SOURCES.map((source) => (
          <button
            key={source.id}
            type="button"
            title={source.hint}
            onClick={() => {
              setRankSource(source.id);
              setDrafts([]);
              setApplied(null);
            }}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              rankSource === source.id
                ? 'bg-accent text-bg'
                : 'border border-border text-textMuted hover:border-textSub hover:text-text'
            }`}
          >
            {source.label}
          </button>
        ))}
      </div>

      {rankSource === 'set' &&
        (savedRanks ? (
          <p className="mt-1 text-[0.65rem] text-accent">
            Using the {Object.keys(savedRanks).length} saved Set Rank
            {Object.keys(savedRanks).length !== 1 ? 's' : ''}
            {savedRanksLabel ? ` for ${savedRanksLabel}` : ''} from the Player Manager — players
            without one are asked for a rank below.
          </p>
        ) : (
          <p className="mt-1 text-[0.65rem] text-textDim">
            No saved Set Ranks{savedRanksLabel ? ` for ${savedRanksLabel}` : ''} yet — assign them
            in the Player Manager, type them below, or paste a ranks table.
          </p>
        ))}
      {rankSource === 'expected' &&
        (expectedRanks ? (
          <p className="mt-1 text-[0.65rem] text-accent">
            Using each player&apos;s Expected Rank from their last 5
            {savedRanksLabel ? ` ${savedRanksLabel}` : ''} tournaments — anyone without one falls
            back to their Set Rank, or is asked for a rank below.
          </p>
        ) : (
          <p className="mt-1 text-[0.65rem] text-textDim">
            No Expected Rank data{savedRanksLabel ? ` for ${savedRanksLabel}` : ''} yet — falling
            back to Set Ranks, or type a rank below.
          </p>
        ))}
      {rankSource === 'pasted' && (
        <p className="mt-1 text-[0.65rem] text-textDim">
          Balancing with only the Ranks box below — paste a{' '}
          <span className="font-mono">rank: name, name</span> table, e.g.{' '}
          <span className="font-mono">11: karira, patt</span>.
        </p>
      )}

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[0.65rem] uppercase tracking-wide text-textDim">
            Players
          </label>
          <textarea
            value={playersText}
            onChange={(e) => setPlayersText(e.target.value)}
            rows={3}
            spellCheck={false}
            placeholder="Player1 (C-), Player2 (A-), Player3 (B+), Player4 (A), Player5 (S)"
            className="w-full resize-y rounded-md border border-border bg-surfaceAlt px-2 py-1.5 font-mono text-xs outline-none focus:border-textSub"
          />
        </div>
        <div>
          <label className="mb-1 block text-[0.65rem] uppercase tracking-wide text-textDim">
            Ranks{' '}
            <span className="normal-case text-textDim">
              ({rankSource === 'pasted' ? 'your rank source' : 'optional — overrides the source above'})
            </span>
          </label>
          <textarea
            value={ranksText}
            onChange={(e) => setRanksText(e.target.value)}
            rows={3}
            spellCheck={false}
            placeholder={
              rankSource === 'pasted'
                ? '11: karira, patt\n10: Shirosora, shiro206\n9: Hyther, Tommy'
                : 'Copypaste from Tour Sheet'
            }
            className="w-full resize-y rounded-md border border-border bg-surfaceAlt px-2 py-1.5 font-mono text-xs outline-none focus:border-textSub"
          />
        </div>
      </div>

      {/* Players the chosen source couldn't rank — the drafter asking the
          admin for a rank, right where the gap shows up. Draft-only: these
          feed the merge above but nothing is persisted. */}
      {unranked.length > 0 && (
        <div className="mt-2 rounded-md border border-accent/40 bg-accent/10 p-2">
          <p className="text-xs text-accent">
            {rankSource === 'set' ? 'No Set Rank' : 'No rank'} for {unranked.length} player
            {unranked.length !== 1 ? 's' : ''} — type one to include them in the draft:
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {unranked.map(({ key, label }) => {
              const raw = manualRanks[key] ?? '';
              const invalid = raw.trim() !== '' && typedRanks[key] === undefined;
              return (
                <label
                  key={key}
                  className={`flex items-center gap-1.5 rounded-md border bg-surfaceAlt px-2 py-1 text-xs ${
                    invalid ? 'border-taken' : 'border-border'
                  }`}
                >
                  <span className="text-textMuted">{label}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={raw}
                    onChange={(e) =>
                      setManualRanks((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                    placeholder="rank"
                    className="w-14 rounded border border-border bg-bg px-1.5 py-0.5 font-mono text-xs text-text outline-none focus:border-textSub"
                  />
                </label>
              );
            })}
          </div>
          <p className="mt-1 text-[0.65rem] text-textDim">
            Typed ranks are for this draft only — save a permanent Set Rank in the Player Manager.
          </p>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <span className="text-xs text-textMuted">
          {ranked.length} ranked player{ranked.length !== 1 ? 's' : ''}
          {ranked.length !== listed.length ? ` of ${listed.length} listed` : ''}
          {summaryBits.length > 0 && (
            <span className="text-textDim"> ({summaryBits.join(', ')})</span>
          )}
        </span>
        {sizeOptions.length > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-textMuted">
            Players per team
            <select
              value={effectiveSize}
              onChange={(e) => {
                setTeamSize(Number(e.target.value));
                setDrafts([]);
                setApplied(null);
              }}
              className="rounded-md border border-border bg-surfaceAlt px-2 py-1 text-xs outline-none focus:border-textSub"
            >
              {sizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size} ({ranked.length / size} teams)
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          onClick={generate}
          disabled={!ranked.length}
          className="rounded-md border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent disabled:opacity-50"
        >
          {drafts.length ? 'Regenerate' : 'Generate teams'}
        </button>
      </div>

      {unsupported.length > 0 && (
        <p className="mt-2 text-xs text-taken">
          {unsupported.length} name{unsupported.length !== 1 ? 's' : ''} contain spaces, which the
          Teams box can&apos;t represent — left out: {unsupported.join(', ')}
        </p>
      )}
      {error && <p className="mt-2 text-xs text-taken">{error}</p>}

      {drafts.length > 0 && (
        <div className="mt-2 space-y-1.5">
          <p className="text-[0.65rem] uppercase tracking-wide text-textDim">
            {drafts.length} balanced split{drafts.length !== 1 ? 's' : ''} — click one to fill the
            Teams box above
          </p>
          {drafts.map((draft, i) => (
            <button
              key={i}
              type="button"
              onClick={() => apply(draft, i)}
              className={`block w-full rounded-md border px-2.5 py-1.5 text-left transition ${
                applied === i
                  ? 'border-accent/50 bg-accent/10'
                  : 'border-border bg-surfaceAlt/40 hover:border-textSub'
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-text">
                  Draft {i + 1}
                  {applied === i && (
                    <span className="ml-1.5 font-normal text-accent">applied</span>
                  )}
                </span>
                <span className="text-[0.65rem] text-textDim">
                  {draft.spread === 0 ? 'perfectly even' : `spread ${draft.spread}`}
                </span>
              </span>
              {draft.teams.map((team, teamIndex) => (
                <span key={teamIndex} className="mt-0.5 block font-mono text-xs text-textSub">
                  {team.map((player) => `${player.name} (${player.rank})`).join(' ')}{' '}
                  <span className="text-textDim">= {draft.sums[teamIndex]}</span>
                </span>
              ))}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
