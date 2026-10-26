import type { CatalogEntry, Sampling, WriterRole } from "../shared/types";
import { thinkingSupport } from "./effort";

/**
 * The "Dynamic" model: one entry in the model list that is really a team. Each request is sorted into a kind of task
 * (a web page, Python, a translation, a proof...) and handed to the model of the chosen size that does that kind of task
 * best, according to public, independent benchmarks (see docs/dynamic-model-research.md). The NPU holds one model at a
 * time, so models are switched only when the kind of task changes, and a request that is small or ambiguous stays on
 * the model that is already loaded.
 */

export const DYNAMIC_NAME = "Dynamic";
export const DYNAMIC_PREFIX = "dynamic:";

export const CATEGORY_IDS = [
  "web_code", "python_code", "code_repair", "code_explain", "planning", "tool_use", "math", "reasoning", "knowledge",
  "instruction", "chat", "creative", "writing", "summarize", "translate_fr", "translate_other", "long_context", "vision", "fast"
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
  writing: { label: "Mail and natural writing", hint: "Emails, letters, messages that sound human" },
  summarize: { label: "Summaries and rewriting", hint: "Summarize, rewrite, proofread, shorten" },
  translate_fr: { label: "French and translation from or to French", hint: "French writing and translation involving French" },
  translate_other: { label: "Other languages", hint: "Translation and writing in other languages" },
  long_context: { label: "Long documents", hint: "Very long pasted text or files" },
  vision: { label: "Images", hint: "Pictures, screenshots, charts, OCR" },
  fast: { label: "Quick replies", hint: "Greetings, one-line answers, titles" }
};

export const isDynamicId = (id: string | null | undefined): id is string => !!id && id.startsWith(DYNAMIC_PREFIX);
export const tierOf = (id: string) => id.slice(DYNAMIC_PREFIX.length);

// ------------------------------------------------------------------ packs

/**
 * A PC is described by its memory, which fixes how much the NPU can hold. That gives three sizes, named by speed:
 * Flash (the smallest, instant), Flux (the reasonable one), Forge (the biggest the NPU holds). Each size is a PACK:
 * several models of about that size, each the best at one kind of work (code, natural writing, facts, reasoning), and
 * a request goes to the right one of the installed pack.
 */
export const LANES = ["flash", "flux", "forge"] as const;
export type Lane = (typeof LANES)[number];

export const LANE_INFO: Record<Lane, { label: string; hint: string }> = {
  flash: { label: "Flash", hint: "The smallest and fastest: instant answers" },
  flux: { label: "Flux", hint: "The reasonable one: quick enough, good enough" },
  forge: { label: "Forge", hint: "The biggest the NPU holds: best answers, slower" }
};

/** A memory configuration and the pack that is its Flash, its Flux and its Forge. */
export interface Profile { id: string; label: string; ramGB: number; npuGB: number; packs: Record<Lane, string> }

/** One model of a pack. */
export interface BundleModel {
  /** Catalog id, or a short stable name when the model is not in the catalog. */
  ref: string;
  name: string;
  repo: string;
  /** Other repos that hold the same model in the same quant (checked on Hugging Face), tried in order when `repo` fails. */
  altRepos?: string[];
  quant: string | null;
  /** The quant to ask `altRepos` for when `quant` is null because `repo` is a precompiled NPU bundle (which some chips have no build of): a GGUF file of the same model. */
  altQuant?: string;
  paramsB: number;
  sizeGB: number;
  /** What it is for in the pack, in a few words. */
  job: string;
  /** Generation speed: measured by the app on a Snapdragon X NPU, or an estimate (memory bandwidth ÷ file size). */
  tokPerSec: number | null;
  tokEstimated?: boolean;
  /** Always thinks before answering: used for reasoning, maths and plans only. */
  thinking: boolean;
  vision: boolean;
  /** Fits its profile with little room left for context. */
  tight?: boolean;
  /** The repo and its Q4_0 file were checked on Hugging Face. */
  verified: boolean;
  note?: string;
  /** The alias of Microsoft Foundry Local's build of this model, which the pack runs instead when it is installed (it measured faster on the NPU). */
  foundry?: string;
  /** Only Foundry Local has it: there is no file to fetch from anywhere else. */
  foundryOnly?: boolean;
}

