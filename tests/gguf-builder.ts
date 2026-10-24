// Builds small synthetic GGUF headers for tests.
interface Opts {
  arch: string; blocks: number; heads: number; kvHeads?: number; kvHeadsArray?: number[];
  embed: number; keyLength?: number; ctx?: number; name?: string; expertCount?: number; padTokens?: number;
}

const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const u64 = (n: number) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const str = (s: string) => Buffer.concat([u64(Buffer.byteLength(s)), Buffer.from(s)]);

export function buildGguf(o: Opts): Buffer {
  const kvs: Buffer[] = [];
  const add = (k: string, t: number, v: Buffer) => kvs.push(Buffer.concat([str(k), u32(t), v]));
  add("general.architecture", 8, str(o.arch));
  if (o.name) add("general.name", 8, str(o.name));
  add(`${o.arch}.block_count`, 4, u32(o.blocks));
  add(`${o.arch}.embedding_length`, 4, u32(o.embed));
  add(`${o.arch}.attention.head_count`, 4, u32(o.heads));
  if (o.kvHeadsArray) add(`${o.arch}.attention.head_count_kv`, 9, Buffer.concat([u32(4), u64(o.kvHeadsArray.length), ...o.kvHeadsArray.map(u32)]));
  else if (o.kvHeads) add(`${o.arch}.attention.head_count_kv`, 4, u32(o.kvHeads));
  if (o.keyLength) add(`${o.arch}.attention.key_length`, 4, u32(o.keyLength));
  if (o.ctx) add(`${o.arch}.context_length`, 4, u32(o.ctx));
  if (o.expertCount) add(`${o.arch}.expert_count`, 4, u32(o.expertCount));
  if (o.padTokens) {
    const toks = Array.from({ length: o.padTokens }, (_, i) => str(`tok${i}`));
    add("tokenizer.ggml.tokens", 9, Buffer.concat([u32(8), u64(toks.length), ...toks]));
  }
  return Buffer.concat([Buffer.from("GGUF"), u32(3), u64(0), u64(kvs.length), ...kvs]);
}
