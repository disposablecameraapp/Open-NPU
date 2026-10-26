import { MAX_STEPS, MAX_TAGS } from "./skills";

/** The guide to writing a skill, shown as a message in a chat (Customize > Skills > documentation). */
export const SKILL_DOCS = `# Writing skills

A **skill** is a way of splitting a task into small steps. A small model that cannot hold a whole task at once does each step in turn, in the same conversation, and every step sees the answers of the steps before it.

## Using a skill

Type \`/\` in the message box: the list of skills opens. Pick one with the arrows and Enter (or click), then write your material (the text to summarize, the question...) and send. The steps run by themselves one after the other; the chat shows "Next step: ..." before each. Stop with Esc, or cancel the skill with the × on its label.

## What a skill holds

- **Name** and **description**: how it appears in the list.
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
models: qwen3-4b-thinking-2507
---
Shared rules, one or two lines.

## Step: Key points
List the key points of the text as short bullets.

## Step: Summary
Write a summary of 3 sentences from those key points.
\`\`\`

A plain text file with no header becomes a skill with one step, named after its first line. Use **Import** in Customize > Skills to load one, **Export** to save one.

## Customizing

Built-in skills cannot be changed, but **Duplicate** gives you a copy to edit: rename it, change the steps, the rules, the tags, the models. Your skills are stored on your PC with your settings.
`;
