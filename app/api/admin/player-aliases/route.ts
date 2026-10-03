import { NextRequest, NextResponse } from 'next/server';
import { setPlayerAlias } from '@/lib/store';
import { hasAdminSession } from '@/lib/admin-session';
import { norm } from '@/lib/stats';

/**
 * Declares or withdraws one username alias — "this other name is the same
 * person as this one" — the cross-match identity link the per-match `renames`
 * map can't be, since those are scoped to a single tournament's roster paste.
 *
 * Applying one merges the two names everywhere at once: aggregated stats,
 * player pages, Expected Ranks and the autodrafter all follow it, and the
 * alias's stored Set Ranks and bot/override rows move onto the canonical
 * player (see setPlayerAlias). That is deliberately not reversible beyond
 * splitting the names again, so the UI only offers a plain delete.
 *
 * PUT (not POST) because it's idempotent per alias — same shape as
 * PUT /api/admin/player-tags. Admin-gated in the handler below — see
 * lib/admin-session.ts for why that is not middleware's job.
 */
export async function PUT(req: NextRequest) {
  // The admin gate (see lib/admin-session.ts — the Edge middleware cannot read
  // the secret, so a middleware check would deny everyone).
  if (!(await hasAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | { alias?: unknown; target?: unknown }
    | null;

  const aliasKey = norm(typeof body?.alias === 'string' ? body.alias : '');
  if (!aliasKey) {
    return NextResponse.json({ error: 'An alias name is required.' }, { status: 400 });
  }
  const aliasRaw = String(body?.alias).trim();

  // null/'' removes the alias; anything else names the canonical player.
  const rawTarget = body?.target;
  const targetDisplay =
    typeof rawTarget === 'string' && rawTarget.trim() !== '' ? rawTarget.trim() : null;
  if (rawTarget !== null && rawTarget !== undefined && rawTarget !== '' && targetDisplay === null) {
    return NextResponse.json({ error: 'Target must be a name or null.' }, { status: 400 });
  }

  const targetKey = targetDisplay ? norm(targetDisplay) : null;
  // Compared on the raw strings, not the normalized keys: both normalize to
  // the same thing for a pure casing rename ("Sere" -> "sere"), and that is a
  // real rename — the display is what the admin is correcting, and it survives
  // canonicalAliases only because it is kept. Only the identical string is a
  // genuine self-alias, i.e. a request that says nothing.
  if (targetDisplay !== null && targetDisplay === aliasRaw) {
    return NextResponse.json(
      { error: 'An alias cannot point at itself.' },
      { status: 400 }
    );
  }

  await setPlayerAlias(aliasKey, targetKey, targetDisplay);
  return NextResponse.json({ ok: true, aliasKey, target: targetDisplay });
}
