/**
 * The big series of the unit writers: the SAME unit asked in ten ways (how much context, which words, which instructions), for units of
 * programs of very different kinds (a platformer, a snake game, a ball and paddle game, a to-do tool, a puzzle), so that what is learned
 * is about writing a unit of ANY program and not about one genre. Every unit has working code as its ideal and checks that RUN the
 * answer. The structure of the platformer is the real answer of a 4B model to the structure question; the others are written in the same form.
 * Nothing in the instructions of a variant is about a genre.
 */
import { ContextEngine, layoutElements, stateShape } from "./construct/context";
import { WRITE_INSTRUCTIONS } from "./construct/docs";
import type { Plan, Unit } from "./construct/types";
import { COINS, HITS, LAND, LAYOUT, MOVE, REQS, SCENE, STATE, UNITS, UNIT_SPECS, flat, given } from "./promptLabUnits";

const U = (kind: Unit["kind"], name: string, does: string, serves: string[], extra: Partial<Unit> = {}): Unit => ({ id: name, kind, name, does, serves, uses: [], examples: [], ...extra });
const rq = (...t: string[]) => t.map((text, i) => ({ id: `R${i + 1}`, text }));
const ALL = (n: number) => Array.from({ length: n }, (_, i) => `R${i + 1}`);

interface Program { id: string; title: string; reqs: { id: string; text: string }[]; state: unknown; layout: string; structure: string; units: Unit[]; code: Record<string, string>; specs: { unit: string; ideal: string; checks: string[] }[] }

// ------------------------------------------------------------------------------------------------------------------- P1 platformer
const P1_STRUCTURE = `core | state S (player, camera, levelMap, entities, lives, score, coins, timeLeft, currentLevelIndex, gameStatus), update(dt), draw(), save(), load()
feature player | position x/y, velocity vx/vy, jumpState, sprite frame, health | core
feature inputHandler | arrow keys for move, space for jump | core
feature physics | gravity acceleration, ground collision, platform collision, enemy collision detection | core
feature levelMap | tile grid with ground holes, floating platforms, brick blocks, question-mark blocks, green pipes, flagpole | core
feature entities | table of enemy types (6 kinds), power-up types (mushroom, fire flower, star), coin locations, boss definition | core
feature camera | scroll left/right to follow player, zoom effect | core
feature ui | HUD for lives, score, coins, time limit; "You win", "Game over", "Shop" screens; start menu with level selection | core
feature shop | buy lives using coins, save/load progress between levels | core
feature saveSystem | persist high scores, current lives, and unlocked levels to file | core
feature themeManager | grass, desert, ice, cave, castle backgrounds and color palettes for sky, clouds, hills | core`;
const STEP = "function stepPlayer(player, input, solids) { var p = { ...player, vx: (input.right ? 3 : 0) - (input.left ? 3 : 0), vy: player.vy + 0.5 }; return landOn(moveThing(p, 1), solids); }";
const spec1 = (n: string) => UNIT_SPECS.find((s) => s.unit === n)!;
const P1: Program = {
  id: "P1", title: "Mario-like platformer", reqs: REQS, state: STATE, layout: LAYOUT, structure: P1_STRUCTURE,
  units: [
    UNITS.find((u) => u.name === "S")!, UNITS.find((u) => u.name === "hits")!, UNITS.find((u) => u.name === "moveThing")!, UNITS.find((u) => u.name === "landOn")!,
    U("fn", "stepPlayer", "the player after one step: it moves 3 left or right by the keys (both keys cancel), vy grows by 0.5, it moves, and it lands on the solids", ["R1", "R2"], { signature: "stepPlayer(player, input, solids)", uses: ["moveThing", "landOn"], examples: [
      { call: "stepPlayer({x:40,y:160,w:16,h:24,vx:0,vy:0,grounded:false},{left:false,right:true},[]).x", expect: "43" }] }),
    UNITS.find((u) => u.name === "drawScene")!
  ],
  code: { hits: HITS, moveThing: MOVE, landOn: LAND, stepPlayer: STEP },
  specs: [
    { unit: "S", ideal: spec1("S").ideal, checks: spec1("S").checks },
    { unit: "landOn", ideal: LAND, checks: spec1("landOn").checks },
    { unit: "stepPlayer", ideal: STEP, checks: [given(HITS), given(MOVE), given(LAND), "loads",
      "run: stepPlayer({x:40,y:160,w:16,h:24,vx:0,vy:0,grounded:false},{left:false,right:true},[]).x => 43",
      "run: stepPlayer({x:40,y:160,w:16,h:24,vx:0,vy:0,grounded:false},{left:true,right:false},[]).x => 37",
      "run: stepPlayer({x:40,y:160,w:16,h:24,vx:0,vy:0,grounded:false},{left:true,right:true},[]).x => 40",
      "run: stepPlayer({x:40,y:160,w:16,h:24,vx:0,vy:0,grounded:false},{left:false,right:false},[]).vy => 0.5",
      "run: stepPlayer({x:40,y:176,w:16,h:24,vx:0,vy:1,grounded:false},{left:false,right:false},[{x:0,y:200,w:400,h:40}]) => {x:40,y:176,w:16,h:24,vx:0,vy:0,grounded:true}",
      "run: stepPlayer(Object.freeze({x:40,y:160,w:16,h:24,vx:0,vy:0,grounded:false}),Object.freeze({left:false,right:true}),Object.freeze([])).x => 43"] },
    { unit: "drawScene", ideal: SCENE, checks: spec1("drawScene").checks }
  ]
};

