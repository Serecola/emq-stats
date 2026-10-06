import { NextRequest, NextResponse } from 'next/server';
import { buildExport, exportFilename, slug } from '@/lib/export';
import { hasAdminSession } from '@/lib/admin-session';
import { getMatch, listMatches, listPlayerAliases } from '@/lib/store';
import { createZip } from '@/lib/zip';
import type { Match } from '@/lib/types';

// The archive is built from every upload in the table, so nothing here can be
// cached — and the session cookie is the gate: middleware.ts matches
// /api/admin/:path*, so a request without one is answered 401 before it lands.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const JSON_INDENT = 2;

export async function GET(req: NextRequest) {
  // The admin gate (see lib/admin-session.ts — the Edge middleware cannot read
  // the secret, so a middleware check would deny everyone). Exports carry the
  // raw game JSON of every tournament, so this is admin-only by construction.
  if (!(await hasAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const format = searchParams.get('format');

  // `?id=` is one tournament; no id is the lot of them. Both read through the
  // store, so the exports are the same parsed JSON the rest of the app sees.
  const matches: Match[] = id
    ? [await getMatch(id)].filter((m): m is Match => m !== null)
    : await listMatches();

  if (id && !matches.length) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
  if (!matches.length) {
    return NextResponse.json({ error: 'There are no tournaments to export yet.' }, { status: 404 });
  }

  const at = new Date();
  // Global aliases folded for fixture detection only — a manifest entry is
  // named after the fixture its JSON's two teams resolve to (see buildExport).
  const { manifest, files } = buildExport(matches, at, await listPlayerAliases());

  // `?format=json` skips the archive: the same manifest with every export
  // inlined under its path, for scripting or a diff that shouldn't have to
  // care about zip framing.
  if (format === 'json') {
    return NextResponse.json({
      manifest,
      exports: Object.fromEntries(files.map((f) => [f.path, f.data])),
    });
  }

  const zip = createZip(
    [
      {
        name: 'manifest.json',
        data: Buffer.from(JSON.stringify(manifest, null, JSON_INDENT), 'utf8'),
      },
      ...files.map((f) => ({
        name: f.path,
        data: Buffer.from(JSON.stringify(f.data, null, JSON_INDENT), 'utf8'),
      })),
    ],
    at
  );

  // `new Uint8Array(zip)` rather than the Buffer itself: a Buffer is a valid
  // response body at runtime, but its ArrayBufferLike backing isn't assignable
  // to BodyInit under this DOM lib, and the copy costs nothing next to deflate.
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Length': String(zip.length),
      'Content-Disposition': `attachment; filename="${
        id ? exportFilename(at, slug(matches[0].name, id)) : exportFilename(at)
      }"`,
      // An archive of every upload, behind the admin gate: nothing between the
      // proxy and the browser should be holding on to one.
      'Cache-Control': 'private, no-store',
    },
  });
}