/** For each kind of task, the models of the pack in order of preference (refs of its models). */
export type PackTable = Partial<Record<TaskCategory, string[]>>;

export interface Pack {
  id: string;
  /** "4B" */
  label: string;
  maxParamsB: number;
  models: BundleModel[];
  table: PackTable;
  /** Why each pick, "category" → one line with its source. */
  why?: Record<string, string>;
}

export interface DynamicData {
  asOf: string;
  /** What the choices are based on and how far to trust them. */
  provisional?: string;
  profiles: Profile[];
  packs: Record<string, Pack>;
}

export interface DynamicSettings {
  /** The memory configuration chosen; the PC's own when missing. */
  profile?: string;
  /** Choices changed in the developer settings, by pack; they win over the built-in table. */
  table?: Record<string, PackTable>;
  /** When a request cannot be sorted by its words, ask the loaded model (costs a second or two). */
  askModel?: boolean;
  /** The router (a tiny model on the processor) reads the requests the words are unsure about. On when installed, unless this is false. */
  router?: boolean;
}

/** The profile that suits a PC with this much memory: the biggest one it can carry. */
export function profileFor(data: DynamicData, ramGB: number | null | undefined, chosen?: string): Profile {
  const byId = data.profiles.find((p) => p.id === chosen);
  if (byId) return byId;
  const fit = [...data.profiles].sort((a, b) => b.ramGB - a.ramGB).find((p) => (ramGB ?? 16) >= p.ramGB - 1);
  return fit ?? data.profiles[0];
}

/** A pack with the developer's changes to its table applied. */
export function mergedPack(data: DynamicData, packId: string, s: DynamicSettings | undefined): Pack | undefined {
  const pack = data.packs[packId];
  return pack ? { ...pack, table: { ...pack.table, ...(s?.table?.[packId] ?? {}) } } : undefined;
}

