'use client';

import { useMemo, useState } from 'react';
import { parsePlayerList, parseRankList } from '@/lib/teams';
import { balanceTeams, mergeHiddenRanks, type DraftPlayer, type TeamDraft } from '@/lib/balance';
import { VALID_TEAM_COUNTS } from '@/lib/schedule';

const norm = (s: string) => s.toLowerCase().trim();

/**
 * Auto-draft helper for the Teams box. The host pastes the `players.txt`
 * list (names, optionally with their letter tier) and, if needed, the
 * `ranks.txt` table ("rank: players"), then picks one of the balanced splits
 * the partitioner finds — the same workflow as the host scripts, except the
 * result is written straight back into the Teams box.
 *
 * `savedRanks` is the admin's Set Ranks for the tournament's current gamemode
 * + sub-mode (see the Player Manager / listSetRanks). Those ranks are applied
 * underneath anything pasted into the ranks box, so drafting normally needs
 * only the players list: every name with a saved Set Rank is picked up
 * automatically, while a pasted entry still overrides it for one-off cases.
 *
 * `onApply` receives the team arrays plus a normalized-name -> rank map so
 * the caller can emit the annotated "Name (rank) ... = total" format the
 * rest of the app already parses (which is also how the ranks get saved).
 */
export default function TeamDrafter({
  onApply,
  savedRanks,
  savedRanksLabel,
}: {
  onApply: (teams: string[][], ranks: Record<string, number>) => void;
  savedRanks?: Record<string, number> | null;
  savedRanksLabel?: string;
}) {
  const [playersText, setPlayersText] = useState('');
  const [ranksText, setRanksText] = useState('');
  const [teamSize, setTeamSize] = useState(3);
  const [drafts, setDrafts] = useState<TeamDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<number | null>(null);

  const listed = useMemo(() => parsePlayerList(playersText), [playersText]);
  const rankList = useMemo(() => parseRankList(ranksText), [ranksText]);
  // Pasted ranks win; the saved Set Ranks fill in everyone the box didn't
  // cover. Set Ranks for names not in this roster are ignored (see
  // mergeHiddenRanks), so only listed players can enter the draft.
  const ranks = useMemo(
    () => mergeHiddenRanks(listed, rankList.ranks, savedRanks),
    [listed, rankList, savedRanks]
  );

  const { ranked, unranked, unsupported, fromSaved } = useMemo(() => {
    const ranked: DraftPlayer[] = [];
    const unranked: string[] = [];
    const unsupported: string[] = [];
    const fromSaved: string[] = [];
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
      if (rank === undefined) unranked.push(label);
      else {
        ranked.push({ name: player.name, rank, grade: player.grade });
        if (rankList.ranks[key] === undefined) fromSaved.push(player.name);
      }
    }
    return { ranked, unranked, unsupported, fromSaved };
  }, [listed, ranks, rankList]);

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
      setError('Paste a players list and a ranks table first.');
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
          (paste a players list, then pick a balanced split)
        </span>
      </label>

      {savedRanks ? (
        <p className="mt-1 text-[0.65rem] text-accent">
          Using the {Object.keys(savedRanks).length} saved Set Rank
          {Object.keys(savedRanks).length !== 1 ? 's' : ''}
          {savedRanksLabel ? ` for ${savedRanksLabel}` : ''} from the Player Manager — the Ranks
          box below only needs entries that should differ for this tournament.
        </p>
      ) : (
        <p className="mt-1 text-[0.65rem] text-textDim">
          No saved Set Ranks{savedRanksLabel ? ` for ${savedRanksLabel}` : ''} yet — assign them in
          the Player Manager, or paste a ranks table below.
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
            placeholder="hopefortomorrow (C-), jessmi2 (A-), JerryTheRisu (B+), Tommy (A), patt (S)"
            className="w-full resize-y rounded-md border border-border bg-surfaceAlt px-2 py-1.5 font-mono text-xs outline-none focus:border-textSub"
          />
        </div>
        <div>
          <label className="mb-1 block text-[0.65rem] uppercase tracking-wide text-textDim">
            Ranks <span className="normal-case text-textDim">(optional — overrides saved ranks)</span>
          </label>
          <textarea
            value={ranksText}
            onChange={(e) => setRanksText(e.target.value)}
            rows={3}
            spellCheck={false}
            placeholder={'12: karira\n11: patt\n10: Shirosora, shiro206, Tommy, Hyther'}
            className="w-full resize-y rounded-md border border-border bg-surfaceAlt px-2 py-1.5 font-mono text-xs outline-none focus:border-textSub"
          />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <span className="text-xs text-textMuted">
          {ranked.length} ranked player{ranked.length !== 1 ? 's' : ''}
          {ranked.length !== listed.length ? ` of ${listed.length} listed` : ''}
          {fromSaved.length > 0 && (
            <span className="text-textDim"> ({fromSaved.length} from saved Set Ranks)</span>
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

      {unranked.length > 0 && (
        <p className="mt-2 text-xs text-accent">
          No rank found for {unranked.length} player{unranked.length !== 1 ? 's' : ''}:{' '}
          {unranked.join(', ')} — left out of the draft.
        </p>
      )}
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
