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
      type: "array", minItems: 1, maxItems: 14,
      items: {
        type: "object", additionalProperties: false, required: ["kind", "name", "does", "serves"],
        properties: {
          kind: { type: "string", enum: ["state", "layout", "fn", "view", "handler"] },
          name: str("identifier: camelCase for a function, a view or a handler; S for the state; layout for the layout"),
          does: { type: "string", maxLength: 120, description: "one short sentence: what it does" },
          serves: { type: "array", maxItems: 5, items: str("a requirement id, like R2") },
          uses: { type: "array", maxItems: 5, items: str("the name of another unit it calls or reads") },
          signature: str("for a fn: name(arg, arg) -> what it returns"),
          examples: { type: "array", maxItems: 3, items: { type: "object", additionalProperties: false, required: ["call", "expect"], properties: { call: str("a JavaScript expression that calls the function, like clamp(15, 0, 10)"), expect: str("a JavaScript expression for the result, like 10") } } },
          into: str("for a view: the id of the element of the page it draws into, like board or score"),
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
Events a handler can have: click #id, key (any key pressed), keydown NAME and keyup NAME for one key (NAME: ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Space, Enter, Escape or a letter; a key that is held needs both), tick 16 (every 16 ms, about 60 times a second: use it for anything that moves or counts down on its own; tick 1000 is once a second), load, input #id, change #id, submit #id.`;

/** The plan is asked as lines, not as a form: a small model follows a line it can copy far better than a nested JSON object, and a line costs a few tokens. */
export const UNIT_LINES = `Reply with one line per unit and nothing else, in this form:
kind name | what it does | the requirements it serves | extra
- kind is one of: state, layout, fn, view, handler.
- extra (only when it applies, each one after a |): uses: names of other units it calls or reads, separated by commas · on: the event of a handler (click #id, key, tick 16, load, input #id, change #id, submit #id) · into: the id of the element a view draws into.
- after a fn line, one line per example, written e: call => result (two or three, following from the requirements).
Example, for a program with a count and a button that adds one, never above 10:
state S | the count, starting at 0 | R1
layout layout | the count and a button | R1,R2
fn nextCount(count, max) | the count after one more, never above max | R2,R3
e: nextCount(9, 10) => 10
e: nextCount(10, 10) => 10
view drawCount | shows the count | R1 | into: count
handler onPlus | adds one to the count | R2 | uses: nextCount | on: click #plus`;

/** The plan is made in three small questions, one kind of unit each, after the state is written: what is shown, what happens, what is calculated. A model cannot mix up the kinds when each question is about one. */
export const SCREEN_INSTRUCTIONS = `You list what a program SHOWS, one line per part of the page that is drawn from the state: a number, a text, a bar, everything moving on the page, a screen that appears and disappears. Use the keys of the state that you are given. Reply with lines only, in this form:
view name | what it draws, from which part of the state | the requirements it serves | into: the id of the element it draws into
Example, for a program that shows a count:
view drawCount | shows the count | R1 | into: count
One view per thing that changes on the page; a view only draws, it decides nothing. Everything that is drawn as pictures (a scene, moving things, a board) goes into ONE shared element, so several views have the same into (into: canvas); a number or a text shown gets its own element. A view draws things the person sees: a camera, a scroll offset or a score is a number in the state, never a view. At most ten.`;

export const ACTIONS_INSTRUCTIONS = `You list what HAPPENS in a program: each time the person does something, and each thing that happens by itself as time passes. One line per event, in this form:
handler name | what it changes in the state | the requirements it serves | on: the event
Events: click #id, keydown NAME and keyup NAME (NAME: ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Space, Enter, Escape or a letter; a key that is held needs both, one handler for the press and one for the release), key (any key), tick 16 (every 16 ms, about 60 times a second), load, input #id, change #id, submit #id.
An event is only something the person does or the clock: a collision, a win, a game over, a score are NOT events, they are checked inside the tick handler (every 16 ms) by calling functions. Never write a condition as an event.
Example, for a program with a count and a button that adds one:
handler onPlus | adds one to the count | R2 | on: click #plus
handler onLeftDown | sets input.left to true | R1 | on: keydown ArrowLeft
handler onLeftUp | sets input.left to false | R1 | on: keyup ArrowLeft
handler onTick | moves things and checks the end | R3 | on: tick 16
A handler only changes the state (S) by calling functions that calculate; it does not draw: the page draws every view again by itself after each handler, so a handler that "renders" is never needed, and one clock event (tick 16) has ONE handler. Use the keys of the state that you are given. At most ten. Reply with lines only, no explanation and no code.`;

export const CALC_INSTRUCTIONS = `You list the calculations the program needs: the pure functions that the handlers and the views will call. One line per function, in this form, and under it two or three examples:
fn name(argument, argument) | what it takes and returns | the requirements it serves
e: call => result
A function ALWAYS takes values as arguments (parts of the state, like player or enemies) and returns a NEW value; it never reads the state, the page or a global, and a function with no argument does not exist. Use the keys of the state that you are given for the names of the arguments. Every decision and every calculation of the handlers is a function here: a movement, a collision, a score, a test of the end.
Example, for a program with a count that never goes above a maximum:
fn nextCount(count, max) | the count after one more, never above max | R3
e: nextCount(9, 10) => 10
e: nextCount(10, 10) => 10
A function never draws, never calls a view or a handler, and never runs a whole step of the program (no loop, no tick, no update-everything function): the handlers call these small ones in turn. At most twelve functions, each small and doing one thing, each returning a value.`;

export const PLAN_INSTRUCTIONS = `You plan how to build a program from its requirements.
${TOOLBOX}
${UNIT_LINES}
Plan the units, no more than the requirements need: twelve at most, each described in a few words. One state, one layout. Put every decision and calculation in fns, small and single-purpose. Views only draw. Handlers only connect an event to fns and S. Every unit names the requirements it serves (R1, R2...). Do not plan a unit that no requirement needs, and do not leave a requirement without a unit.`;

export const GAPS_INSTRUCTIONS = `Some requirements have no unit yet. Write only the NEW units that serve them (not the ones that exist), reusing the existing units by name in "uses:".
${TOOLBOX}
${UNIT_LINES}`;

export const CHANGE_INSTRUCTIONS = `You change a finished program. The person's request is a change or a problem they saw.
${TOOLBOX}
Find the smallest set of units that explains the request. Reply with lines and nothing else:
- one line per existing unit that must change: rewrite name | what must be different in it (if a unit needs a value that S does not hold, rewrite S too)
- one line per NEW unit the change needs, in the form below
- one line per thing the program must now do that it did not (nothing when the change only fixes a fault): requirement | the statement
${UNIT_LINES.split("\n").slice(1).join("\n")}
Do not touch units the request does not concern.`;

/** What a writer is told for each kind of unit: short, and the same wording every time. */
export const WRITE_RULES: Record<UnitKind, string> = {
  state: "Write the initial state as ONE JSON object: every value the program remembers, with its starting value. Things of the same kind have the same field names everywhere (every thing with a position and a size has x, y, w, h, never width in one place and w in another), numbers are numbers, the mode or screen the program is in is one short text (\"playing\", \"over\") that other units will compare with, and every list the requirements need holds a few real entries (never an empty list for something the person must see). JSON only, no comments, no code fence needed.",
  layout: "Write the HTML of the body: the elements the program needs, each with an id (and a class when it is styled), then one <style> block with the CSS for the page. No <html>, <head>, <body> or <script> tags. The elements are containers and places for values, EMPTY: views fill them later, so write no content in them; make one element per place the program draws into or shows a value in (never one per requirement), give a container that holds drawn things a fixed size, use a <canvas> (with width and height) for the element a view draws pictures into with a 2D context and a plain element for text, and make it look like the finished program, not like a skeleton.",
  fn: "Write ONE pure JavaScript function with exactly the given name and signature. It takes values and returns a new value (it ALWAYS ends with return); it never touches the page, S or a global and never changes its arguments (copy what it changes). It may call only the functions listed as used. Reply with the function only.",
  view: "Write ONE JavaScript function name(S) that draws its part of the page from S, using only the ids of the layout. It must be safe to call many times (replace what it drew before). It reads S and calls the listed functions; it decides nothing. A canvas is drawn on with its 2D context and its own width and height: it is cleared before every drawing, so never clear it, and draw only your part. S is a global: the function takes no parameter. Reply with the function only.",
  handler: "Write ONE JavaScript function with the given name, called by its event. It reads and changes S by calling the listed functions (S.field = ...), and does nothing else; do not draw. S is a global: the function takes no parameter named S and never assigns S itself, only its fields. The work is done by the listed functions: call them and put what they return into S (S.player = movePlayer(S.player, S.keys, S.level)). A handler of tick 16 runs 60 times a second: a speed is per tick, and a clock counts 0.016 of a second per tick. Reply with the function only."
};

/** The strict rules of each kind, each one a fault small models made again and again: the unit is checked against them the moment it is written. */
export const STRICT_RULES: Partial<Record<UnitKind, string>> = {
  fn: "STRICT RULES (check your code against each before answering): 1. It starts with `function NAME(parameters) {` exactly as given. 2. Every path ends with `return` of a value (never nothing). 3. It never changes an argument: copy first ({ ...obj }, [ ...list ]) and return the copy. 4. It uses only its parameters, the functions listed and Math: no S, no document, no other function, no random or clock unless it is a parameter. 5. It reads only the fields The state S shows, spelled exactly as shown (w and h are not width and height unless shown so). 6. A list may be empty: a loop over it must work. 7. It returns the kind of value its task says.",
  view: "STRICT RULES (check your code against each before answering): 1. It starts with `function NAME() {` and takes no parameter: S is a global. 2. It takes its element with document.getElementById(\"id\") using the exact id given, and a canvas with getContext(\"2d\"). 3. It reads S only through the names The state S shows, spelled exactly as shown. 4. It never changes S. 5. It never clears a canvas (the page does) and never adds to what an earlier call drew: it sets the text, or draws the whole picture again. 6. It calls no handler and no other view. 7. A list may be empty: a loop over it must work.",
  handler: "STRICT RULES (check your code against each before answering): 1. It starts with `function NAME() {` (or `function NAME(e) {` when it needs the event), and no parameter is called S: S is a global. 2. It changes S by assignment (S.keys.left = true; S.score += 10): a handler that changes nothing does nothing. 3. A mode is compared only with the words The state S shows or that you set yourself. 4. It calls only the functions listed, with their arguments in the order of their signature, and puts what they return into S. 5. It draws nothing and touches no element. 6. It runs for each event: a tick handler runs 60 times a second, so a speed is per tick and a clock counts 0.016 per tick."
};

export const WRITE_INSTRUCTIONS = (kind: UnitKind) => `You write one unit of a program. ${WRITE_RULES[kind]}${STRICT_RULES[kind] ? ` ${STRICT_RULES[kind]}` : ""} Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.`;

export const REPAIR_INSTRUCTIONS = (kind: UnitKind) => `You correct one unit of a program. ${WRITE_RULES[kind]}${STRICT_RULES[kind] ? ` ${STRICT_RULES[kind]}` : ""} Change only what the problems name; keep the rest as it is. Reply with the whole corrected unit only. No explanation.`;
