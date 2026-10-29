import { CATEGORY_IDS, type BundleModel, type Sorted, type TaskCategory } from "./dynamic";

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

/**
 * How the router is sampled: greedy, with nothing of the chat's own settings (a presence penalty of 1.5 on a one-word answer, or a top-k, made the same question answer differently from one run to the next:
 * the lab's runs of one prompt went from right to wrong at random, the 0.6B model scored below chance, and the 2B right 60 to 80 % of the time on a question it answered right on its best run).
 */
export const routerSampling = (maxTokens: number) => ({ temperature: 0, top_p: 1, top_k: 1, max_tokens: maxTokens });

/** The router measured on the hard requests of `docs/prompt-lab-router.md` (best run of each prompt, mean of 102): Qwen3.5-2B 95.7, Qwen3-1.7B native bundle 84.5, Qwen3-1.7B 70.7, LFM2-1.2B-Tool 47.4, Qwen3-0.6B 38.8 (below chance). The 2B is used when it is installed (the voice pack installs it) and nothing else is chosen. */
export const ROUTER_PREFERRED = /qwen3\.5[-_ ]?2b/i;

/** Where its own server listens (the chat's is on 18181), and the window it is given: the prompt is short and the answer is one word. */
export const ROUTER_HOST = "127.0.0.1:18182";
export const ROUTER_CTX = 2048;
/** The rules are trusted above this; below it the request is read by the router. */
export const ROUTER_BELOW = 0.8;
/** The whole sort is done in this time or the rules' guess stands: sorting must never be what makes an answer wait. A model that answers each question in 0.3 s sorts in about a second. */
export const ROUTER_TIMEOUT_MS = 2000;

// ------------------------------------------------------------------ a series of yes/no questions

/**
 * The router does not sort in one go among eighteen kinds, which is a lot to ask of a tiny model. It is asked a series of simple questions,
 * each answered with one word, yes or no: the first thing it says is the whole answer, so each costs little more than the time to the first
 * token. Each answer picks the next question, down to a kind. The request comes first and only the question changes, so the model reads the
 * request once and the questions that follow only add a few words.
 */
export interface Node { ask: string; yes: string; no: string }

/**
 * A next step is another question (an id starting with q_) or a kind (a name of CATEGORY_IDS). The tree is short on purpose: code is found
 * in 2 to 4 questions, a text to write in 3 to 5, a question about the world in 4, a plain conversation in 7, and the most common ones are
 * asked first.
 */
export const TREE: Record<string, Node> = {
  q_code: { ask: "Does it ask for computer code, a program or a script, or about code the person has?", yes: "q_error", no: "q_text" },
  q_error: { ask: "Is the problem an error, a bug, or something that does not work?", yes: "code_repair", no: "q_read" },
  q_read: { ask: "Does it ask to explain, read or review code that already exists?", yes: "code_explain", no: "q_web" },
  q_web: { ask: "Is it something to see or use in a web browser: a page, a game, an animation or an interface?", yes: "web_code", no: "python_code" },
  q_text: { ask: "Does it ask to write, translate, rewrite or summarize a text?", yes: "q_translate", no: "q_think" },
  q_translate: { ask: "Does it ask to translate a text from one language to another?", yes: "q_french", no: "q_creative" },
  q_french: { ask: "Is French the language it is translated from or into?", yes: "translate_fr", no: "translate_other" },
  q_creative: { ask: "Does it ask for a story, a poem, a song or other creative writing?", yes: "creative", no: "q_message" },
  q_message: { ask: "Does it ask to write an email, a letter or a message to someone?", yes: "writing", no: "summarize" },
  q_think: { ask: "Does it need a calculation, an equation, a logic puzzle or step-by-step reasoning?", yes: "q_math", no: "q_fact" },
  q_math: { ask: "Is it a calculation, an equation or a maths problem (not a logic puzzle)?", yes: "math", no: "reasoning" },
  q_fact: { ask: "Is it a question about facts, the world, or how something works?", yes: "knowledge", no: "q_plan" },
  q_plan: { ask: "Does it ask for a plan, a schedule, or a list of steps to organize something?", yes: "planning", no: "q_structure" },
  q_structure: { ask: "Does it ask to extract data, to answer as JSON, a table or another strict structure, or to draw a chart or graph of numbers?", yes: "tool_use", no: "q_format" },
  q_format: { ask: "Does it set an exact format, length or other strict constraint on the answer?", yes: "instruction", no: "chat" }
};
export const ROOT = "q_code";

