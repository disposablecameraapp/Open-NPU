import { MAX_STEPS, MAX_TAGS } from "./skills";
import { MAX_LIBS } from "./skillLibs";

/** The guide to writing a skill, shown as a message in a chat (Customize > Skills > documentation). */
export const SKILL_DOCS = `# Writing skills

A **skill** is a way of splitting a task into small steps. A small model that cannot hold a whole task at once does each step in turn, in the same conversation, and every step sees the answers of the steps before it.

## Using a skill

Type \`/\` in the message box: the list of skills opens. Pick one with the arrows and Enter (or click), then write your material (the text to summarize, the question...) and send. The steps run by themselves one after the other; the chat shows "Next step: ..." before each. Stop with Esc, or cancel the skill with the × on its label.

## What a skill holds

- **Name** and **description**: how it appears in the list.
- **Icon**: pick one from the searchable library when you create or edit a skill; without one, the icon of its category is used. Icons are line drawings only, there are no pictures.
- **Tags**: up to ${MAX_TAGS}, lower case, to find it again (\`writing\`, \`study\`, \`code\`).
- **Shared rules**: short instructions kept in front of the model for every step.
- **Steps**: up to ${MAX_STEPS}. Each step has a title and one clear job. The prompt of a step may refer to "the previous answer".
- **Recommended models**: model ids, best first. When one is installed and "switch to the recommended model" is on, choosing the skill selects it. Otherwise your current model is used.

The app measures the skill and writes its size on it: *about N tokens, suits every model / 8K or more / 16K or more*. Shared rules plus the longest step is what the model carries at once, so keep a step short: **under 450 characters** for small models.

## Writing a good step

1. One job per step: "list the key points", then "write the summary from those points".
2. Say what the output looks like ("a numbered list of at most 7 lines").
3. Say what to do with the previous answer ("use the list above").
4. Charts and diagrams: ask for a \`\`\`chart or \`\`\`mermaid block in the last step only.

## The text form (import and export)

A skill is a \`.md\` or \`.txt\` file you can share:

\`\`\`
---
name: Summarize a text
description: Key points first, then a short summary.
tags: writing, summary
icon: pen
models: qwen3-4b-thinking-2507
---
Shared rules, one or two lines.

## Step: Key points
List the key points of the text as short bullets.

## Step: Summary
Write a summary of 3 sentences from those key points.
\`\`\`

A plain text file with no header becomes a skill with one step, named after its first line. Use **Import** in Customize > Skills to load one, **Export** to save one.

## Skills that load by themselves

You do not have to type \`/\`. When an installed skill fits what you ask (a website, a game, an Excel file, a presentation, a chart...), the app loads it by itself and the chat shows a line **Loaded skill: <name>** with a book icon, like the other steps. A skill that loads by itself gives the model its shared rules and the order of its steps; it does not run the steps one by one (that is what \`/\` does). A skill with a \`when:\` line (a regular expression of the words to react to) is loaded this way; the skills that come with the app have one.

The default skills (the green section at the bottom of the list) can be uninstalled with the bin and installed again from "Not installed". The app still builds websites, games, Word, Excel and PowerPoint files without them, with less guidance. A skill you uninstall never breaks a file it helped to make (see Libraries).

## Libraries: giving a skill real code to use

A skill can carry **libraries**: JavaScript or CSS that its pages can use (a chart library, an animation library, a font, your own helper functions). That is how the app builds its own pages, now open to you.

- **Public library**: give an https address (\`url:\`). The app downloads it **once**, when you save or import the skill, and keeps the code with the skill. Nothing is loaded from the internet when a page runs.
- **Custom library**: write or paste the code in the skill file itself, in a fenced block.
- **From a file or a zip on your PC**: in the Skills editor, "From a file or a zip on this PC" takes a .js or .css file, or a zip (a library you downloaded or built yourself). In a zip the app finds the file to load (the one the library's package.json names, else a .min.js or .umd.js in a dist folder) and lets you pick another. Nothing is put online, and the code is kept with the skill. A file that uses import or export (an ES module) cannot be loaded by a plain page: pick its .umd.js, .iife.js or .min.js build.
- **Use**: a one-line note (\`use:\`) tells the model what the library does and how to call it. Only that note is sent to the model, never the code.

In the model's page, a library is asked for with a placeholder: \`<script src="lib:name"></script>\` (a stylesheet: \`<link rel="stylesheet" href="lib:name">\`). The model is told to do this when the skill is loaded.

**The code becomes part of the file.** When the answer is finished, the app replaces each placeholder by the real code of the library, inside the page (in the preview it is already replaced as the page is written). The file is then complete on its own: if you uninstall or delete the skill later, the page keeps working with no missing dependency. The only difference is that the file is longer, so it is harder to edit by hand. The model is shown the short placeholder again while the skill is installed, so edits stay easy.

Limits: up to ${MAX_LIBS} libraries per skill, 600 KB each and 2 MB together, https addresses only, JavaScript and CSS only. Check the licence of a public library before sharing a skill that carries it; write it in \`license:\`.

### Text form with libraries

\`\`\`\`
---
name: Charts with Chart.js
description: Draws a chart page with Chart.js.
tags: create, chart
---
Use Chart.js for every chart. Data comes from the person.

## Step: Write the page
Write one .html page with a canvas and a Chart.js chart.

## Library: chartjs
kind: js
url: https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js
license: MIT
use: Chart.js 4. new Chart(canvas, { type: "bar", data: { labels, datasets }, options })

## Library: helpers
kind: js
use: round2(x) rounds to 2 decimals.

\`\`\`js
window.round2 = (x) => Math.round(x * 100) / 100;
\`\`\`
\`\`\`\`

When a file like this has a \`url:\` and no code, Import downloads it. The Skills editor has a Libraries section with the same fields and a Download button.

## Customizing

Built-in skills cannot be changed, but **Duplicate** gives you a copy to edit: rename it, change the steps, the rules, the tags, the models. Your skills are stored on your PC with your settings.
`;