// ------------------------------------------------------------------------------------------------------------------- P2 snake
const SNAKE_STATE = { mode: "playing", score: 0, size: 20, dir: "right", snake: [{ x: 5, y: 10 }, { x: 4, y: 10 }, { x: 3, y: 10 }], food: { x: 12, y: 10 } };
const NEXT = `function nextHead(head, dir, size) {
  var dx = dir === "right" ? 1 : dir === "left" ? -1 : 0, dy = dir === "down" ? 1 : dir === "up" ? -1 : 0;
  return { x: (head.x + dx + size) % size, y: (head.y + dy + size) % size };
}`;
const UP = `function onUp() { if (S.mode === "playing" && S.dir !== "down") S.dir = "up"; }`;
const BOARD = `function drawBoard() {
  var k = canvas.width / S.size;
  ctx.fillStyle = "#222"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#4caf50";
  S.snake.forEach(function (c) { ctx.fillRect(c.x * k, c.y * k, k, k); });
  ctx.fillStyle = "#e53935";
  ctx.fillRect(S.food.x * k, S.food.y * k, k, k);
}`;
const rec = (w: number, h: number) => given(`var calls = [], canvas = { width: ${w}, height: ${h} }, ctx = new Proxy({}, { get: function (t, k) { return function () { calls.push([k].concat([].slice.call(arguments))); }; }, set: function () { return true; } }); var document = { getElementById: function () { throw new Error("a view never looks the page up"); } };`);
const has = (cond: string) => `calls.some(function (c) { return ${cond}; })`;
const P2: Program = {
  id: "P2", title: "Snake", reqs: rq("The snake moves by itself one cell at a time on a square grid and wraps around the edges", "The arrow keys turn it, never straight back into itself", "It eats the food, grows and the score goes up", "It dies when it runs into itself", "The board shows the snake and the food") as never,
  state: SNAKE_STATE, layout: `<canvas id="board" width="400" height="400"></canvas>\n<div id="hud"></div>`,
  structure: `core | state S (mode, score, size, dir, snake, food), nextHead(head, dir, size)
feature snake | the body as a list of cells, moving by adding a head and removing the tail, growing when it eats | core
feature food | one cell, placed where the snake is not | core, snake
feature controls | the arrow keys turn the snake, never straight back | core
feature board | the grid drawn as squares | core
feature hud | the score and the game over message | core`,
  units: [
    U("state", "S", "everything the program remembers: the mode, the score, the grid size, the direction, the snake as a list of cells and the food", ALL(5)),
    U("fn", "nextHead", "the cell reached from head by one step in dir (\"up\", \"down\", \"left\" or \"right\"), wrapping around a grid of size by size cells", ["R1"], { signature: "nextHead(head, dir, size)", examples: [
      { call: "nextHead({x:5,y:10},\"right\",20)", expect: "{x:6,y:10}" }, { call: "nextHead({x:19,y:3},\"right\",20)", expect: "{x:0,y:3}" }] }),
    U("handler", "onUp", "while playing, turns the snake up unless it is going down", ["R2"], { on: "keydown ArrowUp" }),
    U("view", "drawBoard", "draws the snake and the food as squares of canvas width divided by the grid size, on a dark background", ["R5"], { into: "board" })
  ],
  code: { nextHead: NEXT },
  specs: [
    { unit: "S", ideal: JSON.stringify(SNAKE_STATE, null, 2), checks: ["json", 'contains: "snake"', 'contains: "food"', 'contains: "dir"', 'contains: "mode"', 'regex: "x"\\s*:', "not: //", "not: function", "not: []"] },
    { unit: "nextHead", ideal: NEXT, checks: ["loads",
      'run: nextHead({x:5,y:10},"right",20) => {x:6,y:10}', 'run: nextHead({x:19,y:3},"right",20) => {x:0,y:3}', 'run: nextHead({x:0,y:3},"left",20) => {x:19,y:3}',
      'run: nextHead({x:4,y:0},"up",20) => {x:4,y:19}', 'run: nextHead({x:4,y:19},"down",20) => {x:4,y:0}', 'run: nextHead({x:4,y:7},"down",10) => {x:4,y:8}',
      'run: nextHead(Object.freeze({x:1,y:1}),"left",5) => {x:0,y:1}'] },
    { unit: "onUp", ideal: UP, checks: [given(`var S = ${JSON.stringify(SNAKE_STATE)};`), "loads",
      'run: (onUp(), S.dir) => "up"', 'run: (S.dir = "down", onUp(), S.dir) => "down"', 'run: (S.dir = "left", onUp(), S.dir) => "up"', 'run: (S.mode = "over", onUp(), S.dir) => "right"'] },
    { unit: "drawBoard", ideal: BOARD, checks: [given(`var S = ${JSON.stringify(SNAKE_STATE)};`), rec(400, 400), "loads",
      `run: (drawBoard(), ${has("c[0] === 'clearRect'")}) => false`,
      `run: (drawBoard(), ${has("c[0] === 'fillRect' && c[1] === 100 && c[2] === 200 && c[3] === 20 && c[4] === 20")}) => true`,
      `run: (drawBoard(), ${has("c[0] === 'fillRect' && c[1] === 60 && c[2] === 200 && c[3] === 20 && c[4] === 20")}) => true`,
      `run: (drawBoard(), ${has("c[0] === 'fillRect' && c[1] === 240 && c[2] === 200 && c[3] === 20 && c[4] === 20")}) => true`,
      `run: (S.size = 10, drawBoard(), ${has("c[0] === 'fillRect' && c[1] === 200 && c[2] === 400 && c[3] === 40 && c[4] === 40")}) => true`,
      `run: (S.snake.pop(), drawBoard(), ${has("c[0] === 'fillRect' && c[1] === 60 && c[2] === 200")}) => false`] }
  ]
};

