import type { CatalogEntry, Sampling, WriterRole } from "../shared/types";

/**
 * The "Dynamic" model: one entry in the model list that is really a team. Each request is sorted into a kind of task
 * (a web page, Python, a translation, a proof...) and handed to the model of the chosen size that does that kind of task
 * best, according to public, independent benchmarks (see docs/dynamic-model-research.md). The NPU holds one model at a
 * time, so models are switched only when the kind of task changes, and a request that is small or ambiguous stays on
 * the model that is already loaded.
 */

export const DYNAMIC_NAME = "Dynamic";
export const DYNAMIC_PREFIX = "dynamic:";

/** The size classes of the team. A tier is chosen by the weight of its biggest model, and by how much RAM it needs. */
export interface TierInfo { id: string; label: string; maxParamsB: number; minRamGB: number }

export const CATEGORY_IDS = [
  "web_code", "python_code", "code_repair", "code_explain", "planning", "tool_use", "math", "reasoning", "knowledge",
  "instruction", "chat", "creative", "summarize", "translate_fr", "translate_other", "long_context", "vision", "fast"
] as const;
export type TaskCategory = (typeof CATEGORY_IDS)[number];

export const CATEGORY_INFO: Record<TaskCategory, { label: string; hint: string }> = {
  web_code: { label: "Web pages and games", hint: "HTML, CSS, JavaScript, canvas games, small web apps" },
  python_code: { label: "Python and scripts", hint: "Python, shell, data scripts, algorithms" },
  code_repair: { label: "Fixing code", hint: "Errors, tracebacks, bugs, failing tests" },
  code_explain: { label: "Explaining code", hint: "Reading, reviewing and explaining code" },
  planning: { label: "Planning", hint: "Plans, steps, splitting a job into parts" },
  tool_use: { label: "Structured output and tools", hint: "JSON, schemas, extraction, function calls" },
  math: { label: "Math", hint: "Calculations, equations, proofs, word problems" },
  reasoning: { label: "Reasoning and logic", hint: "Puzzles, step-by-step thinking, comparisons" },
  knowledge: { label: "Facts and questions", hint: "Who, what, when, how things work" },
  instruction: { label: "Strict instructions", hint: "Exact formats, lengths and constraints" },
  chat: { label: "Conversation", hint: "Everyday chat, advice, opinions" },
  creative: { label: "Creative writing", hint: "Stories, poems, role-play, lyrics" },
  summarize: { label: "Summaries and rewriting", hint: "Summarize, rewrite, proofread, shorten" },
  translate_fr: { label: "French and translation from or to French", hint: "French writing and translation involving French" },
  translate_other: { label: "Other languages", hint: "Translation and writing in other languages" },
  long_context: { label: "Long documents", hint: "Very long pasted text or files" },
  vision: { label: "Images", hint: "Pictures, screenshots, charts, OCR" },
  fast: { label: "Quick replies", hint: "Greetings, one-line answers, titles" }
};

export const isDynamicId = (id: string | null | undefined): id is string => !!id && id.startsWith(DYNAMIC_PREFIX);
export const tierOf = (id: string) => id.slice(DYNAMIC_PREFIX.length);

// ------------------------------------------------------------------ the table

/** For each size, for each kind of task, the models to use in order of preference (a model id, or a repo with an optional :quant). */
export type RoutingTable = Record<string, Partial<Record<TaskCategory, string[]>>>;

/** The three classes of work. A model serves one or more of them; a kind of task asks for one. */
export const LANES = ["flash", "flux", "forge"] as const;
export type Lane = (typeof LANES)[number];

export const LANE_INFO: Record<Lane, { label: string; hint: string }> = {
  flash: { label: "Flash", hint: "Instant: greetings, titles, short answers" },
  flux: { label: "Flux", hint: "The all-rounder: chat, facts, summaries, translation" },
  forge: { label: "Forge", hint: "Heavy work: code, logic, math, plans" }
};

/** What each kind of task asks for. Where the independent benchmarks name no specialist, the class decides. */
export const CATEGORY_LANE: Record<TaskCategory, Lane> = {
  fast: "flash", chat: "flux", knowledge: "flux", instruction: "flux", summarize: "flux", creative: "flux", translate_fr: "flux", translate_other: "flux",
  tool_use: "flux", code_explain: "flux", vision: "forge", long_context: "forge", planning: "forge", reasoning: "forge", math: "forge",
  web_code: "forge", python_code: "forge", code_repair: "forge"
};

