import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, expectedSessionValue } from './lib/auth';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isAdminPage = pathname.startsWith('/admin') && pathname !== '/admin/login';
  const isAdminApi = pathname.startsWith('/api/admin') && pathname !== '/api/admin/login';
  const isMutatingMatchApi = pathname.startsWith('/api/matches') && req.method !== 'GET';

  if (!isAdminPage && !isAdminApi && !isMutatingMatchApi) {
    return NextResponse.next();
  }

  const expected = expectedSessionValue();
  const cookie = req.cookies.get(ADMIN_COOKIE)?.value;

  if (expected && cookie === expected) {
    return NextResponse.next();
  }

  if (isAdminPage) {
    // Cloned from req.nextUrl rather than built with `new URL(path, req.url)`:
    // NextURL puts the basePath back when it serializes, a plain URL doesn't.
    // Without this the redirect points at `/admin/login` instead of
    // `/emq-stats/admin/login`, which leaves the app's mount and 404s in nginx.
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/admin/login';
    // Drop whatever the blocked request carried, keeping only `from` below.
    loginUrl.search = '';
    // `pathname` is basePath-stripped, which is what the login page's
    // router.push() wants — it re-adds the prefix itself.
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*', '/api/matches/:path*'],
};
