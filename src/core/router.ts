import { CATEGORY_IDS, CATEGORY_INFO, parseSort, type BundleModel, type Sorted, type TaskCategory } from "./dynamic";

/**
 * The first look at a request, the way a person decides in a blink before thinking: a very small model that does only this. The rules in
 * dynamic.ts decide most requests in no time; when they hesitate, this model reads the request and names its kind in one word. It runs on
 * the processor in a server of its own, never on the NPU (which holds a single model, and swapping it for every request would cost more
 * than the answer), so it is always there. No training: the categories and a few examples in its instructions are all it needs.
 */

export const ROUTER_MODEL: BundleModel = {
  ref: "qwen3-0.6b",
  name: "Qwen3-0.6B",
  repo: "unsloth/Qwen3-0.6B-GGUF",
  altRepos: ["bartowski/Qwen_Qwen3-0.6B-GGUF"],
  quant: "Q4_0",
  paramsB: 0.6,
  sizeGB: 0.4,
  job: "sorts each request into its kind, on the processor",
  tokPerSec: null,
  thinking: false,
  vision: false,
  verified: true,
  note: "The router of the Dynamic model: runs on the processor, not on the NPU."
};

/** Where its own server listens (the chat's is on 18181), and the window it is given: the prompt is short and the answer is one word. */
export const ROUTER_HOST = "127.0.0.1:18182";
export const ROUTER_CTX = 2048;
/** The rules are trusted above this; below it the request is read by the router. */
export const ROUTER_BELOW = 0.8;
/** The router gives up after this long and the rules' guess stands: sorting must never be what makes an answer wait. */
export const ROUTER_TIMEOUT_MS = 5000;

const EXAMPLES: [string, TaskCategory][] = [
  ["make a snake game in html", "web_code"],
  ["explique les intérêts composés avec un graphique interactif", "web_code"],
  ["write a python script that renames my files", "python_code"],
  ["TypeError: undefined is not a function, why?", "code_repair"],
  ["what does this function do?", "code_explain"],
  ["plan my revision for the next two weeks", "planning"],
  ["extract the names and dates as JSON", "tool_use"],
  ["solve 3x + 5 = 20", "math"],
  ["if all bloops are razzies and all razzies are lazzies, are all bloops lazzies?", "reasoning"],
  ["pourquoi le ciel est bleu ?", "knowledge"],
  ["answer in exactly three words", "instruction"],
  ["I had a rough day", "chat"],
  ["écris un poème sur la mer", "creative"],
  ["rédige un mail pour demander un devis", "writing"],
  ["résume ce texte en trois points", "summarize"],
  ["traduis en anglais : bonne nuit", "translate_fr"],
  ["how do you say thank you in German", "translate_other"],
  ["salut", "fast"]
];

/** What the router is asked: the kinds with what each means, a few solved examples, then the request. */
export function routerPrompt(text: string, previous?: TaskCategory): { system: string; user: string } {
  const kinds = CATEGORY_IDS.filter((c) => c !== "vision" && c !== "long_context").map((c) => `${c}: ${CATEGORY_INFO[c].hint}`).join("\n");
  const solved = EXAMPLES.map(([q, c]) => `Request: ${q}\nKind: ${c}`).join("\n\n");
  return {
    system: `You sort requests by kind. Reply with the kind only: one word from the list, nothing else.\nThe language a request is written in is not its kind: sort by what is asked for. Something to look at or play with (a chart, a diagram, a simulation, a page, a game) is web_code.\n\nKinds:\n${kinds}\n\nExamples:\n\n${solved}`,
    user: `${previous ? `(The request before this one was: ${previous}.)\n` : ""}Request: ${text.trim().slice(0, 600)}\nKind:`
  };
}

/** The kind in the router's reply, or null (an answer that names none is no answer). */
export function routerKind(reply: string): TaskCategory | null {
  const c = parseSort(reply.replace(/<think>[\s\S]*?<\/think>/g, " "));
  return c && c !== "vision" && c !== "long_context" ? c : null;
}

/** Does this sort need the router? Not when it is sure, nor when the request is an image or a very long text (the shape says it). */
export const routerWanted = (s: Sorted): boolean => s.confidence < ROUTER_BELOW && s.category !== "vision" && s.category !== "long_context";

/** The rules' sort with the router's word put in. */
export const withRouter = (s: Sorted, kind: TaskCategory | null): Sorted => (kind ? { category: kind, confidence: 0.82, reason: "the router model sorted it" } : s);

/** Small memory of what was sorted: asking again (a retry, the same words) costs nothing. */
export class SortMemory {
  private m = new Map<string, TaskCategory>();
  constructor(private max = 60) {}
  get(text: string) { return this.m.get(text.trim().toLowerCase()); }
  set(text: string, kind: TaskCategory) {
    const k = text.trim().toLowerCase();
    this.m.delete(k);
    this.m.set(k, kind);
    if (this.m.size > this.max) this.m.delete(this.m.keys().next().value as string);
  }
}
