import { describe, expect, it } from "vitest";
import { CATEGORY_IDS, BundleModel, candidateRepos, DynamicData, Pack, TaskCategory, healEntry, installedOf, mergedPack, missingInPack, packStats, parseSort, pickModel, profileFor, sortRequest } from "../src/core/dynamic";
import type { CatalogEntry } from "../src/shared/types";

/** What people really ask, in English and French, and the kind of task each one is. */
const CASES: [string, TaskCategory][] = [
  ["make a web page about the history of snake with a playable snake game", "web_code"],
  ["fais-moi un jeu de snake en html css et javascript", "web_code"],
  ["create a landing page for my bakery with a responsive navbar", "web_code"],
  ["build a todo app with local storage", "web_code"],
  ["explique moi les interets cumuler avec un diagram interactif", "tool_use"],
  ["explain how a binary search works with an interactive visualisation", "web_code"],
  ["montre-moi une simulation de la gravité", "web_code"],
  ["add a dark mode toggle button to my website", "web_code"],
  ["write a tetris game using canvas", "web_code"],
  ["make a calculator", "web_code"],
  ["écris une page web avec un formulaire de contact", "web_code"],
  ["center a div with flexbox", "web_code"],
  ["write a python script that renames all files in a folder", "python_code"],
  ["écris un script python qui lit un fichier csv avec pandas", "python_code"],
  ["implement binary search in Rust", "python_code"],
  ["write a function that returns the nth fibonacci number", "python_code"],
  ["give me a regex that matches email addresses", "python_code"],
  ["write a bash script to back up my home folder", "python_code"],
  ["write a SQL query that returns the top 5 customers by revenue", "python_code"],
  ["I get TypeError: undefined is not a function when I click the button", "code_repair"],
  ["fix this: Traceback (most recent call last): File main.py line 3 NameError: name 'x' is not defined", "code_repair"],
  ["mon code plante avec une erreur de syntaxe, corrige-le", "code_repair"],
  ["why does my loop never stop? it crashes the page", "code_repair"],
  ["debug this function", "code_repair"],
  ["explain this code to me: ```python\nfor i in range(3): print(i)\n```", "code_explain"],
  ["review my code and tell me what to improve", "code_explain"],
  ["explique cette fonction ligne par ligne", "code_explain"],
  ["write unit tests for this function", "code_explain"],
  ["make a plan to learn Spanish in 3 months", "planning"],
  ["break down the steps to launch a podcast", "planning"],
  ["fais-moi une feuille de route pour mon projet de startup", "planning"],
  ["design the architecture for a chat app with 10k users", "planning"],
  ["extract the names and dates from this text as JSON", "tool_use"],
  ["convert this table to CSV", "tool_use"],
  ["réponds en json avec les champs nom et prix", "tool_use"],
  ["write a JSON schema for a user profile", "tool_use"],
  ["solve 3x + 7 = 22", "math"],
  ["what is the derivative of x^3 * sin(x)?", "math"],
  ["calcule l'intégrale de x au carré entre 0 et 3", "math"],
  ["prove that the square root of 2 is irrational", "math"],
  ["how many ways can 5 people sit in a row?", "math"],
  ["if all bloops are razzies and all razzies are lazzies, are all bloops lazzies? think step by step", "reasoning"],
  ["here is a riddle: what has keys but cannot open locks?", "reasoning"],
  ["compare the pros and cons of renting versus buying a house", "reasoning"],
  ["résous cette énigme logique", "reasoning"],
  ["who invented the telephone?", "knowledge"],
  ["what is the capital of Australia?", "knowledge"],
  ["qu'est-ce que la photosynthèse ?", "knowledge"],
  ["how does a refrigerator work?", "knowledge"],
  ["what's the difference between a virus and a bacterium?", "knowledge"],
  ["answer in exactly three bullet points: why is the sky blue", "instruction"],
  ["write a sentence of no more than 10 words without using the letter e", "instruction"],
  ["réponds uniquement par oui ou non: la terre est ronde ?", "instruction"],
  ["write a short story about a dragon who is afraid of fire", "creative"],
  ["écris un poème sur la mer", "creative"],
  ["act as a pirate and describe your day", "creative"],
  ["write lyrics for a sad song about summer ending", "creative"],
  ["role-play as a medieval innkeeper", "creative"],
  ["summarize this article in 3 sentences", "summarize"],
  ["résume ce texte", "summarize"],
  ["rewrite this email to sound more professional", "writing"],
  ["write an email to my landlord asking him to fix the heater", "writing"],
  ["rédige un mail pour décaler la réunion de demain", "writing"],
  ["écris une lettre de motivation pour un poste de vendeur", "writing"],
  ["make this message sound more natural and friendly", "writing"],
  ["proofread my essay and fix the grammar", "summarize"],
  ["traduis ce texte en anglais", "translate_fr"],
  ["translate 'good morning, how are you?' into French", "translate_fr"],
  ["comment dit-on 'bonne chance' en espagnol ? traduis-le", "translate_fr"],
  ["translate this paragraph to Spanish", "translate_other"],
  ["translate this into German: the weather is nice today", "translate_other"],
  ["这个怎么说？请帮我翻译成英文", "translate_other"],
  ["what is in this image?", "vision"],
  ["describe the screenshot I sent", "vision"],
  ["hi", "fast"],
  ["bonjour", "fast"],
  ["thanks!", "fast"],
  ["merci beaucoup", "fast"],
  ["I feel stressed about my exams, any advice?", "chat"],
  ["what do you think about remote work?", "chat"],
  ["can you recommend a good book?", "chat"],
  // a second set, written after the first was tuned: what the rules had never seen
["Build me a simple platformer where a square jumps over obstacles", "web_code"],
  ["I need a website for my dog grooming business with prices and a gallery", "web_code"],
  ["make the button change color when hovered", "web_code"],
  ["can you code a pomodoro timer in the browser", "web_code"],
  ["crée une animation de particules sur un canvas", "web_code"],
  ["Write a program that reads numbers from stdin and prints their median", "python_code"],
  ["how do I merge two dictionaries in python", "python_code"],
  ["scrape the titles from a webpage with beautifulsoup", "python_code"],
  ["write a C++ function to reverse a linked list", "python_code"],
  ["Why am I getting 'ModuleNotFoundError: No module named requests'?", "code_repair"],
  ["my function returns undefined instead of the sum", "code_repair"],
  ["ça ne compile pas, voici l'erreur : expected ';' before '}' token", "code_repair"],
  ["what does this do? ```js\nconst f = a => a.map(x => x*2)\n```", "code_explain"],
  ["can you walk me through how this algorithm works", "code_explain"],
  ["Help me organize a two week trip to Japan", "planning"],
  ["what should be the milestones for building a mobile app", "planning"],
  ["Give me the output as a JSON array with keys id and title", "tool_use"],
  ["Compute 15% of 240 and then add 18", "math"],
  ["a train leaves at 3pm at 80 km/h, another at 4pm at 100 km/h, when do they meet", "math"],
  ["what is the probability of rolling two sixes", "math"],
  ["Is it ethical to lie to protect someone? explain both sides", "reasoning"],
  ["Which is heavier, a kilo of feathers or a kilo of steel?", "reasoning"],
  ["Who painted the Mona Lisa and when?", "knowledge"],
  ["explain how vaccines work", "knowledge"],
  ["what causes the northern lights", "knowledge"],
  ["Reply with only the word yes or no", "instruction"],
  ["write exactly 5 sentences about cats, each starting with the letter C", "instruction"],
  ["Write a bedtime story about a sleepy robot", "creative"],
  ["pretend you are a grumpy cat and answer my questions", "creative"],
  ["Make this paragraph shorter: The meeting that was held yesterday was long.", "summarize"],
  ["give me the key points of this report", "summarize"],
  ["corrige les fautes d'orthographe de ce texte", "summarize"],
  ["Peux-tu me traduire cette phrase en français ?", "translate_fr"],
  ["How do you say 'where is the library' in Italian?", "translate_other"],
  ["Tell me a joke", "creative"],
  ["hey there", "fast"],
  ["ok thanks", "fast"],
  ["salut ça va ?", "fast"],
  ["I had a rough day at work and need to vent", "chat"],
  ["what's your favorite color?", "chat"],
];

