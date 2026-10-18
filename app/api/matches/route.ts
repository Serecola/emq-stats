import { NextRequest, NextResponse } from 'next/server';
import { createMatch, listMatchSummaries } from '@/lib/store';
import { hasAdminSession } from '@/lib/admin-session';
import { isValidDate } from '@/lib/match-title';
import { isValidCycles, isValidTeamCount, resolveCycles, validTeamCountsPhrase } from '@/lib/format';
import { REGIONS, MODES, SUBMODES_BY_MODE } from '@/lib/types';
import type { MatchInput } from '@/lib/types';

export async function GET() {
  // Viewer list doesn't need the (potentially large) raw file payloads, so
  // this reads the summary columns rather than fetching megabytes per row
  // only to strip them off again.
  return NextResponse.json(await listMatchSummaries());
}

export async function POST(req: NextRequest) {
  // Reads are public (the viewer list above); creating a tournament is not —
  // admin-gated here, see lib/admin-session.ts.
  if (!(await hasAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json()) as MatchInput;

  if (!body?.name?.trim()) {
    return NextResponse.json({ error: 'Tournament name is required.' }, { status: 400 });
  }
  if (!body?.date || !isValidDate(body.date)) {
    return NextResponse.json({ error: 'A valid date is required.' }, { status: 400 });
  }
  if (!REGIONS.includes(body.region)) {
    return NextResponse.json({ error: 'Region must be NA, EU, or Asia.' }, { status: 400 });
  }
  if (!MODES.includes(body.mode)) {
    return NextResponse.json(
      { error: `Mode must be ${MODES.join(' or ')}.` },
      { status: 400 }
    );
  }
  if (!SUBMODES_BY_MODE[body.mode]?.includes(body.submode)) {
    // Custom has no sub-mode: an empty one is exactly what it stores (the
    // editor hides the sub-mode picker for it). Any other mode requires a
    // concrete sub-mode.
    if (!(body.mode === 'Custom' && (body.submode ?? '') === '')) {
      return NextResponse.json(
        { error: `Sub-mode must be one of: ${SUBMODES_BY_MODE[body.mode]?.join(', ')}.` },
        { status: 400 }
      );
    }
  }
  if (!Array.isArray(body.teams) || body.teams.length < 2) {
    return NextResponse.json({ error: 'At least 2 teams are required.' }, { status: 400 });
  }
  if (!isValidTeamCount(body.teams.length)) {
    return NextResponse.json(
      { error: `Tournaments must have exactly ${validTeamCountsPhrase()} teams (got ${body.teams.length}).` },
      { status: 400 }
    );
  }
  // The format must make a legal schedule for this roster: an explicit pick
  // wins, otherwise the historical inference for the count (the same rule the
  // form submits with — see components/MatchForm.tsx). A 3-team 3v3v3 runs no
  // round robin so it carries no format to check.
  if (
    body.teams.length !== 3 &&
    body.cycles !== undefined &&
    !isValidCycles(body.teams.length, resolveCycles(body.teams.length, body.cycles))
  ) {
    return NextResponse.json(
      { error: `That format doesn't fit ${body.teams.length} teams.` },
      { status: 400 }
    );
  }
  // Files are optional — a tournament can be created up front (just the
  // roster + fixtures) and have its game JSON uploaded later via Edit. New
  // tours always start included in stats — exclusion is a Tour Manager row
  // action afterwards.
  const match = await createMatch({
    ...body,
    files: Array.isArray(body.files) ? body.files : [],
    excludeFromStats: false,
  });
  return NextResponse.json(match, { status: 201 });
}