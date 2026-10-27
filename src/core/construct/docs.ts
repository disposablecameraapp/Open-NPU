import type { UnitKind } from "./types";

const str = (description: string) => ({ type: "string", description });

export const REQUIREMENTS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "requirements"],
  properties: {
    title: str("a short name for the program, in the language of the request"),
    language: str("the language of the request, as a word: English, French..."),
    requirements: {
      type: "array", minItems: 1,
      description: "what the program must do, one statement each, atomic and testable, in the person's own words",
      items: { type: "object", additionalProperties: false, required: ["text"], properties: { text: str("one thing the person sees, does, or that must happen") } }
    }
  }
};

export const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["units"],
  properties: {
    units: {
      type: "array", minItems: 1,
      items: {
        type: "object", additionalProperties: false, required: ["kind", "name", "does", "serves"],
        properties: {
          kind: { type: "string", enum: ["state", "layout", "fn", "view", "handler"] },
          name: str("identifier: camelCase for a function, a view or a handler; S for the state; layout for the layout"),
          does: str("one sentence: what it does"),
          serves: { type: "array", items: str("a requirement id, like R2") },
          uses: { type: "array", items: str("the name of another unit it calls or reads") },
          signature: str("for a fn: name(arg, arg) -> what it returns"),
          examples: { type: "array", items: { type: "object", additionalProperties: false, required: ["call", "expect"], properties: { call: str("a JavaScript expression that calls the function, like clamp(15, 0, 10)"), expect: str("a JavaScript expression for the result, like 10") } } },
          on: str("for a handler: the event: click #id, key, tick 500, load, input #id, change #id, submit #id")
        }
      }
    }
  }
};

export const REQUIREMENTS_INSTRUCTIONS = `You turn a request for a program into its requirements. Reply with one JSON object that follows the schema, and nothing else.
A requirement is one thing the person sees, does, or that must happen, in a single sentence, testable (someone could check it is true). Keep the person's own words and every detail they gave; add nothing they did not ask for. Cover what is shown, what the person can do, what happens as a result, what happens over time, and how it starts and ends.`;

/** The shape of every program, said once: this is what the planner and the writers are told is available. */
export const TOOLBOX = `A program is one web page made of units of five kinds:
- state: ONE JSON object S with everything the program remembers (numbers, texts, lists, lists of lists). Named S.
- layout: the HTML of the page (elements with ids) and its CSS. Named layout.
- fn: a pure function. It takes values and returns a new value; it never touches the page or S and never changes its arguments. All the decisions and calculations are fns, because a fn can be tested with examples.
- view: a function name(S) that draws one part of the page from S, using the ids of the layout. It can be called again and again.
- handler: a thin function name(arg) called by an event. It reads and changes S by calling fns, and does nothing else; the page is drawn again afterwards.
Events a handler can have: click #id, key, tick 500 (every 500 ms), load, input #id, change #id, submit #id.`;

export const PLAN_INSTRUCTIONS = `You plan how to build a program from its requirements. Reply with one JSON object that follows the schema, and nothing else.
${TOOLBOX}
Plan the units, no more than the requirements need. One state, one layout. Put every decision and calculation in fns, small and single-purpose, each with a signature and two to four examples (call and expect) that follow from the requirements. Views only draw. Handlers only connect an event to fns and S. Each unit says which requirements it serves (R1, R2...) and which other units it uses. Do not plan a unit that no requirement needs, and do not leave a requirement without a unit.`;

export const GAPS_INSTRUCTIONS = `Some requirements have no unit yet. Reply with one JSON object that follows the schema, with only the NEW units that serve them (not the ones that exist), reusing the existing units by name in "uses".
${TOOLBOX}`;

/** What a writer is told for each kind of unit: short, and the same wording every time. */
export const WRITE_RULES: Record<UnitKind, string> = {
  state: "Write the initial state as ONE JSON object: every value the program remembers, with its starting value. JSON only, no comments, no code fence needed.",
  layout: "Write the HTML of the body: the elements the program needs, each with an id (and a class when it is styled), then one <style> block with the CSS for the page. No <html>, <head>, <body> or <script> tags. Make it look like the finished program, not like a skeleton.",
  fn: "Write ONE pure JavaScript function with exactly the given name and signature. It takes values and returns a new value; it never touches the page, S or a global and never changes its arguments. It may call only the functions listed as used. Reply with the function only.",
  view: "Write ONE JavaScript function name(S) that draws its part of the page from S, using only the ids of the layout. It must be safe to call many times (replace what it drew before). It reads S and calls the listed functions; it decides nothing. Reply with the function only.",
  handler: "Write ONE JavaScript function with the given name, called by its event. It reads and changes S by calling the listed functions (S.field = ...), and does nothing else; do not draw. Reply with the function only."
};

export const WRITE_INSTRUCTIONS = (kind: UnitKind) => `You write one unit of a program. ${WRITE_RULES[kind]} Use only the names given in the context; invent no other name. No explanation.`;

export const REPAIR_INSTRUCTIONS = (kind: UnitKind) => `You correct one unit of a program. ${WRITE_RULES[kind]} Change only what the problems name; keep the rest as it is. Reply with the whole corrected unit only. No explanation.`;
