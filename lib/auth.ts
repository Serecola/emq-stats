export const ADMIN_COOKIE = 'emq_admin_session';

/**
 * How long one generation of session cookies lasts. The cookie's value is
 * derived from the stored secret *and* this window (see
 * `expectedSessionValue`), so every 90 days the whole set of issued cookies
 * stops validating at once and the admin signs back in with the same password.
 *
 * Derived from the clock rather than rotated by a job: no cron, no extra
 * state to keep in step, and no restart — the same pure function runs on the
 * writer (the login route) and on the checker (`hasAdminSession`), so they
 * cannot disagree about which generation a request belongs to.
 */
const SESSION_WINDOW_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Which session generation a moment in time falls in — the 90-day window index
 * since the epoch. Exported so the login route and the checkers can be seen to
 * derive the same number from the same clock.
 */
export function sessionWindow(now: number = Date.now()): number {
  return Math.floor(now / (SESSION_WINDOW_DAYS * DAY_MS));
}

/**
 * The value the session cookie must equal right now: SHA-256 of the stored
 * secret, salted with the current session window.
 *
 * Three deliberate properties:
 *
 * - **The secret is required.** There is no `|| ADMIN_PASSWORD` fallback: a
 *   deploy without ADMIN_SESSION_SECRET denies the admin area outright (every
 *   admin page bounces to the login screen, the login route answers 500) rather
 *   than quietly minting sessions out of the password — which would quietly
 *   turn a guessed, reused or leaked password into a valid cookie too. Failing
 *   shut costs a misconfigured deploy its admin; the fallback would have cost
 *   it a second, permanent credential.
 * - **It expires on its own every 90 days** (see SESSION_WINDOW_DAYS): the
 *   admin re-authenticates with the same user-set password, the cheapest
 *   re-auth there is for a single-admin app. Changing ADMIN_SESSION_SECRET
 *   still expires everything at once, for when that matters (a suspected
 *   leak).
 * - **It is hashed, not concatenated.** A captured cookie therefore reveals
 *   neither the secret nor the next window's value, so it cannot be extended
 *   past its window by minting fresh cookies — which is what would otherwise
 *   make the automatic rotation cosmetic.
 *
 * Async because Web Crypto's `digest` is promise-based and is the one hash
 * available in every runtime this ships to — the Node server today, and the
 * Edge sandbox too should the check ever move back. It runs at most a handful
 * of times per admin request, over ~40 bytes.
 *
 * Rotating the secret is therefore just a restart: every reader of it is in
 * the Node runtime, which reads the env per request, so there is no build-time
 * copy to go stale and nothing to redeploy.
 */
export async function expectedSessionValue(now?: number): Promise<string | undefined> {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return undefined;
  // Colon-separated: the window is always pure digits and always last, so no
  // two (secret, window) pairs can produce the same input string.
  const input = new TextEncoder().encode(`${secret}:${sessionWindow(now)}`);
  const digest = await crypto.subtle.digest('SHA-256', input);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
