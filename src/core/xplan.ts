/**
 * The planning side of a page of blocks, with no model in it: reading the outline a small model wrote (and falling back to a
 * fixed outline when it wrote nothing usable), the list of names the later steps are told so they agree with each other, and the
 * mending of a fragment: whatever is not exactly the form the checker keeps is REPLACED by the right one, never only reported,
 * so a page written over many calls ends up in one consistent form.
 */
import { xMend } from "./xcheck";
import { X_DOCS } from "./xdocs";

export interface XSection { id: string; title: string; kind: "screen" | "overlay"; blocks: string[]; topics: string[] }
export interface XArt { name: string; w: number; h: number; about: string }
export interface XOutline { style: string; state: Record<string, string | number>; sections: XSection[]; wanted: string[]; art: XArt[] }

export const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24) || "part";

const KNOWN = new Set(X_DOCS.map((d) => d.name));
/** What a model calls a block that is really the core (a list, a panel, a rule) or nothing. */
const CORE_WORDS = new Set(["core", "none", "html", "css", "ui", "hud", "menu", "inventory", "inventaire", "state", "rule", "rules", "list", "scene", "panel", "button", "text", "-", "–", "n/a", "no", "nothing"]);

export const sectionKind = (title: string): "screen" | "overlay" => (/\b(hud|overlay|status|score ?board|interface|toolbar|bar|panel|inventory|inventaire)\b/i.test(title) ? "overlay" : "screen");

