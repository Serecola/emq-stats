import { getSongs, norm } from './stats';
import type { Match, Mode, Submode } from './types';

// Order matters — matches AnsType in the original emq-stats.py script.
// "Mst" is the main title guess (always present); the rest only show up
// in Erumode (self-answer) exports.
const ANSWER_TYPES = [
  'Mst',
  'A',
  'Mt',
  'Rigger',
  'Developer',
  'Composer',
  'Arranger',
  'Lyricist',
] as const;

export interface NgmcGuessRow {
  uname: string;
  guessRate: number; // %
  avgDiff: number; // average CorrectPercentage of songs they got right
  erigs: number; // songs only they got right (TimesCorrect === 1)
  avgOf8: number; // average # of people who also got songs they got right
  opGr: number;
  edGr: number;
  insGr: number;
  rigHits: number; // correct guesses that were on their pre-made list
  rigGr: number; // % of their on-list guesses that were correct
  rigCount: number; // total guesses that were on their pre-made list
  offlistGr: number; // % correct among guesses NOT on their pre-made list
  correct: number;
  songs: number;
  games: number;
  performance: number;
}

export interface ErumodeGuessRow {
  uname: string;
  guessRate: number; // % across all active answer types
  perType: Record<string, number>; // answer type -> guess rate %, active types only
  rigGr: number;
  rigCount: number;
  songs: number;
  games: number;
  performance: number;
}

export interface GuessRateStats {
  mode: Mode;
  activeTypes: string[]; // Erumode only — which answer types actually appear
  ngmcRows: NgmcGuessRow[];
  erumodeRows: ErumodeGuessRow[];
}

interface PlayerAccum {
  uname: string;
  songCount: [number, number, number, number]; // op, ed, ins, total
  correctCount: [number, number, number, number];
  totalDiff: number;
  totalHits: number;
  erigs: number;
  rigHits: number;
  rigCount: number;
  gameFiles: Set<string>;
  saCorrectCount: number[]; // per ANSWER_TYPES index
  saRigHits: number[]; // per ANSWER_TYPES index
}

function emptyAccum(uname: string): PlayerAccum {
  return {
    uname,
    songCount: [0, 0, 0, 0],
    correctCount: [0, 0, 0, 0],
    totalDiff: 0,
    totalHits: 0,
    erigs: 0,
    rigHits: 0,
    rigCount: 0,
    gameFiles: new Set(),
    saCorrectCount: new Array(ANSWER_TYPES.length).fill(0),
    saRigHits: new Array(ANSWER_TYPES.length).fill(0),
  };
}

// NGMC's Erig weighting and rating ceiling scale with tournament size.
// Only three breakpoints were specified (8/12/16 players); anything in
// between snaps up to the next tier, and anything above 16 uses the 16
// tier's values rather than extrapolating further.
function ngmcFactors(playerCount: number): { erigMultiplier: number; maxRating: number } {
  if (playerCount <= 8) return { erigMultiplier: 0.15, maxRating: 18 };
  if (playerCount <= 12) return { erigMultiplier: 0.2, maxRating: 20 };
  return { erigMultiplier: 0.25, maxRating: 22 };
}

/**
 * "Performance" — a single rating number distinct from Guess Rate, used
 * for cross-tournament comparison. Formula depends on mode/submode:
 *
 *   Erumode (Normal/Balanced/No Vocal): guessRate × 20
 *   Erumode Random:                     guessRate × 28
 *   NGMC:  ((guessRate × (1 − erigMultiplier)) + (erigs / 30 × erigMultiplier)) × maxRating
 *          — erigMultiplier/maxRating depend on total player count (see
 *          ngmcFactors), except NGMC Random always uses maxRating = 30.
 *          Note erigs/30 uses a fixed denominator of 30, not the player's
 *          own song count.
 *
 * guessRate is used as a fraction (0–1) here, not the 0–100 percentage
 * it's displayed as, so Performance lands in a small, comparable rating
 * range instead of the thousands.
 */
function computePerformance(
  mode: Mode,
  submode: Submode | undefined,
  guessRatePct: number,
  erigs: number,
  totalPlayers: number
): number {
  const guessRateFrac = guessRatePct / 100;

  if (mode === 'Erumode') {
    const multiplier = submode === 'Random' ? 28 : 20;
    return guessRateFrac * multiplier;
  }

  const { erigMultiplier, maxRating: tieredMaxRating } = ngmcFactors(totalPlayers);
  const maxRating = submode === 'Random' ? 30 : tieredMaxRating;
  return (guessRateFrac * (1 - erigMultiplier) + (erigs / 30) * erigMultiplier) * maxRating;
}

/**
 * Per-player accuracy/rig stats — guess rate, avg diff, erigs, rig hit
 * rate, etc. — ported from emq-stats.py. NGMC and Erumode matches use
 * different formulas (mirroring the script's `SA` vs non-`SA` branches),
 * selected by `match.mode` rather than auto-detected.
 */
