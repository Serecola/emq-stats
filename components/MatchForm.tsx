'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { nanoid } from 'nanoid';
import type { Match, MatchFile, Mode, Region, SetRanks, Submode } from '@/lib/types';
import { MODES, REGIONS, SUBMODES_BY_MODE } from '@/lib/types';
import { withBasePath } from '@/lib/base-path';
import { parseTeamsBlob, parsePlayerRanks, teamsToBlob } from '@/lib/teams';
import { savedRanksFor } from '@/lib/player-ranks';
import TeamDrafter from '@/components/TeamDrafter';
import BracketTeamRow from '@/components/BracketTeamRow';
import DownloadFilesButton from '@/components/DownloadFilesButton';
import ShareMatchLink from '@/components/ShareMatchLink';
import {
  generateRoundRobin,
  matchFilesToBracket,
  isValidTeamCount,
  exportDisplayLabel,
  fileContentSignature,
} from '@/lib/schedule';
import { formatMatchTitle } from '@/lib/match-title';
import { extractUsernames } from '@/lib/stats';

const norm = (s: string) => s.toLowerCase().trim();

type FileDraft = {
  id: string;
  label: string;
  text: string; // raw JSON text — always from a file, never hand-typed
  error: string | null;
  slot?: string; // bracket matchup this file is attached to
};