describe("sorting a request into a kind of task", () => {
  it("gets the usual requests right", () => {
    const wrong = CASES.map(([text, want]) => ({ text, want, got: sortRequest(text).category })).filter((x) => x.want !== x.got);
    const ok = CASES.length - wrong.length;
    // the report names every miss, so a rule can be fixed rather than the test loosened
    expect(wrong, `${ok}/${CASES.length} right`).toEqual([]);
  });
  it("sends an attached image to vision and a very long text to the long-document model", () => {
    expect(sortRequest("what is this?", { hasImage: true }).category).toBe("vision");
    expect(sortRequest("x ".repeat(6000)).category).toBe("long_context");
    expect(sortRequest("summarize this " + "lorem ipsum ".repeat(1000)).category).not.toBe("fast");
  });
  it("keeps the topic for a short follow-up", () => {
    expect(sortRequest("now make it faster", { previous: "web_code" }).category).toBe("web_code");
    expect(sortRequest("continue", { previous: "creative" }).category).toBe("creative");
    expect(sortRequest("plus court", { previous: "summarize" }).category).toBe("summarize");
  });
  it("is unsure when nothing in the request says what it is", () => {
    expect(sortRequest("hmm, the thing with the stuff from before, you know?").confidence).toBeLessThan(0.55);
    expect(sortRequest("write a python script that sorts a list").confidence).toBeGreaterThan(0.6);
  });
  it("reads a model's one-word answer", () => {
    expect(parseSort("web_code")).toBe("web_code");
    expect(parseSort("Category: math.")).toBe("math");
    expect(parseSort("I cannot tell")).toBeNull();
    expect(CATEGORY_IDS.length).toBeGreaterThan(15);
  });
});

