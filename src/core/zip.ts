// A small zip reader and writer, enough for Office files (docx, xlsx, pptx are zips of XML). No dependency: the
// browser and Node both have CompressionStream / DecompressionStream.

export type ZipFiles = Record<string, Uint8Array>;

const enc = new TextEncoder();
const dec = new TextDecoder();
export const toBytes = (s: string) => enc.encode(s);
export const fromBytes = (b: Uint8Array) => dec.decode(b);

let table: Uint32Array | null = null;
export function crc32(data: Uint8Array): number {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  }
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = table[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function pipe(data: Uint8Array, stream: { writable: WritableStream; readable: ReadableStream }): Promise<Uint8Array> {
  const w = stream.writable.getWriter();
  void w.write(data as BufferSource).then(() => w.close()).catch(() => undefined);
  const chunks: Uint8Array[] = [];
  const r = stream.readable.getReader();
  for (;;) { const { done, value } = await r.read(); if (done) break; chunks.push(value); }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/** Entries of a zip by name. Throws a readable message when it is not a zip. */
export async function readZip(bytes: Uint8Array): Promise<ZipFiles> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) if (v.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error("This file is not a valid Office file (no zip structure).");
  const count = v.getUint16(end + 10, true);
  let p = v.getUint32(end + 16, true);
  const out: ZipFiles = {};
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error("The zip directory is damaged.");
    const method = v.getUint16(p + 10, true);
    const csize = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = fromBytes(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/")) continue;
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + csize);
    if (method === 0) out[name] = raw.slice();
    else if (method === 8) out[name] = await pipe(raw, new DecompressionStream("deflate-raw"));
    else throw new Error(`Unsupported zip compression (${method}) in ${name}.`);
  }
  return out;
}

/** A zip with the given entries (deflated when the platform can, stored otherwise). */
export async function writeZip(files: ZipFiles): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, data] of Object.entries(files)) {
    const nm = toBytes(name);
    const crc = crc32(data);
    let body = data, method = 0;
    if (typeof CompressionStream !== "undefined" && data.length > 64) {
      try { const z = await pipe(data, new CompressionStream("deflate-raw")); if (z.length < data.length) { body = z; method = 8; } } catch { /* stored */ }
    }
    const head = new Uint8Array(30 + nm.length);
    const h = new DataView(head.buffer);
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, method, true);
    h.setUint16(10, 0, true); h.setUint16(12, 0x21, true); // 1980-01-01
    h.setUint32(14, crc, true); h.setUint32(18, body.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nm.length, true);
    head.set(nm, 30);
    const cen = new Uint8Array(46 + nm.length);
    const c = new DataView(cen.buffer);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, method, true);
    c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, body.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nm.length, true);
    c.setUint32(42, offset, true);
    cen.set(nm, 46);
    parts.push(head, body);
    central.push(cen);
    offset += head.length + body.length;
  }
  const dirSize = central.reduce((n, c) => n + c.length, 0);
  const tail = new Uint8Array(22);
  const t = new DataView(tail.buffer);
  t.setUint32(0, 0x06054b50, true); t.setUint16(8, central.length, true); t.setUint16(10, central.length, true); t.setUint32(12, dirSize, true); t.setUint32(16, offset, true);
  const all = [...parts, ...central, tail];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of all) { out.set(p, at); at += p.length; }
  return out;
}