const KINDS = new Set<string>(CATEGORY_IDS);
const isKind = (id: string): id is TaskCategory => KINDS.has(id);

/** The question to ask first for a request the words already lean towards a kind: a yes goes straight down towards it. */
export const CONFIRM: Partial<Record<TaskCategory, string>> = {
  web_code: "q_code", python_code: "q_code", code_repair: "q_code", code_explain: "q_code", translate_fr: "q_translate", translate_other: "q_translate", math: "q_math",
  knowledge: "q_fact", creative: "q_creative", writing: "q_message", summarize: "q_text", planning: "q_plan", tool_use: "q_structure", reasoning: "q_think", instruction: "q_format"
};

const CODE_LEAF: Partial<Record<TaskCategory, string>> = { web_code: "q_web", code_repair: "q_error", code_explain: "q_read" };

/**
 * Every decision about a request is one of these closed questions, put to the router (the chat model when the router does not answer), never read from the words of the message.
 * The prompt lab (`docs/prompt-lab-router.md`) asks the same questions with hard requests, so a change here is measured there.
 */
export const Q = {
  program: "Does it ask to build, write or change something that RUNS: a program, game, app, tool or web page, or say that something in one does not work or looks wrong? (Answer no for a chat, a question, an explanation, a chart, a spreadsheet, an Excel or Word file, a text document or a thanks.)",
  produce: "Does the person ask you to PRODUCE a file or a document now (make it, write it, create it), rather than ask for help, advice, an explanation, a summary, a review, or just talk?",
  sheet: "Does it ask for an Excel spreadsheet, a table of figures, or a sheet to fill in or to calculate in?",
  word: "Does it ask for a written document to be made (a letter, a report, a CV, minutes, a contract, a research document)?",
  site: "Does it ask for a website, a landing page or a web page to show to people?",
  calculator: "Does it ask for a small calculator, converter or simulator page with inputs and a result?",
  exercise: "Does it give its own figures and ask for something to be worked out or answered from them (an exercise, a cost, a valuation), rather than an empty sheet or a general template?",
  file: "What file does the request ask to be made? sheet = an Excel spreadsheet or a table of figures; document = a written document (a letter, a report, a CV, minutes, a contract, a research document); site = a website or a landing page; calculator = a small calculator, converter or simulator page; none = anything else (a program, a game, a chat, a question, a chart).",
  web: "Does answering it need recent facts, or looking something up on the web, that a model would not know by heart?"
} as const;

export const FILE_CHOICES = ["sheet", "document", "site", "calculator", "none"] as const;

/** A question with a short list of answers: the router replies with one word of the list. */
export function choicePrompt(text: string, ask: string, options: readonly string[]): { system: string; user: string } {
  return {
    system: "You sort a request that a person sent to an assistant. Reply with one word from the list. Judge by what the request asks for, not by the language it is written in.",
    user: `Request: """${text.trim().slice(0, 600)}"""\nQuestion: ${ask}\nAnswer with one of: ${options.join(", ")}.\nAnswer:`
  };
}

/** The option the reply starts with, or null. */
export function parseChoice<T extends string>(reply: string, options: readonly T[]): T | null {
  const w = reply.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, " ").toLowerCase().match(/[a-z]+/)?.[0];
  return options.find((o) => o === w) ?? null;
}

/** The web search for a request, written by the router: the topic and what is wanted, not what is to be done with it. */
export function searchQueryPrompt(text: string): { system: string; user: string } {
  return {
    system: "You write web search queries. Reply with the query only.",
    user: `Request: """${text.trim().slice(0, 600)}"""\nWrite the web search query that finds what this request needs: only the topic and the facts wanted, 2 to 8 words, no greeting, nothing about what to make or write with the result. Query:`
  };
}

