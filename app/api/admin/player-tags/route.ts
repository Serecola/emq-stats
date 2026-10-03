import { NextRequest, NextResponse } from 'next/server';
import { setPlayerTag } from '@/lib/store';
import { hasAdminSession } from '@/lib/admin-session';
import type { PlayerTag } from '@/lib/types';

/**
 * Sets or clears one username's global bot decision — the override the
 * Player Manager's "Player Tags" tab edits and the public views badge with.
 * Unlike Set Ranks there is no mode/sub-mode dimension: a bot is a bot in
 * every gamemode, so the row is keyed by username alone.
 *
 * Most usernames have no row at all: the automatic "username contains Bot"
 * rule (lib/player-tags.ts) decides for them. A row exists only to override
 * that rule — `Bot` to force it on, `NotBot` to silence a false alarm, and
 * `null` to drop the override and fall back to the name again.
 *
 * PUT (not POST) because this is idempotent per username: the tab saves a
 * single cell, and re-sending the same value is a no-op. Admin-gated in the
 * handler below — see lib/admin-session.ts for why that is not middleware's job.
 */
const VALID_TAGS: readonly PlayerTag[] = ['Bot', 'NotBot'];

export async function PUT(req: NextRequest) {
  // The admin gate (see lib/admin-session.ts — the Edge middleware cannot read
  // the secret, so a middleware check would deny everyone).
  if (!(await hasAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
