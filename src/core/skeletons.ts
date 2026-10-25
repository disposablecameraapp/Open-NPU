/**
 * Working starting points for the programs people ask for again and again. A small model writes a snake game from nothing
 * with a glitch or two; given a snake game that runs, it only has to change what the request changes. Each page here is one
 * file (style and script inline, no network, no library), was run for real, and keeps its ids stable so a request can be
 * adapted without the model having to rediscover the structure.
 */

export interface Skeleton {
  id: string;
  /** Shown to the reader: "Snake". */
  name: string;
  /** What the request must say for this starting point to apply. */
  match: RegExp;
  html: string;
}

const SNAKE = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Snake</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; background: #11151c; color: #e8eef6; font-family: system-ui, sans-serif; }
  h1 { margin: 0; font-size: 28px; }
  #hud { display: flex; gap: 24px; font-size: 18px; }
  #board { background: #0b0e13; border: 2px solid #2a3442; border-radius: 8px; }
  #message { margin: 0; min-height: 22px; color: #9fb0c3; }
  button { padding: 8px 18px; border: 0; border-radius: 6px; background: #4ade80; color: #08210f; font-size: 16px; cursor: pointer; }
</style>
</head>
<body>
<h1>Snake</h1>
<div id="hud"><span>Score: <strong id="score">0</strong></span><span>Best: <strong id="best">0</strong></span></div>
<canvas id="board" width="400" height="400"></canvas>
<p id="message"></p>
<button id="restart" type="button">Restart</button>
<script>
var CELLS = 20;          // the board is CELLS x CELLS squares
var SPEED = 120;         // milliseconds per move: lower is faster
var WRAP = false;        // true: the snake comes out of the opposite wall instead of dying

var canvas = document.getElementById("board");
var ctx = canvas.getContext("2d");
var CELL = canvas.width / CELLS;
var scoreEl = document.getElementById("score");
var bestEl = document.getElementById("best");
var messageEl = document.getElementById("message");
var snake, dir, nextDir, food, score, alive, timer;
var best = 0;

function reset() {
  clearInterval(timer);
  snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
  dir = { x: 1, y: 0 };
  nextDir = dir;
  score = 0;
  alive = true;
  scoreEl.textContent = score;
  messageEl.textContent = "Arrow keys or WASD to steer. Space restarts.";
  placeFood();
  draw();
  timer = setInterval(step, SPEED);
}

function placeFood() {
  do {
    food = { x: Math.floor(Math.random() * CELLS), y: Math.floor(Math.random() * CELLS) };
  } while (snake.some(function (s) { return s.x === food.x && s.y === food.y; }));
}

function gameOver() {
  alive = false;
  clearInterval(timer);
  if (score > best) { best = score; bestEl.textContent = best; }
  messageEl.textContent = "Game over. Press Space or Restart.";
  draw();
}

function step() {
  dir = nextDir;
  var head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
  if (WRAP) {
    head.x = (head.x + CELLS) % CELLS;
    head.y = (head.y + CELLS) % CELLS;
  } else if (head.x < 0 || head.y < 0 || head.x >= CELLS || head.y >= CELLS) {
    return gameOver();
  }
  var eating = head.x === food.x && head.y === food.y;
  var body = eating ? snake : snake.slice(0, -1);
  if (body.some(function (s) { return s.x === head.x && s.y === head.y; })) return gameOver();
  snake.unshift(head);
  if (eating) {
    score++;
    scoreEl.textContent = score;
    placeFood();
  } else {
    snake.pop();
  }
  draw();
}

function draw() {
  ctx.fillStyle = "#0b0e13";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f87171";
  ctx.beginPath();
  ctx.arc(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, CELL / 2 - 2, 0, Math.PI * 2);
  ctx.fill();
  snake.forEach(function (s, i) {
    ctx.fillStyle = alive ? (i === 0 ? "#86efac" : "#4ade80") : "#64748b";
    ctx.fillRect(s.x * CELL + 1, s.y * CELL + 1, CELL - 2, CELL - 2);
  });
}

var KEYS = {
  ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
  w: { x: 0, y: -1 }, s: { x: 0, y: 1 }, a: { x: -1, y: 0 }, d: { x: 1, y: 0 }
};

document.addEventListener("keydown", function (e) {
  var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === " " || k === "Enter") {
    e.preventDefault();
    if (!alive) reset();
    return;
  }
  var d = KEYS[k];
  if (!d) return;
  e.preventDefault();
  if (d.x === -dir.x && d.y === -dir.y) return; // no U-turn into its own body
  nextDir = d;
});