// ------------------------------------------------------------------------------------------------------------------- P3 ball and paddle
const PONG_STATE = { mode: "playing", score: 0, lives: 3, width: 400, height: 300, ball: { x: 200, y: 150, r: 6, vx: 3, vy: -3 }, paddle: { x: 170, y: 280, w: 60, h: 10 }, bricks: [{ x: 20, y: 20, w: 50, h: 14, alive: true }, { x: 80, y: 20, w: 50, h: 14, alive: false }] };
const WALLS = `function bounceWalls(ball, width) {
  var b = { ...ball };
  if ((b.x - b.r <= 0 && b.vx < 0) || (b.x + b.r >= width && b.vx > 0)) b.vx = -b.vx;
  if (b.y - b.r <= 0 && b.vy < 0) b.vy = -b.vy;
  return b;
}`;
const LEFT = `function onLeft() { if (S.mode === "playing") S.paddle.x = Math.max(0, S.paddle.x - 20); }`;
const GAME = `function drawGame() {
  ctx.fillStyle = "#111"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff"; ctx.fillRect(S.paddle.x, S.paddle.y, S.paddle.w, S.paddle.h);
  ctx.beginPath(); ctx.arc(S.ball.x, S.ball.y, S.ball.r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#f90";
  S.bricks.forEach(function (b) { if (b.alive) ctx.fillRect(b.x, b.y, b.w, b.h); });
}`;
const P3: Program = {
  id: "P3", title: "Ball and paddle", reqs: rq("A ball moves and bounces off the walls and the ceiling", "The player moves a paddle left and right with the arrow keys and cannot leave the court", "The ball breaks bricks it touches and the score goes up", "Losing the ball costs a life", "The court shows the paddle, the ball and the bricks left") as never,
  state: PONG_STATE, layout: `<canvas id="court" width="400" height="300"></canvas>`,
  structure: `core | state S (mode, score, lives, width, height, ball, paddle, bricks), bounceWalls(ball, width)
feature ball | position and speed, moving each step and bouncing | core
feature paddle | a bar moved by the arrow keys, kept inside the court | core
feature bricks | a list of bricks, each alive or broken | core, ball
feature hud | score and lives | core
feature court | everything drawn | core`,
  units: [
    U("state", "S", "everything the program remembers: the mode, the score, the lives, the size of the court, the ball, the paddle and the bricks", ALL(5)),
    U("fn", "bounceWalls", "a copy of the ball that turns around when it touches a wall: vx flips at the left or right wall when it is heading into it, vy flips at the ceiling when it is heading into it; a ball moving away from a wall is left as it is", ["R1"], { signature: "bounceWalls(ball, width)", examples: [
      { call: "bounceWalls({x:3,y:100,r:6,vx:-3,vy:2},400).vx", expect: "3" }, { call: "bounceWalls({x:200,y:100,r:6,vx:3,vy:2},400)", expect: "{x:200,y:100,r:6,vx:3,vy:2}" }] }),
    U("handler", "onLeft", "while playing, moves the paddle 20 to the left, never past the left edge of the court", ["R2"], { on: "keydown ArrowLeft" }),
    U("view", "drawGame", "draws the paddle as a rectangle, the ball as a filled circle and every brick that is not broken as a rectangle, on a dark background", ["R5"], { into: "court" })
  ],
  code: { bounceWalls: WALLS },
  specs: [
    { unit: "S", ideal: JSON.stringify(PONG_STATE, null, 2), checks: ["json", 'contains: "ball"', 'contains: "paddle"', 'contains: "bricks"', 'contains: "lives"', 'regex: "r"\\s*:', "not: //", "not: function", "not: []"] },
    { unit: "bounceWalls", ideal: WALLS, checks: ["loads",
      "run: bounceWalls({x:3,y:100,r:6,vx:-3,vy:2},400).vx => 3", "run: bounceWalls({x:397,y:100,r:6,vx:3,vy:2},400).vx => -3", "run: bounceWalls({x:200,y:4,r:6,vx:3,vy:-3},400).vy => 3",
      "run: bounceWalls({x:200,y:100,r:6,vx:3,vy:2},400) => {x:200,y:100,r:6,vx:3,vy:2}", "run: bounceWalls({x:3,y:100,r:6,vx:3,vy:2},400).vx => 3",
      "run: (function () { var b = Object.freeze({x:3,y:100,r:6,vx:-3,vy:2}); return bounceWalls(b,400).vx; })() => 3"] },
    { unit: "onLeft", ideal: LEFT, checks: [given(`var S = ${JSON.stringify(PONG_STATE)};`), "loads",
      "run: (onLeft(), S.paddle.x) => 150", "run: (S.paddle.x = 10, onLeft(), S.paddle.x) => 0", 'run: (S.mode = "over", onLeft(), S.paddle.x) => 170'] },
    { unit: "drawGame", ideal: GAME, checks: [given(`var S = ${JSON.stringify(PONG_STATE)};`), rec(400, 300), "loads",
      `run: (drawGame(), ${has("c[0] === 'clearRect'")}) => false`,
      `run: (drawGame(), ${has("c[0] === 'fillRect' && c[1] === 170 && c[2] === 280 && c[3] === 60 && c[4] === 10")}) => true`,
      `run: (drawGame(), ${has("c[0] === 'arc' && c[1] === 200 && c[2] === 150 && c[3] === 6")}) => true`,
      `run: (drawGame(), ${has("c[0] === 'fillRect' && c[1] === 20 && c[2] === 20 && c[3] === 50 && c[4] === 14")}) => true`,
      `run: (drawGame(), ${has("c[0] === 'fillRect' && c[1] === 80 && c[2] === 20")}) => false`,
      `run: (S.paddle.x = 5, drawGame(), ${has("c[0] === 'fillRect' && c[1] === 5 && c[2] === 280")}) => true`] }
  ]
};

