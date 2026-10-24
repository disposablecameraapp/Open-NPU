import { GgufInfo } from "../shared/types";

/** Thrown when the buffer ends inside the metadata: fetch more bytes and retry. */
export class NeedMoreData extends Error {
  constructor() {
    super("need more data");
  }
}

class Reader {
  off = 0;
  constructor(readonly b: Buffer) {}
  need(n: number) {
    if (this.off + n > this.b.length) throw new NeedMoreData();
  }
  u8() { this.need(1); return this.b.readUInt8(this.off++); }
  i8() { this.need(1); return this.b.readInt8(this.off++); }
  u16() { this.need(2); const v = this.b.readUInt16LE(this.off); this.off += 2; return v; }
  i16() { this.need(2); const v = this.b.readInt16LE(this.off); this.off += 2; return v; }
  u32() { this.need(4); const v = this.b.readUInt32LE(this.off); this.off += 4; return v; }
  i32() { this.need(4); const v = this.b.readInt32LE(this.off); this.off += 4; return v; }
  f32() { this.need(4); const v = this.b.readFloatLE(this.off); this.off += 4; return v; }
  f64() { this.need(8); const v = this.b.readDoubleLE(this.off); this.off += 8; return v; }
  u64() { this.need(8); const v = Number(this.b.readBigUInt64LE(this.off)); this.off += 8; return v; }
  i64() { this.need(8); const v = Number(this.b.readBigInt64LE(this.off)); this.off += 8; return v; }
  str() {
    const n = this.u64();
    this.need(n);
    const s = this.b.toString("utf8", this.off, this.off + n);
    this.off += n;
    return s;
  }
}

type Value = number | boolean | string | number[] | null;

function scalar(r: Reader, type: number): number | boolean | string {
  switch (type) {
    case 0: return r.u8();
    case 1: return r.i8();
    case 2: return r.u16();
    case 3: return r.i16();
    case 4: return r.u32();
    case 5: return r.i32();
    case 6: return r.f32();
    case 7: return r.u8() !== 0;
    case 8: return r.str();
    case 10: return r.u64();
    case 11: return r.i64();
    case 12: return r.f64();
    default: throw new Error(`unsupported GGUF value type ${type}`);
  }
}

const FIXED_SIZE: Record<number, number> = { 0: 1, 1: 1, 2: 2, 3: 2, 4: 4, 5: 4, 6: 4, 7: 1, 10: 8, 11: 8, 12: 8 };

/** Keys kept in full; large arrays (tokenizer) are skipped without being materialized. */
function value(r: Reader, type: number, keep: boolean): Value {
  if (type !== 9) {
    const v = scalar(r, type);
    return typeof v === "boolean" ? v : v;
  }
  const et = r.u32();
  const n = r.u64();
  if (et === 8) {
    for (let i = 0; i < n; i++) {
      const len = r.u64();
      r.need(len);
      r.off += len;
    }
    return null;
  }
  const size = FIXED_SIZE[et];
  if (size === undefined) throw new Error(`unsupported GGUF array type ${et}`);
  if (!keep || n > 4096) {
    r.need(n * size);
    r.off += n * size;
    return null;
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(Number(scalar(r, et)));
  return out;
}

export interface GgufMetadata {
  version: number;
  tensorCount: number;
  kv: Record<string, Value>;
}

const KEEP = /(^general\.(architecture|name|file_type|size_label)$)|\.(block_count|context_length|embedding_length|feed_forward_length|expert_count|expert_used_count|full_attention_interval|attention\.head_count|attention\.head_count_kv|attention\.key_length)$/;

/** Parse the metadata section of a GGUF file from its first bytes. Throws NeedMoreData if truncated. */
export function parseGgufMetadata(buf: Buffer): GgufMetadata {
  const r = new Reader(buf);
  r.need(4);
  if (buf.toString("ascii", 0, 4) !== "GGUF") throw new Error("not a GGUF file");
  r.off = 4;
  const version = r.u32();
  if (version < 2) throw new Error(`unsupported GGUF version ${version}`);
  const tensorCount = r.u64();
  const kvCount = r.u64();
  const kv: Record<string, Value> = {};
  for (let i = 0; i < kvCount; i++) {
    const key = r.str();
    const type = r.u32();
    const keep = KEEP.test(key);
    const v = value(r, type, keep);
    if (keep) kv[key] = v;
  }
  return { version, tensorCount, kv };
}

const num = (v: Value | undefined): number | null => (typeof v === "number" ? v : null);

/** Turn raw metadata into what the fit check needs. Hybrid models count attention layers only. */
export function summarize(meta: GgufMetadata, fileSizeGB?: number): GgufInfo {
  const kv = meta.kv;
  const arch = String(kv["general.architecture"] ?? "unknown");
  const get = (k: string) => kv[`${arch}.${k}`];

  const blockCount = num(get("block_count"));
  const headCountRaw = get("attention.head_count");
  const kvRaw = get("attention.head_count_kv");
  const embed = num(get("embedding_length"));

  let headCount: number | null = null;
  if (typeof headCountRaw === "number") headCount = headCountRaw;
  else if (Array.isArray(headCountRaw)) headCount = Math.max(0, ...headCountRaw) || null;

  let attentionLayers: number | null = blockCount;
  let kvHeads: number | null = null;
  if (Array.isArray(kvRaw)) {
    // per-layer array: 0 means no attention (conv / SSM layer)
    const attn = kvRaw.filter((x) => x > 0);
    attentionLayers = attn.length;
    kvHeads = attn.length ? Math.max(...attn) : null;
  } else if (typeof kvRaw === "number") {
    kvHeads = kvRaw;
    const interval = num(get("full_attention_interval"));
    if (interval && blockCount) attentionLayers = Math.floor(blockCount / interval);
  } else if (headCount) {
    kvHeads = headCount;
  }

  const keyLen = num(get("attention.key_length"));
  const headDim = keyLen ?? (embed && headCount ? Math.floor(embed / headCount) : null);

  let paramsB: number | null = null;
  const label = String(kv["general.size_label"] ?? "");
  const m = /(\d+(?:\.\d+)?)\s*B/i.exec(label);
  if (m) paramsB = parseFloat(m[1]);
  else if (fileSizeGB) paramsB = Math.round((fileSizeGB / 0.56) * 10) / 10; // ~4.5 bits/weight

  return {
    architecture: arch,
    name: typeof kv["general.name"] === "string" ? (kv["general.name"] as string) : null,
    blockCount,
    attentionLayers,
    headCount,
    kvHeads,
    headDim,
    contextLength: num(get("context_length")),
    expertCount: num(get("expert_count")),
    paramsB
  };
}

export type RangeFetcher = (start: number, endInclusive: number) => Promise<Buffer>;

/** Read just the header with growing range requests (512 KB, then x4 up to maxBytes). */
export async function readGgufHeader(fetchRange: RangeFetcher, maxBytes = 64 * 1024 * 1024): Promise<GgufMetadata> {
  let size = 512 * 1024;
  for (;;) {
    const buf = await fetchRange(0, size - 1);
    try {
      return parseGgufMetadata(buf);
    } catch (e) {
      if (!(e instanceof NeedMoreData)) throw e;
      if (buf.length < size) throw new Error("GGUF header is truncated");
      if (size >= maxBytes) throw new Error("GGUF header too large");
      size = Math.min(size * 4, maxBytes);
    }
  }
}
