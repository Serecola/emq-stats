import { NextRequest, NextResponse } from 'next/server';
import { setPlayerSetRank } from '@/lib/store';
import { hasAdminSession } from '@/lib/admin-session';
import { MODES, SUBMODES_BY_MODE, type Mode } from '@/lib/types';

/**
 * Sets or clears one player's admin-assigned rank for one gamemode +
 * sub-mode — the granularity the Player Manager ranks at, and the
 * granularity autodraft consumes.
 *
 * PUT (not POST) because this is idempotent per player+mode+sub-mode: the
 * Player Manager saves a single cell, and re-sending the same value is a
 * no-op. Admin-gated in the handler below — see lib/admin-session.ts for why
 * that is not middleware's job.
 */
export async function PUT(req: NextRequest) {
  // The admin gate (see lib/admin-session.ts — the Edge middleware cannot read
  // the secret, so a middleware check would deny everyone).
  if (!(await hasAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | { playerKey?: unknown; mode?: unknown; submode?: unknown; rank?: unknown }
    | null;

  const playerKey = typeof body?.playerKey === 'string' ? body.playerKey.trim() : '';
  const mode = body?.mode;
  const submode = body?.submode;

  if (!playerKey) {
    return NextResponse.json({ error: 'A player is required.' }, { status: 400 });
  }
  if (!MODES.includes(mode as Mode)) {
    return NextResponse.json(
      { error: `Mode must be ${MODES.join(' or ')}.` },
      { status: 400 }
    );
  }
  if (!SUBMODES_BY_MODE[mode as Mode].includes(submode as string)) {
    return NextResponse.json(
      { error: `Sub-mode must be one of: ${SUBMODES_BY_MODE[mode as Mode].join(', ')}.` },
      { status: 400 }
    );
  }

  // null/'' clears the rank; anything else must be a non-negative number
  // (fractional ranks are allowed, matching the roster's "(N)" values).
  const raw = body?.rank;
  let rank: number | null;
  if (raw === null || raw === undefined || raw === '') {
    rank = null;
  } else {
    rank = Number(raw);
    if (!Number.isFinite(rank) || rank < 0) {
      return NextResponse.json(
        { error: 'Rank must be a number of 0 or higher.' },
        { status: 400 }
      );
    }
  }

  await setPlayerSetRank(playerKey, mode as Mode, submode as string, rank);
  return NextResponse.json({ ok: true, playerKey, mode, submode, rank });
}