// ------------------------------------------------------------------------------------------------------------------- P4 to-do tool
const TODO_STATE = { filter: "all", next: 3, tasks: [{ id: 1, title: "Buy milk", done: false }, { id: 2, title: "Call Sam", done: true }] };
const VISIBLE = `function visibleTasks(tasks, filter) {
  if (filter === "active") return tasks.filter(function (t) { return !t.done; });
  if (filter === "done") return tasks.filter(function (t) { return t.done; });
  return tasks.slice();
}`;
const ADD = `function onAdd() {
  var el = document.getElementById("title");
  var t = el.value.trim();
  if (!t) return;
  S.tasks.push({ id: S.next, title: t, done: false });
  S.next += 1;
  el.value = "";
}`;
const LIST = `function drawList() {
  var el = document.getElementById("list");
  el.innerHTML = visibleTasks(S.tasks, S.filter).map(function (t) { return "<li class=\\"" + (t.done ? "done" : "") + "\\">" + t.title + "</li>"; }).join("");
}`;
const todoS = given(`var S = ${JSON.stringify(TODO_STATE)};`);
const boxesAuto = given(`var els = {}, document = { getElementById: function (id) { return els[id] || (els[id] = { textContent: "", innerHTML: "", value: "" }); } };`);
const P4: Program = {
  id: "P4", title: "To-do list", reqs: rq("The person types a task and adds it with a button", "Tasks are listed and each can be done or not", "A filter shows all, only the active or only the done tasks", "The number of tasks left is shown") as never,
  state: TODO_STATE, layout: `<input id="title" placeholder="New task"><button id="add">Add</button>\n<ul id="list"></ul>\n<span id="count"></span>`,
  structure: `core | state S (filter, next, tasks), visibleTasks(tasks, filter)
feature tasks | the list of tasks with an id, a title and a done flag; adding one | core
feature filter | all, active or done: which tasks are shown | core, tasks
feature list | the tasks shown as a list | core, filter
feature counter | how many tasks are left | core, tasks`,
  units: [
    U("state", "S", "everything the program remembers: the filter, the next id and the list of tasks", ALL(4)),
    U("fn", "visibleTasks", "the tasks to show for a filter: \"all\" gives every task, \"active\" the ones not done, \"done\" the ones done; any other value gives every task; the order is kept and the input is not changed", ["R3"], { signature: "visibleTasks(tasks, filter)", examples: [
      { call: "visibleTasks([{id:1,done:false},{id:2,done:true}],\"done\").length", expect: "1" }] }),
    U("handler", "onAdd", "reads the text of the field #title, removes the spaces around it, and when something is left adds a task with the next id, not done, raises the next id by one and empties the field; an empty text adds nothing", ["R1"], { on: "click #add" }),
    U("view", "drawList", "writes the visible tasks into the list as one <li> each with the title, and the class done on the ones that are done", ["R2"], { into: "list", uses: ["visibleTasks"] })
  ],
  code: { visibleTasks: VISIBLE },
  specs: [
    { unit: "S", ideal: JSON.stringify(TODO_STATE, null, 2), checks: ["json", 'contains: "tasks"', 'contains: "filter"', 'contains: "next"', 'regex: "title"\\s*:', "not: //", "not: function", "not: []"] },
    { unit: "visibleTasks", ideal: VISIBLE, checks: [given(`var T = [{id:1,title:"a",done:false},{id:2,title:"b",done:true},{id:3,title:"c",done:false}];`), "loads",
      'run: visibleTasks(T,"all").length => 3', 'run: visibleTasks(T,"active").map(function (t) { return t.id; }) => [1,3]', 'run: visibleTasks(T,"done").map(function (t) { return t.id; }) => [2]',
      'run: visibleTasks(T,"whatever").length => 3', 'run: visibleTasks([],"done") => []', 'run: visibleTasks(Object.freeze(T.slice()),"active").length => 2'] },
    { unit: "onAdd", ideal: ADD, checks: [todoS, given(`var els = { title: { value: "  Walk dog " } }, document = { getElementById: function (id) { return els[id]; } };`), "loads",
      "run: (onAdd(), S.tasks.length) => 3", 'run: (onAdd(), S.tasks[2].title) => "Walk dog"', "run: (onAdd(), [S.tasks[2].id, S.tasks[2].done, S.next]) => [3, false, 4]",
      'run: (onAdd(), els.title.value) => ""', 'run: (els.title.value = "   ", onAdd(), [S.tasks.length, S.next]) => [2, 3]'] },
    { unit: "drawList", ideal: LIST, checks: [todoS, boxesAuto, given(VISIBLE), "loads",
      "run: (drawList(), /Buy milk/.test(els.list.innerHTML)) => true", "run: (drawList(), (els.list.innerHTML.match(/<li/g) || []).length) => 2", "run: (drawList(), /done/.test(els.list.innerHTML)) => true",
      'run: (S.filter = "active", drawList(), /Call Sam/.test(els.list.innerHTML)) => false', 'run: (S.filter = "done", drawList(), /Buy milk/.test(els.list.innerHTML)) => false',
      'run: (drawList(), Object.keys(els).join()) => "list"'] }
  ]
};

