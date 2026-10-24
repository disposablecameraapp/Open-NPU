import { Sampling } from "../shared/types";

/** Safe thinking-model set, used when a model family is unknown (spec). */
export const SAFE_SAMPLING: Sampling = { temperature: 0.6, top_p: 0.95, presence_penalty: 1.5, max_tokens: 8192 };

const FAMILIES: { match: RegExp; id: string; sampling: Sampling }[] = [
  { match: /qwen[-_ ]?3(\.5)?/i, id: "qwen3", sampling: { temperature: 0.6, top_p: 0.95, top_k: 20, presence_penalty: 1.5, max_tokens: 8192 } },
  { match: /granite/i, id: "granite", sampling: { temperature: 1.0, top_p: 0.95, presence_penalty: 1.5, max_tokens: 8192 } },
  { match: /nemotron/i, id: "nemotron", sampling: { temperature: 0.6, top_p: 0.95, presence_penalty: 1.5, max_tokens: 6144 } },
  { match: /nanbeige/i, id: "nanbeige", sampling: { temperature: 0.6, top_p: 0.95, repetition_penalty: 1.0, max_tokens: 16384 } },
  { match: /ministral|mistral/i, id: "ministral", sampling: { temperature: 0.7, top_p: 0.95, max_tokens: 6144 } },
  // LFM2.5: model card values (Liquid AI recommends low temperature with top-k / repetition penalty).
  { match: /lfm2?\.?5?/i, id: "lfm", sampling: { temperature: 0.3, top_p: 1.0, top_k: 50, repetition_penalty: 1.05, max_tokens: 8192 } }
];

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