import { DYNAMIC_DATA } from "../src/core/dynamic-data";

const entry = (id: string, repo: string): CatalogEntry => ({ id, name: id, repo, quant: "Q4_0", engine: "llama_cpp", role: "", architecture: "x", sizeGB: 2, paramsB: 4, recommendedContext: 4096, sampling: { temperature: 0.6, top_p: 0.95, max_tokens: 4096 } }) as CatalogEntry;

describe("packs and profiles", () => {
  it("has three memory profiles, each with a Flash, a Flux and a Forge pack that exist", () => {
    expect(DYNAMIC_DATA.profiles.map((p) => p.id)).toEqual(["16", "24", "32"]);
    for (const p of DYNAMIC_DATA.profiles) for (const l of ["flash", "flux", "forge"] as const) expect(DYNAMIC_DATA.packs[p.packs[l]], `${p.id}/${l}`).toBeTruthy();
    // sizes grow with the lane: the Forge pack holds bigger models than the Flash one
    for (const p of DYNAMIC_DATA.profiles) expect(DYNAMIC_DATA.packs[p.packs.flash].maxParamsB).toBeLessThan(DYNAMIC_DATA.packs[p.packs.forge].maxParamsB);
  });
  it("chooses the profile of the PC's memory, or the one asked for", () => {
    expect(profileFor(DYNAMIC_DATA, 16).id).toBe("16");
    expect(profileFor(DYNAMIC_DATA, 24).id).toBe("24");
    expect(profileFor(DYNAMIC_DATA, 32).id).toBe("32");
    expect(profileFor(DYNAMIC_DATA, 64).id).toBe("32");
    expect(profileFor(DYNAMIC_DATA, 16, "32").id).toBe("32");
  });
  it("makes each pack of models of about its size, with a checked repo, and a model for each kind of work it is asked", () => {
    for (const pack of Object.values(DYNAMIC_DATA.packs)) {
      expect(pack.models.length).toBeGreaterThanOrEqual(3);
      const refs = new Set(pack.models.map((m) => m.ref));
      for (const m of pack.models) { expect(m.verified).toBe(true); expect(m.paramsB).toBeLessThanOrEqual(pack.maxParamsB + 0.6); }
      for (const list of Object.values(pack.table)) for (const r of list as string[]) expect(refs.has(r), `${pack.id}: ${r}`).toBe(true);
      for (const c of ["web_code", "python_code", "writing", "reasoning", "knowledge", "chat"] as TaskCategory[]) expect(pack.table[c]?.length, `${pack.id}/${c}`).toBeGreaterThan(0);
    }
  });
  it("fits each Forge pack in the memory its profile gives the NPU (about half the RAM, minus 0.9 GB per model)", () => {
    for (const pr of DYNAMIC_DATA.profiles) for (const l of ["flash", "flux", "forge"] as const) for (const m of DYNAMIC_DATA.packs[pr.packs[l]].models) expect(m.sizeGB + 0.9, `${pr.id}/${l}/${m.ref}`).toBeLessThan(pr.npuGB * 0.92 + (m.tight ? 0.5 : 0));
  });
});