export function computeGuessRateStats(
  match: Pick<Match, 'teams' | 'files' | 'mode' | 'submode'> & { renames?: Record<string, string> }
): GuessRateStats {
  const renames = match.renames ?? {};
  const resolve = (raw: string) => renames[norm(raw)] || raw;
  const isErumode = match.mode === 'Erumode';
  const totalPlayers = match.teams.flat().length;

  const players: Record<string, PlayerAccum> = {};
  const activeTypesSet = new Set<string>();

  const getAccum = (rawUsername: string) => {
    const uname = resolve(rawUsername);
    const key = norm(uname);
    if (!players[key]) players[key] = emptyAccum(uname);
    return players[key];
  };

  for (const file of match.files) {
    const songs = getSongs(file.data);

    for (const song of songs) {
      const songTypes: string[] = [];
      const sources = song?.Song?.Sources ?? [];
      for (const source of sources) {
        const t = source?.SongTypes?.[0];
        if (t && !songTypes.includes(t)) songTypes.push(t);
      }

      const pgi = song?.PlayerGuessInfos ?? {};
      const songStats = song?.Song?.Stats ?? {};

      for (const pd of Object.values(pgi) as any[]) {
        const keys = Object.keys(pd);
        if (!keys.length) continue;
        const fAT = keys[0];
        const rawUsername = pd[fAT]?.Username;
        if (!rawUsername) continue;
        const acc = getAccum(rawUsername);

        acc.songCount[3]++;
        if (songTypes.includes('OP')) acc.songCount[0]++;
        if (songTypes.includes('ED')) acc.songCount[1]++;
        if (songTypes.includes('Insert')) acc.songCount[2]++;

        if (!isErumode) {
          const mstCorrect = pd['Mst']?.IsGuessCorrect === true;
          if (mstCorrect) {
            acc.correctCount[3]++;
            if (songTypes.includes('OP')) acc.correctCount[0]++;
            if (songTypes.includes('ED')) acc.correctCount[1]++;
            if (songTypes.includes('Insert')) acc.correctCount[2]++;
            acc.totalDiff += songStats?.Mst?.CorrectPercentage ?? 0;
            acc.totalHits += song?.TimesCorrect ?? 0;
            if (song?.TimesCorrect === 1) acc.erigs++;
            if (pd['Mst']?.IsOnList) acc.rigHits++;
          }
        } else {
          for (let at = 0; at < ANSWER_TYPES.length; at++) {
            const type = ANSWER_TYPES[at];
            if (pd[type]) {
              activeTypesSet.add(type);
              if (pd[type].IsGuessCorrect) {
                acc.saCorrectCount[at]++;
                if (pd[type].IsOnList) acc.saRigHits[at]++;
              }
            }
          }
        }

        if (pd[fAT]?.IsOnList) acc.rigCount++;

        acc.gameFiles.add(file.id);
      }
    }
  }

  const activeTypes = ANSWER_TYPES.filter((t) => activeTypesSet.has(t));

  if (!isErumode) {
    const ngmcRows: NgmcGuessRow[] = Object.values(players).map((acc) => {
      const offlistSongs = acc.songCount[3] - acc.rigCount;
      const offlistCorrect = acc.correctCount[3] - acc.rigHits;
      const guessRate = acc.songCount[3] ? (100 * acc.correctCount[3]) / acc.songCount[3] : 0;
      return {
        uname: acc.uname,
        guessRate,
        avgDiff: acc.correctCount[3] ? acc.totalDiff / acc.correctCount[3] : 0,
        erigs: acc.erigs,
        avgOf8: acc.correctCount[3] ? acc.totalHits / acc.correctCount[3] : 0,
        opGr: acc.songCount[0] ? (100 * acc.correctCount[0]) / acc.songCount[0] : 0,
        edGr: acc.songCount[1] ? (100 * acc.correctCount[1]) / acc.songCount[1] : 0,
        insGr: acc.songCount[2] ? (100 * acc.correctCount[2]) / acc.songCount[2] : 0,
        rigHits: acc.rigHits,
        rigGr: acc.rigCount ? (100 * acc.rigHits) / acc.rigCount : 0,
        rigCount: acc.rigCount,
        offlistGr: offlistSongs > 0 ? (100 * offlistCorrect) / offlistSongs : 0,
        correct: acc.correctCount[3],
        songs: acc.songCount[3],
        games: acc.gameFiles.size,
        performance: computePerformance(
          'NGMC',
          match.submode,
          guessRate,
          acc.erigs,
          totalPlayers
        ),
      };
    });
    ngmcRows.sort((a, b) => b.guessRate - a.guessRate);
    return { mode: 'NGMC', activeTypes, ngmcRows, erumodeRows: [] };
  }

  const erumodeRows: ErumodeGuessRow[] = Object.values(players).map((acc) => {
    const activeIdx = activeTypes.map((t) => ANSWER_TYPES.indexOf(t));
    const totalActiveCorrect = activeIdx.reduce((s, i) => s + acc.saCorrectCount[i], 0);
    const totalActiveRigHits = activeIdx.reduce((s, i) => s + acc.saRigHits[i], 0);
    const guessRate =
      acc.songCount[3] && activeTypes.length
        ? (100 * totalActiveCorrect) / (acc.songCount[3] * activeTypes.length)
        : 0;
    const rigGr =
      acc.rigCount && activeTypes.length
        ? (100 * totalActiveRigHits) / (acc.rigCount * activeTypes.length)
        : 0;
    const perType: Record<string, number> = {};
    for (const t of activeTypes) {
      const idx = ANSWER_TYPES.indexOf(t);
      perType[t] = acc.songCount[3] ? (100 * acc.saCorrectCount[idx]) / acc.songCount[3] : 0;
    }
    return {
      uname: acc.uname,
      guessRate,
      perType,
      rigGr,
      rigCount: acc.rigCount,
      songs: acc.songCount[3],
      games: acc.gameFiles.size,
      performance: computePerformance(
        'Erumode',
        match.submode,
        guessRate,
        0,
        totalPlayers
      ),
    };
  });
  erumodeRows.sort((a, b) => b.guessRate - a.guessRate);
  return { mode: 'Erumode', activeTypes, ngmcRows: [], erumodeRows };
}