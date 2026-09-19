export const ADMIN_COOKIE = 'emq_admin_session';

// The cookie value is just the shared session secret. This is deliberately
// simple (single admin password, no user accounts) — swap for something
// stronger if this ever needs multi-user access control.
export function expectedSessionValue(): string | undefined {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD;
}