/** One model of a Dynamic size: what it is, the classes it serves, and what it costs. */
export interface BundleModel {
  /** Catalog id, or the repo when the model is not in the catalog. */
  ref: string;
  name: string;
  repo: string;
  quant: string | null;
  lanes: Lane[];
  paramsB: number;
  sizeGB: number;
  /** Generation speed measured by the app on a Snapdragon X NPU (a seed: the app replaces it with what it measures on this PC). */
  tokPerSec: number | null;
  /** The speed is an estimate (memory bandwidth ÷ file size), not a measurement. */
  tokEstimated?: boolean;
  /** 1 to 10, how strong the model is among the models of the bundle. A seed from the research, editable in the developer settings. */
  power: number;
  thinking: boolean;
  vision: boolean;
  /** Good with very long documents. */
  long?: boolean;
  /** The repo was checked to exist; when false the install may fail and says so. */
  verified: boolean;
  note?: string;
}

export interface DynamicData {
  asOf: string;
  /** What the table is based on and how far to trust it. */
  provisional?: string;
  tiers: TierInfo[];
  table: RoutingTable;
  /** The models of each size, in the order to install them. */
  models: Record<string, BundleModel[]>;
  /** Why each pick (for the developer settings): "tier/category" → one line with its source. */
  why?: Record<string, string>;
}

/** Average speed and total weight of the models that serve a class. `speeds` holds what the app measured on this PC. */
export function laneStats(models: BundleModel[], lane: Lane, speeds: Record<string, number> = {}): { count: number; tokPerSec: number | null; sizeGB: number; names: string[] } {
  const mine = models.filter((m) => m.lanes.includes(lane));
  const rates = mine.map((m) => speeds[m.ref] ?? m.tokPerSec).filter((x): x is number => typeof x === "number" && x > 0);
  const avg = rates.length ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10 : null;
  return { count: mine.length, tokPerSec: avg, sizeGB: Math.round(mine.reduce((a, m) => a + m.sizeGB, 0) * 10) / 10, names: mine.map((m) => m.name) };
}

export interface DynamicSettings {
  /** Choices changed in the developer settings; they win over the built-in table. */
  table?: RoutingTable;
  /** When a request cannot be sorted by its words, ask the loaded model (costs a second or two). */
  askModel?: boolean;
}

export function mergedTable(data: DynamicData, s: DynamicSettings | undefined): RoutingTable {
  const out: RoutingTable = {};
  for (const t of data.tiers) out[t.id] = { ...(data.table[t.id] ?? {}), ...(s?.table?.[t.id] ?? {}) };
  return out;
}

// ------------------------------------------------------------------ sorting a request

export interface Sorted { category: TaskCategory; confidence: number; reason: string }

export interface SortContext {
  hasImage?: boolean;
  /** Category of the previous request of the chat, for follow-ups like "fix it" or "continue". */
  previous?: TaskCategory;
  /** Files or code already in the chat. */
  hasFiles?: boolean;
}

interface Rule { cat: TaskCategory; re: RegExp; w: number; why: string; onCode?: boolean }

const rule = (cat: TaskCategory, w: number, why: string, re: RegExp, onCode = false): Rule => ({ cat, re, w, why, onCode });