describe("choosing the model of a pack", () => {
  const pack = DYNAMIC_DATA.packs["9B"];
  const all = pack.models.map((b) => entry(b.ref, b.repo));
  const by = (ref: string) => all.find((e) => e.id === ref)!;
  const pick = (c: TaskCategory, installed = all, loaded?: CatalogEntry) => pickModel(pack, c, installed, { loaded })?.entry.id;

  it("sends each kind of work to the model of the pack that does it", () => {
    expect(pick("python_code")).toBe("qwen2.5-coder-7b-instruct");
    expect(pick("web_code")).toBe("qwen2.5-coder-7b-instruct");
    expect(pick("summarize")).toBe("qwen3-8b");
    expect(pick("knowledge")).toBe("qwen3-8b");
    expect(pick("writing")).toBe("qwen3-8b");
    expect(pick("code_explain")).toBe("qwen3.5-9b");
    expect(pick("math")).toBe("qwen3.5-9b");
  });
  it("uses only the installed models of the pack, and falls back down its list", () => {
    expect(pick("python_code", [by("qwen3-8b")])).toBe("qwen3-8b");
    expect(pickModel(pack, "python_code", [by("qwen3-8b")])!.wanted).toBe("Qwen2.5-Coder-7B-Instruct");
    expect(pick("writing", [by("qwen3-8b"), by("qwen2.5-coder-7b-instruct")])).toBe("qwen3-8b");
    expect(pickModel(pack, "chat", [entry("someone-else", "x/y")])).toBeNull(); // nothing of the pack is installed
  });
  it("keeps small talk on the loaded model of the pack, to spare a load", () => {
    expect(pick("fast", all, by("qwen3.5-9b"))).toBe("qwen3.5-9b");
    expect(pick("chat", all, by("qwen2.5-coder-7b-instruct"))).toBe("qwen2.5-coder-7b-instruct");
    expect(pick("python_code", all, by("qwen3-8b"))).toBe("qwen2.5-coder-7b-instruct"); // work does not stay
  });
  it("leaves a model that always thinks for reasoning, maths and plans", () => {
    const p4 = DYNAMIC_DATA.packs["4B"];
    const e4 = p4.models.map((b) => entry(b.ref, b.repo));
    for (const c of ["web_code", "summarize", "writing", "chat", "fast"] as TaskCategory[]) expect(pickModel(p4, c, e4)!.entry.id, c).not.toBe("qwen3-4b-thinking-2507");
    expect(pickModel(p4, "reasoning", e4)!.entry.id).toBe("qwen3-4b-thinking-2507");
    expect(pickModel(p4, "planning", e4)!.entry.id).toBe("qwen3-4b-thinking-2507");
  });
  it("finds a model installed under another name through its ref, or by a loose name", () => {
    const custom = { ...entry("custom:hf:bartowski/qwen_qwen3-8b-gguf:q4_0", "bartowski/Qwen_Qwen3-8B-GGUF"), dynamicRef: "qwen3-8b" };
    expect(pickModel(pack, "summarize", [custom])!.entry).toBe(custom);
    const loose = entry("custom:y", "unsloth/Qwen3.5-9B-GGUF");
    expect(installedOf(pack.models.find((m) => m.ref === "qwen3.5-9b")!, [loose])).toBe(loose);
  });
  it("does not take a bigger build of a pack model for the pack's Q4_0 file", () => {
    const m = pack.models.find((x) => x.ref === "qwen2.5-coder-7b-instruct")!;
    const q8 = { ...entry("q8", m.repo), quant: "Q8_0" } as CatalogEntry;
    const q4 = { ...entry("q4", m.repo), quant: "Q4_0" } as CatalogEntry;
    expect(installedOf(m, [q8])).toBeUndefined();
    expect(installedOf(m, [q8, q4])).toBe(q4);
    expect(installedOf(m, [{ ...q8, dynamicRef: m.ref }])).toBeUndefined(); // even one saved as the pack's by an old install
  });
  it("lists every provider of a pack model, its own repo first, without duplicates", () => {
    const m = pack.models.find((x) => x.ref === "qwen2.5-coder-7b-instruct")!;
    expect(candidateRepos(m)[0]).toBe(m.repo);
    expect(candidateRepos(m).length).toBeGreaterThan(1);
    for (const p of Object.values(DYNAMIC_DATA.packs)) for (const x of p.models) expect(new Set(candidateRepos(x)).size, x.ref).toBe(candidateRepos(x).length);
    expect(candidateRepos({ ...m, altRepos: [m.repo, "a/b"] })).toEqual([m.repo, "a/b"]);
  });
  it("puts a saved pack model back to its pack size when an older version counted it twice", () => {
    const m = DYNAMIC_DATA.packs["9B"].models[0];
    const saved = { ...by(m.ref), sizeGB: 8.86, recommendedContext: 4096 };
    expect(healEntry(saved, [m]).sizeGB).toBe(m.sizeGB);
    const ok = { ...saved, sizeGB: m.sizeGB };
    expect(healEntry(ok, [m])).toBe(ok);
  });
  it("skips a model that does not fit this machine while another one of the pack does", () => {
    const big = by("qwen2.5-coder-7b-instruct");
    const fits = (e: CatalogEntry) => e !== big;
    expect(pickModel(pack, "python_code", all, { fits })!.entry.id).toBe("qwen3-8b");
    expect(pickModel(pack, "python_code", [big], { fits })!.entry).toBe(big); // nothing fits: the load reports why
  });
  it("shows the average speed of the models of a pack, with what was measured here winning, and lets the developer change its table", () => {
    const small = DYNAMIC_DATA.packs["2B"];
    expect(packStats(small, { "qwen3-1.7b-native": 27 }).tokPerSec).toBeLessThan(packStats(small).tokPerSec!);
    expect(packStats(pack).count).toBe(pack.models.length);
    const merged = mergedPack(DYNAMIC_DATA, "9B", { table: { "9B": { math: ["qwen3-8b"] } } })!;
    expect(merged.table.math).toEqual(["qwen3-8b"]);
    expect(merged.table.web_code).toEqual(pack.table.web_code);
    expect(missingInPack(pack, [by("qwen3-8b")]).length).toBe(pack.models.length - 1);
  });
  it("reads a model's one-word answer", () => {
    expect(parseSort("writing")).toBe("writing");
    expect(parseSort("Category: math.")).toBe("math");
    expect(parseSort("I cannot tell")).toBeNull();
  });
});