document.getElementById("restart").addEventListener("click", reset);
reset();
</script>
</body>
</html>
`;

const TODO = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>To-do list</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; justify-content: center; background: #f4f6fa; color: #1c2430; font-family: system-ui, sans-serif; }
  main { width: min(480px, 92vw); margin-top: 48px; }
  h1 { margin: 0 0 16px; }
  form { display: flex; gap: 8px; }
  #new-task { flex: 1; padding: 10px 12px; font-size: 16px; border: 1px solid #c5ceda; border-radius: 6px; }
  button { padding: 10px 16px; border: 0; border-radius: 6px; background: #3b82f6; color: white; font-size: 15px; cursor: pointer; }
  button.delete { background: #ef4444; padding: 6px 10px; font-size: 13px; }
  #clear-done { background: #64748b; margin-top: 12px; }
  ul { list-style: none; padding: 0; margin: 16px 0 0; }
  li { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: white; border-radius: 6px; margin-bottom: 8px; box-shadow: 0 1px 2px rgba(0,0,0,.08); }
  li span { flex: 1; }
  li.done span { text-decoration: line-through; color: #8895a7; }
  #count { color: #64748b; margin: 12px 0 0; }
</style>
</head>
<body>
<main>
  <h1>To-do list</h1>
  <form id="task-form">
    <input id="new-task" type="text" placeholder="What needs doing?" autocomplete="off">
    <button id="add" type="submit">Add</button>
  </form>
  <ul id="list"></ul>
  <p id="count"></p>
  <button id="clear-done" type="button">Clear completed</button>
</main>
<script>
var tasks = [];
var nextId = 1;
var form = document.getElementById("task-form");
var input = document.getElementById("new-task");
var list = document.getElementById("list");
var countEl = document.getElementById("count");

function render() {
  list.innerHTML = "";
  tasks.forEach(function (t) {
    var li = document.createElement("li");
    if (t.done) li.className = "done";
    var box = document.createElement("input");
    box.type = "checkbox";
    box.checked = t.done;
    box.addEventListener("change", function () { t.done = box.checked; render(); });
    var label = document.createElement("span");
    label.textContent = t.text;
    var del = document.createElement("button");
    del.className = "delete";
    del.type = "button";
    del.textContent = "Delete";
    del.addEventListener("click", function () {
      tasks = tasks.filter(function (x) { return x.id !== t.id; });
      render();
    });
    li.appendChild(box);
    li.appendChild(label);
    li.appendChild(del);
    list.appendChild(li);
  });
  var left = tasks.filter(function (t) { return !t.done; }).length;
  countEl.textContent = tasks.length ? left + " of " + tasks.length + " left" : "Nothing to do yet.";
}

form.addEventListener("submit", function (e) {
  e.preventDefault();
  var text = input.value.trim();
  if (!text) return;
  tasks.push({ id: nextId++, text: text, done: false });
  input.value = "";
  input.focus();
  render();
});

document.getElementById("clear-done").addEventListener("click", function () {
  tasks = tasks.filter(function (t) { return !t.done; });
  render();
});

render();
</script>
</body>
</html>
`;

