import type { CatalogItem } from "../shared/api";
import { scoreOf } from "./scores";

/** `voiceModelId` values: "" is the fast model chosen by the app, "chat" the model of the conversation, anything else a model by id. */
export const VOICE_MODEL_AUTO = "";
export const VOICE_MODEL_CHAT = "chat";

/** Models too slow to answer in a conversation: they think at length or are made for code. */
const NOT_FOR_TALK = /coder|r1|reasoning|thinking|math/i;

/** Left out of the automatic choice: seen to repeat themselves a lot and to take repetition penalties badly, which a spoken answer cannot hide. */
const REPEATS = /qwen3-1\.7b|phi-4-mini/i;
/** The model voice chat prefers when it is installed: the GenieX build first (Foundry Local refuses repetition penalties), then Foundry's. */
const PREFERRED = /^qwen3\.5-2b$/i;

/**
 * The model voice chat talks with when the person has not chosen one: small (so it sits on the NPU beside the speech models), known to run
 * wholly on the NPU, and the best of those by quality plus speed from the app's own measures. A model never measured is not guessed at.
 */
export function preferredVoiceModel(items: CatalogItem[]): CatalogItem | null {
  const preferred = items.filter((i) => i.installed && !i.hidden && PREFERRED.test(i.entry.name.replace(/\s*\(Foundry Local\)/i, "").trim()));
  return preferred.find((i) => !i.entry.id.startsWith("foundry:")) ?? preferred[0] ?? null;
}

export function fastVoiceModel(items: CatalogItem[]): CatalogItem | null {
  const mine = preferredVoiceModel(items);
  if (mine) return mine;
  let best: { item: CatalogItem; fit: number } | null = null;
  for (const item of items) {
    if (REPEATS.test(item.entry.name)) continue;
    const e = item.entry;
    if (!item.installed || item.hidden || e.id.startsWith("dynamic") || NOT_FOR_TALK.test(e.name) || e.sizeGB > 2.6) continue;
    const s = scoreOf(e);
    const on = item.runsOn ?? s?.runsOn;
    if (!s || on !== "npu" || s.quality < 60 || !s.tokPerSec) continue;
    const fit = s.quality + Math.min(s.tokPerSec, 60);
    if (!best || fit > best.fit) best = { item, fit };
  }
  return best?.item ?? null;
}

/** The model for a voice conversation. Falls back to the conversation's own model when the chosen one is not there. */
export function pickVoiceItem(items: CatalogItem[], setting: string, selected: CatalogItem | null): CatalogItem | null {
  if (setting === VOICE_MODEL_CHAT) return selected;
  if (setting !== VOICE_MODEL_AUTO) return items.find((i) => i.installed && i.entry.id === setting) ?? selected;
  return fastVoiceModel(items) ?? selected;
}
