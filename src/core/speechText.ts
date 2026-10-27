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

const ABBREV = /\b(Dr|Mr|Mrs|Ms|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e|M|Mme)\.$/;

/**
 * Cuts a growing answer into sentences so the voice can start after the first one.
 * The first chunk may also break at a comma/colon once long enough, to cut time to first audio.
 */
export class SentenceChunker {
  private buf = "";
  private emitted = 0;
  constructor(private minLen = 24, private firstBreakLen = 70, private maxLen = 140) {}

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

  /** Hands over what is waiting now, even without a sentence end (the first part of a long first sentence). */
  cutNow(): string[] {
    const piece = this.buf.trim();
    this.buf = "";
    if (!piece) return [];
    this.emitted++;
    return [piece];
  }

  /** A piece longer than the voice reads well in one go (it stumbles and loses words) is cut at its last comma, else its last space. */
  private tooLong(end: number): number | null {
    if (end <= this.maxLen) return null;
    const head = this.buf.slice(0, this.maxLen);
    const at = Math.max(head.lastIndexOf(", "), head.lastIndexOf("; "), head.lastIndexOf(": "));
    const sp = head.lastIndexOf(" ");
    return at > this.maxLen / 3 ? at + 1 : sp > this.maxLen / 3 ? sp : null;
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
      return this.tooLong(i + 1) ?? i + 1;
    }
    return this.tooLong(s.length) ?? -1;
  }
}

const FENCE = /```/g;

/** True when the written text up to here closes everything it opened: a cut there cuts no code block, formula, bracket or bold in two. */
function balanced(t: string): boolean {
  const n = (re: RegExp) => (t.match(re) ?? []).length;
  return n(FENCE) % 2 === 0 && n(/\$\$/g) % 2 === 0 && n(/`/g) % 2 === 0 && n(/\*\*/g) % 2 === 0
    && n(/\(/g) <= n(/\)/g) && n(/\[/g) <= n(/\]/g) && n(/\\\(/g) <= n(/\\\)/g);
}

/**
 * An answer being written, turned into sentences for the voice. The written text is cut at safe points (the end of a sentence or line that
 * closes everything it opened) and each piece is made speakable on its own: nothing that is later rewritten (a bracket that closes, a list
 * marker, bold) is ever compared with what was already said, so no word can be lost between two versions.
 */
export class SpeechStream {
  private raw = "";
  private emitted = 0;
  private spoken = 0;
  private chunker: SentenceChunker;
  constructor(minLen = 24, maxLen = 140) { this.chunker = new SentenceChunker(minLen, 1e9, maxLen); }

  push(delta: string): string[] {
    this.raw += delta;
    return this.drain(false);
  }

  flush(): string[] {
    return this.drain(true);
  }

  private drain(final: boolean): string[] {
    const out: string[] = [];
    for (;;) {
      const cut = final ? this.raw.length : this.safeCut();
      if (cut <= 0) break;
      const piece = this.raw.slice(0, cut);
      this.raw = this.raw.slice(cut);
      this.emitted += piece.length;
      out.push(...this.chunker.push(toSpeechText(piece) + " "));
      if (/[,:;]\s*$/.test(piece) && this.spoken === 0) out.push(...this.chunker.cutNow()); // the first sentence is long: its first part is said now
      this.spoken += out.length;
      if (final) break;
    }
    if (final) out.push(...this.chunker.flush());
    return out;
  }

  /** The end of the first piece that can be spoken now, or 0. */
  private safeCut(): number {
    const s = this.raw;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      const nl = c === "\n";
      const strong = c === "." || c === "!" || c === "?" || c === "…";
      const soft = this.emitted === 0 && (c === "," || c === ":" || c === ";") && i + 1 >= 70;
      if (!nl && !strong && !soft) continue;
      if (!nl && s[i + 1] === undefined) return 0; // "3." may become "3.5"
      if (!nl && !/\s/.test(s[i + 1])) continue;
      if (c === "." && (ABBREV.test(s.slice(Math.max(0, i - 6), i + 1)) || /(^|\n)\s*\d+$/.test(s.slice(0, i)))) continue; // "e.g." and the "1." of a list
      if (!balanced(s.slice(0, i + 1))) continue;
      return i + 1;
    }
    // a stretch that never closes what it opened must not hold the voice for ever
    if (s.length > 600) { const sp = s.lastIndexOf(" ", 500); if (sp > 0) return sp; }
    return 0;
  }
}