const CALCULATOR = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Calculator</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #161a22; font-family: system-ui, sans-serif; }
  #calc { width: 280px; padding: 16px; background: #222936; border-radius: 12px; }
  #display { box-sizing: border-box; width: 100%; padding: 14px; margin-bottom: 12px; background: #0f131a; color: #f1f5f9; font-size: 32px; text-align: right; border-radius: 8px; overflow: hidden; }
  #keys { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  button { padding: 14px 0; font-size: 20px; border: 0; border-radius: 8px; background: #364156; color: #f1f5f9; cursor: pointer; }
  button.op { background: #f59e0b; color: #1a1203; }
  button.wide { grid-column: span 2; }
  button.eq { background: #22c55e; color: #052e13; }
</style>
</head>
<body>
<div id="calc">
  <div id="display">0</div>
  <div id="keys">
    <button data-key="C" class="wide">C</button><button data-key="back">⌫</button><button data-key="/" class="op">÷</button>
    <button data-key="7">7</button><button data-key="8">8</button><button data-key="9">9</button><button data-key="*" class="op">×</button>
    <button data-key="4">4</button><button data-key="5">5</button><button data-key="6">6</button><button data-key="-" class="op">−</button>
    <button data-key="1">1</button><button data-key="2">2</button><button data-key="3">3</button><button data-key="+" class="op">+</button>
    <button data-key="0" class="wide">0</button><button data-key=".">.</button><button data-key="=" class="eq">=</button>
  </div>
</div>
<script>
var display = document.getElementById("display");
var current = "0";      // what is being typed
var stored = null;      // the left side of a pending operation
var pending = null;     // "+", "-", "*" or "/"
var fresh = true;       // the next digit starts a new number

function show() { display.textContent = current; }

function compute(a, op, b) {
  if (op === "+") return a + b;
  if (op === "-") return a - b;
  if (op === "*") return a * b;
  if (op === "/") return b === 0 ? NaN : a / b;
  return b;
}

function format(n) {
  if (!isFinite(n)) return "Error";
  return String(parseFloat(n.toPrecision(12)));
}

function press(key) {
  if (current === "Error" && key !== "C") return;
  if (key >= "0" && key <= "9") {
    current = fresh || current === "0" ? key : current + key;
    fresh = false;
  } else if (key === ".") {
    if (fresh) { current = "0."; fresh = false; }
    else if (current.indexOf(".") < 0) current += ".";
  } else if (key === "C") {
    current = "0"; stored = null; pending = null; fresh = true;
  } else if (key === "back") {
    current = !fresh && current.length > 1 ? current.slice(0, -1) : "0";
  } else if (key === "=") {
    if (pending !== null) {
      current = format(compute(stored, pending, parseFloat(current)));
      stored = null; pending = null; fresh = true;
    }
  } else {
    if (pending !== null && !fresh) {
      current = format(compute(stored, pending, parseFloat(current)));
    }
    stored = parseFloat(current);
    pending = key;
    fresh = true;
  }
  show();
}

document.getElementById("keys").addEventListener("click", function (e) {
  var key = e.target.getAttribute("data-key");
  if (key) press(key);
});

document.addEventListener("keydown", function (e) {
  if ((e.key >= "0" && e.key <= "9") || "+-*/.".indexOf(e.key) >= 0) press(e.key);
  else if (e.key === "Enter" || e.key === "=") press("=");
  else if (e.key === "Backspace") press("back");
  else if (e.key === "Escape") press("C");
});

show();
</script>
</body>
</html>
`;

const TICTACTOE = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tic-tac-toe</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; background: #14181f; color: #e9eef5; font-family: system-ui, sans-serif; }
  h1 { margin: 0; }
  #board { display: grid; grid-template-columns: repeat(3, 96px); grid-template-rows: repeat(3, 96px); gap: 6px; }
  .cell { font-size: 44px; font-weight: 700; border: 0; border-radius: 8px; background: #263041; color: #e9eef5; cursor: pointer; }
  .cell:disabled { cursor: default; }
  .cell.x { color: #60a5fa; }
  .cell.o { color: #fbbf24; }
  .cell.win { background: #166534; }
  #status { margin: 0; font-size: 20px; min-height: 28px; }
  #restart { padding: 8px 18px; border: 0; border-radius: 6px; background: #8b5cf6; color: white; font-size: 16px; cursor: pointer; }
</style>
</head>
<body>
<h1>Tic-tac-toe</h1>
<div id="board"></div>
<p id="status"></p>
<button id="restart" type="button">New game</button>
<script>
var LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
var boardEl = document.getElementById("board");
var statusEl = document.getElementById("status");
var cells = [];
var board, turn, over;

for (var i = 0; i < 9; i++) {
  var b = document.createElement("button");
  b.className = "cell";
  b.type = "button";
  b.setAttribute("data-i", i);
  b.addEventListener("click", function (e) { play(Number(e.currentTarget.getAttribute("data-i"))); });
  boardEl.appendChild(b);
  cells.push(b);
}

function winningLine() {
  for (var k = 0; k < LINES.length; k++) {
    var l = LINES[k];
    if (board[l[0]] && board[l[0]] === board[l[1]] && board[l[0]] === board[l[2]]) return l;
  }
  return null;
}

function play(i) {
  if (over || board[i]) return;
  board[i] = turn;
  var line = winningLine();
  if (line) {
    over = true;
    line.forEach(function (n) { cells[n].classList.add("win"); });
    statusEl.textContent = turn + " wins!";
  } else if (board.every(Boolean)) {
    over = true;
    statusEl.textContent = "It's a draw.";
  } else {
    turn = turn === "X" ? "O" : "X";
    statusEl.textContent = "Turn: " + turn;
  }
  paint();
}

function paint() {
  cells.forEach(function (c, i) {
    c.textContent = board[i];
    c.className = "cell" + (board[i] ? " " + board[i].toLowerCase() : "") + (c.classList.contains("win") ? " win" : "");
    c.disabled = over || !!board[i];
  });
}

function reset() {
  board = [null, null, null, null, null, null, null, null, null];
  turn = "X";
  over = false;
  statusEl.textContent = "Turn: X";
  cells.forEach(function (c) { c.classList.remove("win"); });
  paint();
}

document.getElementById("restart").addEventListener("click", reset);
reset();
</script>
</body>
</html>
`;

const STOPWATCH = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Stopwatch</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; background: #10151c; color: #e8eef6; font-family: system-ui, sans-serif; }
  #display { font-size: 64px; font-variant-numeric: tabular-nums; letter-spacing: 2px; }
  #buttons { display: flex; gap: 10px; }
  button { padding: 10px 22px; border: 0; border-radius: 8px; font-size: 18px; cursor: pointer; background: #334155; color: #e8eef6; }
  #start { background: #22c55e; color: #052e13; }
  #start.running { background: #ef4444; color: white; }
  #laps { list-style: none; padding: 0; margin: 0; width: 240px; max-height: 200px; overflow: auto; font-variant-numeric: tabular-nums; }
  #laps li { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #243041; }
</style>
</head>
<body>
<div id="display">00:00.00</div>
<div id="buttons">
  <button id="start" type="button">Start</button>
  <button id="lap" type="button">Lap</button>
  <button id="reset" type="button">Reset</button>
</div>
<ol id="laps"></ol>
<script>
var displayEl = document.getElementById("display");
var startBtn = document.getElementById("start");
var lapsEl = document.getElementById("laps");
var elapsed = 0;        // milliseconds counted before the current run
var startedAt = 0;      // when the current run began
var timer = null;

function total() { return elapsed + (timer ? Date.now() - startedAt : 0); }

function format(ms) {
  var cs = Math.floor(ms / 10) % 100;
  var s = Math.floor(ms / 1000) % 60;
  var m = Math.floor(ms / 60000);
  function two(n) { return (n < 10 ? "0" : "") + n; }
  return two(m) + ":" + two(s) + "." + two(cs);
}

function tick() { displayEl.textContent = format(total()); }

function toggle() {
  if (timer) {
    elapsed = total();
    clearInterval(timer);
    timer = null;
    startBtn.textContent = "Start";
    startBtn.classList.remove("running");
  } else {
    startedAt = Date.now();
    timer = setInterval(tick, 30);
    startBtn.textContent = "Stop";
    startBtn.classList.add("running");
  }
  tick();
}

function lap() {
  if (!timer) return;
  var li = document.createElement("li");
  var n = lapsEl.children.length + 1;
  li.innerHTML = "<span>Lap " + n + "</span><span>" + format(total()) + "</span>";
  lapsEl.appendChild(li);
}

function reset() {
  clearInterval(timer);
  timer = null;
  elapsed = 0;
  startBtn.textContent = "Start";
  startBtn.classList.remove("running");
  lapsEl.innerHTML = "";
  tick();
}

startBtn.addEventListener("click", toggle);
document.getElementById("lap").addEventListener("click", lap);
document.getElementById("reset").addEventListener("click", reset);
document.addEventListener("keydown", function (e) {
  if (e.key === " ") { e.preventDefault(); toggle(); }
});
tick();
</script>
</body>
</html>
`;

const QUIZ = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Quiz</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f1f5f9; color: #1e293b; font-family: system-ui, sans-serif; }
  #card { width: min(520px, 92vw); padding: 24px; background: white; border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,.1); }
  #progress { color: #64748b; margin: 0 0 8px; }
  #question { margin: 0 0 16px; font-size: 22px; }
  #choices { display: grid; gap: 10px; }
  .choice { padding: 12px; font-size: 17px; text-align: left; border: 2px solid #cbd5e1; border-radius: 8px; background: white; cursor: pointer; }
  .choice.right { border-color: #16a34a; background: #dcfce7; }
  .choice.wrong { border-color: #dc2626; background: #fee2e2; }
  #next, #restart { margin-top: 16px; padding: 10px 20px; border: 0; border-radius: 8px; background: #2563eb; color: white; font-size: 16px; cursor: pointer; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
<div id="card">
  <div id="quiz">
    <p id="progress"></p>
    <h2 id="question"></h2>
    <div id="choices"></div>
    <button id="next" type="button" hidden>Next</button>
  </div>
  <div id="result" hidden>
    <h2 id="final"></h2>
    <button id="restart" type="button">Play again</button>
  </div>
</div>
<script>
var QUESTIONS = [
  { q: "What is the capital of France?", choices: ["Lyon", "Paris", "Marseille", "Nice"], answer: 1 },
  { q: "Which planet is closest to the Sun?", choices: ["Venus", "Earth", "Mercury", "Mars"], answer: 2 },
  { q: "How many sides does a hexagon have?", choices: ["5", "6", "7", "8"], answer: 1 },
  { q: "Which gas do plants take in?", choices: ["Oxygen", "Nitrogen", "Helium", "Carbon dioxide"], answer: 3 },
  { q: "What is 7 x 8?", choices: ["54", "56", "58", "64"], answer: 1 }
];
var index, score, answered;
var quizEl = document.getElementById("quiz");
var resultEl = document.getElementById("result");
var progressEl = document.getElementById("progress");
var questionEl = document.getElementById("question");
var choicesEl = document.getElementById("choices");
var nextBtn = document.getElementById("next");

function showQuestion() {
  var item = QUESTIONS[index];
  answered = false;
  progressEl.textContent = "Question " + (index + 1) + " of " + QUESTIONS.length + " · Score " + score;
  questionEl.textContent = item.q;
  choicesEl.innerHTML = "";
  nextBtn.hidden = true;
  item.choices.forEach(function (text, i) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "choice";
    b.textContent = text;
    b.addEventListener("click", function () { choose(i); });
    choicesEl.appendChild(b);
  });
}

function choose(i) {
  if (answered) return;
  answered = true;
  var item = QUESTIONS[index];
  if (i === item.answer) score++;
  [].forEach.call(choicesEl.children, function (b, k) {
    if (k === item.answer) b.classList.add("right");
    else if (k === i) b.classList.add("wrong");
  });
  nextBtn.textContent = index === QUESTIONS.length - 1 ? "See the result" : "Next";
  nextBtn.hidden = false;
}

function next() {
  index++;
  if (index < QUESTIONS.length) { showQuestion(); return; }
  quizEl.hidden = true;
  resultEl.hidden = false;
  document.getElementById("final").textContent = "You scored " + score + " out of " + QUESTIONS.length;
}

function start() {
  index = 0;
  score = 0;
  quizEl.hidden = false;
  resultEl.hidden = true;
  showQuestion();
}

nextBtn.addEventListener("click", next);
document.getElementById("restart").addEventListener("click", start);
start();
</script>
</body>
</html>
`;

export const SKELETONS: Skeleton[] = [
  { id: "snake", name: "Snake", match: /\bsnake\b|\bserpent\b/i, html: SNAKE },
  { id: "tictactoe", name: "Tic-tac-toe", match: /tic[- ]?tac[- ]?toe|morpion/i, html: TICTACTOE },
  { id: "calculator", name: "Calculator", match: /\bcalculat(?:or|rice|eur)\b|\bcalculette\b/i, html: CALCULATOR },
  { id: "todo", name: "To-do list", match: /\bto[- ]?do\b|liste de t[âa]ches|\btodo\b/i, html: TODO },
  { id: "stopwatch", name: "Stopwatch", match: /\bstopwatch\b|\bchrono(?:m[eè]tre)?\b|\bminuteur\b|\btimer\b/i, html: STOPWATCH },
  { id: "quiz", name: "Quiz", match: /\bquiz\b|\bqcm\b/i, html: QUIZ }
];

/** The starting point for a request, or null. The first family named in the request wins. */
export function skeletonFor(request: string): Skeleton | null {
  let best: { s: Skeleton; at: number } | null = null;
  for (const s of SKELETONS) {
    const m = s.match.exec(request);
    if (m && (!best || m.index < best.at)) best = { s, at: m.index };
  }
  return best?.s ?? null;
}