/** Average speed and total weight of the models of a pack. `speeds` holds what the app measured on this PC. */
export function packStats(pack: Pack, speeds: Record<string, number> = {}): { count: number; tokPerSec: number | null; sizeGB: number } {
  const rates = pack.models.map((m) => speeds[m.ref] ?? m.tokPerSec).filter((x): x is number => typeof x === "number" && x > 0);
  return {
    count: pack.models.length,
    tokPerSec: rates.length ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10 : null,
    sizeGB: Math.round(pack.models.reduce((a, m) => a + m.sizeGB, 0) * 10) / 10
  };
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
  rule("web_code", 3.2, "asks for something interactive", /\b(interactive|interactifs?|interactives?)\b/i),
  rule("web_code", 2.6, "asks for a diagram, a chart or a simulation", /\b(diagram(?:me)?s?|graphiques?|charts?|visuali[sz]ations?|simulat(?:or|eur|ion)s?|animated|anim[ée]e?s?)\b/i),
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
  // a mail or a message that has to sound human
  rule("writing", 3.4, "asks for a mail, a letter or a message", /(write|draft|compose|r[ée]dige|[ée]cris)(-moi)?\b[^.\n]{0,40}\b(an? |un |une |le |la |mon |ma |my )?(e-?mail|mail|courriel|letter|lettre|message|cover letter|lettre de motivation|linkedin|speech|discours|invitation|thank[- ]you|remerciement|announcement|annonce|apology|excuses|resignation|d[ée]mission|reply|r[ée]ponse|post)\b/i),
  rule("writing", 3.4, "wants it to sound natural", /\b(sound(s)? (more )?(natural|human|friendly|polite|warm|professional|formal)|more (natural|human|friendly|polite|warm|formal)|plus (naturel|humain|chaleureux|poli|formel|professionnel)|ton (amical|poli|professionnel|chaleureux|naturel)|sonne (plus )?(naturel|humain))\b/i),
  // summarizing / rewriting
  rule("summarize", 3, "asks to condense or rewrite", /\b(make (this|it|that|the) (paragraph|text|sentence|email|message|note|description)[^.\n]{0,15}(shorter|longer|clearer|simpler|better|more \w+)|(shorter|more concise|plus court|plus concis|plus clair)\b|give me the (key points|main points|gist)|the gist|summari[sz]e|summary|r[ée]sum[ée]|r[ée]sume|tl;?dr|shorten|raccourcis|rewrite|r[ée][ée]cris|reformule|paraphrase|proofread|relis|corrige (l'orthographe|les fautes|ce texte)|fix (the )?(grammar|spelling|typos)|make (it|this) (shorter|clearer)|improve (my|this) (text|email|writing|essay)|am[ée]liore (mon|ce) (texte|mail|email)|key points|points cl[ée]s|bullet points? (of|from)|condense|simplify (this|the) text|rends (ce|le) texte)\b/i),
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

/** Does this entry answer to a name (its id, its repo, repo:quant, its name, or the same name written loosely)? */
const looseKey = (s: string) => s.toLowerCase().replace(/^.*\//, "").replace(/:.*$/, "").replace(/[-_ ]?gguf$/, "").replace(/[^a-z0-9.]+/g, "");
export function entryMatches(e: CatalogEntry, want: string): boolean {
  const w = norm(want);
  if (norm(e.id) === w || norm(e.repo) === w || norm(refOf(e)) === w || norm(e.name) === w) return true;
  const k = looseKey(want);
  return k.length >= 5 && (looseKey(e.name) === k || looseKey(e.repo) === k);
}

/** The installed entry of a pack model, if any. */
/** A bigger build of the same model (Q8_0 for Q4_0) is not the pack's model: it needs twice the NPU memory. */
const sameQuant = (e: CatalogEntry, m: BundleModel) => !m.quant || !e.quant || e.quant.toLowerCase() === m.quant.toLowerCase();
export const installedOf = (m: BundleModel, installed: CatalogEntry[]): CatalogEntry | undefined => {
  // the Foundry Local build comes first when it is there: that is the one the pack measured faster
  const f = m.foundry ? installed.find((e) => e.id === `foundry:${m.foundry}`) : undefined;
  if (f || m.foundryOnly) return f;
  return installed.find((e) => !e.id.startsWith("foundry:") && sameQuant(e, m) && (e.dynamicRef === m.ref || entryMatches(e, m.ref) || entryMatches(e, m.repo) || entryMatches(e, m.name)));
};

export interface Choice {
  entry: CatalogEntry;
  model: BundleModel;
  category: TaskCategory;
  /** The model the pack wanted first, when it was not the one used (not installed). */
  wanted: string | null;
  /** Why `wanted` was left out although it is installed: it does not fit this PC's NPU memory, or it always thinks. null = not installed. */
  skipped?: "fit" | "thinks" | null;
  /** Where in the pack's list the pick was found: 0 = first choice. */
  rank: number;
}

/** The kinds of task where thinking before answering pays. For the others a model that always thinks is left out. */
export const THINKING_OK = new Set<TaskCategory>(["reasoning", "math", "planning"]);

/** Small talk and short answers do not deserve a model switch: whatever pack model is loaded answers. */
const STAY = new Set<TaskCategory>(["fast", "chat"]);

export interface PickOptions {
  loaded?: CatalogEntry | null;
  /** Whether a model fits this machine's NPU memory. Models that do not are skipped while another one of the pack does. */
  fits?: (e: CatalogEntry) => boolean;
}

/**
 * The model for one kind of task, among the INSTALLED models of the pack: the first of the pack's list for it. A model that
 * always thinks is only used for reasoning, maths and plans. For small talk the loaded model of the pack answers, to spare a
 * load. With nothing suitable the loaded model of the pack, then the first one. null when no model of the pack is installed.
 */
export function pickModel(pack: Pack, category: TaskCategory, installed: CatalogEntry[], opts: PickOptions = {}): Choice | null {
  let have = pack.models.flatMap((m) => { const e = installedOf(m, installed); return e ? [{ m, e }] : []; });
  if (!have.length) return null;
  const installedRefs = new Set(have.map((x) => x.m.ref));
  const dropped = new Map<string, "fit" | "thinks">();
  if (opts.fits) { const ok = have.filter((x) => opts.fits!(x.e)); if (ok.length) { have.filter((x) => !ok.includes(x)).forEach((x) => dropped.set(x.m.ref, "fit")); have = ok; } }
  if (!THINKING_OK.has(category)) { const calm = have.filter((x) => !x.m.thinking && thinkingSupport(x.e) !== "always"); if (calm.length) { have.filter((x) => !calm.includes(x)).forEach((x) => dropped.set(x.m.ref, "thinks")); have = calm; } }
  const list = pack.table[category] ?? pack.table.chat ?? [];
  const first = pack.models.find((m) => m.ref === list[0]);
  // the first choice may be installed yet left out: that is not "not installed"
  const skipped = first && installedRefs.has(first.ref) ? dropped.get(first.ref) ?? null : null;
  const here = opts.loaded ? have.find((x) => x.e === opts.loaded) : undefined;
  if (STAY.has(category) && here) return { entry: here.e, model: here.m, category, wanted: null, rank: 0 };
  for (let rank = 0; rank < list.length; rank++) {
    const x = have.find((h) => h.m.ref === list[rank]);
    if (x) return { entry: x.e, model: x.m, category, wanted: rank > 0 ? first?.name ?? null : null, skipped: rank > 0 ? skipped : null, rank };
  }
  const any = here ?? have[0];
  return { entry: any.e, model: any.m, category, wanted: first?.name ?? null, skipped, rank: list.length };
}

/** The note on a pick that is not the pack's first choice, saying the true reason. */
export const wantedNote = (c: Pick<Choice, "wanted" | "skipped">) =>
  !c.wanted ? "" : ` (${c.wanted} would be better, ${c.skipped === "fit" ? "it is installed but does not fit this PC's NPU memory" : c.skipped === "thinks" ? "it is installed but always thinks, too slow for this" : "it is not installed"})`;

/**
 * Entries saved by an older version may carry a size that counted a quant twice (whole file plus its shards). A saved pack model
 * far above the size its pack records is put back to that size, so it is not refused as too big for the NPU.
 */
export function healEntry(e: CatalogEntry, models: BundleModel[]): CatalogEntry {
  const m = models.find((x) => e.dynamicRef === x.ref || entryMatches(e, x.ref) || entryMatches(e, x.repo) || entryMatches(e, x.name));
  if (!m || !m.sizeGB || e.sizeGB <= m.sizeGB * 1.25 || !sameQuant(e, m)) return e;
  return { ...e, sizeGB: m.sizeGB, recommendedContext: Math.max(e.recommendedContext, 8192) };
}

/** Where to get a pack model, in order: its own repo, then the other providers of the same file. */
export const candidateRepos = (m: BundleModel): string[] => (m.foundryOnly ? [] : [m.repo, ...(m.altRepos ?? [])]).filter((r, i, all) => all.indexOf(r) === i);

/** The models of a pack that are not installed yet. */
export const missingInPack = (pack: Pack, installed: CatalogEntry[]) => pack.models.filter((m) => !installedOf(m, installed));

// ------------------------------------------------------------------ the entry in the model list

const DYNAMIC_SAMPLING: Sampling = { temperature: 0.6, top_p: 0.95, top_k: 20, presence_penalty: 1.5, max_tokens: 8192 };

/** The virtual model shown in the list: nothing to download itself, it stands for its pack. `lane` names it for the PC's profile. */
export function dynamicEntry(pack: Pack, lane?: Lane): CatalogEntry {
  return {
    id: `${DYNAMIC_PREFIX}${pack.id}`, name: `${DYNAMIC_NAME} ${lane ? `${LANE_INFO[lane].label} ` : ""}${pack.label}`, repo: `${DYNAMIC_PREFIX}${pack.id}`, quant: null, engine: "llama_cpp",
    role: `The best ${pack.label} model for each request`, architecture: "dynamic", sizeGB: 0, sizeApprox: true, paramsB: pack.maxParamsB,
    recommendedContext: 8192, sampling: { ...DYNAMIC_SAMPLING }
  } as CatalogEntry;
}
