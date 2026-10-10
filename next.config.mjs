/**
 * @type {import('next').NextConfig}
 */

// The app used to share a host with another site and was mounted under the
// `/emq-stats` sub-path. It now runs on its own subdomain (stats.<host>) at the
// domain root, so basePath is empty and routes sit at the top level (`/`,
// `/admin`, ...). The withBasePath() helper (lib/base-path.ts) is kept so a
// future sub-path deployment needs no code churn.
const basePath = '';

// The public origin the app is served from — the base of shareable links (the
// match page's "Player view link") and the target of the legacy /emq-stats
// redirect below. Defined once here and inlined into the bundle as
// NEXT_PUBLIC_SITE_URL so nothing repeats the string (the same pattern the
// basePath uses).
const siteUrl = 'https://stats.serecola.com';

const nextConfig = {
  basePath,
  trailingSlash: false,

  // Inlined into both the server and client bundles at build time, so
  // lib/base-path.ts and the share-link component can read them without the
  // values being duplicated in source.
  env: { NEXT_PUBLIC_BASE_PATH: basePath, NEXT_PUBLIC_SITE_URL: siteUrl },

  // Old links: the app used to live under `serecola.com/emq-stats/*`, so any
  // bookmark or pasted URL there should land on the same path at the new
  // subdomain rather than 404. Redirects run server-side before the page, and
  // `permanent: true` (308) preserves the method so a saved form POST still
  // reaches the API. The nginx layer can do the same thing at the edge (see the
  // README), but keeping it here means it works on any host, Vercel included.
  redirects() {
    return [
      {
        source: '/emq-stats',
        destination: siteUrl,
        permanent: true,
      },
      {
        source: '/emq-stats/:path*',
        destination: `${siteUrl}/:path*`,
        permanent: true,
      },
    ];
  },

  experimental: {
    serverComponentsExternalPackages: ['@libsql/client'],
  },
};

export default nextConfig;