// ------------------------------------------------------------------------------------------------------------------- P5 an obscure puzzle
const LIGHTS_STATE = { mode: "playing", moves: 0, grid: [[false, true, false, false, false], [true, true, true, false, false], [false, true, false, false, false], [false, false, false, false, false], [false, false, false, false, false]] };
const TOGGLE = `function toggleCell(grid, r, c) {
  return grid.map(function (row, i) {
    return row.map(function (v, j) { return (Math.abs(i - r) + Math.abs(j - c) <= 1) ? !v : v; });
  });
}`;
const SOLVED = "function isSolved(grid) { return grid.every(function (row) { return row.every(function (v) { return !v; }); }); }";
const G3 = "var G = [[false,false,false],[false,false,false],[false,false,false]];";
const P5: Program = {
  id: "P5", title: "Lights Out", reqs: rq("A grid of lights, each on or off", "Pressing a light flips it and the lights just above, below, left and right of it", "The puzzle is solved when every light is off", "The number of presses is counted") as never,
  state: LIGHTS_STATE, layout: `<div id="grid"></div>\n<div id="moves"></div>`,
  structure: `core | state S (mode, moves, grid), toggleCell(grid, r, c), isSolved(grid)
feature grid | rows of lights, each true (on) or false (off) | core
feature press | pressing a light flips it and its four neighbours | core, grid
feature check | the puzzle is solved when every light is off | core, grid
feature board | the lights shown as buttons | core, grid`,
  units: [
    U("state", "S", "everything the program remembers: the mode, the number of presses and the grid of lights", ALL(4)),
    U("fn", "toggleCell", "a new grid where the light at row r, column c and the lights just above, below, left and right of it (the ones that exist) are flipped, true to false and false to true; the grid given is not changed", ["R2"], { signature: "toggleCell(grid, r, c)", examples: [
      { call: "toggleCell([[false,false],[false,false]],0,0)", expect: "[[true,true],[true,false]]" }] }),
    U("fn", "isSolved", "true when every light of the grid is off", ["R3"], { signature: "isSolved(grid)", examples: [{ call: "isSolved([[false,false],[false,true]])", expect: "false" }] })
  ],
  code: { toggleCell: TOGGLE, isSolved: SOLVED },
  specs: [
    { unit: "S", ideal: JSON.stringify(LIGHTS_STATE, null, 2), checks: ["json", 'contains: "grid"', 'contains: "moves"', 'contains: "mode"', "regex: (true|false)", "not: //", "not: function", "not: []"] },
    { unit: "toggleCell", ideal: TOGGLE, checks: [given(G3), "loads",
      "run: toggleCell(G,1,1) => [[false,true,false],[true,true,true],[false,true,false]]", "run: toggleCell(G,0,0) => [[true,true,false],[true,false,false],[false,false,false]]",
      "run: toggleCell(G,2,2) => [[false,false,false],[false,false,true],[false,true,true]]", "run: toggleCell(toggleCell(G,2,1),2,1) => G",
      'run: (toggleCell(G,0,0), JSON.stringify(G)) => "[[false,false,false],[false,false,false],[false,false,false]]"'] },
    { unit: "isSolved", ideal: SOLVED, checks: ["loads", "run: isSolved([[false,false],[false,false]]) => true", "run: isSolved([[false,false],[false,true]]) => false", "run: isSolved([]) => true", "run: isSolved([[true]]) => false"] }
  ]
};

