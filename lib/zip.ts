import { deflateRawSync } from 'node:zlib';

/**
 * The smallest ZIP writer that does the job: a handful of files, already
 * JSON, that want to come out as one download.
 *
 * Hand-rolled rather than pulled in as a dependency (`archiver`, `jszip`) because
 * the format is fixed and boring when you know the sizes up front — which we do,
 * because every entry is serialised into memory before it is written. A local
 * file header per entry, a central directory, an end-of-central-directory
 * record: three structures, no streaming, no ZIP64, no data descriptors.
 *
 * Compression is Node's own `zlib.deflateRawSync` (deflate is ZIP's method 8,
 * which is raw deflate with no zlib wrapper), which matters a lot here: raw
 * game exports are JSON, so the archive lands around a tenth of the size it
 * would be stored uncompressed. An entry that deflate *enlarges* (tiny or
 * already-compressed payloads) is written stored instead, method 0, so the
 * archive can never be bigger than the sum of its parts.
 *
 * Filenames are written as UTF-8 with general-purpose bit 11 set, which is how a
 * ZIP reader knows to decode them — a tournament called "Winter Cup ✦ 2026"
 * must not come out as mojibake on Windows.
 */

export interface ZipEntry {
  /** Forward-slash path inside the archive. */
  name: string;
  data: Buffer;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

/** CRC-32 as ZIP defines it (the same polynomial zlib and PNG use). */
function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS date/time pair, which ZIP still uses for timestamps. */
function dosTimestamp(at: Date): { time: number; date: number } {
  // The format starts at 1980; anything earlier (or an invalid Date) is pinned
  // there rather than producing a negative field the reader would reject.
  const year = Number.isNaN(at.getTime()) ? 1980 : Math.max(1980, at.getFullYear());
  return {
    time: (at.getHours() << 11) | (at.getMinutes() << 5) | Math.floor(at.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate(),
  };
}

/** Build a complete .zip in memory from its entries. */
export function createZip(entries: ZipEntry[], modifiedAt: Date = new Date()): Buffer {
  const { time, date } = dosTimestamp(modifiedAt);
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const crc = crc32(entry.data);
    const deflated = deflateRawSync(entry.data, { level: 9 });
    const stored = deflated.length >= entry.data.length;
    const body = stored ? entry.data : deflated;
    const method = stored ? 0 : 8;

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed to extract (2.0)
    local.writeUInt16LE(0x0800, 6); // bit 11: the name below is UTF-8
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // extra field length
    name.copy(local, 30);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0); // central directory header signature
    central.writeUInt16LE(0x031e, 4); // made by: Unix, ZIP 3.0
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra field length
    central.writeUInt16LE(0, 32); // file comment length
    central.writeUInt16LE(0, 34); // disk number start
    central.writeUInt16LE(0, 36); // internal attributes
    central.writeUInt32LE(0x81a40000, 38); // external attributes: -rw-r--r--
    central.writeUInt32LE(offset, 42); // offset of the local header
    name.copy(central, 46);

    locals.push(local, body);
    centrals.push(central);
    offset += local.length + body.length;
  }

  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory signature
  end.writeUInt16LE(0, 4); // this disk
  end.writeUInt16LE(0, 6); // disk with the central directory
  end.writeUInt16LE(entries.length, 8); // entries on this disk
  end.writeUInt16LE(entries.length, 10); // entries in total
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // archive comment length

  return Buffer.concat([...locals, directory, end]);
}
