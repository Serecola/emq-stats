/**
 * The app runs at the domain root of its own subdomain (stats.<host>), so
 * `basePath` in next.config.mjs is empty and what the app calls `/admin` is
 * `/admin` on the wire. The helper is kept so a future sub-path deployment
 * (sharing a host again) needs no call-site changes.
 *
 * `<Link>` and the App Router's push/replace apply any basePath themselves.
 * Hand-built URLs do not: a raw `fetch('/api/...')` or a plain
 * `<form action="/">` would go to the host root, where nothing is routed.
 * Those go through here instead.
 */
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** Prefix a hand-built app path with the deployment's basePath. */
export function withBasePath(path: string): string {
  if (!BASE_PATH || !path.startsWith('/')) return path;
  // Already prefixed — `from`-style params and absolute URLs come through here
  // too, and doubling the prefix would 404 just as hard as omitting it.
  if (path === BASE_PATH || path.startsWith(`${BASE_PATH}/`)) return path;
  return `${BASE_PATH}${path}`;
}