const RULES: Rule[] = [
  // web
  rule("web_code", 3, "mentions a web page", /\b(html5?|css3?|javascript|js\b|typescript|jsx|tsx|react|vue|svelte|tailwind|bootstrap|dom\b|canvas|svg\b|web ?(site|page|app)|site web|page web|landing page|front-?end|responsive|navbar|dropdown|modal|animation css|css animation|flexbox|grid layout)\b/i),
  rule("web_code", 2.5, "asks for a game or interactive page", /\b(snake|tetris|pong|breakout|flappy|2048|memory game|jeu|game|calculator|calculatrice|todo|to-do|clicker|quiz app|timer|stopwatch|chronom[eè]tre|drawing app|paint app)\b/i),
  rule("web_code", 1.5, "files that run in a browser", /\b[\w-]+\.(html?|css|jsx?|tsx?|vue|svelte)\b/i),
  rule("web_code", 2, "asks to build an interface", /\b(make|build|create|code|write|fais|fabrique|cr[ée]e|[ée]cris|g[ée]n[èe]re)\b[^.\n]{0,40}\b(page|site|interface|ui\b|button|bouton|form(ulaire)?|dashboard|portfolio|menu|widget|app(lication)?)\b/i),
  // python and scripts
  rule("python_code", 3, "mentions Python", /\b(python3?|py\b|pandas|numpy|matplotlib|django|flask|fastapi|pytest|pip install|jupyter|notebook|tkinter|pygame|scipy|sklearn|scikit)\b/i),
  rule("python_code", 2, "mentions another language", /\b(bash|shell script|powershell|rust|golang|go lang|java\b|kotlin|swift|c\+\+|c#|csharp|sql|regex|regexp|expression r[ée]guli[èe]re|node\.?js|sqlite|php|ruby|lua|perl|awk|sed\b)\b/i),
  rule("python_code", 1.8, "asks for an algorithm or a function", /\b(algorithm|algorithme|leetcode|complexity|big-?o|recursion|r[ée]cursi|sort(ing)? (a )?list|fibonacci|prime numbers?|nombres? premiers?|linked list|binary tree|dynamic programming|function that|fonction qui|script (that|qui|to|pour))\b/i),
  rule("python_code", 1.2, "has a def or a class", /(^|\n)\s*(def |class |import |from \w+ import |#!\/)/, true),
  rule("web_code", 2.5, "describes a game or an animation", /\b(platformer|shooter|arcade|puzzle game|maze|obstacles?|sprite|particles?|particules|bouncing|rebond|physics (demo|simulation)|(a|the|un|le) game (where|in which|o[uù])|jeu o[uù]|pomodoro|hover(ed)?|survol|fade|slider|carousel|carrousel|accordion|tabs? (menu|component)|parallax|scroll(ing)? (effect|animation))\b/i),
  rule("web_code", 2, "wants a website", /\b(website|site internet|site web|homepage|page d'accueil)\b/i),
  rule("python_code", 3.2, "scraping or a data program", /\b(scrap(e|ing|er)|beautifulsoup|requests library|selenium|web crawler|crawler|stdin|command[- ]line (tool|program)|cli (tool|app)|reads? (a )?(file|numbers|lines|input)|prints? (the|their)|program that|programme qui|read(s)? from (a )?file|parse (a )?(csv|log)|automate)\b/i),
  // repairing
  rule("code_repair", 3.5, "reports an error", /\b(traceback|exception|stack ?trace|segfault|undefined is not|is not defined|cannot read propert|syntaxerror|typeerror|referenceerror|nameerror|valueerror|keyerror|indexerror|attributeerror|null ?pointer|compilation error|build failed|erreur|error:|does ?n'?t work|not working|ne marche pas|ne fonctionne pas|bug|crash(es|ed)?|plante|broken|cass[ée])\b/i),
  rule("code_repair", 2, "asks to fix", /\b(fix|debug|repair|corrige|r[ée]pare|d[ée]bogue|why (does|is|do) (this|my|it)[^.\n]{0,40}(fail|crash|error|wrong|not)|pourquoi (ça|mon|ce)[^.\n]{0,40}(plante|marche pas|erreur|bug))\b/i),
  rule("code_repair", 3.2, "an error name", /\b(\w+Error|\w+Exception|No module named|command not found|permission denied|segmentation fault|unexpected (token|identifier|end)|expected ['";)}\]]|ne compile pas|doesn'?t compile|won'?t compile|returns? (undefined|null|none|nan|nothing)|instead of (the|a|what)|off[- ]by[- ]one|infinite loop|boucle infinie|race condition|memory leak|fuite m[ée]moire)/i),
  // explaining
  rule("code_explain", 3, "asks to explain or review code", /\b(what does (this|that|it) do|walk me through|how does (this|that|the|my) (algorithm|code|function|script|program|class|loop|query|regex) work|comment (fonctionne|marche) (ce|cette|le|la) (code|fonction|script|algorithme)|explain (this|the|my) (code|function|script|regex|class|snippet)|what does (this|the) (code|function|script|line|regex)|explique (ce|cette|le|la|mon) (code|fonction|script|regex|ligne)|code review|review (my|this) code|relis (mon|ce) code|refactor|refactorise|optimi[sz]e (this|my|the) code|add comments|document (this|my) code|write (unit )?tests?|[ée]cris des tests)\b/i),
  // planning
  rule("planning", 3, "asks for a plan", /\b(plan|roadmap|feuille de route|step[- ]by[- ]step plan|break (this|it) down|break down|d[ée]coupe|d[ée]compose|organi[sz]e (my|the|a)|schedule|planning|itinerary|itin[ée]raire|project plan|strategy|strat[ée]gie|architecture (of|for|de|pour)|design (a|the) system|prioriti[sz]e|checklist|milestones?)\b/i),
  // tool use / structure
  rule("tool_use", 3, "asks for structured output", /\b(json|yaml|xml|csv|schema|sch[ée]ma|structured|structur[ée]|function call|tool call|api call|extract (the )?(fields|entities|names|dates|data)|extrais (les )?(champs|entit[ée]s|noms|dates|donn[ée]es)|parse (this|the)|convert (this|it) to (json|yaml|xml|csv)|convertis en (json|yaml|xml|csv)|table au format|as a table|markdown table|tableau)\b/i),
  // math
  rule("math", 1.5, "asks to solve", /\b(solve|r[ée]sous)\b/i),
  rule("math", 3, "has math in it", /\b(calculate|calcule|equation|[ée]quation|integral|int[ée]grale|derivative|d[ée]riv[ée]e|limit of|limite de|matrix|matrice|probability|probabilit[ée]|theorem|th[ée]or[èe]me|prove that|d[ée]montre|proof|geometry|g[ée]om[ée]trie|algebra|alg[èe]bre|trigonometr|sin\(|cos\(|sqrt|percent(age)?|pourcentage|fraction|factori[sz]e|modulo|gcd|pgcd|ppcm|how many (ways|combinations)|combien de (fa[çc]ons|combinaisons))\b/i),
  rule("math", 2, "has a calculation", /(\d+\s*[+\-*/^×÷]\s*\d+|[a-z]\^\d|\b(sin|cos|tan|log|ln|exp)\(|√|\b\d+\s*(%|x)\s*\d+|=\s*\?|\bx\s*=|\bf\(x\))/i),
  // reasoning
  rule("reasoning", 2.5, "asks for logic", /\b(riddle|[ée]nigme|puzzle|logic|logique|paradox|paradoxe|deduce|d[ée]duis|infer|brain ?teaser|if all|si tous|which is (bigger|better|heavier)|compare and contrast|pros and cons|avantages et inconv[ée]nients|think (step by step|carefully)|r[ée]fl[ée]chis|reason (about|through)|trade-?offs?|argue|argumente|critique)\b/i),
  // knowledge
  rule("knowledge", 2, "asks a factual question", /\b(who (is|was|were|invented|discovered|wrote)|what (is|are|was|were) (the|a|an)|when (did|was|were|is)|where (is|was|are)|how (does|do|did) .{0,30} work|capital of|history of|why is the|qui (est|était|a invent[ée]|a [ée]crit)|qu'?est[- ]ce (que|qu')|c'?est quoi|quand (est|a|était)|o[uù] (est|se trouve)|comment fonctionne|d[ée]finition|define|definition|meaning of|signification|difference between|diff[ée]rence entre)\b/i),
  rule("math", 2.5, "numbers in a question", /(?=(?:[^\d]*\d){2})[^]*\b(how (many|much|long|far|fast|old)|when (do|will|would)|what (is|are) the (total|sum|average|mean|median|product|difference|ratio|rate|speed|area|volume|perimeter)|combien|quelle (est la )?(vitesse|distance|dur[ée]e|somme|moyenne)|at what (time|speed)|km\/h|mph|per (hour|minute|day|cent)|par (heure|minute|jour))\b/i),
  rule("math", 2.8, "a computation", /\b(compute|add|subtract|multiply|divide|additionne|soustrais|multiplie|divise)\b[^.\n]{0,40}\d|\d+\s*%\s*(of|de)\s*\d+|\b(average|mean|median|moyenne|m[ée]diane) of\b[^.\n]{0,30}\d/i),
  rule("reasoning", 2.5, "a dilemma", /\b(ethic(al|s)?|moral(ly)?|dilemma|dilemme|both sides|les deux c[ôo]t[ée]s|should i|dois-je|is it (right|wrong|ok|okay|fair|true) (to|that)|est-il (juste|bien|mal)|what would happen if|que se passerait-il|hypothetical|hypoth[ée]tique|counterfactual)\b/i),
  // instruction following
  rule("instruction", 2.8, "gives exact constraints", /\b((reply|answer|respond|r[ée]ponds?) (with )?only|only the word|yes or no|oui ou non|each (sentence|line|word|paragraph) (starting|beginning|ending|with)|chaque (phrase|ligne|mot) (commence|se termine|d[ée]bute)|exactly|exactement|no more than|pas plus de|at (least|most)|au (moins|plus)|in (exactly )?\d+ (words|sentences|bullet|points|lines|paragraphs)|en \d+ (mots|phrases|points|lignes|paragraphes)|only (reply|answer|output|respond)|r[ée]ponds uniquement|uniquement|without (using|the word)|sans (utiliser|le mot)|do not (mention|use|include)|ne mentionne pas|use (only|the format)|format(ted)? as|start (with|each)|commence par|end with|termine par|all caps|en majuscules|lowercase|in the style of|dans le style de)\b/i),
  rule("knowledge", 1.2, "starts like a question", /^\s*(who|what|when|where|why|how|which|whose|qui|quoi|quand|o[uù]|pourquoi|comment|quel(le)?s?|lequel|laquelle)\b[^.]{0,120}\?\s*$/i),
  rule("knowledge", 2.4, "asks how or why something is", /\b(explain (how|why|what|the)|what (causes|makes|happens)|how (do|does|did|can|is|are) (?!you say|you pronounce|would you say)\w+|why (do|does|did|are|is) \w+|tell me about|parle-moi de|explique[- ]moi (comment|pourquoi|ce que)|who (painted|wrote|composed|founded|built|discovered|invented|directed|won|created|discovered)|how (old|tall|big|far|long) is)\b/i),
  // creative
  rule("creative", 3, "asks for creative writing", /\b(tell me a (joke|story|riddle|pun|fairy tale)|dis-moi une blague|raconte[- ]moi (une histoire|un conte)|bedtime story|story|short story|histoire|conte|nouvelle|poem|po[èe]me|poetry|po[ée]sie|haiku|sonnet|lyrics|paroles|song|chanson|rap\b|novel|roman|fiction|fan ?fic|screenplay|sc[ée]nario|dialogue between|character|personnage|role-?play|jeu de r[ôo]le|pretend (you|to be)|fais comme si|act as (a|an|if)|joue le r[ôo]le|villain|dragon|wizard|magicien|once upon|il [ée]tait une fois|write (me )?a (joke|riddle|pun)|blague)\b/i),
  // summarizing / rewriting
  rule("summarize", 3, "asks to condense or rewrite", /\b(make (this|it|that|the) (paragraph|text|sentence|email|message|note|description)[^.\n]{0,15}(shorter|longer|clearer|simpler|better|more \w+)|(shorter|more concise|plus court|plus concis|plus clair)\b|give me the (key points|main points|gist)|the gist|summari[sz]e|summary|r[ée]sum[ée]|r[ée]sume|tl;?dr|shorten|raccourcis|rewrite|r[ée][ée]cris|reformule|paraphrase|proofread|relis|corrige (l'orthographe|les fautes|ce texte)|fix (the )?(grammar|spelling|typos)|make (it|this) (shorter|clearer|more formal|more professional|polite)|improve (my|this) (text|email|writing|essay)|am[ée]liore (mon|ce) (texte|mail|email)|key points|points cl[ée]s|bullet points? (of|from)|condense|simplify (this|the) text|rends (ce|le) texte)\b/i),
  // translation
  rule("translate_fr", 4.6, "translation involving French", /\b(traduis|traduire|traduction|(in|into|to|from) french|en fran[çc]ais|vers le fran[çc]ais|en anglais|translate (it |this |that )?(to|into) english)\b/i),
  rule("translate_other", 3.9, "translation to another language", /\b(how (do|would) you say|comment (dit|dirait)-on|how to say|translate|translation|traduce|traduzca|[üu]bersetze|翻译|翻訳|in (spanish|german|italian|portuguese|chinese|japanese|korean|russian|arabic|dutch|polish|turkish|hindi|swedish)|en (espagnol|allemand|italien|portugais|chinois|japonais|cor[ée]en|russe|arabe|n[ée]erlandais|polonais|turc)|speak (spanish|german|italian|portuguese|chinese|japanese))\b/i),
  // vision
  rule("vision", 3, "talks about an image", /\b(this (image|picture|photo|screenshot|screen ?shot|chart|graph|diagram)|cette (image|photo|capture)|in the (image|picture|photo|screenshot)|dans l'image|what('s| is) (in|on) (the|this) (image|picture|photo|screen)|ocr|read the text (in|from)|lis le texte|describe (the|this|my) (image|picture|photo|screenshot|diagram|chart)|d[ée]cris (l'|cette |la )?(image|photo|capture)|(screenshot|image|picture|photo|diagram|chart|capture)( that)? (i|I) (sent|attached|uploaded))\b/i),
  // chat
  rule("chat", 2.4, "talks to the assistant", /\b(your (favou?rite|opinion|view|take)|ton (pr[ée]f[ée]r[ée]|avis)|what do you (think|like|prefer)|do you (like|prefer|believe|think)|tu (aimes|pr[ée]f[èe]res|penses)|i had a (rough|bad|great|long) |i need to vent|i feel|i'm (sad|tired|bored|stressed|anxious|happy)|je me sens|je suis (triste|fatigu[ée]|stress[ée]|content)|advice|conseil|what do you think|que penses-tu|qu'en penses-tu|recommend|recommande|suggest|suggestion|opinion|how are you|comment vas-tu|comment [çc]a va|tell me about yourself|parle-moi de toi)\b/i),
  // quick
  rule("fast", 3, "a greeting or a one-liner", /^\s*(hi|hello|hey|yo|salut|bonjour|bonsoir|coucou|hola|ciao|thanks|thank you|merci|ok(ay)?|cool|bye|au revoir|good (morning|night|evening)|bonne (nuit|journ[ée]e|soir[ée]e)|test|ping|\?|lol|mdr)[\s!.?]*$/i)
];

const FRENCH_WORDS = new Set("le la les des une un est pour que qui dans avec sur pas plus mais ou et je tu il elle nous vous ils elles mon ma mes ton ta tes son sa ses ce cette ces comment pourquoi quand fais fait peux peut veux voudrais peut-être très aussi donc alors bonjour merci s'il te plaît svp au aux du de d' l' c' j' n' qu'".split(" "));

/** How French a text is, 0 to 1: the share of its words that are common French words. */
export function frenchShare(text: string): number {
  const words = text.toLowerCase().replace(/[^a-zà-ÿ'’\s-]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length < 3) return 0;
  const hits = words.filter((w) => FRENCH_WORDS.has(w) || FRENCH_WORDS.has(w.replace(/^[a-z]'/, "").length ? w.split(/['’]/)[0] + "'" : w)).length;
  const accents = (text.match(/[éèêàùçôîâû]/gi) ?? []).length;
  return Math.min(1, hits / words.length + Math.min(0.15, accents / Math.max(40, text.length)));
}

/** A script that is not Latin (Chinese, Japanese, Arabic, Cyrillic...) means another language. */
const NON_LATIN = /[Ѐ-ӿ֐-׿؀-ۿऀ-ॿ฀-๿぀-ヿ㐀-鿿가-힯]/;

/** Long pasted text (a document) is a different job from a question about it. */
export const LONG_TEXT_CHARS = 9000;

/**
 * Sorts a request by its words, its shape and what the chat already holds. No model is involved, so it is instant and
 * the same every time. `confidence` (0 to 1) tells whether a model should be asked to look at the request as well.
 */
export function sortRequest(text: string, ctx: SortContext = {}): Sorted {
  const t = text.trim();
  if (ctx.hasImage) return { category: "vision", confidence: 0.95, reason: "an image is attached" };
  if (!t) return { category: ctx.previous ?? "chat", confidence: 0.3, reason: "an empty message" };
  if (t.length >= LONG_TEXT_CHARS) {
    // a long text with a short instruction on top: the instruction says what to do, the length says where to read
    const head = sortRequest(t.slice(0, 600), ctx);
    return { category: head.confidence >= 0.7 && head.category !== "chat" && head.category !== "knowledge" ? head.category : "long_context", confidence: 0.8, reason: "a very long text" };
  }
  const score = new Map<TaskCategory, { s: number; why: string }>();
  const add = (cat: TaskCategory, w: number, why: string) => { const cur = score.get(cat); score.set(cat, { s: (cur?.s ?? 0) + w, why: cur && cur.s >= w ? cur.why : why }); };
  // the words are read outside fenced code (a `python` inside a block says what the code is, not what is asked)
  const prose = t.replace(/```[\s\S]*?(```|$)/g, " [code] ");
  for (const r of RULES) {
    const m = (r.onCode ? t : prose).match(r.re);
    if (m) add(r.cat, r.w * (m.length > 1 && r.re.global ? 1.2 : 1), r.why);
  }
  // shape: code in the message
  const fences = (t.match(/```/g) ?? []).length / 2;
  if (fences >= 1) {
    const lang = /```(\w+)/.exec(t)?.[1]?.toLowerCase() ?? "";
    const asked = score.has("code_repair") || score.has("code_explain");
    if (!asked && /^(html|css|js|javascript|jsx|ts|tsx|typescript|vue|svelte)$/.test(lang)) add("web_code", 2.5, "web code in the message");
    else if (!asked && lang) add("python_code", 2.5, `${lang} code in the message`);
    if (!score.has("code_repair") && !score.has("code_explain") && !score.has("web_code")) add("code_explain", 1.2, "code in the message");
  }
  // language: French talk goes to the model that is best at French unless the job is clearly something else
  const fr = frenchShare(t);
  if (fr >= 0.28 && t.split(/\s+/).length >= 4) add("translate_fr", 1.1 + fr, "written in French");
  else if (NON_LATIN.test(t) && !score.has("translate_other")) add("translate_other", 2, "written in another language");
  if (t.length < 24 && !score.size) add("fast", 2, "a very short message");
  else if (t.length < 60 && !score.size) add("chat", 1.1, "a short message");
  // a short follow-up keeps the topic of the one before ("fix it", "continue", "plus court")
  const words = t.split(/\s+/).length;
  if (ctx.previous && words <= 7 && (!score.size || Math.max(...[...score.values()].map((v) => v.s)) < 2.5)) add(ctx.previous, 3, "a follow-up to the previous request");
  // code files in the chat make an ambiguous "make it better" a code job
  if (ctx.hasFiles && /\b(better|improve|add|change|update|make it|ajoute|am[ée]liore|change|modifie|rends|mets)\b/i.test(t) && !score.has("web_code") && !score.has("python_code")) add(ctx.previous && /code|repair/.test(ctx.previous) ? ctx.previous : "web_code", 2, "a change to the files of the chat");
  if (!score.size) return { category: "chat", confidence: 0.35, reason: "nothing specific found" };
  // French is a language, not a job: when something specific scored, it only wins on its own
  const ranked = [...score.entries()].sort((a, b) => b[1].s - a[1].s);
  let [cat, top] = ranked[0];
  if (cat === "translate_fr" && ranked.length > 1 && !/\b(traduis|traduire|traduction|translate|en anglais|en fran[çc]ais)/i.test(t)) { [cat, top] = ranked[1]; }
  // an exact format or length is the job when the topic is only a question or a chat
  if ((cat === "knowledge" || cat === "chat") && (score.get("instruction")?.s ?? 0) >= 2.5) { cat = "instruction"; top = score.get("instruction")!; }
  const second = ranked.find(([c]) => c !== cat)?.[1].s ?? 0;
  const confidence = Math.max(0.2, Math.min(0.98, (top.s / (top.s + second + 1)) * (top.s >= 3 ? 1.15 : top.s >= 2 ? 1 : 0.75)));
  return { category: cat, confidence: Math.round(confidence * 100) / 100, reason: top.why };
}

/** The question to a model when the words were not enough: it answers with one id. */
export function sortPrompt(text: string): { system: string; user: string } {
  const list = CATEGORY_IDS.filter((c) => c !== "fast").map((c) => `${c}: ${CATEGORY_INFO[c].hint}`).join("\n");
  return {
    system: `You sort requests. Reply with exactly one word from this list and nothing else:\n${list}\nfast: a greeting or a one-line answer`,
    user: `Request:\n${text.trim().slice(0, 1200)}\n\nWhich one is it?`
  };
}

/** The category in a model's reply, or null. */
export function parseSort(reply: string): TaskCategory | null {
  const w = reply.toLowerCase().match(/[a-z_]+/g) ?? [];
  return (w.find((x) => (CATEGORY_IDS as readonly string[]).includes(x)) as TaskCategory | undefined) ?? null;
}

// ------------------------------------------------------------------ choosing a model

const norm = (s: string) => s.trim().toLowerCase();
const refOf = (e: Pick<CatalogEntry, "repo" | "quant">) => (e.quant ? `${e.repo}:${e.quant}` : e.repo);

/** Does this entry answer to the table's name for a model (its id, its repo, or repo:quant)? */
const looseKey = (s: string) => s.toLowerCase().replace(/^.*\//, "").replace(/:.*$/, "").replace(/[-_ ]?gguf$/, "").replace(/[^a-z0-9.]+/g, "");
export function entryMatches(e: CatalogEntry, want: string): boolean {
  const w = norm(want);
  if (norm(e.id) === w || norm(e.repo) === w || norm(refOf(e)) === w || norm(e.name) === w) return true;
  const k = looseKey(want);
  return k.length >= 5 && (looseKey(e.name) === k || looseKey(e.repo) === k);
}

export interface Choice {
  entry: CatalogEntry;
  category: TaskCategory;
  /** The model the table wanted first, when it was not the one used (not installed). */
  wanted: string | null;
  /** Where in the table the pick was found: 0 = first choice. */
  rank: number;
}

const LANE_ORDER: Record<Lane, Lane[]> = { flash: ["flash", "flux", "forge"], flux: ["flux", "forge", "flash"], forge: ["forge", "flux", "flash"] };

/** The installed entry of a bundle model, if any. */
export const installedOf = (m: BundleModel, installed: CatalogEntry[]) => installed.find((e) => e.dynamicRef === m.ref) ?? installed.find((e) => entryMatches(e, m.ref) || entryMatches(e, m.repo) || entryMatches(e, m.name));

export interface PickOptions {
  loaded?: CatalogEntry | null;
  /** The models of the size. Where the table names nobody for a kind of task, these are sorted by class. */
  bundle?: BundleModel[];
  /** Speeds measured on this PC, by model ref. */
  speeds?: Record<string, number>;
  /** Strength overrides from the developer settings, by model ref. */
  power?: Record<string, number>;
}

/**
 * The model for one kind of task. First the table: the first of its list that is installed. Where it names nobody (the
 * independent benchmarks found no specialist), the class decides: Flash takes the fastest model, Forge the strongest,
 * Flux the best balance of both. A model that is already loaded wins unless another is clearly better, because a switch
 * costs a load. With nothing suitable, the loaded model, then the first installed.
 */
export function pickModel(table: RoutingTable, tier: string, category: TaskCategory, installed: CatalogEntry[], loadedOrOpts?: CatalogEntry | null | PickOptions): Choice | null {
  // a plain model (it has an engine) is the loaded one; anything else is the options
  const o: PickOptions = loadedOrOpts && !("engine" in loadedOrOpts) ? loadedOrOpts : { loaded: loadedOrOpts as CatalogEntry | null | undefined };
  const loaded = o.loaded ?? null;
  const list = table[tier]?.[category] ?? [];
  for (let rank = 0; rank < list.length; rank++) {
    // a name in the table is a model of the bundle when it can be found there, so it is found however its repo is called
    const bm = o.bundle?.find((b) => b.ref === list[rank]);
    const e = bm ? installedOf(bm, installed) : installed.find((x) => entryMatches(x, list[rank]));
    if (e) return { entry: e, category, wanted: rank > 0 ? (o.bundle?.find((b) => b.ref === list[0])?.name ?? list[0]) : null, rank };
  }
  if (o.bundle?.length) {
    const lane = CATEGORY_LANE[category];
    const speed = (m: BundleModel) => o.speeds?.[m.ref] ?? m.tokPerSec ?? 8;
    const power = (m: BundleModel) => o.power?.[m.ref] ?? m.power;
    const usable = o.bundle
      .map((m) => ({ m, e: installedOf(m, installed) }))
      .filter((x): x is { m: BundleModel; e: CatalogEntry } => !!x.e && (category !== "vision" || x.m.vision));
    for (const l of LANE_ORDER[lane]) {
      const c = usable.filter((x) => x.m.lanes.includes(l) && (category !== "long_context" || usable.every((u) => !u.m.long) || x.m.long));
      if (!c.length) continue;
      const score = (x: { m: BundleModel }) => (l === "flash" ? speed(x.m) : l === "forge" ? power(x.m) * 10 + Math.log2(speed(x.m)) : power(x.m) * Math.sqrt(speed(x.m)));
      c.sort((a, b) => score(b) - score(a));
      const best = c[0];
      // already loaded and nearly as good: stay, a switch costs more than it gains
      const here = loaded && c.find((x) => x.e === loaded);
      // (a Flash model that is loaded always does: any of them is quick, and a load takes longer than the answer)
      const chosen = here && (l === "flash" || score(here) >= score(best) * 0.8) ? here : best;
      return { entry: chosen.e, category, wanted: l !== lane ? o.bundle.find((m) => m.lanes.includes(lane))?.name ?? null : null, rank: l === lane ? 0 : 1 };
    }
  }
  const any = loaded && installed.includes(loaded) ? loaded : installed[0];
  return any ? { entry: any, category, wanted: list[0] ?? o.bundle?.find((m) => m.lanes.includes(CATEGORY_LANE[category]))?.name ?? null, rank: list.length } : null;
}

/** Every model a size of Dynamic can use, in the table's order, without repeats. */
export function modelsOfTier(table: RoutingTable, tier: string): string[] {
  const out: string[] = [];
  for (const cat of CATEGORY_IDS) for (const m of table[tier]?.[cat] ?? []) if (!out.some((x) => norm(x) === norm(m))) out.push(m);
  return out;
}

/** The models of a size's bundle that are not installed yet. */
export const missingBundle = (bundle: BundleModel[], installed: CatalogEntry[]) => bundle.filter((m) => !installedOf(m, installed));

/** The models of a size that are not installed yet, first choices before the others. */
export function missingModels(table: RoutingTable, tier: string, installed: CatalogEntry[]): string[] {
  return modelsOfTier(table, tier).filter((m) => !installed.some((e) => entryMatches(e, m)));
}

/** How many switches of model a run of categories costs (a model change between two requests of the same chat). */
export function categoryOfRole(role: WriterRole | undefined): TaskCategory {
  return role === "plan" ? "planning" : "web_code";
}

// ------------------------------------------------------------------ the entry in the model list

const DYNAMIC_SAMPLING: Sampling = { temperature: 0.6, top_p: 0.95, top_k: 20, presence_penalty: 1.5, max_tokens: 8192 };

/** The virtual model shown in the list: nothing to download itself, it stands for its team. */
export function dynamicEntry(t: TierInfo): CatalogEntry {
  return {
    id: `${DYNAMIC_PREFIX}${t.id}`, name: `${DYNAMIC_NAME} ${t.label}`, repo: `${DYNAMIC_PREFIX}${t.id}`, quant: null, engine: "llama_cpp",
    role: `Picks the best model up to ${t.label} for each request`, architecture: "dynamic", sizeGB: 0, sizeApprox: true, paramsB: t.maxParamsB,
    recommendedContext: 8192, sampling: { ...DYNAMIC_SAMPLING }
  } as CatalogEntry;
}
