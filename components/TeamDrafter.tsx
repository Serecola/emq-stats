'use client';

import { useMemo, useState } from 'react';
import { parsePlayerList, parseRankList, roundToTenth } from '@/lib/teams';
import { balanceTeams, mergeHiddenRanks, type DraftPlayer, type TeamDraft } from '@/lib/balance';
import {
  ROUNDS_MAX,
  ROUNDS_MIN,
  isValidCycles,
  resolveCycles,
  validTeamCountsPhrase,
} from '@/lib/format';

const norm = (s: string) => s.toLowerCase().trim();

/**
 * `roundToTenth` over a whole rank table, keeping its normalized-name keys.
 * Applied to the Expected table only — it's the one layer the app derives
 * rather than the admin entering, so the only one worth rounding. Set Ranks
 * and anything typed or pasted are the admin's own numbers and are used
 * exactly as given, so the draft preview never disagrees with what's applied.
 */
const roundRanks = (ranks: Record<string, number>): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [key, rank] of Object.entries(ranks)) out[key] = roundToTenth(rank);
  return out;
};

/**
 * A team total or spread for the draft preview. Sums of tenth-valued ranks are
 * still binary floats (11.4 + 5.6 + 3.2), so the trailing noise is rounded off
 * for display; a whole number still reads as a whole number.
 */
const fmt1 = (n: number) => String(roundToTenth(n));

/**
 * Which table the autodraft balances with (the "rank source" pills):
 *
 *   - `set`      — the admin's saved Set Ranks for the tournament's gamemode
 *                  + sub-mode (default). A player without one is asked for a
 *                  rank right in the drafter, via an inline input.
 *   - `expected` — the player's Expected Rank from their last 5 tournaments
 *                  in this gamemode + sub-mode, falling back to their Set
 *                  Rank when they have no games to compute one from.
 *   - `vn`       — the player's VN-only Expected Rank from their last 5
 *                  tournaments (Mst answers only), with NO Set Rank fallback:
 *                  a player with no VN data is treated as unranked, exactly
 *                  like the old Pasted-table source treated missing players.
 */
type RankSource = 'set' | 'expected' | 'vn';

const RANK_SOURCES: { id: RankSource; label: string; hint: string }[] = [
  { id: 'set', label: 'Set Ranks', hint: 'Saved Set Ranks for this mode + sub-mode (default)' },
  {
    id: 'expected',
    label: 'Expected (last 5)',
    hint: "Each player's Expected Rank from their last 5 tournaments, falling back to their Set Rank",
  },
  {
    id: 'vn',
    label: 'Expected (VN Only)',
    hint: "Each player's VN-only Expected Rank from their last 5 tournaments (no set ranks)",
  },
];

/**
 * The format pills for a round robin: how many times every pair meets.
 * With 2 teams there is one pair, and with 3 teams every round holds all
 * three, so the same value is "Rounds N" (how many games the tournament
 * runs, 2–10) for both and the pills are replaced by a number input. For
 * team counts ≥ 3 the same Rounds-N number input is offered alongside the
 * round-robin pills, but Twice is always the default — see defaultCycles in
 * lib/format.ts.
 */
const FORMAT_OPTIONS: { cycles: 1 | 2; label: string }[] = [
  { cycles: 1, label: 'Round Robin Once' },
  { cycles: 2, label: 'Round Robin Twice' },
];

