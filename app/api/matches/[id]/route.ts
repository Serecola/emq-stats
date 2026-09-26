import { NextRequest, NextResponse } from 'next/server';
import { deleteMatch, getMatch, updateMatch } from '@/lib/store';
import { isValidDate } from '@/lib/match-title';
import { isValidTeamCount } from '@/lib/schedule';
import { REGIONS, MODES, SUBMODES_BY_MODE } from '@/lib/types';
import type { MatchInput } from '@/lib/types';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const match = await getMatch(params.id);
  if (!match) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  return NextResponse.json(match);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
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
    return NextResponse.json(
      { error: `Sub-mode must be one of: ${SUBMODES_BY_MODE[body.mode]?.join(', ')}.` },
      { status: 400 }
    );
  }
  if (!Array.isArray(body.teams) || body.teams.length < 2) {
    return NextResponse.json({ error: 'At least 2 teams are required.' }, { status: 400 });
  }
  if (!isValidTeamCount(body.teams.length)) {
    return NextResponse.json(
      { error: `Tournaments must have exactly 4 or 6 teams (got ${body.teams.length}).` },
      { status: 400 }
    );
  }
  // Files are optional — a tournament can exist with only a roster/fixtures
  // and have its game JSON uploaded later.
  const updated = await updateMatch(params.id, {
    ...body,
    files: Array.isArray(body.files) ? body.files : [],
  });
  if (!updated) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await deleteMatch(params.id);
  return NextResponse.json({ ok: true });
}