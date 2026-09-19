/**
 * Balanced team drafting — a TypeScript port of the host script's
 * `bldm.py` / `NGMbalance_v3.py` partitioner. Given players with numeric
 * ranks it splits them into equal-sized teams whose rank sums sit as close
 * together as possible (minimising max(sum) − min(sum)) and returns several
 * optimal splits so the host can pick one.
 *
 * Two cooperating phases:
 *
 *   1. Multi-start local search — random snake deals, each hill-climbed with
 *      pairwise swaps. Fast and varied: it quickly lands on several distinct
 *      splits at (or near) the best spread, which is what the host actually
 *      picks from.
 *   2. Exact search — the depth-first partition walk, seeded with phase 1's
 *      spread as the incumbent so pruning bites from the first branch. It
 *      either proves optimality (harvesting more tied splits on the way) or
 *      runs out of budget trying. A branch dies when even a perfect finish
 *      can't match the incumbent, from both ends: sums only grow, the final
 *      smallest team can never exceed the average, and the current smallest
 *      team can gain at most its free slots × the largest remaining rank.
 *
 * The search exits early once the spread hits a provable floor — 0, or 1
 * when integer ranks make a dead-even tie on the average impossible — so
 * typical rosters finish in milliseconds.
 *
 * The wall-clock limit is still honoured — for a very large roster the
 * result may not be provably optimal, but it is always a valid, balanced
 * split.
 */
// Ties on the best spread are collected up to this count; the search keeps
// running past it so the incumbent spread stays correct.
const COLLECT_CAP = 2000;
// Ranks may be decimal (e.g. 1.5), making sums order-sensitive in the last
// ulp — compare spreads with a tolerance instead of ===.
const EPS = 1e-9;
// Math.random never returns 1, but an injectable random might — clamp so
// floor(r * len) stays a valid index.
const pickIndex = (r: number, len: number): number => Math.min(len - 1, Math.floor(r * len));
export interface DraftPlayer {
  name: string;
  rank: number;
  // Optional letter tier from the players list (e.g. "A-"). Display only —
  // balancing always uses the numeric rank.
  grade?: string;
}

export interface TeamDraft {
  teams: DraftPlayer[][]; // strongest team first, strongest player first within a team
  sums: number[]; // rank total per team, aligned with `teams`
  spread: number; // max(sums) − min(sums); 0 is a perfectly even split
}

export interface BalanceOptions {
  maxResults?: number; // how many optimal splits to return (default 5)
  timeLimitMs?: number; // search budget (default 1500ms)
  random?: () => number; // injectable for deterministic tests
}

