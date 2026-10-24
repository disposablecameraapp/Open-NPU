import { KvShape } from "../shared/types";

/** Fixed runtime overhead measured on the test laptop (LFM2.5: 4.7 GB file used 5.6 GB at 4K context). */
export const OVERHEAD_GB = 0.9;
/** Keep a margin under the NPU ceiling: overflowing it crashes the server instead of erroring. */
export const SAFETY_FACTOR = 0.92;
export const GB = 1024 ** 3;
const MIN_CONTEXT = 2048;
const STEP = 1024;

/** K + V, f16 cache: 2 tensors x layers x kvHeads x headDim x 2 bytes. Attention layers only (hybrids are cheap). */
export function kvBytesPerToken(kv: KvShape): number {
  return 2 * kv.attentionLayers * kv.kvHeads * kv.headDim * 2;
}

export function npuNeededGB(fileGB: number, kv: KvShape | undefined, contextTokens: number): number {
  const kvGB = kv ? (kvBytesPerToken(kv) * contextTokens) / GB : 0;
  return fileGB + OVERHEAD_GB + kvGB;
}

export function usableBudgetGB(npuBudgetGB: number): number {
  return npuBudgetGB * SAFETY_FACTOR;
}

/** Largest context (multiple of 1K, capped) that fits the budget. 0 when even the weights do not fit. */
export function maxContextTokens(
  fileGB: number,
  kv: KvShape | undefined,
  npuBudgetGB: number,
  cap = 131072
): number {
  const room = usableBudgetGB(npuBudgetGB) - fileGB - OVERHEAD_GB;
  if (room <= 0) return 0;
  if (!kv) return cap;
  const perToken = kvBytesPerToken(kv) / GB;
  if (perToken <= 0) return cap;
  const raw = Math.floor(room / perToken);
  const stepped = Math.floor(raw / STEP) * STEP;
  return Math.max(0, Math.min(cap, stepped));
}

/**
 * Context to launch with: the wish, shrunk to fit, never above a context that was
 * tested to work. Returns 0 if the model cannot fit even the minimum context.
 */
export function fitContext(opts: {
  fileGB: number;
  kv?: KvShape;
  npuBudgetGB: number;
  wanted: number;
  maxTested?: number;
}): number {
  let cap = maxContextTokens(opts.fileGB, opts.kv, opts.npuBudgetGB);
  if (opts.maxTested) cap = Math.min(cap, opts.maxTested);
  if (cap < MIN_CONTEXT) return 0;
  return Math.max(MIN_CONTEXT, Math.min(opts.wanted, cap));
}

/**
 * Speed estimate from file size, fitted on two measured runs of dense models
 * (5.4 GB ~ 8 tok/s, 2.3 GB ~ 14 tok/s): tok/s = 24.2 * size^-0.656.
 * MoE models only read active experts, so they run faster than their file size suggests;
 * the factor is a rough placeholder to be replaced by measured runs.
 */
export function estimateTokPerSec(fileGB: number, isMoe: boolean): number {
  const size = isMoe ? Math.max(0.5, fileGB * 0.35) : fileGB;
  return Math.round(24.2 * Math.pow(size, -0.656) * 10) / 10;
}

export function ramWarning(ramPercent: number): boolean {
  return ramPercent > 90;
}
