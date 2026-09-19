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
    const loginUrl = new URL('/admin/login', req.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*', '/api/matches/:path*'],
};
