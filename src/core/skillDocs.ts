import { MAX_STEPS, MAX_TAGS } from "./skills";
import { MAX_LIBS } from "./skillLibs";

/** The guide to writing a skill, shown as a message in a chat (Customize > Skills > documentation). */
export const SKILL_DOCS = `# Writing skills

A **skill** is a recipe the assistant follows: shared rules plus a list of small steps. A small model cannot hold a big task in its head at once, so a skill cuts the task into steps; each step sees the answers of the steps before it. A skill can also carry **libraries** (code its pages can use) and can **load by itself** when your request fits.

**Contents:** 1. Using skills · 2. Default skills · 3. What a skill holds · 4. How to write a good skill · 5. Loading by itself (\`when\`) · 6. Libraries · 7. The text form · 8. Complete examples · 9. What a skill does not do · 10. Troubleshooting

---

## 1. Using skills

- **With \`/\`**: type \`/\` in the message box, pick a skill with the arrows and Enter (or click), write your material (the text to summarize, the question) and send. The steps run one after the other by themselves; the chat shows "Next step: ..." before each. Stop with Esc, or cancel the skill with the × on its label.
- **By itself**: when an installed skill fits what you ask, the app loads it without \`/\` (see section 5). The chat shows a line **Loaded skill: <name>** with a book icon, like the other steps of the work.
- A skill chosen with \`/\` runs all its steps. A skill that loads by itself gives the model its rules and the order of its steps in one answer; it does not stop between steps.

## 2. Default skills

The green section at the bottom of Customize > Skills holds the skills that come with the app: website, calculator page, arcade game, small app, code, change a file, PowerPoint, Word, Excel, chart, diagram, quiz, document with charts.

- **Uninstall** one with the bin. It moves to "Not installed", where **Install** puts it back.
- The app still builds websites, games, Word, Excel and PowerPoint files without them, with less guidance. Uninstalling a skill never breaks a file it helped to make (see Libraries).
- Default skills cannot be edited, but **Duplicate** gives you a copy that is yours: change anything, rename it, share it.

## 3. What a skill holds

| Part | What it is | Limit |
|---|---|---|
| Name, description | How it appears in the list and in the \`/\` menu. | 60 and 160 characters |
| Icon | One from the searchable library (line drawings only). Without one, the icon of its category. | |
| Tags | Lower case, no spaces. They help search (\`#writing\`) and decide the **category** (the first category whose tags the skill carries). | up to ${MAX_TAGS} |
| Shared rules | Short instructions kept in front of the model at every step. | keep under ~600 characters |
| Steps | A title and a prompt each, run in order. | up to ${MAX_STEPS}, each under ~450 characters |
| Recommended models | Model ids, best first. When one is installed and "switch to the recommended model" is on, choosing the skill selects it. | optional |
| Load by itself | A pattern of words (section 5). | optional |
| Libraries | JavaScript or CSS code its pages can use (section 6). | see section 6 |

**The size is measured for you.** The app writes it on the skill: *about N tokens, suits every model / 8K or more / 16K or more*. What the model carries at the heaviest moment is the shared rules, the notes of the libraries and the longest step. Under 500 tokens fits any model, even small ones; over 1200 tokens needs a 16K context. The code of a library is never counted: it is not sent to the model.

## 4. How to write a good skill

These rules come from what works with small models running on the NPU. Read them once before writing; most bad skills break one of them.

### The ten rules

1. **One job per step.** "List the key points", then "write the summary from those points". A step that says "analyze, then decide, then write" does all three badly.
2. **Say what the output looks like.** "A numbered list of at most 7 lines", "one paragraph of 3 sentences", "only the corrected text, no comment". A small model fills the space you leave open.
3. **Say what to do with the previous answer.** "Using only the list above..." keeps it from inventing new facts and from forgetting the earlier step.
4. **Put the format and the limits in the shared rules, the job in the step.** "Plain text only. Answer in the language of the request." belongs to every step; "list the problems" belongs to one.
5. **Write short, direct sentences.** Orders, not wishes: "List", "Write", "Check". Under 450 characters per step for small models. If a step needs more, it is two steps.
6. **Tell it what not to do, once, plainly.** "Do not add facts that are not in the text." "Do not ask questions: if something is missing, make a simple choice and say it." One or two such lines, not a list of ten.
7. **Show a tiny example when the format is unusual.** One example line of the exact format beats a paragraph describing it. Keep it to one.
8. **Always end with a check or a summary step when the result is a file.** "Check that every id the script looks for exists in the page" catches most bugs for free.
9. **Let the user's language decide the answer's language.** Write "Answer in the language of the user's request" in the shared rules. Write your own prompts in English or in your language, as you prefer; the rule above handles the rest.
10. **Test with the smallest model you support.** If it works on a 4B model it works on all of them. Run it on real material (a long text, a vague request), not only on the easy case.

### Steps that work

| Instead of | Write |
|---|---|
| "Analyze the text and give a good summary" | Step 1: "List the 5 to 8 most important points, one short line each. Do not write the summary yet." Step 2: "Using only the points above, write a summary of 3 to 5 sentences." |
| "Be creative and make something nice" | "Give 10 ideas, one line each. Mix safe ideas and bold ones. Number them." |
| "Write the code and make sure it works" | Step 1: plan in 4 lines. Step 2: write every file. Step 3: "Take one example input, follow the code by hand, say the output." |

### Choosing name, description, tags and icon

- **Name**: what it produces, in 2 to 4 words ("Meeting notes to actions", not "Helper 3").
- **Description**: one sentence saying the input and the result. It is what the person reads to decide.
- **Tags**: 3 to 5, the words a person would search. Use the tags of a category to put the skill in it: \`code\`, \`data\`, \`language\`, \`writing\`, \`study\`, \`food\`, \`planning\`, \`ideas\`, \`create\`.
- **Icon**: pick the one that matches what you make, not the topic you talk about.

### How many steps?

Two or three is the sweet spot. One step is a prompt, not a skill. Past five, each step must be tiny and the chat gets long. If you need more, make two skills.

### Anti-patterns

- A giant shared-rules block that repeats every step. Rules are for what is true at every step.
- A step that refers to "the document" without saying where it is. The material is what the user sent with the skill, or the previous answer: say which.
- Asking the model to "think step by step" inside a step. The steps are already that.
- Charts or diagrams in the first steps. Ask for a \`chart\` or \`mermaid\` block in the **last** step only, once the data is settled.
- Promising what the model cannot do ("browse the web", "run the code"). Say what it can: reason, write, check by hand.
- Putting private data (names, keys, addresses) in a skill you will share.

### Checklist before you share a skill

- [ ] It works on the smallest model you have, on real material.
- [ ] Each step is one job and under 450 characters.
- [ ] The output format of the last step is exact.
- [ ] The description tells the input and the result.
- [ ] The \`when\` pattern does not fire on requests that are not for this skill (test a few).
- [ ] Every library has a licence, a one-line \`use\`, and works with no network.
- [ ] Nothing private is in it. Export it and read the \`.md\` once.

## 5. Loading by itself (\`when\`)

A skill with a **\`when\`** pattern is loaded for you when your request contains those words. The pattern is a **regular expression** (case does not matter) and is written in the skill's header or in the editor ("Load by itself when the request contains...").

- **Which skill wins**: the one whose match is the **longest** (so \`lettre de motivation\` beats \`lettre\`). At equal length, **your own skill wins over a default one**.
- **Files in the chat**: the default skills are split by it: with files in the chat only "Change an existing file" can apply, without files all the others. Your own skills apply in both cases; write the pattern so that it fits.
- **Never** during a voice conversation, and never when you chose a skill with \`/\`.
- **What it does**: the model gets the shared rules, the notes of the libraries and the order of the steps. The app shows "Loaded skill: <name>" and builds the answer as usual.

### Writing a good pattern

- Use word boundaries: \`\\b(invoice|facture)\\b\`. Without them \`cv\` matches inside other words.
- List the words in the languages you use (English and French here).
- Prefer specific words ("landing page", "flashcards") to common ones ("make", "page").
- Escape special characters: \`c\\+\\+\`, \`c#\` is fine.
- A pattern with an error is refused when you save. Maximum 300 characters.
- Test it on 3 requests that should match and 3 that should not.

## 6. Libraries: real code for your skill

A skill can carry **libraries**: JavaScript or CSS that the pages it helps to write can use. A chart library, an animation library, a font, a game helper, your own functions. This is how the app builds its own pages, open to you.

### Three ways to add one

- **Public library**: give an https address (\`url:\` or the address field). The app downloads it **once**, when you save or import the skill, and keeps the code **with the skill**. Nothing is loaded from the internet when a page runs.
- **From a file or a zip on your PC**: "From a file or a zip on this PC" takes a \`.js\` or \`.css\` file, or a zip (a library you downloaded, built or wrote yourself). In a zip the app finds the file to load: the one the library's \`package.json\` names (\`unpkg\`, \`jsdelivr\`, \`browser\`, \`main\`), else a \`.min.js\` or \`.umd.js\` in a \`dist\` folder. You can choose another file before validating. Nothing goes online.
- **Custom code**: write or paste the code in the editor, or in the skill file itself.

### What a page needs from a library

- A **plain script**: a file that starts with \`import\` or \`export\` (an ES module) cannot be loaded by a page without a bundler and is refused. Take the \`.umd.js\`, \`.iife.js\` or \`.min.js\` build.
- **No network**: pages run in a frame without network access. A library that fetches data, fonts or images from the internet will not do it. Fonts and pictures must be inside (data URLs).
- It should set a **global** (\`Chart\`, \`AOS\`, \`confetti\`...) that the page then calls.
- **Size**: up to ${MAX_LIBS} libraries per skill, 600 KB each, 2 MB together. Prefer the minified build.
- **Licence**: write it (\`license: MIT\`). MIT, ISC, BSD and Apache-2.0 libraries can be shared freely with their notice; check before sharing a skill that carries someone else's code. Keep the licence comment at the top of the file.

### The note for the model (\`use\`)

The model never sees the code, only your note. Write what the library does and **the exact call**:

\`\`\`
use: Chart.js 4. new Chart(canvas, { type: "bar", data: { labels, datasets: [{ label, data }] }, options })
use: confetti({ particleCount: 100, spread: 70 }) throws confetti. Call it on a win.
use: round2(x) rounds to 2 decimals; clamp(x, a, b) limits x to [a, b].
\`\`\`

One or two lines, with the call written out. A vague note ("charts library") gives wrong calls.

### How the page uses it

When a skill with libraries is loaded, the model is told to load a library with a placeholder:

\`\`\`html
<script src="lib:chartjs"></script>
<link rel="stylesheet" href="lib:animations">
\`\`\`

- **While the page is written**, the preview already replaces the placeholder by the code, so you see it work.
- **When the answer is finished**, the app writes the real code **inside the page**, between \`<!-- lib:name -->\` markers. The file is then **complete on its own**, with no dependency.
- **If you uninstall or delete the skill later, the page keeps working.** The only difference is that the file is longer, so it is harder to edit by hand.
- While the skill is installed, the model is shown the short placeholder again instead of the code, so a change request stays easy to answer.
- A library used twice in a page is written once. A name nobody has is left as it is (and the page will not find it).

### Writing your own library

A custom library is just a script that sets a global:

\`\`\`js
window.helpers = {
  round2: (x) => Math.round(x * 100) / 100,
  clamp: (x, a, b) => Math.min(b, Math.max(a, x))
};
\`\`\`

Keep it small, give the functions short names, and describe them in \`use\`. Wrap it in \`(function(){ ... })();\` if you do not want to leak variables.

## 7. The text form (import and export)

A skill is a \`.md\` or \`.txt\` file you can share. **Export** saves it, **Import** loads it (a public library with no code is downloaded at that moment).

\`\`\`\`
---
name: Charts with Chart.js
description: Draws a chart page with Chart.js from the numbers you give.
tags: create, chart, data
icon: chart
models: qwen3-4b-thinking-2507
when: \\b(chart\\.?js|bar chart|pie chart|graphique)\\b
---
Use Chart.js for every chart. The data comes from the person: never invent numbers.
Plain code, one .html file. Answer in the language of the request.

## Step: Data
List the series, the labels and the numbers, one line each.

## Step: Write the page
Write one .html page with a canvas and a Chart.js chart of that data.

## Step: Check
Check that the canvas id used in the script exists in the page.

## Library: chartjs
kind: js
url: https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js
license: MIT
use: Chart.js 4. new Chart(canvas, { type: "bar", data: { labels, datasets: [{ label, data }] } })

## Library: helpers
kind: js
license: MIT
use: round2(x) rounds to 2 decimals.

\`\`\`js
window.round2 = (x) => Math.round(x * 100) / 100;
\`\`\`
\`\`\`\`

- **Header** (between \`---\` lines): \`name\`, \`description\`, \`tags\`, \`icon\`, \`models\`, \`when\`. Only \`name\` and \`description\` matter; the rest is optional.
- **Shared rules**: the text after the header, before the first \`## Step:\`.
- **Steps**: each \`## Step: title\` and the text under it.
- **Libraries**: each \`## Library: name\` with \`kind\` (\`js\` or \`css\`), optional \`url\`, \`license\`, \`use\`, then the code in a fenced block. If the code contains backticks, use a longer fence.
- A plain text with no header becomes a skill with one step, named after its first line.
- The order of the sections does not matter. Names of libraries are lower case letters, digits and dashes.
- Everything is stored on your PC with your settings. Libraries are kept inside the skill, so an exported file carries them: the person who imports it needs no zip and no network.

## 8. Complete examples

### A text skill (no library)

\`\`\`\`
---
name: Meeting notes to actions
description: Turns rough meeting notes into decisions and an action list.
tags: work, planning, notes
---
Be faithful to the notes. Do not invent names or dates. Plain text. Answer in the language of the request.

## Step: Decisions
List the decisions taken, one line each. If none, write "No decision".

## Step: Actions
From the notes, list each action as: who - what - when. If the person or the date is not said, write "?" there.

## Step: Summary
Write a 3-sentence summary for people who were not there.
\`\`\`\`

### A skill that builds a page with a library, loading by itself

\`\`\`\`
---
name: Party page with confetti
description: A one-page celebration site with a confetti burst.
tags: create, site
when: \\b(confetti|anniversaire|birthday page|page de f[eê]te)\\b
---
One .html page, short texts, a big title and a button that throws confetti. Answer in the language of the request.

## Step: Write the page
Write one .html page. The button calls the library.

## Library: confetti
kind: js
license: ISC
use: confetti({ particleCount: 120, spread: 80 }) throws confetti. Call it on the click of the button.

(the library code, or a url: line instead)
\`\`\`\`

## 9. What a skill does not do

- A skill gives the model **rules, an order of steps and libraries**. It does not run code on its own and does not change what the model knows.
- **The app's own builders** have their own rules. The steps that write a program or a page **freely** (a game, a small app, a page the templates cannot hold) are given the rules and the libraries of the skill that was loaded, so a page can use a library there. The builders that work from a template or a fixed structure (Word, Excel and PowerPoint files, one-page websites made of blocks, the arcade game engine) fill their own fields and do not read a skill's rules or libraries: they show "Loaded skill" and work as usual.
- A skill cannot read your files: give the material in the message or attach it.
- Libraries do not run on the server: only in the page, in the preview or in the saved file.

## 10. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| "This skill cannot be saved: ..." | The message names the problem: a missing name, description or step, an empty step, too many steps or tags, a wrong library name, a library with no code and no address, an address that is not https, a \`when\` that is not a valid regular expression. |
| The skill never loads by itself | The pattern does not match the words you used. Write it in the languages you speak, with \`\\b\`, and test it. A default skill with a longer match may win. |
| It loads when it should not | The pattern is too general. Use more specific words. |
| "Could not download it" | The address is not reachable, or answers with a web page instead of a script. Download the file on your PC and add it "from a file or a zip". |
| "This file is an ES module" | The file uses \`import\` or \`export\`. Use the \`.umd.js\`, \`.iife.js\` or \`.min.js\` build of the library. |
| The page says the library is not defined | The \`use\` note does not give the exact global or call, or the library does not set a global. Fix the note, or wrap the library so it sets \`window.Name\`. |
| The page works in the preview and not after Save as | Check that the answer was finished: the code is written into the file at the end. Ask again if the answer was stopped. |
| A small model ignores a step | The step is too long or does two jobs. Cut it in two and shorten it. |
| The skill is too heavy for the model | The size line says 16K+. Shorten the rules and steps; the code of a library does not count. |

Skills you write are saved on your PC. Duplicate a default skill to start from a good example.
`;