/** The query as the router wrote it, or null when it is empty, too long or not a line of words. */
export function readSearchQuery(reply: string): string | null {
  const line = reply.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, " ").split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  const q = line.replace(/^(?:query|requ[êe]te)\s*:\s*/i, "").replace(/^["'`«“]+|["'`»”.]+$/g, "").trim();
  // a line of words: no code-like token ("no_result"), no answer that says there is none
  if (!/^[\p{L}\p{N}][\p{L}\p{N} '’.,\-+#&/]*$/u.test(q) || /^(?:none|n\/a|no result|no query|aucun|rien)$/i.test(q)) return null;
  return q.length >= 3 && q.length <= 100 && q.split(/\s+/).length <= 14 ? q : null;
}

/** What one question asks the router: the request is the same each time, so it is read once. */
export function yesNoPrompt(text: string, ask: string): { system: string; user: string } {
  return {
    system: "You answer yes/no questions about a request that a person sent to an assistant. Reply with one word: yes or no. Judge by what the request asks for, not by the language it is written in.",
    user: `Request: """${text.trim().slice(0, 600)}"""\nQuestion: ${ask}\nAnswer (yes or no):`
  };
}

/** yes, no, or null when the reply is neither (a French oui and non count). */
export function parseYesNo(reply: string): boolean | null {
  const w = reply.replace(/<think>[\s\S]*?<\/think>/g, " ").toLowerCase().match(/[a-zé]+/)?.[0];
  return w === "yes" || w === "oui" || w === "y" ? true : w === "no" || w === "non" || w === "n" ? false : null;
}

export interface Asked { id: string; yes: boolean }

/**
 * Sorts a request by asking `answer` the questions of the tree, each at most once. `lean` is the kind the words lean towards: its question
 * comes first, and a yes goes straight down towards it. A reply that is neither yes nor no, or too many questions, gives null (the words'
 * guess then stands).
 */
export async function sortByQuestions(answer: (ask: string, id: string) => Promise<boolean | null>, lean?: TaskCategory, maxQuestions = 8): Promise<{ kind: TaskCategory | null; asked: Asked[] }> {
  const asked: Asked[] = [];
  const known = new Map<string, boolean>();
  const ask = async (id: string): Promise<boolean | null> => {
    if (known.has(id)) return known.get(id)!;
    const r = await answer(TREE[id].ask, id);
    if (r !== null) { asked.push({ id, yes: r }); known.set(id, r); }
    return r;
  };
  const walk = async (start: string): Promise<TaskCategory | null> => {
    let id = start;
    for (;;) {
      if (isKind(id)) return id;
      if (!TREE[id] || asked.length >= maxQuestions) return null;
      const r = await ask(id);
      if (r === null) return null;
      id = r ? TREE[id].yes : TREE[id].no;
    }
  };
  const first = lean ? CONFIRM[lean] : undefined;
  if (first) {
    const r = await ask(first);
    if (r === null) return { kind: null, asked };
    // in the code questions, the one that names the kind the words lean towards comes next: a second yes ends it
    const leaf = r && first === ROOT && lean ? CODE_LEAF[lean] : undefined;
    if (leaf) {
      const r2 = await ask(leaf);
      if (r2 === null) return { kind: null, asked };
      if (r2) return { kind: await walk(TREE[leaf].yes), asked };
    }
    return { kind: await walk(r ? (leaf ? "q_error" : TREE[first].yes) : first === ROOT ? TREE[first].no : ROOT), asked };
  }
  return { kind: await walk(ROOT), asked };
}

/** Does this sort need the router? Not when it is sure, nor when the request is an image or a very long text (the shape says it). */
export const routerWanted = (s: Sorted): boolean => s.confidence < ROUTER_BELOW && s.category !== "vision" && s.category !== "long_context";

/** The rules' sort with the router's word put in. */
export const withRouter = (s: Sorted, kind: TaskCategory | null): Sorted => (kind ? { category: kind, confidence: 0.82, reason: "the router model sorted it" } : s);

/** Small memory of what was sorted: asking again (a retry, the same words) costs nothing. */
export class SortMemory {
  private m = new Map<string, TaskCategory>();
  constructor(private max = 60) {}
  clear() { this.m.clear(); }
  get(text: string) { return this.m.get(text.trim().toLowerCase()); }
  set(text: string, kind: TaskCategory) {
    const k = text.trim().toLowerCase();
    this.m.delete(k);
    this.m.set(k, kind);
    if (this.m.size > this.max) this.m.delete(this.m.keys().next().value as string);
  }
}
