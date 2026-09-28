/**
 * @type {import('next').NextConfig}
 */

// The app shares a host with another site, so it is mounted under a sub-path
// rather than at the domain root. Anything that builds a URL by hand —
// middleware redirects, client `fetch()` calls, a plain `<form action>` — has to
// add this prefix itself; `<Link>` and the router's push/replace do it
// automatically. See lib/base-path.ts.
const basePath = '/emq-stats';

const nextConfig = {
  basePath,
  trailingSlash: false,

  // Inlined into both the server and client bundles at build time, so
  // lib/base-path.ts can read it without the value being duplicated in source.
  env: { NEXT_PUBLIC_BASE_PATH: basePath },

  experimental: {
    serverComponentsExternalPackages: ['@libsql/client'],
  },
};

export default nextConfig;
