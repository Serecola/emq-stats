import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, expectedSessionValue } from '@/lib/auth';

/**
 * Failed-login throttle, per client address: MAX_FAILURES wrong passwords
 * inside LOCKOUT_MS and that address is refused with a 429 (carrying
 * `Retry-After`) until its window rolls over. Without it the login door is the
 * only thing between the internet and a guessable password — an unattended
 * endpoint that would otherwise happily test a wordlist all night.
 *
 * In-process on purpose: the app runs as a single `next start` behind nginx, so
 * a Map is the whole state, and it costs no schema, no Redis and no extra query
 * on the login path. The trade-offs are honest ones — a restart clears the
 * counters, and behind more than one instance each process keeps its own tally
 * (so the effective allowance multiplies). nginx's `limit_req` on this path is
 * the belt-and-braces answer to both; see the README's admin authentication
 * section.
 */
const MAX_FAILURES = 5;
const LOCKOUT_MS = 10 * 60 * 1000;
/** Client address -> its failures inside the current window. Pruned lazily below. */
const failures = new Map<string, { count: number; firstAt: number }>();

/**
 * The client address the throttle counts against.
 *
 * Behind nginx the app only sees `X-Forwarded-For`, and the README's
 * `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` *appends* the
 * real peer to whatever the client sent — so the trusted value is the LAST
 * entry, not the first. Reading the first would let anyone choose their own
 * identity with a header: a fresh allowance per guess, or a way to lock the
 * real admin out by pinning their address.
 */
function clientIp(req: NextRequest): string {
  const last = req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();
  return last || req.ip || 'unknown';
}

/**
 * Seconds until this address may try again, or 0 when it may. A window that
 * has rolled over is dropped on the way past — which is also what keeps the map
 * honest for addresses that come back; the sweep below mops up the ones that
 * never do.
 */
function lockoutRemaining(key: string, now: number): number {
  const entry = failures.get(key);
  if (!entry) return 0;
  const elapsed = now - entry.firstAt;
  if (elapsed >= LOCKOUT_MS) {
    failures.delete(key);
    return 0;
  }
  return entry.count >= MAX_FAILURES ? Math.ceil((LOCKOUT_MS - elapsed) / 1000) : 0;
}

/** Record one wrong password, starting a fresh window if the last one expired. */
function noteFailure(key: string, now: number) {
  const entry = failures.get(key);
  if (!entry || now - entry.firstAt >= LOCKOUT_MS) {
    failures.set(key, { count: 1, firstAt: now });
    return;
  }
  entry.count += 1;
}

/**
 * Drop windows that expired long ago. Only walks the map once it is big enough
 * to be worth the walk, so the ordinary case (a few typos) never pays for it —
 * while an attacker cycling addresses still cannot make it grow without bound.
 */
function sweepFailures(now: number) {
  if (failures.size < 500) return;
  for (const [key, entry] of failures) {
    if (now - entry.firstAt >= LOCKOUT_MS) failures.delete(key);
  }
}

export async function POST(req: NextRequest) {
  const now = Date.now();
  const ip = clientIp(req);
  sweepFailures(now);

  const lockedFor = lockoutRemaining(ip, now);
  if (lockedFor > 0) {
    return NextResponse.json(
      { error: 'Too many failed attempts. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(lockedFor) } },
    );
  }

  const { password } = await req.json().catch(() => ({ password: '' }));
  const adminPassword = process.env.ADMIN_PASSWORD;
  // The session value is hashed from ADMIN_SESSION_SECRET and the current
  // 90-day window (lib/auth.ts), and is deliberately undefined when that
  // secret is missing — so a misconfigured deploy denies the admin area rather
  // than falling back to treating the password as the cookie.
  const session = await expectedSessionValue(now);

  if (!adminPassword || !session) {
    return NextResponse.json(
      { error: 'Server is missing its admin credentials env vars.' },
      { status: 500 }
    );
  }

  if (password !== adminPassword) {
    noteFailure(ip, now);
    // The attempt that reaches the cap is answered with the lockout itself, so
    // the client learns where it stands instead of one more 401.
    const lockedOut = lockoutRemaining(ip, now);
    if (lockedOut > 0) {
      return NextResponse.json(
        { error: 'Too many failed attempts. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(lockedOut) } }
      );
    }
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 });
  }

  // A success clears the tally: the lockout is about a run of wrong guesses,
  // not a lifetime allowance.
  failures.delete(ip);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, session, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    // 30 days, shorter than the 90-day session window (lib/auth.ts) on
    // purpose: that window is the server-side ceiling that still applies if
    // this TTL is ever raised, or if a cookie is restored from a browser
    // backup, and the cookie should not outlive it in the meantime.
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
