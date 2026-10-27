import type { Skeleton } from "./skeletons";

/**
 * Working starting points for a game made with the game engine (`engine.ts`). Each is a whole page of about forty lines that was
 * run for real: a small model changes the things, the numbers and the rules of a game it can read, instead of inventing a format. The
 * page does not carry the engine (the app adds it when the page is shown, tested or saved, `withEngine`), so what the model writes
 * and later changes is only the description of the game.
 */

const page = (title: string, body: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  html, body { margin: 0; height: 100%; background: #0b0d12; color: #fff; font-family: system-ui, sans-serif; }
  body { display: flex; align-items: center; justify-content: center; }
</style>
</head>
<body>
<div id="game"></div>
<script>
// The game engine (Game) is added by the app: write no loop, no key handling and no collision code, only the things and the rules.
// Sizes are in pixels, speeds in pixels per SECOND (a jump is about -340, gravity about 900), x and y go from 0 to 1 across the screen.
// A thing that a rule spawns is only a kind of thing: it appears when the rule spawns it, not at the start.
const game = Game.run({
${body}
});
</script>
</body>
</html>
`;

const FLYER = page("Flyer", String.raw`  title: "Flyer", width: 480, height: 640, background: "#70c5ce", lives: 3,
  things: [
    { name: "bird", shape: "circle", color: "#ffd23f", w: 26, x: 0.25, y: 0.4, gravity: 900, edges: "stop" },   // gravity pulls it down
    { name: "pipe", shape: "rect", color: "#2e8b57", pair: 170, w: 60, vx: -180 },                              // two parts with a gap of 170 px at a random height
    { name: "heart", shape: "icon", icon: "heart", color: "#ff4d6d", w: 26, vx: -150 },
    { name: "floor", shape: "rect", color: "#7a5230", w: 900, h: 10, x: 0, y: 1 }
  ],
  rules: [
    { when: { key: "Space" }, do: [{ op: "velocity", who: "bird", vy: -340 }] },                                // a flap
    { when: { click: true },  do: [{ op: "velocity", who: "bird", vy: -340 }] },
    { when: { start: true },  do: [{ op: "spawn", name: "pipe", at: "right" }] },
    { when: { every: 1.7 },   do: [{ op: "spawn", name: "pipe", at: "right" }, { op: "score", by: 1 }] },       // a new pipe and a point every 1.7 s
    { when: { every: 11 },    do: [{ op: "spawn", name: "heart", at: "right" }] },
    { when: { hit: ["bird", "pipe"] },  do: [{ op: "lives", by: -1 }, { op: "remove", who: "b" }] },          // in hit:[x, y], a is x and b is y
    { when: { hit: ["bird", "floor"] }, do: [{ op: "lives", by: -1 }, { op: "velocity", who: "bird", vy: -340 }] },
    { when: { hit: ["bird", "heart"] }, do: [{ op: "lives", by: 1 }, { op: "remove", who: "b" }] }
  ]`);

const CATCH = page("Catch", String.raw`  title: "Catch", width: 480, height: 640, background: "#1b2440", lives: 3,
  things: [
    { name: "basket", shape: "rect", color: "#4aa3ff", w: 90, h: 16, x: 0.5, y: 0.92, control: "horizontal", speed: 380 },   // the player: left and right keys
    { name: "fruit", shape: "circle", color: "#ffa94a", w: 22, vy: 170 },                                                  // falls at 170 px per second
    { name: "bomb", shape: "circle", color: "#ef4444", w: 22, vy: 210 },
    { name: "floor", shape: "rect", color: "#1b2440", w: 900, h: 8, x: 0, y: 1 }
  ],
  rules: [
    { when: { every: 0.9 }, do: [{ op: "spawn", name: "fruit", at: "top" }] },                                      // a fruit from a random place at the top
    { when: { every: 2.5 }, do: [{ op: "spawn", name: "bomb", at: "top" }] },
    { when: { hit: ["basket", "fruit"] }, do: [{ op: "score", by: 1 }, { op: "remove", who: "b" }] },               // in hit:[x, y], a is x and b is y
    { when: { hit: ["basket", "bomb"] },  do: [{ op: "lives", by: -1 }, { op: "remove", who: "b" }] },
    { when: { hit: ["floor", "fruit"] },  do: [{ op: "lives", by: -1 }, { op: "remove", who: "b" }] },
    { when: { hit: ["floor", "bomb"] },   do: [{ op: "remove", who: "b" }] }
  ]`);

const BOUNCE = page("Bounce", String.raw`  title: "Bounce", width: 480, height: 640, background: "#10131a", lives: 3,
  things: [
    { name: "paddle", shape: "rect", color: "#e8eef6", w: 90, h: 14, x: 0.5, y: 0.92, control: "horizontal", speed: 420 },
    { name: "ball", shape: "circle", color: "#ffd23f", w: 14, x: 0.5, y: 0.6, vx: 160, vy: -260, edges: "bounce" },     // bounces on the borders of the screen
    { name: "brick", shape: "rect", color: "#4ade80", w: 52, h: 18, x: 0.5, y: 0.1, grid: [8, 5], gap: 6 },             // 8 columns and 5 rows of bricks
    { name: "floor", shape: "rect", color: "#10131a", w: 900, h: 6, x: 0, y: 1 }
  ],
  rules: [
    { when: { hit: ["ball", "paddle"] }, do: [{ op: "bounce", who: "a" }] },
    { when: { hit: ["ball", "brick"] },  do: [{ op: "score", by: 10 }, { op: "remove", who: "b" }, { op: "bounce", who: "a" }] },
    { when: { hit: ["ball", "floor"] },  do: [{ op: "lives", by: -1 }, { op: "velocity", who: "ball", vx: 160, vy: -260 }] }
  ]`);

export const ENGINE_SKELETONS: Skeleton[] = [
  { id: "engine-flyer", name: "Flyer (game engine)", match: /\b(flappy|flap|fly|flying|flies|jump\w*|tap|bird|plane|rocket|helicopter|balloon|doodle|gravity|vole\w*|saute\w*|oiseau|avion|fus[ée]e)\b/i, html: FLYER },
  { id: "engine-bounce", name: "Bounce (game engine)", match: /\b(pong|breakout|brick\w*|paddle|ball|casse[- ]?briques?|raquette|balle)\b/i, html: BOUNCE },
  { id: "engine-catch", name: "Catch (game engine)", match: /./, html: CATCH }
];

/**
 * What a writer is shown of the engine: examples of games written with it, the closest to the request first, as many as the room allows.
 * They are there for their form (the things, the units, the rules), never as a game to adapt: the user's game is its own.
 */
export function engineExamplesFor(request: string, room: number): string {
  const first = ENGINE_SKELETONS.find((s) => s.match.test(request)) ?? ENGINE_SKELETONS[ENGINE_SKELETONS.length - 1];
  const chosen: Skeleton[] = [];
  let used = 0;
  for (const s of [first, ...ENGINE_SKELETONS.filter((x) => x !== first)]) {
    if (chosen.length && used + s.html.length > room) break;
    chosen.push(s);
    used += s.html.length;
  }
  return chosen.map((s) => s.html.replace(/\s+$/, "")).join("\n\n---\n\n");
}
