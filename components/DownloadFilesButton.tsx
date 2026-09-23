'use client';

import { useState } from 'react';

/**
 * A ZIP entry as it goes into the archive: the bytes written, the method that
 * produced them, and the CRC/length of the *uncompressed* data (both are
 * recorded per entry whichever method was used).
 */
type ZipEntry = {
  name: string;
  data: Uint8Array;
  /** 0 = stored, 8 = raw DEFLATE. */
  method: 0 | 8;
  crc: number;
  /** Uncompressed byte length. */
  size: number;
};

/**
 * Downloads every JSON export attached to a tournament as a single `.zip` named
 * after the tournament, instead of a dozen separate files.
 *
 * The archive is assembled in the browser — no upload, no dependency. Each
 * entry is DEFLATEd with the platform's own `CompressionStream` where it exists
 * and the result is smaller; otherwise the text is stored as-is, which every
 * unzipper understands. Entry names are the uploads' own names, so a file that
 * came out of an earlier download can be attached right back.
 */
export default function DownloadFilesButton({
  files,
  archiveName,
}: {
  files: { label: string; text: string }[];
  /** Base name for the `.zip` — normally the tournament's display title. */
  archiveName: string;
}) {
  // Placeholder files that only carry scores (no JSON attached yet) have
  // nothing to hand back, so a tournament whose attachments are all still blank
  // gets no button at all rather than an empty archive.
  const downloadable = files.filter((f) => f.text.trim() !== '');
  const [zipping, setZipping] = useState(false);
  if (downloadable.length === 0) return null;

  const zipName = `${safeBase(archiveName) || 'tournament'}.zip`;

  async function downloadZip() {
    setZipping(true);
    try {
      const used = new Set<string>();
      const entries: ZipEntry[] = [];
      for (const file of downloadable) {
        const raw = new TextEncoder().encode(file.text);
        const deflated = await deflateRaw(raw);
        // Storing beats deflating when the archive would only grow.
        const compressed = deflated !== null && deflated.length < raw.length;
        entries.push({
          name: fileName(file.label, used),
          data: compressed ? (deflated as Uint8Array) : raw,
          method: compressed ? 8 : 0,
          crc: crc32(raw),
          size: raw.length,
        });
      }
      triggerDownload(
        new Blob([buildZip(entries, new Date())], { type: 'application/zip' }),
        zipName
      );
    } finally {
      setZipping(false);
    }
  }

  return (
    <button
      type="button"
      onClick={downloadZip}
      disabled={zipping}
      title={`Saves ${zipName}`}
      className="rounded-md border border-border px-2 py-1 text-[0.65rem] text-textSub transition-colors hover:border-textSub hover:text-text disabled:opacity-60"
    >
      {zipping ? 'Zipping…' : `Download all JSONs as .zip (${downloadable.length})`}
    </button>
  );
}

/** A file-name-safe base: no extension, no characters systems reject. */
function safeBase(label: string): string {
  return label
    .replace(/\.(json|zip)$/i, '')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .trim()
    .slice(0, 80);
}

/** A safe, unique entry name for one export: its label plus a `.json` suffix. */
function fileName(label: string, used: Set<string>): string {
  const base = safeBase(label) || 'export';
  let name = `${base}.json`;
  // Two exports uploaded under the same name must both survive the archive.
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} (${n}).json`;
  used.add(name.toLowerCase());
  return name;
}

/**
 * DEFLATEs bytes with the platform's own compressor, or returns null when the
 * browser has no `CompressionStream` (or refuses this format) — in which case
 * the caller stores the text uncompressed instead.
 */
async function deflateRaw(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer> | null> {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const stream = new Blob([bytes])
      .stream()
      .pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

/** CRC-32 as ZIP stores it; the lookup table is built once and reused. */
let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** An instant as the DOS time/date pair a ZIP header stores. */
function dosDateTime(stamp: Date): { time: number; date: number } {
  const time = (stamp.getHours() << 11) | (stamp.getMinutes() << 5) | (stamp.getSeconds() >> 1);
  const date =
    ((stamp.getFullYear() - 1980) << 9) | ((stamp.getMonth() + 1) << 5) | stamp.getDate();
  return { time: time & 0xffff, date: date & 0xffff };
}

/**
 * Assembles a ZIP archive — local headers, the entry data, the central
 * directory, then the end-of-central-directory record — from entries the caller
 * has already compressed or stored. Entry names are written as UTF-8, which the
 * general-purpose flag bit 11 declares.
 */
function buildZip(entries: ZipEntry[], stamp: Date): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const names = entries.map((e) => encoder.encode(e.name));
  const localSize = entries.reduce((n, e, i) => n + 30 + names[i].length + e.data.length, 0);
  const centralSize = entries.reduce((n, _e, i) => n + 46 + names[i].length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  const { time, date } = dosDateTime(stamp);
  const offsets: number[] = [];
  let offset = 0;

  entries.forEach((entry, i) => {
    offsets.push(offset);
    view.setUint32(offset, 0x04034b50, true); // local file header
    view.setUint16(offset + 4, 20, true); // version needed to extract
    view.setUint16(offset + 6, 0x0800, true); // names are UTF-8
    view.setUint16(offset + 8, entry.method, true);
    view.setUint16(offset + 10, time, true);
    view.setUint16(offset + 12, date, true);
    view.setUint32(offset + 14, entry.crc, true);
    view.setUint32(offset + 18, entry.data.length, true); // compressed size
    view.setUint32(offset + 22, entry.size, true); // uncompressed size
    view.setUint16(offset + 26, names[i].length, true);
    view.setUint16(offset + 28, 0, true); // no extra field
    offset += 30;
    out.set(names[i], offset);
    offset += names[i].length;
    out.set(entry.data, offset);
    offset += entry.data.length;
  });

  const centralOffset = offset;
  entries.forEach((entry, i) => {
    view.setUint32(offset, 0x02014b50, true); // central directory header
    view.setUint16(offset + 4, 20, true); // version made by
    view.setUint16(offset + 6, 20, true); // version needed
    view.setUint16(offset + 8, 0x0800, true);
    view.setUint16(offset + 10, entry.method, true);
    view.setUint16(offset + 12, time, true);
    view.setUint16(offset + 14, date, true);
    view.setUint32(offset + 16, entry.crc, true);
    view.setUint32(offset + 20, entry.data.length, true);
    view.setUint32(offset + 24, entry.size, true);
    view.setUint16(offset + 28, names[i].length, true);
    view.setUint16(offset + 30, 0, true); // no extra field
    view.setUint16(offset + 32, 0, true); // no comment
    view.setUint16(offset + 34, 0, true); // disk this entry starts on
    view.setUint16(offset + 36, 0, true); // internal attributes
    view.setUint32(offset + 38, 0, true); // external attributes
    view.setUint32(offset + 42, offsets[i], true); // where its local header is
    offset += 46;
    out.set(names[i], offset);
    offset += names[i].length;
  });

  view.setUint32(offset, 0x06054b50, true); // end of central directory
  view.setUint16(offset + 4, 0, true);
  view.setUint16(offset + 6, 0, true);
  view.setUint16(offset + 8, entries.length, true); // entries on this disk
  view.setUint16(offset + 10, entries.length, true); // entries in total
  view.setUint32(offset + 12, centralSize, true);
  view.setUint32(offset + 16, centralOffset, true);
  view.setUint16(offset + 20, 0, true); // no comment
  return out;
}


/** Hands a blob to the browser as a download, then releases its URL. */
function triggerDownload(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking straight away can cancel the download in some browsers, so give
  // it time to actually start first.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
