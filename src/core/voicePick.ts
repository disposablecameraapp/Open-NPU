import type { CatalogItem } from "../shared/api";
import { scoreOf } from "./scores";

/** `voiceModelId` values: "" is the fast model chosen by the app, "chat" the model of the conversation, anything else a model by id. */
export const VOICE_MODEL_AUTO = "";
export const VOICE_MODEL_CHAT = "chat";

/** Models too slow to answer in a conversation: they think at length or are made for code. */
const NOT_FOR_TALK = /coder|r1|reasoning|thinking|math/i;

/** Left out of the automatic choice: seen to repeat themselves a lot and to take repetition penalties badly, which a spoken answer cannot hide. */
const REPEATS = /qwen3-1\.7b|phi-4-mini/i;
/** The model voice chat prefers when installed: the GenieX build first (Foundry Local refuses repetition penalties), then Foundry's. The 4B is one menu choice away. */
const PREFERRED = [/^qwen3\.5-2b$/i];
/** The two Qwen3.5 sizes offered in the voice screen's menu. */
export const VOICE_SIZES = [/^qwen3\.5-2b$/i, /^qwen3\.5-4b$/i];

/**
 * The model voice chat talks with when the person has not chosen one: small (so it sits on the NPU beside the speech models), known to run
 * wholly on the NPU, and the best of those by quality plus speed from the app's own measures. A model never measured is not guessed at.
 */
export function preferredVoiceModel(items: CatalogItem[]): CatalogItem | null {
  for (const re of PREFERRED) {
    const preferred = items.filter((i) => i.installed && !i.hidden && re.test(i.entry.name.replace(/\s*\(Foundry Local\)/i, "").trim()));
    const hit = preferred.find((i) => !i.entry.id.startsWith("foundry:")) ?? preferred[0];
    if (hit) return hit;
  }
  return null;
}

/** The installed models of the voice screen's menu (2B, 4B), the GenieX build before Foundry's. */
export function voiceMenuItems(items: CatalogItem[]): CatalogItem[] {
  const out: CatalogItem[] = [];
  for (const re of VOICE_SIZES) {
    const hits = items.filter((i) => i.installed && !i.hidden && re.test(i.entry.name.replace(/\s*\(Foundry Local\)/i, "").trim()));
    const hit = hits.find((i) => !i.entry.id.startsWith("foundry:")) ?? hits[0];
    if (hit) out.push(hit);
  }
  return out;
}

/** Size in billions of parameters of the model a conversation uses (a Dynamic model counts as the biggest of its pack); null when unknown. */
export function sizeOfChatModel(item: CatalogItem | null | undefined): number | null {
  const e = item?.entry;
  if (!e) return null;
  if (e.paramsB && e.paramsB > 0) return e.paramsB;
  return e.sizeGB > 0 ? e.sizeGB / 0.6 : null;
}

/**
 * The automatic voice model is always one of the two made for it, the one nearest in size to the conversation's model (a 4B or a 9B chat goes
 * to the 4B, a 2B or smaller to the 2B); the other one when only that one is installed. Null when neither is installed.
 */
export function voiceModelNear(items: CatalogItem[], targetB: number | null | undefined): CatalogItem | null {
  const menu = voiceMenuItems(items);
  if (menu.length < 2 || targetB == null) return menu[0] ?? null;
  return targetB > Math.sqrt(8) ? menu[1] : menu[0];
}

/** Other installed models that can be chosen by hand for the voice chat. */
export function otherVoiceItems(items: CatalogItem[]): CatalogItem[] {
  const menu = new Set(voiceMenuItems(items).map((i) => i.entry.id));
  return items.filter((i) => i.installed && !i.hidden && !menu.has(i.entry.id) && !i.entry.id.startsWith("dynamic") && !NOT_FOR_TALK.test(i.entry.name) && !REPEATS.test(i.entry.name) && i.entry.sizeGB <= 6);
}

export function fastVoiceModel(items: CatalogItem[], targetB?: number | null): CatalogItem | null {
  const mine = targetB === undefined ? preferredVoiceModel(items) : voiceModelNear(items, targetB);
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
  return fastVoiceModel(items, sizeOfChatModel(selected)) ?? selected;
}
