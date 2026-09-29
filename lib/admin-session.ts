import { cookies } from 'next/headers';
import { ADMIN_COOKIE, expectedSessionValue } from './auth';

/**
 * Whether the request currently being rendered carries a valid admin session.
 *
 * The admin cookie is `httpOnly`, so the browser's own JavaScript can't read
 * it — but a Server Component can, which is what lets the public match page
 * offer an admin a way back into the tournament's editor without ever showing
 * the control to a viewer. It makes exactly the comparison `middleware.ts`
 * makes, deliberately: the two must never disagree about who is an admin.
 *
 * Deliberately not in lib/auth.ts: that module is imported by the middleware,
 * which runs on the Edge and has no `next/headers`.
 *
 * Only usable from a Server Component / Route Handler (it needs the request
 * scope `cookies()` reads from), and it opts whatever renders it into dynamic
 * rendering, so don't call it from anything you want cached per-URL.
 */
export function hasAdminSession(): boolean {
  const expected = expectedSessionValue();
  if (!expected) return false;
  return cookies().get(ADMIN_COOKIE)?.value === expected;
}
