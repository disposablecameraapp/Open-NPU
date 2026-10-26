import { texToText } from "./math";

/** Turn a chat answer into something a voice should read: no code, links, markdown marks or emoji. */
export function toSpeechText(md: string): string {
  let t = md;
  t = t.replace(/```[\s\S]*?(```|$)/g, " "); // fenced code (also unfinished while streaming)
  t = t.replace(/\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\\begin\{(\w+\*?)\}[\s\S]*?\\end\{\1\}/g, (m) => ` ${texToText(m.replace(/^\$\$|\$\$$|^\\[[(]|\\[\])]$/g, ""))} `);
  t = t.replace(/\[A [^\]\n]{0,100} was shown on screen[^\]\n]*\]/g, " "); // the note a model may copy from its history
  t = t.replace(/`([^`]*)`/g, "$1");
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, " ");
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  t = t.replace(/https?:\/\/\S+/g, " ");
  t = t.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  t = t.replace(/^\s*[-*+]\s+/gm, "");
  t = t.replace(/^\s*\d+[.)]\s+/gm, "");
  t = t.replace(/^\s*>\s?/gm, "");
  t = t.replace(/(\*\*|__|\*|_|~~)/g, "");
  t = t.replace(/\|/g, " ");
  t = t.replace(/\s*\(([^()\n]{1,120})\)/g, ", $1,"); // an aside in brackets is said as an aside, not skipped nor spelled
  t = t.replace(/[«»"“”]/g, "").replace(/\s*[—–]\s*/g, ", ").replace(/\s+-\s+/g, ", ").replace(/\.{3,}|…/g, ".");
  t = t.replace(/\s*\/\s*/g, " ").replace(/[#^~<>=\\]/g, " ").replace(/,\s*,/g, ",").replace(/,\s*([.!?])/g, "$1");
  t = t.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "");
  return t.replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{2,}/g, "\n").trim();
}

/**
 * The part of a growing answer's spoken text that will not change when more arrives. A list marker ("1" then "1. "), an opening "**" or a
 * half-written word turn into something else a moment later, so the unfinished last word and a last line that is only a marker are held back
 * until the next piece (or the end) settles them: what was already said is then always the start of what comes next.
 */
export function settledSpeech(clean: string, final: boolean): string {
  if (final) return clean;
  let t = clean.replace(/[^\s]*$/, "");
  t = t.replace(/(^|\n)[ \t]*(\d+[.)]?|[-*+#>]+)?[ \t]*$/, "$1");
  return t;
}

const ABBREV = /\b(Dr|Mr|Mrs|Ms|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e|M|Mme)\.$/;

/**
 * Cuts a growing answer into sentences so the voice can start after the first one.
 * The first chunk may also break at a comma/colon once long enough, to cut time to first audio.
 */
export class SentenceChunker {
  private buf = "";
  private emitted = 0;
  constructor(private minLen = 24, private firstBreakLen = 70, private maxLen = 160) {}

  push(text: string): string[] {
    this.buf += text;
    return this.drain(false);
  }

  flush(): string[] {
    return this.drain(true);
  }

  private drain(final: boolean): string[] {
    const out: string[] = [];
    for (;;) {
      const cut = this.findCut(final);
      if (cut < 0) break;
      const piece = this.buf.slice(0, cut).trim();
      this.buf = this.buf.slice(cut);
      if (piece) { out.push(piece); this.emitted++; }
    }
    if (final) {
      const rest = this.buf.trim();
      this.buf = "";
      if (rest) out.push(rest);
    }
    return out;
  }

  private findCut(final: boolean): number {
    const s = this.buf;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      const next = s[i + 1];
      const strong = c === "." || c === "!" || c === "?" || c === "…" || c === "\n";
      const soft = this.emitted === 0 && (c === "," || c === ":" || c === ";") && i + 1 >= this.firstBreakLen;
      if (!strong && !soft) continue;
      if (next === undefined && !final) return -1; // wait: "3." may become "3.5"
      if (next !== undefined && !/\s/.test(next) && c !== "\n") continue; // "3.5", "e.g.x"
      if (c === "." && ABBREV.test(s.slice(Math.max(0, i - 6), i + 1))) continue;
      const len = s.slice(0, i + 1).trim().length;
      if (len < this.minLen && !final && c !== "\n") continue;
      return i + 1;
    }
    // a sentence too long for the voice to read in one go (it stumbles) is cut at its last comma, else its last space
    if (s.length > this.maxLen * 1.4) {
      const head = s.slice(0, this.maxLen);
      const at = Math.max(head.lastIndexOf(", "), head.lastIndexOf("; "), head.lastIndexOf(": "));
      const sp = head.lastIndexOf(" ");
      const cut = at > this.maxLen / 3 ? at + 1 : sp > this.maxLen / 3 ? sp : -1;
      if (cut > 0) return cut;
    }
    return -1;
  }
}

/** Spoken text of an answer cut into the part not said yet: `fed` is what was already handed to the voice. Never stalls if the start changed. */
export function speechAfter(clean: string, fed: string): string {
  if (clean.startsWith(fed)) return clean.slice(fed.length);
  return clean.length > fed.length ? clean.slice(fed.length) : "";
}
