/**
 * What a program being written is doing right now, read from the text as it grows (no model call). A page written in one piece
 * shows its chapters one after the other (the screen, the settings, the player, the controls, the loop...), each with its time
 * and its lines, so the person sees the work move instead of one long "Writing".
 */
export interface Chapter { id: string; label: string; note: string; test: RegExp }

const HTML_CHAPTERS: Chapter[] = [
  { id: "frame", label: "Writing the page and its styles", note: "the page frame and how it looks", test: /<style[\s>]|<head[\s>]/i },
  { id: "screen", label: "Building the screen", note: "the canvas, the buttons and the text on screen", test: /<canvas[\s>]|<body[\s>]/i },
  { id: "things", label: "Listing the things of the game", note: "what is in the game", test: /\bthings\s*[:=]\s*\[/ },
  { id: "rules", label: "Writing the rules", note: "what happens when things meet", test: /\brules\s*[:=]\s*\[/ },
  { id: "settings", label: "Setting sizes and speeds", note: "sizes, speeds, colours", test: /\b(?:const|let|var)\s+(?:[A-Z][A-Z0-9_]{2,}|CONFIG|SETTINGS)\s*=/ },
  { id: "world", label: "Building the level", note: "the map and what it is made of", test: /\b(?:level|levels|map|tiles?|platforms?|grid|world)\w*\s*=\s*[\[{`]/i },
  { id: "player", label: "Creating the player", note: "the character and its state", test: /\b(?:player|mario|bird|ship|paddle|hero|snake)\s*=\s*\{/i },
  { id: "others", label: "Creating enemies and objects", note: "enemies, coins, obstacles", test: /\b(?:enemies|goombas?|obstacles|pipes|coins|bricks|items|bullets|asteroids)\s*=\s*[\[{]/i },
  { id: "controls", label: "Adding the controls", note: "keys, touch and mouse", test: /addEventListener\(\s*['"](?:key(?:down|up)|touchstart|pointerdown|mousedown)/ },
  { id: "moves", label: "Writing movement and collisions", note: "how things move and what they touch", test: /\bfunction\s+(?:update|step|move|physics)\w*|\b(?:collide|collision|intersects?|overlaps?)\w*\s*\(/i },
  { id: "draw", label: "Drawing the scene", note: "drawing the scene on every frame", test: /\bfunction\s+(?:draw|render)\w*|\bctx\.(?:fillRect|drawImage|arc)\(/ },
  { id: "score", label: "Adding score and lives", note: "points, lives, the best score", test: /\bscore\s*\+=|\blives\s*(?:-=|--)|\bhigh\s*score\b|\bfunction\s+(?:updateHud|drawHud|addScore)/i },
  { id: "loop", label: "Starting the game loop", note: "the loop that runs every frame", test: /requestAnimationFrame\(|setInterval\(/ },
  { id: "end", label: "Adding start, game over and restart", note: "start screen, game over, restart", test: /\bfunction\s+(?:start|restart|reset|init|gameOver)\w*|\bgame\s*over\b/i },
  { id: "close", label: "Closing the page", note: "the end of the file", test: /<\/html>/i }
];

const words = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ").toLowerCase();
const KINDS = /^(?:Game|Engine|Main|App|Scene|Input|Controls?|Renderer|Canvas|Vector\d?|Rect|Entity|Sprite|Base|Manager|State)$/;
/** The things the program defines by name ("class Goomba", "function spawnCoin"): each one is a chapter, so the list says what is being made. */
const NAMED = /\bclass\s+([A-Z]\w{2,})|\bfunction\s+(?:create|spawn|make|build|add)([A-Z]\w{2,})\s*\(/g;

/** The chapters that have just shown up in `text`, in the order they appear there; `seen` says which were already told. */
export function newChapters(text: string, seen: Set<string>): Chapter[] {
  if (text.length < 40) return [];
  const found: { c: Chapter; at: number }[] = [];
  for (const c of HTML_CHAPTERS) {
    if (seen.has(c.id)) continue;
    const at = text.search(c.test);
    if (at >= 0) found.push({ c, at });
  }
  for (const m of text.matchAll(NAMED)) {
    const name = m[1] ?? m[2];
    const id = `named:${name}`;
    if (KINDS.test(name) || seen.has(id) || found.some((f) => f.c.id === id)) continue;
    found.push({ c: { id, label: `Creating ${words(name)}`, note: `the ${words(name)} and how it behaves`, test: /$^/ }, at: m.index ?? 0 });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.c);
}