export default function MatchForm({
  existing,
  savedRanks,
  expectedRanks,
  vnExpectedRanks,
}: {
  existing?: Match;
  // The admin's Set Ranks from the Player Manager, keyed mode -> sub-mode ->
  // normalized name -> rank. The autodrafter uses the entry matching this
  // tournament's mode + sub-mode, so a draft is balanced with the ranks that
  // were assigned for the exact gamemode it's for.
  savedRanks?: SetRanks;
  // Expected Ranks from each player's last 5 tournaments (same keying) — the
  // autodrafter's "Expected (last 5)" source, with Set Ranks as the fallback
  // for players who have no recent games.
  expectedRanks?: SetRanks;
  // VN-only Expected Ranks from each player's last 5 tournaments (same
  // keying) — the autodrafter's "Expected (VN Only)" source. Unlike the
  // combined source there is no Set Rank fallback: players with no VN data
  // are treated as unranked, like the old Pasted-table source.
  vnExpectedRanks?: SetRanks;
}) {
  const router = useRouter();
  const [name, setName] = useState(existing?.name ?? '');
  const [date, setDate] = useState(existing?.date ?? '');
  const [region, setRegion] = useState<Region>(existing?.region ?? 'NA');
  // Mode/sub-mode defaults follow the gamemode priority order (Erumode first —
  // MODES in lib/types.ts), same as every other mode picker.
  const [mode, setMode] = useState<Mode>(existing?.mode ?? MODES[0]);
  const [submode, setSubmode] = useState<Submode>(
    existing?.submode ?? SUBMODES_BY_MODE[MODES[0]][0]
  );
  const [teamsText, setTeamsText] = useState(
    existing ? teamsToBlob(existing.teams, existing.playerRanks) : ''
  );
  const [files, setFiles] = useState<FileDraft[]>(() =>
    existing
      ? existing.files.map((f) => ({
          id: f.id,
          label: f.label,
          text: JSON.stringify(f.data, null, 2),
          error: null,
          slot: f.slot,
        }))
      : []
  );
  // Per-file, per-team score entry: scores[fileId][normalizedTeamLabel] = "12"
  // (kept as strings while editing; parsed to numbers on submit). Seeded
  // from any scores already saved on the match. The 0 the form assumes for a
  // blank opponent (see setScoreForSlot) is stored here as a plain "0" like
  // any typed number — what's in these boxes is what gets saved.
  const [scores, setScores] = useState<Record<string, Record<string, string>>>(() => {
    const initial: Record<string, Record<string, string>> = {};
    if (existing) {
      for (const f of existing.files) {
        if (f.scores) {
          initial[f.id] = Object.fromEntries(
            Object.entries(f.scores).map(([k, v]) => [k, String(v)])
          );
        }
      }
    }
    return initial;
  });
  // Score entries this form filled in itself as an assumed 0 (see
  // setScoreForSlot), keyed `fileId\0teamLabel`. Tracking which zeros were
  // assumed — versus typed — is what lets clearing one side take the
  // assumption back on the other: a fixture emptied to nothing is unscored
  // again, instead of leaving a lone 0 behind that would read back as 0–0.
  const assumedZerosRef = useRef<Set<string>>(new Set());
  const [renames, setRenames] = useState<Record<string, string>>(existing?.renames ?? {});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [teamSource, setTeamSource] = useState<'paste' | 'draft'>('paste');
  // Which team's cells the bracket highlights right now, or null when the
  // pointer is off it — same behaviour as the read-only bracket on the match
  // page, so one squad's whole set of games can be read off either view.
  const [hoveredTeam, setHoveredTeam] = useState<number | null>(null);
  // Match box the pointer is currently dragging a file over — its card
  // highlights so it's obvious where the drop will land (null = nowhere).
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);

  const parsedTeams = useMemo(() => parseTeamsBlob(teamsText), [teamsText]);
  // Merge over any existing ranks so re-saving without re-annotating the
  // roster doesn't silently wipe out ranks that were set previously.
  const parsedPlayerRanks = useMemo(() => {
    const fresh = parsePlayerRanks(teamsText);
    return { ...(existing?.playerRanks ?? {}), ...fresh };
  }, [teamsText, existing]);
  const rosterNames = useMemo(() => parsedTeams.flat(), [parsedTeams]);
  const rosterSetNorm = useMemo(() => new Set(rosterNames.map(norm)), [rosterNames]);
  const previewTitle = useMemo(
    () => (date && name.trim() ? formatMatchTitle(date, region, mode, submode, name) : ''),
    [date, region, mode, submode, name]
  );

  // Auto-draft is a creation-time tool: it replaces the whole roster, and a
  // tournament that already has uploads can't survive that — every entered
  // score is keyed to its team label (the team's first player, see
  // lib/results.ts), so freshly drafted teams leave those scores orphaned.
  // Targeted edits are fine; wholesale replacement is not, so the drafter
  // (and its toggle) only appears while there is nothing to lose.
  const canRedraft = !existing || existing.files.length === 0;

  // Whether this edit changes a team *label* (its first player), the one kind
  // of roster change that can detach scores already entered. Renaming or
  // reordering a member further down a team is harmless.
  const renamedTeamLabels = useMemo(() => {
    if (!existing) return false;
    const labels = (teams: string[][]) => teams.map((t) => norm(t[0] ?? '')).join('|');
    return labels(existing.teams) !== labels(parsedTeams);
  }, [existing, parsedTeams]);
  const scoredFileCount =
    existing?.files.filter((f) => f.scores && Object.keys(f.scores).length > 0).length ?? 0;

  // Autogenerated fixture bracket for the current roster.
  const rounds = useMemo(() => generateRoundRobin(parsedTeams), [parsedTeams]);

  // Drafts as MatchFile-shaped objects so the shared matcher can bind them
  // to bracket slots (explicit slot first, then by detected participants).
  const filesForMatch = useMemo<MatchFile[]>(
    () =>
      files.map((f) => {
        let data: unknown = {};
        if (f.text.trim()) {
          try {
            data = JSON.parse(f.text);
          } catch {
            data = {};
          }
        }
        return { id: f.id, label: f.label, data, slot: f.slot };
      }),
    [files]
  );

  const assignment = useMemo(
    () => matchFilesToBracket(parsedTeams, filesForMatch, renames),
    [parsedTeams, filesForMatch, renames]
  );
  const draftById = useMemo(() => new Map(files.map((f) => [f.id, f])), [files]);

  // Parse every file's JSON once per render pass for the rename panel, and
  // fingerprint it in the same pass for the duplicate check below — an export
  // is ~100 kB, so parsing the whole set twice per render isn't worth it.
  const parsedDrafts = useMemo(() => {
    const data: Record<string, unknown> = {};
    const signatures: Record<string, string> = {};
    for (const f of files) {
      if (!f.text.trim()) continue;
      try {
        const parsed = JSON.parse(f.text);
        data[f.id] = parsed;
        signatures[f.id] = fileContentSignature(parsed);
      } catch {
        // Invalid JSON is surfaced separately at submit time.
      }
    }
    return { data, signatures };
  }, [files]);

  // Drafts holding the same game as an earlier draft. One export is one game,
  // so a byte-identical copy is never legitimate — it would be counted twice
  // in every aggregate that walks `files` (and in the tournament's own
  // games-played count), and `matchFilesToBracket` would place it on the pair's
  // *other* fixture, passing it off as the rematch leg.
  //
  // Grouped rather than listed flat so the panel can name the original the
  // copies duplicate, and so removing the first copy of a group promotes the
  // next one instead of leaving a duplicate behind. Drafts with no signature
  // (empty score placeholders, unparseable text) can't be compared and are
  // left out.
  const duplicateGroups = useMemo(() => {
    const bySignature = new Map<string, string[]>();
    for (const f of files) {
      const sig = parsedDrafts.signatures[f.id];
      if (!sig) continue;
      const group = bySignature.get(sig);
      if (group) group.push(f.id);
      else bySignature.set(sig, [f.id]);
    }
    return [...bySignature.values()]
      .filter((ids) => ids.length > 1)
      .map((ids) => ({
        // First one wins the slot; the rest are the copies.
        original: draftById.get(ids[0])!,
        copies: ids.slice(1).map((id) => draftById.get(id)!),
      }));
  }, [files, parsedDrafts.signatures, draftById]);

  const duplicateIds = useMemo(
    () => new Set(duplicateGroups.flatMap((g) => g.copies.map((c) => c.id))),
    [duplicateGroups]
  );

  // Every username, across every uploaded file, that doesn't match anyone
  // in the pasted roster. Computed from the raw JSON only (not affected by
  // renames already chosen) so an entry never disappears once you've fixed
  // it — it just shows its current mapping and stays editable.
  const unmatchedNames = useMemo(() => {
    if (rosterNames.length === 0) return [];
    const firstSeen = new Map<string, string>();
    for (const data of Object.values(parsedDrafts.data)) {
      for (const u of extractUsernames(data)) {
        const key = norm(u);
        if (!rosterSetNorm.has(key) && !firstSeen.has(key)) firstSeen.set(key, u);
      }
    }
    return [...firstSeen.entries()]; // [normalizedKey, rawName][]
  }, [parsedDrafts, rosterNames, rosterSetNorm]);

  function setRename(oldNameNorm: string, newName: string) {
    setRenames((prev) => {
      const next = { ...prev };
      if (newName) next[oldNameNorm] = newName;
      else delete next[oldNameNorm];
      return next;
    });
  }

  // Single intake for every upload path — a match box's file picker, a drop
  // on a match box, the batch picker, a drop on the bracket. `slot` pins the
  // first file to that fixture; everything else is added slot-less so the
  // participant matcher can place it (see matchFilesToBracket).
  async function intake(fileList: FileList | null, slot?: string) {
    if (!fileList || fileList.length === 0) return;
    // The pickers' accept attribute guards them; drops need it right here.
    const jsons = Array.from(fileList).filter((f) => /\.json$/i.test(f.name));
    if (jsons.length === 0) {
      setFormError('Only .json song-history exports can be attached.');
      return;
    }
    setFormError(null);
    const entries = await Promise.all(
      jsons.map(async (f) => ({
        // The upload keeps its own name verbatim, prefix and all (minus the
        // extension): that name *is* the file, so it's what a download hands
        // back and what the bracket reads a pair's two legs' play time out of
        // (see exportTimestamp). The prefix is hidden when rendered instead
        // (see exportDisplayLabel).
        name: f.name.replace(/\.json$/i, ''),
        text: await f.text(),
      }))
    );
    addUploads(entries, slot);
  }

  // Adds already-read exports. With a slot, the first entry pins to that
  // fixture — replacing whatever was there and carrying over any entered
  // scores (same as the card's own picker did); the rest, or all entries
  // when no slot was given, land slot-less for the matcher to place.
  function addUploads(entries: { name: string; text: string }[], slot?: string) {
    if (entries.length === 0) return;
    const pinned = slot ? entries[0] : undefined;
    const loose = slot ? entries.slice(1) : entries;
    const replaced = slot ? assignment.bySlot[slot] : undefined;
    // Ids are generated up here, not inside the setFiles updater, so a
    // re-run of the updater (StrictMode) can't hand out a different one.
    const drafts: FileDraft[] = [];
    if (slot && pinned) {
      drafts.push({ id: nanoid(6), label: pinned.name, text: pinned.text, error: null, slot });
    }
    for (const e of loose) {
      drafts.push({ id: nanoid(6), label: e.name, text: e.text, error: null });
    }
    const pinnedId = slot && pinned ? drafts[0].id : undefined;

    setFiles((prev) => {
      const filtered = replaced ? prev.filter((f) => f.id !== replaced.id) : prev;
      return [...filtered, ...drafts];
    });
    if (replaced && pinnedId) {
      setScores((prev) => {
        const next = { ...prev };
        if (next[replaced.id]) {
          next[pinnedId] = next[replaced.id];
          delete next[replaced.id];
        }
        return next;
      });
      // The carried-over scores keep their assumed zeros — re-key the marks
      // to the new file id so clearing one side still revokes the other's
      // assumption under it.
      const from = `${replaced.id}\u0000`;
      for (const key of [...assumedZerosRef.current]) {
        if (key.startsWith(from)) {
          assumedZerosRef.current.delete(key);
          assumedZerosRef.current.add(`${pinnedId}\u0000${key.slice(from.length)}`);
        }
      }
    }
  }

  /**
   * Detaches one uploaded export from this tournament, along with any scores
   * entered against it. Confirmed, because the labels are truncated in the UI
   * and two exports of the same game are easy to confuse — and on an existing
   * tournament saving after this drops the file (and its scores) for good.
   */
  function removeFile(id: string, label?: string) {
    const name = label ? `"${label}"` : 'this file';
    if (
      !confirm(
        `Remove ${name}?\n\nAny scores entered against it are dropped too. ` +
          `Removing it from the list isn't saved until you save the tournament.`
      )
    ) {
      return;
    }
    setFiles((prev) => prev.filter((f) => f.id !== id));
    setScores((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  // A miss while dragging — a drop anywhere on the form that isn't a match
  // box or the bracket — must not hand the file to the browser, which would
  // navigate to the JSON and lose everything typed. Cancel the default
  // instead; the zones that accept files prevent it themselves and upload.
  function blockFileDrop(e: React.DragEvent) {
    if (Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault();
  }

  // Entering a score for a matchup that has no file yet creates a
  // placeholder file (empty JSON) so the score has somewhere to live; the
  // JSON can be attached later and the scores carry over.
  //
  // Filling one team's box assumes the opponent scored 0 — the same rule the
  // saved match reads back with (withAssumedZeroScores) — so the other box
  // takes an editable "0" as soon as a number is typed. The fixture then
  // shows its result (12–0, winner highlighted, card solid) before save, and
  // the 0 is saved explicitly instead of only being inferred on read. A
  // number already sitting in the opponent's box is never touched (the
  // assumption stands only "unless overwritten"). Typing over an assumed 0
  // makes it a typed score; clearing a side revokes an assumed 0 on the
  // other, so emptying both boxes leaves the game unscored rather than a
  // stray 0.
  function setScoreForSlot(
    slot: string,
    teamLabelNorm: string,
    opponentLabelNorm: string,
    value: string
  ) {
    const existingFile = assignment.bySlot[slot];
    let fileId = existingFile?.id;
    if (!fileId) {
      fileId = nanoid(6);
      setFiles((prev) => [...prev, { id: fileId!, label: '', text: '', error: null, slot }]);
    }
    const teamKey = `${fileId!}\u0000${teamLabelNorm}`;
    const opponentKey = `${fileId!}\u0000${opponentLabelNorm}`;
    // Whatever is typed here is the admin's own number, never an assumption.
    assumedZerosRef.current.delete(teamKey);
    const opponentBlank = (scores[fileId!]?.[opponentLabelNorm] ?? '').trim() === '';
    // Decided here, against the current render's state, so the updater below
    // stays pure — React may run it twice (StrictMode).
    let assumedFill = false;
    let assumedRevoke = false;
    if (value.trim() === '') {
      // Clearing a side takes back an assumed 0 on the other (no-op for a
      // typed 0, which is only ever removed by clearing its own box).
      assumedRevoke = assumedZerosRef.current.delete(opponentKey);
    } else if (opponentBlank) {
      assumedZerosRef.current.add(opponentKey);
      assumedFill = true;
    }
    setScores((prev) => {
      const fileScores = { ...prev[fileId!] };
      fileScores[teamLabelNorm] = value;
      if (assumedFill) fileScores[opponentLabelNorm] = '0';
      if (assumedRevoke) delete fileScores[opponentLabelNorm];
      return { ...prev, [fileId!]: fileScores };
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!date) {
      setFormError('A date is required.');
      return;
    }
    if (!name.trim()) {
      setFormError('A tournament name is required.');
      return;
    }
    if (!SUBMODES_BY_MODE[mode].includes(submode)) {
      setFormError('Pick a valid sub-mode for the selected mode.');
      return;
    }
    if (parsedTeams.length < 2) {
      setFormError('Paste at least 2 teams into the box above.');
      return;
    }
    if (!isValidTeamCount(parsedTeams.length)) {
      setFormError(`Tournaments must have exactly 4 or 6 teams (got ${parsedTeams.length}).`);
      return;
    }
    // Refuse to save a duplicate rather than silently dropping it. Silently
    // keeping the first would make the form disagree with what the admin sees,
    // and silently keeping the last could throw away entered scores — asking is
    // the only honest option, and the panel above says which file to remove.
    if (duplicateIds.size > 0) {
      setFormError(
        `Remove the duplicate upload${duplicateIds.size === 1 ? '' : 's'} listed below first — the same game attached twice is counted twice everywhere.`
      );
      return;
    }

    const parsedFiles: MatchFile[] = [];
    let hadFileError = false;

    // One file per bracket matchup, carrying its slot + scores.
    for (const round of rounds) {
      for (const m of round.matchups) {
        const file = assignment.bySlot[m.slot];
        const draft = file ? draftById.get(file.id) : undefined;
        const slotScores = file ? scores[file.id] : undefined;
        const parsedScores = slotScores
          ? Object.fromEntries(
              Object.entries(slotScores)
                .filter(([, v]) => v.trim() !== '' && !isNaN(Number(v)))
                .map(([k, v]) => [k, Number(v)])
            )
          : undefined;
        const hasScores = parsedScores && Object.keys(parsedScores).length > 0;
        if (!file && !hasScores) continue;
        let data: unknown = {};
        if (draft?.text.trim()) {
          try {
            data = JSON.parse(draft.text);
          } catch {
            hadFileError = true;
            continue;
          }
        }
        parsedFiles.push({
          id: file?.id ?? nanoid(6),
          label: draft?.label || `Round ${m.displayRound} · ${m.labelA} vs ${m.labelB}`,
          data,
          slot: m.slot,
          ...(hasScores ? { scores: parsedScores } : {}),
        });
      }
    }

    // Files that couldn't be tied to a fixture are still saved (slot-less).
    for (const f of unmatchedDrafts) {
      if (!f.text.trim()) continue;
      try {
        const data = JSON.parse(f.text);
        const fileScores = scores[f.id];
        const parsedScores = fileScores
          ? Object.fromEntries(
              Object.entries(fileScores)
                .filter(([, v]) => v.trim() !== '' && !isNaN(Number(v)))
                .map(([k, v]) => [k, Number(v)])
            )
          : undefined;
        parsedFiles.push({
          id: f.id,
          label: f.label || 'Untitled',
          data,
          ...(parsedScores && Object.keys(parsedScores).length ? { scores: parsedScores } : {}),
        });
      } catch {
        hadFileError = true;
      }
    }

    if (hadFileError) {
      setFormError('Fix the invalid JSON file(s) below.');
      return;
    }

    setSubmitting(true);
    const payload = {
      name: name.trim(),
      date,
      region,
      mode,
      submode,
      teams: parsedTeams,
      files: parsedFiles,
      renames,
      playerRanks: parsedPlayerRanks,
    };
    // withBasePath: the request carries the whole tournament (raw exports and
    // all), and a hand-built URL gets no prefix from the router — without it
    // this POST leaves the app's mount and lands on the host root.
    const res = await fetch(
      withBasePath(existing ? `/api/matches/${existing.id}` : '/api/matches'),
      {
        method: existing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );
    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      // A 413 is the proxy refusing the body on size, so the response is its
      // HTML error page rather than our JSON — say what actually went wrong
      // instead of the generic fallback the failed parse would give.
      setFormError(
        body.error ||
          (res.status === 413
            ? 'The server refused this tournament as too large (413). Raise client_max_body_size in the nginx config — see the README.'
            : 'Failed to save match.')
      );
      return;
    }
    const saved = await res.json();
    // A brand new tournament drops the admin on its own Edit screen rather
    // than the public match page: creating one is normally just the first
    // half of the job (roster + fixtures), with the game JSON attached
    // afterwards, and the edit form is where that upload lives. Re-saving an
    // existing tournament still lands on the public page, so the result of
    // the edit is visible.
    router.push(existing ? `/matches/${saved.id}` : `/admin/matches/${saved.id}/edit`);
    router.refresh();
  }

  // Unmatched drafts (files that couldn't be tied to a bracket matchup).
  const unmatchedIds = new Set(assignment.unmatched.map((f) => f.id));
  const unmatchedDrafts = files.filter((f) => unmatchedIds.has(f.id));
  const unmatchedFiles = unmatchedDrafts.filter((f) => f.text.trim());

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-6"
      onDragOver={blockFileDrop}
      onDrop={blockFileDrop}
    >
      {/* Only a saved tournament has a player-view link — a new one has no id
          to link to until it's created (and lands on this same Edit screen,
          where the section then appears). */}
      {existing && <ShareMatchLink matchId={existing.id} />}

      <div>
        <label className="mb-1 block text-xs font-medium text-textMuted">
          Tournament <span className="text-textDim">(date, region, mode, and sub-mode are mandatory)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="rounded-md border border-border bg-surfaceAlt px-3 py-2 text-sm outline-none focus:border-textSub"
          />
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value as Region)}
            required
            className="rounded-md border border-border bg-surfaceAlt px-3 py-2 text-sm outline-none focus:border-textSub"
          >
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            value={mode}
            onChange={(e) => {
              const nextMode = e.target.value as Mode;
              setMode(nextMode);
              setSubmode((prev) =>
                SUBMODES_BY_MODE[nextMode].includes(prev) ? prev : SUBMODES_BY_MODE[nextMode][0]
              );
            }}
            required
            className="rounded-md border border-border bg-surfaceAlt px-3 py-2 text-sm outline-none focus:border-textSub"
          >
            {MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={submode}
            onChange={(e) => setSubmode(e.target.value)}
            required
            className="rounded-md border border-border bg-surfaceAlt px-3 py-2 text-sm outline-none focus:border-textSub"
          >
            {SUBMODES_BY_MODE[mode].map((sm) => (
              <option key={sm} value={sm}>
                {sm}
              </option>
            ))}
          </select>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tournament name"
            required
            className="min-w-[12rem] flex-1 rounded-md border border-border bg-surfaceAlt px-3 py-2 text-sm outline-none focus:border-textSub"
          />
        </div>
        {previewTitle && (
          <p className="mt-1.5 text-xs text-textMuted">
            Will display as: <span className="font-medium text-textSub">{previewTitle}</span>
          </p>
        )}
      </div>

      {/* Teams are editable on both New and Edit: `teamsText` is seeded from the
          saved roster (see the useState above), so an admin correcting a typo or
          swapping a member re-saves the same tournament. The Auto-draft half is
          hidden once a tournament has uploads, since it replaces every team. */}
      {canRedraft && (
        <>
          {/* Segmented source toggle — "Paste teams" (the textarea) vs "Auto-draft"
              (TeamDrafter). Only one is shown at a time; the toggle itself is
              intentionally NOT reset when switching back and forth, so a drafted
              result keeps sitting in `teamsText` even while the drafter is shown. */}
          <div className="mb-2 flex items-center gap-1.5">
            {(['paste', 'draft'] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setTeamSource(opt)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  teamSource === opt
                    ? 'bg-accent text-bg'
                    : 'border border-border text-textMuted hover:border-textSub hover:text-text'
                }`}
              >
                {opt === 'paste' ? 'Paste teams' : 'Auto-draft teams'}
              </button>
            ))}
          </div>
        </>
      )}
      {(teamSource === 'paste' || !canRedraft) && (
        <div>
          <label className="mb-1 block text-xs font-medium text-textMuted">
            Teams{' '}
          </label>
          <textarea
            value={teamsText}
            onChange={(e) => setTeamsText(e.target.value)}
            placeholder={
              'Player1 (Rank) Player2 (Rank) Player3 (Rank) = RankTotal\nPlayer1 (Rank) Player2 (Rank) Player3 (Rank) = RankTotal\n'
            }
            rows={4}
            className="w-full resize-y rounded-md border border-border bg-surfaceAlt px-3 py-2 font-mono text-xs outline-none focus:border-textSub"
          />
          {parsedTeams.length > 0 && !isValidTeamCount(parsedTeams.length) && (
            <p className="mt-1 text-xs text-taken">
              Tournaments must have exactly 4 or 6 teams — currently parsing {parsedTeams.length}.
            </p>
          )}
          {parsedTeams.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {parsedTeams.map((t, i) => (
                <span
                  key={i}
                  className="rounded-full border border-border bg-surfaceAlt px-2.5 py-1 text-xs text-textSub"
                >
                  <span className="font-semibold text-text">Team {i + 1}:</span>{' '}
                  {t
                    .map((n) => {
                      const r = parsedPlayerRanks[norm(n)];
                      return r !== undefined ? `${n} (${r})` : n;
                    })
                    .join(', ')}
                </span>
              ))}
            </div>
          )}
          {teamsText.trim() && parsedTeams.length === 0 && (
            <p className="mt-1 text-xs text-taken">Couldn't parse any teams from that text.</p>
          )}
          {/* A team's first name is its label, and every entered score is keyed
              by it (lib/results.ts) — so renaming or reordering a leader silently
              detaches those scores from the standings. Warn before that's saved. */}
          {renamedTeamLabels && scoredFileCount > 0 && (
            <p className="mt-1 text-xs text-taken">
              Changing a team&apos;s first name detaches the scores already entered
              against it ({scoredFileCount} game{scoredFileCount !== 1 ? 's' : ''} affected).
              Those scores are kept, but they won&apos;t count until re-entered under the
              new label.
            </p>
          )}
        </div>
      )}
      {canRedraft && teamSource === 'draft' && (
        <TeamDrafter
          savedRanks={savedRanksFor(savedRanks ?? {}, mode, submode)}
          expectedRanks={savedRanksFor(expectedRanks ?? {}, mode, submode)}
          vnExpectedRanks={savedRanksFor(vnExpectedRanks ?? {}, mode, submode)}
          savedRanksLabel={`${mode} ${submode}`}
          onApply={(teams, ranks) => setTeamsText(teamsToBlob(teams, ranks))}
        />
      )}

      {rounds.length > 0 && (
        <div>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <label className="block text-xs font-medium text-textMuted">
              Bracket{' '}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {/* Batch upload: several exports in one go, each matched to a
                  fixture by the players detected in its JSON. Two games that
                  share a pair (double round robin) are split across that
                  pair's two fixtures in play-time order — see
                  matchFilesToBracket. */}
              <label
                title="Pick several .json exports; each one is matched to a fixture by the players in it"
                className="cursor-pointer rounded-md border border-border px-2 py-1 text-[0.65rem] text-textSub transition-colors hover:border-textSub hover:text-text"
              >
                Batch upload JSONs
                <input
                  type="file"
                  accept=".json,application/json"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    intake(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
              {/* One click for every export attached to this tournament, matched
                  to a fixture or not — the uploads are otherwise only editable
                  here, so this is the way to get them back out, zipped up under
                  the tournament's own name. */}
              <DownloadFilesButton files={files} archiveName={previewTitle || name} />
            </div>
          </div>
          {/* The bracket outside the cards doubles as the batch drop zone:
              several exports at once, each bound to a fixture by the players
              in its JSON. A card stops the drop before it reaches here when
              the file is meant for one specific match. */}
          <div
            className="space-y-3"
            onMouseLeave={() => setHoveredTeam(null)}
            onDragOver={(e) => {
              if (!Array.from(e.dataTransfer.types).includes('Files')) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverSlot(null);
              intake(e.dataTransfer.files);
            }}
          >
            {rounds.map((round) => (
              <div key={round.displayRound}>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-textMuted">
                  Round {round.displayRound}
                </h3>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {round.matchups.map((m) => {
                    const file = assignment.bySlot[m.slot];
                    const draft = file ? draftById.get(file.id) : undefined;
                    const aVal = file ? scores[file.id]?.[norm(m.labelA)] ?? '' : '';
                    const bVal = file ? scores[file.id]?.[norm(m.labelB)] ?? '' : '';
                    const aNum = aVal.trim() !== '' && !isNaN(Number(aVal)) ? Number(aVal) : null;
                    const bNum = bVal.trim() !== '' && !isNaN(Number(bVal)) ? Number(bVal) : null;
                    const aWin = aNum !== null && bNum !== null && aNum > bNum;
                    const bWin = aNum !== null && bNum !== null && bNum > aNum;
                    const tie = aNum !== null && bNum !== null && aNum === bNum;
                    const bothScored = aNum !== null && bNum !== null;
                    // Same card treatment as the match page's bracket: dashed and
                    // faded until both scores are in, solid once played. Filling
                    // either box assumes the other is 0 (setScoreForSlot), so a
                    // single number already solidifies the card.
                    return (
                      <div
                        key={m.slot}
                        // A match box is also a drop target: a JSON dropped
                        // here is attached to this fixture specifically.
                        onDragOver={(e) => {
                          if (!Array.from(e.dataTransfer.types).includes('Files')) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'copy';
                          setDragOverSlot(m.slot);
                        }}
                        onDragLeave={(e) => {
                          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                            setDragOverSlot(null);
                          }
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation(); // not the bracket-level batch upload
                          setDragOverSlot(null);
                          intake(e.dataTransfer.files, m.slot);
                        }}
                        className={`rounded-md border px-2 py-1 ${
                          dragOverSlot === m.slot
                            ? 'border-accent bg-accent/10'
                            : bothScored
                              ? 'border-border bg-surface'
                              : 'border-dashed border-border bg-surface/40'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[0.6rem] uppercase tracking-wide text-textDim">
                            Match #{m.slot.replace(/^r\d+m/, '')}
                            <span className="ml-1 normal-case">· Round {m.displayRound}</span>
                          </span>
                          {draft ? (
                            <div className="flex items-center gap-2">
                              {/* The upload's own name, read-only: exports are
                                  never renamed, and the download button hands
                                  them back under exactly this name. Only the
                                  rendering drops the game's fixed prefix. */}
                              <span
                                title={exportDisplayLabel(draft.label) || undefined}
                                className="max-w-[11rem] truncate text-[0.65rem] text-textDim"
                              >
                                {exportDisplayLabel(draft.label) || 'Untitled'}
                              </span>
                              <button
                                type="button"
                                onClick={() => removeFile(draft.id, exportDisplayLabel(draft.label))}
                                className="text-[0.65rem] text-textDim hover:text-taken"
                              >
                                Remove
                              </button>
                            </div>
                          ) : (
                            <label
                              title="Click to pick a file, or drop a .json export right onto this match"
                              className="cursor-pointer text-[0.65rem] text-accent hover:underline"
                            >
                              Attach JSON
                              <input
                                type="file"
                                accept=".json,application/json"
                                className="hidden"
                                onChange={(e) => {
                                  intake(e.target.files, m.slot);
                                  e.target.value = '';
                                }}
                              />
                            </label>
                          )}
                        </div>
                        <BracketTeamRow
                          members={parsedTeams[m.teamAIndex]}
                          teamIndex={m.teamAIndex}
                          result={tie ? 'tie' : aWin ? 'win' : null}
                          highlighted={hoveredTeam === m.teamAIndex}
                          onHover={setHoveredTeam}
                          divider
                          score={
                            <ScoreInput
                              value={aVal}
                              win={aWin}
                              tie={tie}
                              onChange={(v) => setScoreForSlot(m.slot, norm(m.labelA), norm(m.labelB), v)}
                            />
                          }
                        />
                        <BracketTeamRow
                          members={parsedTeams[m.teamBIndex]}
                          teamIndex={m.teamBIndex}
                          result={tie ? 'tie' : bWin ? 'win' : null}
                          highlighted={hoveredTeam === m.teamBIndex}
                          onHover={setHoveredTeam}
                          score={
                            <ScoreInput
                              value={bVal}
                              win={bWin}
                              tie={tie}
                              onChange={(v) => setScoreForSlot(m.slot, norm(m.labelB), norm(m.labelA), v)}
                            />
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {unmatchedNames.length > 0 && (
        <div className="space-y-1.5 rounded-md border border-accent/30 bg-accent/5 p-3">
          <p className="text-xs text-accent">
            {unmatchedNames.length} name{unmatchedNames.length !== 1 ? 's' : ''} across your
            uploaded file{files.length !== 1 ? 's' : ''} don't match anyone in the pasted teams
            — rename to match, or leave as-is. You can change these any time.
          </p>
          {unmatchedNames.map(([key, rawName]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="flex-shrink-0 font-mono text-xs text-textSub">{rawName}</span>
              <span className="flex-shrink-0 text-xs text-textDim">→</span>
              <select
                value={renames[key] ?? ''}
                onChange={(e) => setRename(key, e.target.value)}
                className="flex-1 rounded-md border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-textSub"
              >
                <option value="">Leave as "{rawName}"</option>
                {rosterNames.map((rn) => (
                  <option key={rn} value={rn}>
                    Rename to {rn}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      {duplicateGroups.length > 0 && (
        <div className="space-y-2 rounded-md border border-taken/30 bg-taken/5 p-3">
          <p className="text-xs text-taken">
            {duplicateIds.size} of your uploads{' '}
            {duplicateIds.size === 1 ? 'is an exact copy' : 'are exact copies'} of another file
            already attached — same game, same data. Each one would count that game twice in
            every player&apos;s stats and in the tournament&apos;s games-played count, and would
            fill the other fixture of that pair as if it were the rematch. Remove{' '}
            {duplicateIds.size === 1 ? 'the copy' : 'the copies'} before saving.
          </p>
          {duplicateGroups.map((g) => (
            <div key={g.original.id} className="space-y-1.5">
              {g.copies.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs text-textSub">
                    {exportDisplayLabel(c.label) || c.id}
                    <span className="ml-1 font-sans text-textDim">
                      (identical to {exportDisplayLabel(g.original.label) || g.original.id})
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(c.id, exportDisplayLabel(c.label) || c.id)}
                    className="flex-shrink-0 text-xs text-textDim hover:text-taken"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {unmatchedFiles.length > 0 && (
        <div className="space-y-1.5 rounded-md border border-taken/30 bg-taken/5 p-3">
          <p className="text-xs text-taken">
            {unmatchedFiles.length} file{unmatchedFiles.length !== 1 ? 's' : ''} couldn't be
            matched to a bracket matchup (their teams weren't detected). They'll still be
            saved, but won't appear in the bracket.
          </p>
          {unmatchedFiles.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-2">
              <span className="truncate font-mono text-xs text-textSub">
                {exportDisplayLabel(f.label) || f.id}
              </span>
              <button
                type="button"
                onClick={() => removeFile(f.id, exportDisplayLabel(f.label) || f.id)}
                className="flex-shrink-0 text-xs text-textDim hover:text-taken"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {formError && <p className="text-sm text-taken">{formError}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-60"
      >
        {submitting ? 'Saving…' : existing ? 'Save changes' : 'Create match'}
      </button>
    </form>
  );
}

/**
 * The editable counterpart of the match page's score pill: the winner carries
 * the accent fill, a tie is neutral — but it stays an input, so the admin types
 * each matchup's score in place. `win` / `tie` are the same comparisons the
 * read-only bracket makes, so both views agree on who won a fixture.
 */
function ScoreInput({
  value,
  win,
  tie,
  onChange,
}: {
  value: string;
  win: boolean;
  tie: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="–"
      className={`w-12 flex-shrink-0 rounded border px-1 text-center text-xs font-semibold outline-none ${
        win
          ? 'border-accent bg-accent text-bg'
          : tie
            ? 'border-border bg-surfaceAlt text-text focus:border-textSub'
            : 'border-border bg-surfaceAlt text-textMuted focus:border-textSub'
      }`}
    />
  );
}