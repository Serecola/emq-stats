import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parsePlayerList, parseRankList, teamsToBlob, parseTeamsBlob, parsePlayerRanks } = require('./.tmp-lib/teams.js');
const { balanceTeams } = require('./.tmp-lib/balance.js');

// Deterministic PRNG so the run is reproducible while still exercising the
// random restarts (a constant random would make every restart identical).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const norm = (s) => s.toLowerCase().trim();

// ---- the host's actual .txt files ----------------------------------------
const playersTxt =
  'hopefortomorrow (C-), jessmi2 (A-), JerryTheRisu (B+), BiKiNiMAN (None), Tommy (A), Serecola (B), patt (S), ivesoundfan (A), Dulcleidio (B-), AJ1703 (C), Hyther (S-), Kirivert (B+)';

const ranksTxt = `12: karira
11: patt
10: Shirosora, shiro206, Tommy, Hyther
9: Kreifish, Serecola
8: Cold, ivesoundfan, Memories
7: Aisu, tamagoyaki, JESSMI2, kariraBot
6: EternalSympathy, Zippy, JerryTheRisu, KappuChinooo, KreiBot
5: Tokufi, akaze, AJ1703, murasame, wailing, SereBot
4: Dulcleidio, Wuffles, naizuri, Jube, anb, Kirivert, MemoriesBot, ColdBot, AisuBot
3: bamboo, Orfey, Ulus, ruuka, watashi, saiyuki, hopefortomorrow, carmanhan, Seshio
2: LostPomegranate, dada38, DulcBot, Animero, Hichinoro
1: MaKo, Ephemeral, moosepi, Renzou, hirisu, cindergoat, runesy, wix, empoleon434, DuckMan, partlystatic, Kitty-tama, BiKiNiMAN`;

// ---- parsers --------------------------------------------------------------
const listed = parsePlayerList(playersTxt);
const rankList = parseRankList(ranksTxt);
console.log('parsePlayerList ->', listed.length, 'players');
console.log('  sample:', JSON.stringify(listed.slice(0, 3)));
console.log('parseRankList ->', Object.keys(rankList.ranks).length, 'names; patt =', rankList.ranks['patt'], '; hyther =', rankList.ranks['hyther']);

const ranked = listed
  .map((p) => ({ name: p.name, rank: rankList.ranks[norm(p.name)], grade: p.grade }))
  .filter((p) => p.rank !== undefined);
console.log('ranked players ->', ranked.length, '(all 12 listed have a rank:', ranked.length === listed.length, ')');
console.log('  roster:', ranked.map((p) => `${p.name}(r${p.rank}${p.grade ? `,${p.grade}` : ''})`).join(' '));
console.log('  total rank sum:', ranked.reduce((s, p) => s + p.rank, 0));

// ---- exhaustive optimum, to prove the search is actually optimal ----------
function bruteForceOptimum(players, teamCount) {
  const n = players.length;
  const size = n / teamCount;
  const ranks = players.map((p) => p.rank);
  const bins = Array.from({ length: teamCount }, () => []);
  const sums = new Array(teamCount).fill(0);
  let best = Infinity;
  const rec = (i) => {
    if (i === n) {
      const spread = Math.max(...sums) - Math.min(...sums);
      if (spread < best) best = spread;
      return;
    }
    for (let b = 0; b < teamCount; b++) {
      if (bins[b].length === size) continue;
      if (b > 0 && bins[b - 1].length === 0) break;
      bins[b].push(i);
      sums[b] += ranks[i];
      rec(i + 1);
      sums[b] -= ranks[i];
      bins[b].pop();
    }
  };
  rec(0);
  return best;
}

const optimum = bruteForceOptimum(ranked, 4);
console.log('\nbrute-force optimum spread (12 players / 4 teams):', optimum);

const t0 = Date.now();
const drafts = balanceTeams(ranked, 3, { random: mulberry32(42) });
const elapsed = Date.now() - t0;
console.log('balanceTeams ->', drafts.length, 'drafts in', elapsed, 'ms');

let structural = true;
for (const draft of drafts) {
  const names = draft.teams.flat().map((p) => p.name);
  const sumsOk = draft.teams.every((team, i) => team.reduce((s, p) => s + p.rank, 0) === draft.sums[i]);
  const ordered = draft.sums.every((s, i) => i === 0 || draft.sums[i - 1] >= s);
  const spreadOk = draft.spread === draft.sums[0] - draft.sums[draft.sums.length - 1];
  if (
    draft.teams.length !== 4 ||
    draft.teams.some((t) => t.length !== 3) ||
    new Set(names).size !== 12 ||
    !sumsOk ||
    !ordered ||
    !spreadOk
  ) {
    structural = false;
    console.log('  STRUCTURAL FAIL:', JSON.stringify(draft));
  }
}
console.log('all drafts structurally valid (4 teams x 3, all 12 once, sums correct):', structural);
console.log('all drafts optimal (spread === brute force):', drafts.every((d) => d.spread === optimum));

