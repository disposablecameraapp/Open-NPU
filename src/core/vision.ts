import type { CatalogEntry, ChatMessage, ContentPart } from "../shared/types";
import { visionSupport } from "./effort";

/**
 * A model that cannot see images still gets them: a model that can looks at each one first and writes down what is in it, and
 * the description goes with the user's message to the model that does the work. Nothing here knows which models exist; main picks.
 */

export const DESCRIBE_INSTRUCTIONS = [
  "You describe an image for another assistant that cannot see it. Everything it knows about the image is what you write.",
  "Be exact and compact (under 250 words): what the image shows and how it is laid out; every readable piece of text copied exactly (code, error messages, labels, numbers, menu items); colours that matter.",
  "For a screenshot of a program, page or game: say what each part is and what looks broken, wrong or missing. For a chart: its type, axes and the values you can read. For a photo: the subject, the setting and the details that matter.",
  "Never guess beyond what is visible. No greeting, no questions."
].join("\n");

export const describePrompt = (question: string) => `Describe this image.${question.trim() ? `\n\nThe user's message about it, so you can focus on what it needs:\n"${question.trim().slice(0, 800)}"` : ""}`;

export interface ImageRef { message: number; part: number; url: string }

/** Every image of a conversation, by where it is. */
export function imagesOf(messages: ChatMessage[]): ImageRef[] {
  const out: ImageRef[] = [];
  messages.forEach((m, message) => {
    if (typeof m.content === "string") return;
    m.content.forEach((p, part) => { if (p.type === "image_url") out.push({ message, part, url: p.image_url.url }); });
  });
  return out;
}

/** A short stable key for an image, to remember its description (the data URL itself is far too long to keep as a key). */
export function imageKey(url: string): string {
  let h = 5381;
  const step = Math.max(1, Math.floor(url.length / 4000));
  for (let i = 0; i < url.length; i += step) h = (Math.imul(h, 33) + url.charCodeAt(i)) | 0;
  for (const c of url.slice(-64)) h = (Math.imul(h, 33) + c.charCodeAt(0)) | 0; // the end of the data too: a small edit shows there
  return `${url.length}:${h}`;
}

/** The messages with each image replaced by its description, as text the receiving model reads as part of the message. */
export function swapImages(messages: ChatMessage[], describe: (ref: ImageRef, n: number) => string): ChatMessage[] {
  let n = 0;
  return messages.map((m, message) => {
    if (typeof m.content === "string") return m;
    const parts: ContentPart[] = m.content.map((p, part) => (p.type === "image_url" ? { type: "text" as const, text: describe({ message, part, url: p.image_url.url }, ++n) } : p));
    // the images came first and the text after: join the descriptions and the text into one message
    return { ...m, content: parts.map((p) => (p.type === "text" ? p.text : "")).filter(Boolean).join("\n\n") };
  });
}

export const imageBlock = (n: number, description: string, model: string) => `[Image ${n}, described by ${model} because you cannot see images. What follows is everything known about it.]\n${description.trim()}\n[End of image ${n}]`;
export const imageLost = (n: number, why: string) => `[Image ${n} was attached but could not be read: ${why}. Say so if the answer depends on it.]`;

/** The installed models that can look at an image, the one already loaded first (no load), then the smallest (the quickest to load). */
export function describers(installed: CatalogEntry[], loaded?: CatalogEntry | null, preferred: (CatalogEntry | null | undefined)[] = []): CatalogEntry[] {
  const seen = new Set<string>();
  const ok = (e: CatalogEntry | null | undefined): e is CatalogEntry => !!e && visionSupport(e) && !seen.has(e.id) && (seen.add(e.id), true);
  const rest = installed.filter((e) => visionSupport(e)).sort((a, b) => (a.sizeGB ?? 99) - (b.sizeGB ?? 99));
  return [...preferred, loaded, ...rest].filter(ok);
}