export function balanceTeams(
  players: DraftPlayer[],
  teamSize: number,
  options: BalanceOptions = {}
): TeamDraft[] {
  const { maxResults = 5, timeLimitMs = 1500, random = Math.random } = options;
  const teamCount = Math.floor(players.length / teamSize);

  if (teamSize < 1 || !players.length || players.length % teamSize !== 0 || teamCount < 2) {
    return [];
  }
  if (maxResults < 1) return [];

  // Strongest first: the ordering is what makes both the greedy seed and the
  // "can this branch still win?" prune effective.
  const sorted = [...players].sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name));
  const total = sorted.reduce((sum, p) => sum + p.rank, 0);
  const average = total / teamCount;

  const deadline = Date.now() + timeLimitMs;

  // Lower bound no split can beat: 0 — unless every rank is an integer and
  // the average isn't, in which case a dead-even tie is arithmetically
  // impossible and 1 is the best anyone can do.
  const allInteger = sorted.every((p) => Number.isInteger(p.rank));
  const floorSpread = allInteger && !Number.isInteger(average) ? 1 : 0;

  const spreadOf = (sums: number[]): number => Math.max(...sums) - Math.min(...sums);
  const sumOf = (team: DraftPlayer[]): number => team.reduce((s, p) => s + p.rank, 0);
  // Teams are unordered, so several placements can describe the same split —
  // signature on the sorted member names to deduplicate.
  const signature = (teams: DraftPlayer[][]): string =>
    teams.map((team) => team.map((p) => p.name).sort().join('|')).sort().join('/');

  const collected = new Map<string, DraftPlayer[][]>();
  let bestSpread = Infinity;

  const record = (teams: DraftPlayer[][], sums: number[]): void => {
    const spread = spreadOf(sums);
    if (spread < bestSpread - EPS) {
      bestSpread = spread;
      collected.clear();
    } else if (spread > bestSpread + EPS) {
      return;
    }
    if (collected.size >= COLLECT_CAP) return;
    const sig = signature(teams);
    if (!collected.has(sig)) collected.set(sig, teams.map((team) => [...team]));
  };

  // Snake-deal into teams (0..n-1, then n-1..0): the deterministic seed uses
  // the ranked order, the randomized restarts use shuffled ones.
  const deal = (order: DraftPlayer[]): DraftPlayer[][] => {
    const bins: DraftPlayer[][] = Array.from({ length: teamCount }, () => []);
    order.forEach((player, i) => {
      const cycle = Math.floor(i / teamCount);
      const offset = i % teamCount;
      bins[cycle % 2 === 0 ? offset : teamCount - 1 - offset].push(player);
    });
    return bins;
  };

  const seedTeams = deal(sorted);
  record(seedTeams, seedTeams.map(sumOf));

  // ---- phase 1: multi-start local search --------------------------------
  // Random snake deals, each hill-climbed with the best pairwise swap until
  // nothing improves. Fast and varied: this stocks the host's list of
  // candidate splits, and its best spread seeds phase 2's incumbent.
  const enough = (): boolean =>
    bestSpread <= floorSpread + EPS && collected.size >= maxResults;
  const phaseADeadline = Math.min(deadline, Date.now() + Math.max(60, Math.round(timeLimitMs / 4)));
  let stalled = 0;
  while (!enough() && stalled < 400 && Date.now() < phaseADeadline) {
    const order = [...sorted];
    for (let i = order.length - 1; i > 0; i--) {
      const j = pickIndex(random(), i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }
    const teams = deal(order);
    const sums = teams.map(sumOf);

    // Steepest descent over pairwise swaps (the only moves that keep
    // equal-sized teams valid): apply the best swap until none improves.
    for (;;) {
      let swapI = -1;
      let swapJ = -1;
      let swapA: DraftPlayer | null = null;
      let swapB: DraftPlayer | null = null;
      let bestNew = spreadOf(sums);
      for (let i = 0; i < teamCount; i++) {
        for (let j = i + 1; j < teamCount; j++) {
          for (const a of teams[i]) {
            for (const b of teams[j]) {
              const si = sums[i] - a.rank + b.rank;
              const sj = sums[j] - b.rank + a.rank;
              let lo = si;
              let hi = sj;
              if (hi < lo) [lo, hi] = [hi, lo];
              let max = hi;
              let min = lo;
              for (let k = 0; k < teamCount; k++) {
                if (k === i || k === j) continue;
                if (sums[k] > max) max = sums[k];
                if (sums[k] < min) min = sums[k];
              }
              if (max - min < bestNew - EPS) {
                bestNew = max - min;
                swapI = i;
                swapJ = j;
                swapA = a;
                swapB = b;
              }
            }
          }
        }
      }
      if (swapA === null || swapB === null) break;
      const ia = teams[swapI].indexOf(swapA);
      const ib = teams[swapJ].indexOf(swapB);
      teams[swapI][ia] = swapB;
      teams[swapJ][ib] = swapA;
      sums[swapI] += swapB.rank - swapA.rank;
      sums[swapJ] += swapA.rank - swapB.rank;
    }

    const prevBest = bestSpread;
    const prevSize = collected.size;
    record(teams, sums);
    if (collected.size === prevSize && bestSpread >= prevBest - EPS) stalled++;
    else stalled = 0;
  }

  // ---- phase 2: exact search, seeded with the incumbent ------------------
  // Walks every partition the prunes don't kill. If phase 1 already reached
  // a provable floor with enough variety, this is skipped entirely.
  if (!enough()) {
    const bins: DraftPlayer[][] = Array.from({ length: teamCount }, () => []);
    const sums = new Array<number>(teamCount).fill(0);

    const search = (index: number): void => {
      if (enough()) return;
      if (index === sorted.length) {
        record(bins, sums);
        return;
      }
      // Even a perfect finish can't beat (or tie) the incumbent: the final
      // largest team is at least the current one, and the final smallest can
      // never exceed the average.
      const maxSum = Math.max(...sums);
      if (maxSum - average > bestSpread + EPS) return;

      // Symmetric bound from below: the smallest team can gain at most its
      // free slots × the largest remaining rank (players arrive
      // strongest-first, so sorted[index] is the largest one left).
      const minSum = Math.min(...sums);
      let freeSlots = Infinity;
      for (let b = 0; b < teamCount; b++) {
        if (sums[b] <= minSum + EPS) freeSlots = Math.min(freeSlots, teamSize - bins[b].length);
      }
      const smallestPossible =
        freeSlots === 0 ? minSum : minSum + freeSlots * sorted[index].rank;
      if (maxSum - smallestPossible > bestSpread + EPS) return;

      const player = sorted[index];
      for (let b = 0; b < teamCount; b++) {
        if (bins[b].length === teamSize) continue;
        if (b > 0 && bins[b - 1].length === 0) break; // keep bins packed left-to-right
        bins[b].push(player);
        sums[b] += player.rank;
        search(index + 1);
        sums[b] -= player.rank;
        bins[b].pop();
        if (Date.now() > deadline) return;
      }
    };

    search(0);
  }

  const toDraft = (teams: DraftPlayer[][]): TeamDraft => {
    // Normalise the presentation: strongest team first, and within each team
    // players strongest-first (the local-search bins aren't ordered).
    const withSums = teams.map((team) => {
      const ordered = [...team].sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name));
      return { team: ordered, sum: ordered.reduce((s, p) => s + p.rank, 0) };
    });
    withSums.sort((a, b) => b.sum - a.sum);
    const orderedSums = withSums.map((w) => w.sum);
    return {
      teams: withSums.map((w) => w.team),
      sums: orderedSums,
      spread: orderedSums[0] - orderedSums[orderedSums.length - 1],
    };
  };

  // `collected` is already deduplicated by split signature (teams are
  // unordered). Sample without replacement so generating again offers
  // different splits — the host script prints random choices the same way.
  const pool = [...collected.values()];
  const picked: DraftPlayer[][][] = [];
  while (pool.length && picked.length < maxResults) {
    picked.push(...pool.splice(pickIndex(random(), pool.length), 1));
  }

  return picked.map(toDraft);
}
