import { Sampling } from "../shared/types";

/** Safe thinking-model set, used when a model family is unknown (spec). */
export const SAFE_SAMPLING: Sampling = { temperature: 0.6, top_p: 0.95, presence_penalty: 1.5, max_tokens: 8192 };

const FAMILIES: { match: RegExp; id: string; sampling: Sampling }[] = [
  { match: /qwen[-_ ]?3(\.5)?/i, id: "qwen3", sampling: { temperature: 0.6, top_p: 0.95, top_k: 20, presence_penalty: 1.5, max_tokens: 8192 } },
  { match: /granite/i, id: "granite", sampling: { temperature: 1.0, top_p: 0.95, presence_penalty: 1.5, max_tokens: 8192 } },
  { match: /nemotron/i, id: "nemotron", sampling: { temperature: 0.6, top_p: 0.95, presence_penalty: 1.5, max_tokens: 6144 } },
  { match: /nanbeige/i, id: "nanbeige", sampling: { temperature: 0.6, top_p: 0.95, repetition_penalty: 1.0, max_tokens: 16384 } },
  { match: /ministral|mistral/i, id: "ministral", sampling: { temperature: 0.7, top_p: 0.95, repetition_penalty: 1.05, max_tokens: 6144 } },
  // LFM2.5: model card values (Liquid AI recommends low temperature with top-k / repetition penalty).
  { match: /lfm2?\.?5?/i, id: "lfm", sampling: { temperature: 0.3, top_p: 1.0, top_k: 50, repetition_penalty: 1.05, max_tokens: 8192 } }
];

/**
 * Small models fall into loops on a long answer when nothing punishes a repeat. A model with no penalty of its own gets one that grows as
 * it shrinks (Qwen2.5's own config uses 1.05 to 1.1); one that already has a penalty is left as tuned.
 */
export function withLoopGuard(s: Sampling, paramsB: number | undefined): Sampling {
  if (s.presence_penalty !== undefined || s.repetition_penalty !== undefined) return s;
  const size = paramsB ?? 3;
  const penalty = size <= 1 ? 1.15 : size <= 2 ? 1.1 : size <= 4 ? 1.08 : 1.05;
  return { ...s, repetition_penalty: penalty };
}

export function samplingFor(modelName: string): { family: string | null; sampling: Sampling } {
  const f = FAMILIES.find((x) => x.match.test(modelName));
  return f ? { family: f.id, sampling: { ...f.sampling } } : { family: null, sampling: { ...SAFE_SAMPLING } };
}

/** Values from a repo's generation_config.json, when present, override the family defaults. */
export function samplingFromGenerationConfig(cfg: unknown, base: Sampling): Sampling {
  if (!cfg || typeof cfg !== "object") return base;
  const c = cfg as Record<string, unknown>;
  const n = (k: string) => (typeof c[k] === "number" ? (c[k] as number) : undefined);
  return {
    ...base,
    temperature: n("temperature") ?? base.temperature,
    top_p: n("top_p") ?? base.top_p,
    top_k: n("top_k") ?? base.top_k,
    repetition_penalty: n("repetition_penalty") ?? base.repetition_penalty
  };
}

/** Body fields for /v1/chat/completions. Explicit on every request: GenieX defaults made thinking models loop. */
export function requestSampling(s: Sampling): Record<string, number> {
  const out: Record<string, number> = { temperature: s.temperature, top_p: s.top_p, max_tokens: s.max_tokens };
  if (s.top_k !== undefined) out.top_k = s.top_k;
  if (s.presence_penalty !== undefined) out.presence_penalty = s.presence_penalty;
  if (s.frequency_penalty !== undefined) out.frequency_penalty = s.frequency_penalty;
  if (s.repetition_penalty !== undefined) out.repetition_penalty = s.repetition_penalty;
  return out;
}

/**
 * Sampling for the short worker sessions that write, fix and plan files. The chat values are tuned for prose: a high
 * presence penalty (1.5) punishes tokens that were already used, but code is made of repeats ({, const, ctx, ids) and a
 * hot temperature breaks names copied from other files. Workers get a cooler, nearly repeat-neutral setting.
 */
export function codeSampling(s: Sampling): Sampling {
  return {
    ...s,
    temperature: Math.min(s.temperature, 0.25),
    top_p: Math.min(s.top_p, 0.9),
    presence_penalty: s.presence_penalty === undefined ? undefined : Math.min(s.presence_penalty, 0.3)
  };
}

/**
 * The setting for a new try after the model looped, firmer each time. Every kind of penalty is asked for, because engines accept
 * different ones (llama.cpp the repetition penalty, Foundry Local only what its REST reference lists); an engine that refuses a field
 * has it taken out and remembered (`streamChat`), and the temperature, which every engine takes, does the rest.
 */
export function loopRetrySampling(s: Sampling, attempt: number): Sampling {
  return {
    ...s,
    temperature: Math.min(1, s.temperature + 0.15 * attempt),
    frequency_penalty: Math.max(s.frequency_penalty ?? 0, 0.3 * attempt),
    repetition_penalty: Math.min(1.3, Math.max(s.repetition_penalty ?? 1, 1.05 + 0.05 * attempt))
  };
}
