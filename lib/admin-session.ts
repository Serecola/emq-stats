import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_COOKIE, expectedSessionValue } from './auth';

/**
 * Whether the request currently being rendered carries a valid admin session.
 *
 * **This is the admin gate.** It used to live in `middleware.ts`, but the Edge
 * middleware compiles `process.env` to a *runtime* lookup that resolves to
 * nothing in the sandbox — so `expected` there was always undefined and every
 * admin request was bounced no matter what cookie it carried. The Node runtime
 * reads the same env properly (the login route mints correct cookies from it),
 * so the check lives here now: each admin page calls `requireAdminPage`, each
 * admin route handler asks `hasAdminSession` and answers 401. One runtime, one
 * comparison, and no build-time coupling to reason about at rotation time.
 *
 * The admin cookie is `httpOnly`, so the browser's own JavaScript can't read
 * it — but a Server Component can, which is what lets the public match page
 * offer an admin a way back into the tournament's editor without ever showing
 * the control to a viewer.
 *
 * Only usable from a Server Component / Route Handler (it needs the request
 * scope `cookies()` reads from), and it opts whatever renders it into dynamic
 * rendering, so don't call it from anything you want cached per-URL.
 *
 * Async because the expected value is a Web Crypto digest (see lib/auth.ts).
 */
export async function hasAdminSession(): Promise<boolean> {
  const expected = await expectedSessionValue();
  if (!expected) return false;
  return cookies().get(ADMIN_COOKIE)?.value === expected;
}

/**
 * Page-level gate: bounce to the login screen unless this request is an admin,
 * remembering where they were headed in `?from=` so the login form can send
 * them back (the round trip the middleware used to do).
 *
 * The path goes in unprefixed: `redirect()` is basePath-aware, so passing an
 * already-prefixed path doubles it (`/emq-stats/emq-stats/admin/login`) and
 * lands on nothing. That is the opposite of the hand-built URLs elsewhere,
 * which do need `withBasePath()` — see lib/base-path.ts.
 */
export async function requireAdminPage(from: string): Promise<void> {
  if (await hasAdminSession()) return;
  redirect(`/admin/login?from=${encodeURIComponent(from)}`);
}