for (const [i, draft] of drafts.entries()) {
  console.log(`\nDraft ${i + 1}  (spread ${draft.spread})`);
  draft.teams.forEach((team, ti) => {
    console.log(
      `  ${team.map((p) => `${p.name} (${p.rank})`).join(' ')} = ${draft.sums[ti]}`
    );
  });
}

// ---- 18 players / 6 teams of 3 (the other legal tournament size) ----------
const eighteen = Object.entries(rankList.ranks)
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .slice(0, 18)
  .map(([key, rank]) => ({ name: rankList.displayNames[key], rank }));
console.log('\n--- 18-player case:', eighteen.map((p) => `${p.name}(r${p.rank})`).join(' '));

const t1 = Date.now();
const six = balanceTeams(eighteen, 3, { random: mulberry32(7) });
const elapsed6 = Date.now() - t1;
console.log('balanceTeams ->', six.length, 'drafts in', elapsed6, 'ms');
console.log('all 6 teams x 3, all 18 players once:',
  six.every(
    (d) =>
      d.teams.length === 6 &&
      d.teams.every((t) => t.length === 3) &&
      new Set(d.teams.flat().map((p) => p.name)).size === 18 &&
      d.spread === d.sums[0] - d.sums[d.sums.length - 1]
  ));
console.log('spreads:', six.map((d) => d.spread).join(', '));
console.log('distinct drafts offered to the host (>=2):', six.length >= 2, `(${six.length})`);

// Greedy snake draft as a sanity ceiling the search must not do worse than.
const snake = Array.from({ length: 6 }, () => []);
[...eighteen].sort((a, b) => b.rank - a.rank).forEach((p, i) => {
  const cycle = Math.floor(i / 6);
  snake[cycle % 2 === 0 ? i % 6 : 5 - (i % 6)].push(p);
});
const snakeSums = snake.map((t) => t.reduce((s, p) => s + p.rank, 0));
console.log('greedy snake spread:', Math.max(...snakeSums) - Math.min(...snakeSums), '(search must be <=)');
console.log('timing budget respected (<1500ms):', elapsed6 < 1500);

// ---- 24 players / 6 teams of 4 (bigger stress) ---------------------------
const twentyfour = Object.entries(rankList.ranks)
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .slice(0, 24)
  .map(([key, rank]) => ({ name: rankList.displayNames[key], rank }));
const t2 = Date.now();
const big = balanceTeams(twentyfour, 4, { random: mulberry32(99) });
const elapsed24 = Date.now() - t2;
console.log('\n--- 24-player case (6 teams of 4):', big.length, 'drafts in', elapsed24, 'ms');
console.log('spreads:', [...new Set(big.map((d) => d.spread))].join(', '));
console.log('structural (6x4, 24 players once, sums correct+ordered):', big.every((d) =>
  d.teams.length === 6 &&
  d.teams.every((t) => t.length === 4) &&
  new Set(d.teams.flat().map((p) => p.name)).size === 24 &&
  d.sums.every((s, i) => d.teams[i].reduce((x, p) => x + p.rank, 0) === s) &&
  d.sums.every((s, i) => i === 0 || d.sums[i - 1] >= s)
));

// ---- edge cases ----------------------------------------------------------
console.log('\n--- edge cases');
console.log('empty roster ->', JSON.stringify(balanceTeams([], 3)));
console.log('uneven split (13 players / 3) ->', JSON.stringify(balanceTeams(eighteen.slice(0, 13), 3)));
console.log('too few teams (6 players / 3 = 2 teams) ->', balanceTeams(eighteen.slice(0, 6), 3).length, 'drafts (allowed by lib, blocked by UI size options)');
console.log('identical ranks (12x rank 5):', JSON.stringify(balanceTeams(
  Array.from({ length: 12 }, (_, i) => ({ name: `p${i}`, rank: 5 })),
  3,
  { random: () => 0 }
).map((d) => d.spread)));
// ---- round-trip through the Teams box format ------------------------------
const first = drafts[0];
const rankMap = {};
for (const team of first.teams) for (const p of team) rankMap[norm(p.name)] = p.rank;
const blob = teamsToBlob(first.teams.map((t) => t.map((p) => p.name)), rankMap);
const reparsed = parseTeamsBlob(blob);
const reparsedRanks = parsePlayerRanks(blob);
console.log('\nteams blob:', blob);
console.log('round-trip teams:', reparsed.length, '| ranks recovered:', Object.keys(reparsedRanks).length);
console.log('round-trip matches draft:', JSON.stringify(reparsed.map((t) => [...t].sort())) === JSON.stringify(first.teams.map((t) => t.map((p) => p.name).sort())));