/**
 * Auto-draft helper for the Teams box. The host pastes the `players.txt`
 * list (names, optionally with their letter tier), picks which rank source
 * to balance with, then picks one of the balanced splits the partitioner
 * finds — the same workflow as the host scripts, except the result is
 * written straight back into the Teams box.
 *
 * `savedRanks` is the admin's Set Ranks, `expectedRanks` the
 * last-5-tournaments Expected Ranks, and `vnExpectedRanks` the VN-only
 * last-5-tournaments Expected Ranks for the tournament's current gamemode +
 * sub-mode (see the Player Manager / listSetRanks / listRecentExpectedRanks /
 * listRecentVnExpectedRanks).
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
  vnExpectedRanks,
  savedRanksLabel,
  cycles,
  onCyclesChange,
}: {
  onApply: (teams: string[][], ranks: Record<string, number>) => void;
  savedRanks?: Record<string, number> | null;
  expectedRanks?: Record<string, number> | null;
  // VN-only last-5 Expected Ranks for this mode + sub-mode — the
  // "Expected (VN Only)" source's base table. No Set Rank fallback comes
  // from this table; missing players are unranked, like the old
  // Pasted-table source.
  vnExpectedRanks?: Record<string, number> | null;
  savedRanksLabel?: string;
  // The tournament's format — how many times each pair of teams meets (see
  // lib/format.ts). Owned by the form (it is saved with the match, and the
  // bracket preview below the Teams box reads it too), so it arrives here as
  // a controlled value: 1 = Round Robin Once, 2 = Round Robin Twice (the
  // default), 2–10 = "Rounds N" once a draft leaves 2 teams (the lone pair's
  // games) or 3 teams (that many 3v3v3 rounds, default 5). Undefined
  // is "no explicit format yet" — the display resolves it through
  // resolveCycles, same as the schedule does.
  cycles: number | undefined;
  onCyclesChange: (cycles: number) => void;
}) {
  const [playersText, setPlayersText] = useState('');
  const [ranksText, setRanksText] = useState('');
  // Kept as the raw input string so half-typed values ("", "0") stay
  // editable; sizeCheck below decides whether the current text is a legal
  // size for the roster.
  const [teamSizeText, setTeamSizeText] = useState('3');
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
  // Which table leads and what fills a gap in it: the chosen source, plus Set
  // Ranks as the fallback under an Expected-Ranks draft (the only source with
  // one — VN Only deliberately has none, like the old Pasted-table source).
  // The Expected tables are rounded to a tenth here — the only layers the
  // app derives rather than the admin entering, so the only ones rounded.
  const layers = useMemo(() => {
    if (rankSource === 'set') return { primary: savedRanks, fallback: null };
    if (rankSource === 'expected') {
      const primary = expectedRanks ? roundRanks(expectedRanks) : null;
      return { primary, fallback: savedRanks };
    }
    if (rankSource === 'vn') {
      const primary = vnExpectedRanks ? roundRanks(vnExpectedRanks) : null;
      return { primary, fallback: null };
    }
    return { primary: null, fallback: null };
  }, [rankSource, savedRanks, expectedRanks, vnExpectedRanks]);

  // Layering of the chosen source (see mergeHiddenRanks): typed ranks win
  // over everything, then the pasted Ranks box, then the source's own table
  // (Set Ranks, Expected Ranks with Set Ranks as the fallback, or VN-only
  // Expected Ranks with no fallback).
  const ranks = useMemo(() => {
    const merged = mergeHiddenRanks(listed, rankList.ranks, layers.primary, layers.fallback);
    for (const player of listed) {
      const key = norm(player.name);
      const typed = typedRanks[key];
      if (typed !== undefined) merged[key] = typed;
    }
    return merged;
  }, [listed, rankList, typedRanks, layers]);

  const { ranked, unranked, unsupported, counts } = useMemo(() => {
    const ranked: DraftPlayer[] = [];
    // Players the chosen source couldn't rank — each one gets an inline
    // input below so the admin can be asked for a rank right here.
    const unranked: { key: string; label: string }[] = [];
    const unsupported: string[] = [];
    // Which merge layer each ranked player's rank came from (mirrors the
    // priority in `ranks` above), for the summary next to the player count.
    const counts = { pasted: 0, primary: 0, fallback: 0, typed: 0 };
    const { primary, fallback } = layers;
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
  }, [listed, ranks, typedRanks, rankList, layers]);

  const summaryBits = useMemo(() => {
    const bits: string[] = [];
    if (counts.pasted) bits.push(`${counts.pasted} pasted`);
    if (counts.primary)
      bits.push(
        rankSource === 'expected'
          ? `${counts.primary} expected`
          : rankSource === 'vn'
            ? `${counts.primary} VN expected`
            : `${counts.primary} from Set Ranks`
      );
    if (counts.fallback) bits.push(`${counts.fallback} from Set Ranks`);
    if (counts.typed) bits.push(`${counts.typed} typed below`);
    return bits;
  }, [counts, rankSource]);

  // The team size is a free input rather than a menu of presets: a legal
  // size divides the ranked player count exactly AND leaves a playable team
  // count — any even number, plus exactly 3 for the 3v3v3 format (see
  // lib/format.ts) — so every generated draft fits the bracket and the
  // format picker below. Checked live so the admin sees why a size
  // can't work the moment they type it, not only when they generate.
  const sizeCheck = useMemo(() => {
    const n = ranked.length;
    const text = teamSizeText.trim();
    const size = Number(text);
    if (!text || !Number.isInteger(size) || size < 1) {
      return { ok: false as const, size: null, teams: null, reason: 'Enter a team size.' };
    }
    if (n % size !== 0) {
      return {
        ok: false as const,
        size,
        teams: null,
        reason: `${n} player${n !== 1 ? 's' : ''} don't divide evenly into teams of ${size}.`,
      };
    }
    const teams = n / size;
    if (teams < 2) {
      return {
        ok: false as const,
        size,
        teams,
        reason: 'A tournament needs at least 2 teams — try a smaller size.',
      };
    }
    if (teams !== 3 && teams % 2 !== 0) {
      return {
        ok: false as const,
        size,
        teams,
        reason: `${teams} teams is odd — the team count must be even (or exactly 3 for 3v3v3).`,
      };
    }
    return { ok: true as const, size, teams };
  }, [ranked.length, teamSizeText]);

  // What the format control applies to: the team count this size would
  // produce (the Teams box catches up on Apply). While the size is invalid
  // there is no count to format for, so the pills fall back to the raw
  // value's validity against a 4-team shape — display only; Generate is
  // blocked until sizeCheck passes anyway.
  const draftTeamCount = sizeCheck.ok ? sizeCheck.teams : null;
  const formatCycles = resolveCycles(draftTeamCount ?? 4, cycles);

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
    if (!sizeCheck.ok) {
      setDrafts([]);
      setError(
        `${ranked.length} ranked player${ranked.length !== 1 ? 's' : ''} can't be drafted into ` +
          `teams of ${sizeCheck.size ?? 'that size'} — a team size must divide the player count evenly ` +
          `and leave ${validTeamCountsPhrase()}. ${sizeCheck.reason}`
      );
      return;
    }
    const result = balanceTeams(ranked, sizeCheck.size);
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
      {rankSource === 'vn' &&
        (vnExpectedRanks ? (
          <p className="mt-1 text-[0.65rem] text-accent">
            Using each player&apos;s VN-only Expected Rank from their last 5
            {savedRanksLabel ? ` ${savedRanksLabel}` : ''} tournaments. No Set
            Rank fallback, so players without one are asked for a rank below.
          </p>
        ) : (
          <p className="mt-1 text-[0.65rem] text-textDim">
            No VN-only Expected Rank data{savedRanksLabel ? ` for ${savedRanksLabel}` : ''} yet —
            type a rank below for each player you want drafted.
          </p>
        ))}

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
              (optional — overrides the source above)
            </span>
          </label>
          <textarea
            value={ranksText}
            onChange={(e) => setRanksText(e.target.value)}
            rows={3}
            spellCheck={false}
            placeholder="Copypaste from Tour Sheet"
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
        <label className="flex items-center gap-1.5 text-xs text-textMuted">
          Players per team
          <input
            type="number"
            min={1}
            value={teamSizeText}
            onChange={(e) => {
              setTeamSizeText(e.target.value);
              setDrafts([]);
              setApplied(null);
            }}
            className="w-16 rounded-md border border-border bg-surfaceAlt px-2 py-1 text-xs outline-none focus:border-textSub"
          />
        </label>
        {/* Live verdict on the typed size: the team count it produces when
            legal, the reason it can't when not. */}
        {ranked.length > 0 && (
          <span className={sizeCheck.ok ? 'text-xs text-textDim' : 'text-xs text-taken'}>
            {sizeCheck.ok ? `${sizeCheck.teams} teams` : sizeCheck.reason}
          </span>
        )}
        {/* Format — how many times each pair of teams meets, saved with the
            match as its `cycles`. With 2 teams there is one pair and with 3
            teams every round holds all three, so the same value reads as
            "Rounds N" (how many games the tournament runs, 2–10) for both. */}
        <label className="flex items-center gap-1.5 text-xs text-textMuted">
          Format
          {draftTeamCount !== null && (draftTeamCount === 2 || draftTeamCount >= 3) ? (
            <span className="flex items-center gap-1.5">
              Rounds
              <input
                type="number"
                min={ROUNDS_MIN}
                max={ROUNDS_MAX}
                value={formatCycles}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  if (Number.isInteger(value)) onCyclesChange(value);
                }}
                onBlur={() => {
                  // Snap an out-of-range value (typed past the max, or left
                  // over from another team count) back to a legal one.
                  // formatCycles is already the resolved display value, so a
                  // raw pick that doesn't match it is what needs snapping.
                  if (formatCycles !== cycles) onCyclesChange(formatCycles);
                }}
                className="w-16 rounded-md border border-border bg-surfaceAlt px-2 py-1 text-xs outline-none focus:border-textSub"
              />
            </span>
          ) : (
            <span className="flex gap-1.5">
              {FORMAT_OPTIONS.map((option) => (
                <button
                  key={option.cycles}
                  type="button"
                  onClick={() => onCyclesChange(option.cycles)}
                  className={`rounded-full px-2.5 py-1 text-[0.65rem] font-medium transition-colors ${
                    formatCycles === option.cycles
                      ? 'bg-accent text-bg'
                      : 'border border-border text-textMuted hover:border-textSub hover:text-text'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </span>
          )}
        </label>
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
            {drafts.length} balanced split{drafts.length !== 1 ? 's' : ''}
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
                  {fmt1(draft.spread) === '0' ? 'perfectly even' : `spread ${fmt1(draft.spread)}`}
                </span>
              </span>
              {draft.teams.map((team, teamIndex) => (
                <span key={teamIndex} className="mt-0.5 block font-mono text-xs text-textSub">
                  {team.map((player) => `${player.name} (${player.rank})`).join(' ')}{' '}
                  <span className="text-textDim">= {fmt1(draft.sums[teamIndex])}</span>
                </span>
              ))}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