/** The numbers a game keeps: "lives=3, score=0" in any order, any separator. */
export function parseState(text: string): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const m of text.matchAll(/([A-Za-z_][\w-]*)\s*[=:]\s*("[^"]*"|'[^']*'|[^\s,;|]+)/g)) {
    const name = m[1].toLowerCase().replace(/-/g, "_");
    const raw = m[2].replace(/^["']|["']$/g, "");
    out[name] = raw !== "" && !isNaN(Number(raw)) ? Number(raw) : raw;
  }
  return out;
}

/** The outline a small model wrote, read generously: numbering, bullets, bold, any case, missing parts. */
export function parseOutline(reply: string): XOutline {
  const out: XOutline = { style: "", state: {}, sections: [], wanted: [], art: [] };
  const used = new Set<string>();
  for (const raw of reply.replace(/<think>[\s\S]*?<\/think>/g, " ").split("\n")) {
    const line = raw.replace(/^[\s>*#\-\d.)]+/, "").replace(/\*\*/g, "").trim();
    const m = /^(style|look|state|states|art|section\s*\d*|screen\s*\d*)\s*[:\-]\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    if (key === "style" || key === "look") out.style = m[2].trim();
    else if (key.startsWith("state")) Object.assign(out.state, parseState(m[2]));
    else if (key === "art") {
      const [name, size, ...about] = m[2].split("|").map((x) => x.trim());
      const dim = /(\d+)\s*[x×]\s*(\d+)/.exec(size ?? "");
      // a small model that copies one description onto every line, repeats a name or writes its instructions back is not given a drawing per line
      const aboutText = (dim ? about.join(" ") : [size, ...about].filter(Boolean).join(" ")).trim().toLowerCase();
      if (!name || out.art.some((a) => a.name === slug(name)) || name.split(/\s+/).length > 4 || /\b(repeat|closing|file|tag|message)\b/i.test(name) || (aboutText && out.art.some((a) => a.about.trim().toLowerCase() === aboutText))) continue;
      if (name && /[a-z]/i.test(name)) out.art.push({ name: slug(name), w: dim ? Math.min(512, +dim[1]) : 32, h: dim ? Math.min(512, +dim[2]) : 32, about: (dim ? about.join(" ") : [size, ...about].filter(Boolean).join(" ")).trim() || name });
    }
    else {
      const parts = m[2].split("|").map((p) => p.trim());
      const title = (parts[0] ?? "").replace(/^["']|["']$/g, "");
      if (!title) continue;
      const rest = parts.slice(1);
      const blocksPart = rest.length >= 2 ? rest[0] : /\b(map|platformer|battle|dialog|timer|calc|none|core)\b/i.test(rest[0] ?? "") && rest.length === 1 ? rest[0] : "";
      const topicsPart = rest.length >= 2 ? rest.slice(1).join(";") : blocksPart ? "" : (rest[0] ?? "");
      const blocks: string[] = [];
      for (const w of blocksPart.split(/[,;/\s]+/).map((x) => x.toLowerCase().replace(/^x-/, "")).filter(Boolean)) {
        if (KNOWN.has(w)) { if (!blocks.includes(w)) blocks.push(w); }
        else if (!CORE_WORDS.has(w) && !out.wanted.includes(w)) out.wanted.push(w);
      }
      if (used.has(slug(title)) && out.sections.some((x) => x.id === slug(title) && x.topics.join(";") === topicsPart.split(/[;•]/).map((t) => t.trim()).filter(Boolean).join(";"))) continue; // the same section written again
      let id = slug(title);
      for (let n = 2; used.has(id); n++) id = `${slug(title)}_${n}`;
      used.add(id);
      out.sections.push({ id, title, kind: sectionKind(title), blocks, topics: topicsPart.split(/[;•]/).map((t) => t.trim()).filter(Boolean) });
    }
  }
  return out;
}

/** An outline that always exists: what a game of that kind is made of, used when the model gave nothing usable. */
export function defaultOutline(request: string, blocks: string[]): XOutline {
  const has = (b: string) => blocks.includes(b);
  const sec = (title: string, b: string[], topics: string[], kind?: "screen" | "overlay"): XSection => ({ id: slug(title), title, kind: kind ?? sectionKind(title), blocks: b, topics });
  if (has("platformer")) return {
    style: "bright and readable, flat colours, a sky background", wanted: [],
    art: [{ name: "hero", w: 28, h: 36, about: "a small hero in a red cap and blue overalls, seen from the side" }, { name: "goomba", w: 32, h: 32, about: "a brown mushroom-shaped walking enemy with angry eyes and small feet" }],
    state: { lives: 3, score: 0, coins: 0, big: 0, time: 300 },
    sections: [
      sec("Title", [], ["the title", "a play button that goes to the level", "the keys"]),
      sec("Level 1", ["platformer", "timer"], ["ground, pits and platforms", "bricks and question blocks", "walking enemies", "coins", "the flag at the end"]),
      sec("HUD", [], ["score, coins, lives and time shown at the top"]),
      sec("Game over", [], ["a game over screen with a retry button"]),
      sec("You win", [], ["a win screen with the score and a retry button"])
    ]
  };
  if (has("map") || has("battle") || has("dialog")) return {
    style: "warm and readable, flat colours, a clear map", wanted: [],
    art: [{ name: "hero", w: 32, h: 32, about: "a small adventurer seen from above, with a hat and a cloak" }],
    state: { hp: 10, hp_max: 10, gold: 0, quest: 0 },
    sections: [
      sec("Title", [], ["the title", "a start button that goes to the first area"]),
      sec("Village", ["map", ...(has("dialog") ? ["dialog"] : [])], ["the map of the village", "a person to talk to", "a way to the next area"]),
      ...(has("battle") ? [sec("Cave", ["map", "battle"], ["the map of the cave", "an enemy to fight", "the exit"]), sec("Fight", ["battle"], ["the fight and its result"])] : []),
      sec("HUD", [], ["health and gold shown at the top"]),
      sec("Game over", [], ["a game over screen with a retry button"]),
      sec("You win", [], ["a win screen with a retry button"])
    ]
  };
  void request;
  return {
    style: "clean and readable", wanted: [], art: [], state: { score: 0 },
    sections: [sec("Title", [], ["the title", "a start button"]), sec("Game", blocks, ["the game itself"]), sec("HUD", [], ["the score"]), sec("Game over", [], ["a game over screen with a retry button"])]
  };
}

/** The tasks of a section as the model listed them; each line of a list is one. */
export function parseTasks(reply: string): string[] {
  const tasks = reply.replace(/<think>[\s\S]*?<\/think>/g, " ").split("\n").map((l) => l.trim()).filter((l) => /^([-*•]|\d+[.)])\s+\S/.test(l)).map((l) => l.replace(/^([-*•]|\d+[.)])\s+/, "").replace(/\*\*/g, "").trim()).filter((l) => l.length > 3);
  return [...new Set(tasks)];
}

// ------------------------------------------------------------------ names

const dist = (a: string, b: string): number => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};
/** The known name a wrong one most plausibly meant, or null when none is close enough (a third of the length, at most). */
export function nearestName(name: string, known: string[]): string | null {
  const n = slug(name);
  let best: string | null = null, bestD = Infinity;
  for (const k of known) {
    const dd = n === k ? 0 : k.includes(n) || n.includes(k) ? 1 : dist(n, k);
    if (dd < bestD) { bestD = dd; best = k; }
  }
  return best !== null && bestD <= Math.max(1, Math.floor(Math.max(n.length, best.length) / 3)) ? best : null;
}

const EFFECT_NAME = /(?:^|[\s"';])([a-z][a-z0-9_]*)\s*(?:\+=|-=|\+\+|--|=(?!=))/g;
/** Every state name a page writes (effects), shows (of=) or binds (data-bind=). */
export function statesUsed(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/\b(?:do|data-click|data-key|data-submit|on-win|on-lose|on-flee)\s*=\s*("[^"]*"|'[^']*')/gi))
    for (const e of m[1].slice(1, -1).matchAll(EFFECT_NAME)) out.add(e[1]);
  for (const m of html.matchAll(/<x-legend\b[^>]*>([\s\S]*?)<\/x-legend\s*>/gi))
    for (const e of m[1].matchAll(/(?:^|\s)([a-z][a-z0-9_]*)\s*(?:\+=|-=)/gm)) out.add(e[1]);
  for (const m of html.matchAll(/<(?:x|game)-(?:value|list|clock|bar)\b[^>]*?\bof\s*=\s*["']([a-z][a-z0-9_]*)/gi)) out.add(m[1].toLowerCase());
  for (const m of html.matchAll(/\bdata-bind\s*=\s*["']([a-z][a-z0-9_]*)/gi)) out.add(m[1].toLowerCase());
  for (const m of html.matchAll(/\bname\s*=\s*["']([a-z][a-z0-9_]*)["'][^>]*\bvalue=/gi)) out.add(m[1].toLowerCase()); // x-calc
  return [...out].filter((n) => !/^(?:battle_open|dialog_open|battle_result|player_x|player_y|talked_\w+|x|y|time_|index|item)$/.test(n));
}

export const stateTag = (state: Record<string, string | number>): string => {
  const attrs = Object.entries(state).map(([k, v]) => (Array.isArray(v) ? `${k}='${JSON.stringify(v)}'` : `${k.replace(/_/g, "-") === k ? k : k}="${String(v).replace(/"/g, "&quot;")}"`));
  return `<x-state ${attrs.join(" ")}></x-state>`;
};

/** What every later step is told is already defined, read from the page itself (never from a model), short enough to always fit. */
export function bibleOf(p: { state: Record<string, unknown>; scenes: string[]; body: string; css: string; style?: string }, room = 900): string {
  const classes = new Set<string>();
  for (const m of p.body.matchAll(/\bclass\s*=\s*["']([^"']+)["']/gi)) for (const c of m[1].split(/\s+/)) if (c) classes.add(c);
  const ids = [...p.body.matchAll(/\bid\s*=\s*["']([\w-]+)["']/gi)].map((m) => m[1]).filter((i) => !p.scenes.includes(i));
  const dialogs = [...p.body.matchAll(/<x-dialog\b[^>]*\bid\s*=\s*["']([\w-]+)/gi)].map((m) => m[1]);
  const battles = [...p.body.matchAll(/<x-battle\b[^>]*\bid\s*=\s*["']([\w-]+)/gi)].map((m) => m[1]);
  const vars = [...new Set([...p.css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]))];
  const lines = [
    `state: ${Object.keys(p.state).join(", ") || "none yet"}`,
    `scenes (for go:): ${p.scenes.join(", ")}`,
    classes.size ? `classes used: ${[...classes].slice(0, 30).join(", ")}` : "",
    ids.length ? `ids used: ${ids.slice(0, 20).join(", ")}` : "",
    dialogs.length ? `dialogs: ${dialogs.join(", ")} (start one with emit:dialog:<id>)` : "",
    battles.length ? `battles: ${battles.join(", ")} (start one with emit:battle:<id>)` : "",
    vars.length ? `css variables: ${vars.slice(0, 20).join(", ")}` : "",
    p.style ? `look: ${p.style}` : ""
  ].filter(Boolean).join("\n");
  return lines.length > room ? lines.slice(0, room) : lines;
}

// ------------------------------------------------------------------ mending

/** A fragment as the page wants it: no wrapper of a whole document, no script, no code fence, no scene around it (the section is the scene). */
export function cleanFragment(reply: string): { body: string; css: string } {
  let t = reply.replace(/<think>[\s\S]*?<\/think>/g, " ").trim();
  const fence = /```[a-z]*\n([\s\S]*?)```/i.exec(t);
  if (fence) t = fence[1];
  else t = t.replace(/^```[a-z]*\n?/i, "").replace(/```\s*$/i, "");
  let css = "";
  t = t.replace(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi, (_, c: string) => { css += `${c.trim()}\n`; return ""; });
  t = t.replace(/<script\b[\s\S]*?<\/script\s*>/gi, "").replace(/<!doctype[^>]*>/gi, "").replace(/<\/?(?:html|head|body)\b[^>]*>/gi, "").replace(/<title\b[\s\S]*?<\/title\s*>/gi, "").replace(/<meta\b[^>]*>/gi, "");
  t = t.replace(/<\/?x-scene\b[^>]*>/gi, "").replace(/<\/?game-scene\b[^>]*>/gi, "");
  return { body: t.trim(), css: css.trim() };
}

/** Names that are a little off become the real ones: a `go:` toward a scene that does not exist, an `of=` toward a state that does not, a drawing that is not there. */
export function mendNames(html: string, scenes: string[], states: string[], assets: string[] = []): { html: string; fixed: string[] } {
  const fixed: string[] = [];
  let out = html.replace(/\bgo\s*:\s*([A-Za-z0-9_-]+)/g, (all, id: string) => {
    if (scenes.includes(id)) return all;
    const near = nearestName(id, scenes);
    if (!near) return all;
    fixed.push(`go:${id} became go:${near}`);
    return `go:${near}`;
  });
  const fix = (attr: string, q: string, name: string, known: string[]): string | null => {
    const n = name.toLowerCase().replace(/-/g, "_");
    if (known.includes(n)) return n === name ? null : n;
    const near = nearestName(n, known);
    if (!near) return null;
    fixed.push(`${attr}="${name}" became ${attr}="${near}"`);
    return near;
  };
  if (states.length) {
    out = out.replace(/(<(?:x|game)-(?:value|list|clock|bar)\b[^>]*?\bof\s*=\s*)(["'])([A-Za-z_][\w-]*)\2/g, (all, pre: string, q: string, name: string) => { const r = fix("of", q, name, states); return r ? `${pre}${q}${r}${q}` : all; });
    out = out.replace(/(\bdata-bind\s*=\s*)(["'])([A-Za-z_][\w-]*)\2/g, (all, pre: string, q: string, name: string) => { const r = fix("data-bind", q, name, states); return r ? `${pre}${q}${r}${q}` : all; });
  }
  if (assets.length) {
    out = out.replace(/(<(?:x|game)-art\b[^>]*?\bof\s*=\s*)(["'])([A-Za-z_][\w-]*)\2/g, (all, pre: string, q: string, name: string) => { const r = assets.includes(name) ? null : fix("of", q, name, assets); return r ? `${pre}${q}${r}${q}` : all; });
    out = out.replace(/\bart:([A-Za-z_][\w-]*)/g, (all, name: string) => { if (assets.includes(name)) return all; const r = fix("art", '"', name, assets); return r ? `art:${r}` : all; });
  }
  return { html: out, fixed };
}

/** The whole mending of one fragment: shape, then forms (the checker's own repairs), then names. */
const HTML_TAGS = new Set("a abbr article aside audio b bdi bdo blockquote body br button canvas caption cite code col colgroup data datalist dd del details dfn dialog div dl dt em embed fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 head header hgroup hr html i iframe img input ins kbd label legend li main map mark menu meter nav noscript object ol optgroup option output p picture pre progress q rp rt ruby s samp section select small source span strong style sub summary sup svg table tbody td template textarea tfoot th thead time title tr track u ul var video wbr path rect circle ellipse line polyline polygon g defs lineargradient radialgradient stop text tspan use symbol clippath mask filter".split(" "));
/** A small model invents tags (`<ground>`, `<brick_block>`, `<scene>`): they mean nothing to the page, so the tag goes and what it held stays. */
export function dropInventedTags(html: string): { html: string; fixed: string[] } {
  const fixed: string[] = [];
  const out = html.replace(/<\/?([a-zA-Z][\w:.-]*)\b[^<>]*?\/?>/g, (all: string, name: string) => {
    const n = name.toLowerCase();
    if (n.includes("-") || HTML_TAGS.has(n) || n.startsWith("fe")) return all; // block tags (x-...), custom elements, svg filters
    const note = `<${n}> is not a tag: left out`;
    if (!fixed.includes(note)) fixed.push(note);
    return "";
  });
  return { html: out, fixed };
}

export function mendFragment(reply: string, ctx: { scenes: string[]; states: string[]; assets?: string[] }): { body: string; css: string; fixed: string[] } {
  const { body, css } = cleanFragment(reply);
  const d = dropInventedTags(body);
  const a = xMend(d.html);
  const b = mendNames(a.html, ctx.scenes, ctx.states, ctx.assets);
  return { body: b.html, css, fixed: [...d.fixed, ...a.fixed, ...b.fixed] };
}