describe("the native NPU bundle", () => {
  it("has a GGUF Q4_0 of the same model to fall back on when AI Hub has no build for the chip", async () => {
    const m = Object.values(DYNAMIC_DATA.packs).flatMap((p) => p.models).find((x) => x.ref === "qwen3-1.7b-native")!;
    expect(m.quant).toBeNull();
    expect(m.altQuant).toBe("Q4_0");
    expect(m.altRepos?.length).toBeGreaterThan(0);
  });
  it("runs the Foundry Local build of a pack model when it is installed, and the GenieX file otherwise", () => {
    const base = { ref: "qwen3.5-2b", name: "Qwen3.5-2B", repo: "unsloth/Qwen3.5-2B-GGUF", quant: "Q4_0", paramsB: 1.9, sizeGB: 1.2, job: "", tokPerSec: null, thinking: false, vision: false, verified: true } as BundleModel;
    const withFoundry = { ...base, foundry: "qwen3.5-2b" };
    const gguf = { ...entry("g", "unsloth/Qwen3.5-2B-GGUF"), name: "Qwen3.5-2B" };
    const onFoundry = { ...entry("foundry:qwen3.5-2b", "qwen3.5-2b"), name: "Qwen3.5-2B (Foundry Local)", quant: null } as CatalogEntry;
    expect(installedOf(withFoundry, [gguf, onFoundry])?.id).toBe("foundry:qwen3.5-2b");
    expect(installedOf(withFoundry, [gguf])?.id).toBe("g");
    expect(installedOf(base, [onFoundry])).toBeUndefined(); // a model with no Foundry build is not matched by a Foundry entry
    const only = { ...withFoundry, ref: "phi-4-mini", repo: "foundry:phi-4-mini", foundry: "phi-4-mini", foundryOnly: true };
    expect(installedOf(only, [gguf])).toBeUndefined();
    expect(candidateRepos(only)).toEqual([]);
  });
});
