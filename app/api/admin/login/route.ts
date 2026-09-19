import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, expectedSessionValue } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({ password: '' }));
  const adminPassword = process.env.ADMIN_PASSWORD;
  const session = expectedSessionValue();

  if (!adminPassword || !session) {
    return NextResponse.json(
      { error: 'Server is missing ADMIN_PASSWORD env var.' },
      { status: 500 }
    );
  }

  if (password !== adminPassword) {
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, session, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
