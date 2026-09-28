/**
 * The app is served from a sub-path (`basePath` in next.config.mjs) because it
 * shares a host with another site, so what the app calls `/admin` is really
 * `/emq-stats/admin` on the wire.
 *
 * `<Link>` and the App Router's push/replace add that prefix themselves. Hand-
 * built URLs do not: a raw `fetch('/api/...')` or a plain `<form action="/">`
 * goes to the host root, where nothing is routed and nginx answers 404. Those
 * go through here instead.
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