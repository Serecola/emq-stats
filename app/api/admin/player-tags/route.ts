import { NextRequest, NextResponse } from 'next/server';
import { setPlayerTag } from '@/lib/store';
import type { PlayerTag } from '@/lib/types';

/**
 * Sets or clears one username's global Player/Bot tag — the identity label
 * the Player Manager's "Player Tags" tab edits and the public views badge
 * with. Unlike Set Ranks there is no mode/sub-mode dimension: a bot is a
 * bot in every gamemode, so the row is keyed by username alone.
 *
 * PUT (not POST) because this is idempotent per username: the tab saves a
 * single cell, and re-sending the same value is a no-op. `/api/admin/*` is
 * already gated by middleware.ts.
 */
const VALID_TAGS: readonly PlayerTag[] = ['Player', 'Bot'];

export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { playerKey?: unknown; tag?: unknown }
    | null;

  const playerKey = typeof body?.playerKey === 'string' ? body.playerKey.trim() : '';

  if (!playerKey) {
    return NextResponse.json({ error: 'A player is required.' }, { status: 400 });
  }

  // null/'' clears the tag (untagged); otherwise one of the two labels.
  const raw = body?.tag;
  let tag: PlayerTag | null;
  if (raw === null || raw === undefined || raw === '') {
    tag = null;
  } else if (typeof raw === 'string' && VALID_TAGS.includes(raw as PlayerTag)) {
    tag = raw as PlayerTag;
  } else {
    return NextResponse.json(
      { error: `Tag must be ${VALID_TAGS.join(' or ')}.` },
      { status: 400 }
    );
  }

  await setPlayerTag(playerKey, tag);
  return NextResponse.json({ ok: true, playerKey, tag });
}