// ------------------------------------------------------------------------------------------------------------------- the ten ways
const PROGRAMS = [P1, P2, P3, P4, P5];
const clean = (s: string) => s.replace(/\s*\n\s*/g, " ");
const TERSE = "Write one unit of a program in JavaScript. Reply with the code only, no explanation.";
const CHECKLIST = "Before you answer, check: the name and the arguments are exactly the ones asked; you use only names that appear above; the unit does only its own job (nothing the page already does); a function returns a new value and never changes what it was given; nothing that the task says is left out.";

interface Variant { id: string; label: string; make(p: Program, u: Unit, ctx: Ctx): { system: string; prompt: string } }
interface Ctx { full: string; fullWithStructure: string; task: string; shape: string; elements: string; uses: (code: boolean) => string; reqs: string; stateValues: string; examples: string }

const VARIANTS: Variant[] = [
  { id: "V01", label: "the engine as it is", make: (_p, u, c) => ({ system: WRITE_INSTRUCTIONS(u.kind), prompt: c.full }) },
  { id: "V02", label: "the engine, with the parts of the program", make: (_p, u, c) => ({ system: WRITE_INSTRUCTIONS(u.kind), prompt: c.fullWithStructure }) },
  { id: "V03", label: "the task alone", make: (_p, _u, c) => ({ system: TERSE, prompt: c.task }) },
  { id: "V04", label: "task and state", make: (_p, u, c) => ({ system: TERSE, prompt: `${c.task}\n\n${u.kind === "state" ? `Requirements:\n${c.reqs}` : `The state S:\n${c.shape}`}` }) },
  { id: "V05", label: "task, state and the signatures of what it uses", make: (_p, u, c) => ({ system: TERSE, prompt: `${c.task}\n\n${u.kind === "state" ? `Requirements:\n${c.reqs}` : `The state S:\n${c.shape}`}${c.uses(false) ? `\n\nFunctions you can call:\n${c.uses(false)}` : ""}${c.elements && u.kind === "view" ? `\n\nElements of the page:\n${c.elements}` : ""}` }) },
  { id: "V06", label: "task, state and the code of what it uses", make: (_p, u, c) => ({ system: TERSE, prompt: `${c.task}\n\n${u.kind === "state" ? `Requirements:\n${c.reqs}` : `The state S:\n${c.shape}`}${c.uses(true) ? `\n\nFunctions you can call (their code):\n${c.uses(true)}` : ""}${c.elements && u.kind === "view" ? `\n\nElements of the page:\n${c.elements}` : ""}` }) },
  { id: "V07", label: "a plain request in a sentence", make: (p, u, c) => ({ system: "", prompt: `I am building a program called "${p.title}". Please write the ${u.kind === "fn" ? "function" : u.kind} ${u.signature ?? u.name}${u.kind === "handler" ? `, called on ${u.on}` : ""}${u.kind === "view" ? `, drawing into #${u.into}` : ""}. ${u.does}.${u.kind === "state" ? "" : ` The state S looks like this: ${clean(c.shape)}.`}${c.uses(false) ? ` You can call: ${clean(c.uses(false))}.` : ""} Reply with the code only.` }) },
  { id: "V08", label: "the engine context and a checklist after", make: (_p, _u, c) => ({ system: TERSE, prompt: `${c.full}\n\n${CHECKLIST}` }) },
  { id: "V09", label: "task, the real values of the state and examples", make: (_p, u, c) => ({ system: TERSE, prompt: `${c.task}\n\n${u.kind === "state" ? `Requirements:\n${c.reqs}` : `S starts as:\n${c.stateValues}`}${c.examples ? `\n\nThese must hold:\n${c.examples}` : ""}${c.uses(true) ? `\n\nAlready written:\n${c.uses(true)}` : ""}` }) },
  { id: "V10", label: "telegraphic", make: (_p, u, c) => ({ system: "", prompt: `unit: ${u.kind} ${u.name}\n${u.signature ? `signature: ${u.signature}\n` : ""}${u.on ? `event: ${u.on}\n` : ""}${u.into ? `into: #${u.into}\n` : ""}does: ${u.does}\n${u.kind === "state" ? "" : `S: ${clean(c.shape)}\n`}${u.uses.length ? `uses: ${u.uses.join(", ")}\n` : ""}reply: code only` }) }
];

function contextOf(p: Program, u: Unit, engine: ContextEngine): Ctx {
  const plan = engine.plan;
  const shape = stateShape(JSON.stringify(p.state));
  const used = u.uses.map((n) => p.units.find((x) => x.name === n)).filter((x): x is Unit => !!x);
  const sig = (x: Unit) => `${x.signature ?? `${x.name}()`}: ${x.does}`;
  const task = [`kind: ${u.kind}`, `name: ${u.name}`, `does: ${u.does}`, u.signature ? `signature: ${u.signature}` : "", u.on ? `called by the event: ${u.on}` : "", u.into ? `draws into the element #${u.into}` : ""].filter(Boolean).join("\n");
  plan.structure = undefined;
  const full = engine.build(u).text;
  plan.structure = p.structure;
  const fullWithStructure = engine.build(u).text;
  plan.structure = undefined;
  return {
    full, fullWithStructure, task, shape, elements: layoutElements(p.layout).join("\n"), reqs: p.reqs.map((r) => `${r.id}. ${r.text}`).join("\n"),
    uses: (code) => used.map((x) => (code && p.code[x.name] ? `${sig(x)}\n${p.code[x.name]}` : sig(x))).join("\n\n"),
    stateValues: JSON.stringify(p.state),
    examples: u.examples.map((e) => `${e.call} gives ${e.expect}`).join("\n")
  };
}

function buildWith(variants: Variant[], pick: (p: Program, unit: string) => boolean, front: { title: string; runs: number; maxTokens: number }, intro: string): string {
  const parts: string[] = [];
  for (const p of PROGRAMS) {
    const plan: Plan = { title: p.title, language: "English", requirements: p.reqs, units: p.units };
    const engine = new ContextEngine(plan, 12000);
    engine.accept("S", { code: JSON.stringify(p.state), verified: true, problems: [] });
    engine.accept("layout", { code: p.layout, verified: true, problems: [] });
    for (const u of p.units) if (u.kind === "fn" && p.code[u.name]) engine.accept(u.name, { code: p.code[u.name], verified: true, problems: [] });
    if (!p.units.some((u) => u.kind === "layout")) plan.units = [...p.units, U("layout", "layout", "the page", ALL(p.reqs.length))];
    for (const s of p.specs) {
      if (!pick(p, s.unit)) continue;
      const u = p.units.find((x) => x.name === s.unit)!;
      for (const v of variants) {
        const { system, prompt } = v.make(p, u, contextOf(p, u, engine));
        parts.push(`## ${p.id} ${u.name} · ${v.id} ${v.label}

${prompt}

### Options

${system ? `- system: ${clean(system)}` : "- thinking: off"}
- max_tokens: ${u.kind === "state" || u.kind === "layout" ? Math.round(front.maxTokens * 1.4) : front.maxTokens}

### Checks

${s.checks.map((c) => (c.startsWith("- ") ? c : `- ${c}`)).join("\n")}

### Ideal

\`\`\`
${s.ideal}
\`\`\`
`);
      }
    }
  }
  return `---
title: ${front.title}
runs: ${front.runs}
max_tokens: ${front.maxTokens}
thinking: off
---

# ${front.title}

${intro}

${parts.join("\n")}`;
}

const FULL_INTRO = `The same unit is asked in ten ways (V01 to V10: how much context, which words, which instructions, with or without the parts of the program, the code or only the signatures of what it uses, a plain sentence, a telegraphic note), and the units come from five programs of very different kinds: a platformer (P1, whose parts are the real answer of a 4B model), a snake game (P2), a ball and paddle game (P3), a to-do tool (P4) and a puzzle (P5). Nothing in any way of asking is about a genre.
The score is on what the code DOES: every unit has checks that run the answer. To read the report, take the mean of each way (V01 to V10) over all the units, then the mean of each unit over the ten ways: the first says which way of asking is best, the second which kinds of unit the model cannot write whatever it is told.`;

function build(): string {
  return buildWith(VARIANTS, () => true, { title: "The writers of the engine, ten ways, five programs", runs: 2, maxTokens: 1200 }, FULL_INTRO);
}

// ------------------------------------------------------------------------------------------------------------------- the short round
// A first run of the ten ways on a 2B model showed that the instructions of the engine (the rules of each kind of unit) are what makes a
// state or a layout come out right, that the plain sentence and the telegraphic note are always worse, and that the parts of the program
// shown to a writer often made a unit worse. The short round keeps the engine's instructions in every way and varies only the context.
const eng = (u: Unit) => WRITE_INSTRUCTIONS(u.kind);
const QUICK: Variant[] = [
  { id: "W1", label: "the engine as it is", make: (_p, u, c) => ({ system: eng(u), prompt: c.full }) },
  { id: "W2", label: "the engine with the parts of the program", make: (_p, u, c) => ({ system: eng(u), prompt: c.fullWithStructure }) },
  { id: "W3", label: "the engine rules, the real values of the state, the examples and the code of what it uses", make: (_p, u, c) => ({ system: eng(u), prompt: `${c.task}\n\n${u.kind === "state" ? `Requirements:\n${c.reqs}` : `S starts as:\n${c.stateValues}`}${c.examples ? `\n\nThese must hold:\n${c.examples}` : ""}${c.uses(true) ? `\n\nAlready written:\n${c.uses(true)}` : ""}${c.elements && u.kind === "view" ? `\n\nElements of the page:\n${c.elements}` : ""}` }) },
  { id: "W4", label: "the engine context and a checklist after", make: (_p, u, c) => ({ system: eng(u), prompt: `${c.full}\n\n${CHECKLIST}` }) },
  { id: "W5", label: "the engine rules and the task alone", make: (_p, u, c) => ({ system: eng(u), prompt: c.task }) },
  { id: "W6", label: "the engine rules, the task and the state", make: (_p, u, c) => ({ system: eng(u), prompt: `${c.task}\n\n${u.kind === "state" ? `Requirements:\n${c.reqs}` : `The state S:\n${c.shape}`}${c.elements && u.kind === "view" ? `\n\nElements of the page:\n${c.elements}` : ""}` }) }
];
const QUICK_UNITS = new Set(["P1 landOn", "P1 stepPlayer", "P2 S", "P2 nextHead", "P2 onUp", "P2 drawBoard", "P3 bounceWalls", "P4 onAdd", "P4 drawList", "P5 toggleCell"]);
const QUICK_INTRO = `Ten units of five kinds of program (a function, a handler, a view on a canvas, a view on a box, a state), each asked in six ways that all keep the engine's own instructions and change only what is shown: W1 the engine as it is, W2 with the parts of the program, W3 the real values of the state with the examples and the code of what it uses, W4 a checklist after the context, W5 the task alone, W6 the task and the state.
The score is on what the code DOES. It is meant to take about half an hour on a 4B model at two runs; set runs to 1 in the front matter to halve it.
To read the report, take the mean of each way (W1 to W6) over the ten units, then the mean of each unit over the six ways.`;
export const LAB_UNIT_TESTS_QUICK = buildWith(QUICK, (p, unit) => QUICK_UNITS.has(`${p.id} ${unit}`), { title: "The writers of the engine, short round", runs: 2, maxTokens: 600 }, QUICK_INTRO);

export const LAB_UNIT_TESTS_2 = build();
export const UNIT_PROGRAMS = PROGRAMS.map((p) => ({ id: p.id, units: p.specs.map((s) => s.unit) }));
