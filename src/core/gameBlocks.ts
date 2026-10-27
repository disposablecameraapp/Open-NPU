/**
 * Game blocks: a world game (a map, things to pick up, doors, enemies, people to talk to, a state shown on screen) written as
 * HTML. The layout is plain HTML and CSS, which the model already knows (grid, flex, position, gap); the pieces of the game are
 * tags of a small language of our own (`<game-state>`, `<game-map>`, `<game-value>`, `<game-rule>`...). The page does not carry
 * the runtime: the app adds it when the page is shown, tested or saved (`withBlocks`), so what the model writes is only the
 * description. A map is drawn as text, one character per tile, so a position is read from the text itself.
 */

export const BLOCKS_SOURCE = `
var GameBlocks = (function () {
  var COLORS = { wall: "#4b5563", floor: "#1b2230", player: "#2563eb", item: "#f59e0b", enemy: "#dc2626", door: "#92400e", exit: "#16a34a", npc: "#7c3aed" };
  var GLYPHS = { player: "\\u{1F9D9}", item: "\\u2B50", enemy: "\\u{1F47E}", door: "\\u{1F6AA}", exit: "\\u{1F3C1}", npc: "\\u{1F9D1}" };
  var state = {}, initial = {}, rules = [], maps = [], over = null, logEl = null;

  function num(v) { var n = parseFloat(v); return isNaN(n) || String(n) !== String(v).trim() ? v : n; }
  function cond(expr) {
    if (expr == null || !String(expr).trim()) return true;
    return String(expr).split("&&").every(function (part) {
      var m = /^\\s*(!?)([A-Za-z_]\\w*)\\s*(>=|<=|==|!=|>|<)?\\s*(-?[\\w.]+)?\\s*$/.exec(part);
      if (!m) return false;
      var a = state[m[2]]; if (a === undefined) a = 0;
      if (!m[3]) return m[1] ? !a : !!a;
      var b = m[4] in state ? state[m[4]] : num(m[4]);
      switch (m[3]) { case ">=": return a >= b; case "<=": return a <= b; case "==": return a == b; case "!=": return a != b; case ">": return a > b; default: return a < b; }
    });
  }
  function say(text) {
    if (!text) return;
    if (logEl) logEl.textContent = text;
    var t = document.createElement("div"); t.className = "game-toast"; t.textContent = text;
    t.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#000c;color:#fff;padding:8px 14px;border-radius:8px;font:14px system-ui;pointer-events:none;z-index:50";
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 1800);
  }
  function apply(effects) {
    (effects || []).forEach(function (e) { state[e[0]] = (typeof state[e[0]] === "number" ? state[e[0]] : 0) + e[1]; });
    refresh();
  }
  function finish(kind, text) {
    if (over) return; over = kind;
    var o = document.createElement("div"); o.id = "game-over";
    o.style.cssText = "position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:#000a;color:#fff;font:700 32px system-ui;z-index:60;cursor:pointer;text-align:center";
    o.innerHTML = "<div></div><div style='font:400 15px system-ui;opacity:.8'>Press R or click to play again</div>";
    o.firstChild.textContent = text || (kind === "win" ? "You win!" : "Game over");
    o.addEventListener("click", restart); document.body.appendChild(o);
  }
  function restart() {
    var o = document.getElementById("game-over"); if (o) o.remove(); over = null;
    for (var k in initial) state[k] = initial[k];
    maps.forEach(function (m) { m.reset(); }); refresh();
  }
  function check() {
    rules.forEach(function (r) {
      if (over) return;
      if (cond(r.when)) { if (r.say) say(r.say); if (r.do === "win" || r.do === "lose") finish(r.do, r.say); else if (r.do === "restart") restart(); }
    });
  }
  function refresh() {
    document.querySelectorAll("game-value").forEach(function (el) { var v = state[el.getAttribute("of")]; el.textContent = v === undefined ? "0" : String(v); });
    document.querySelectorAll("game-bar").forEach(function (el) {
      var max = parseFloat(el.getAttribute("max")) || 1, v = Math.max(0, Math.min(max, +state[el.getAttribute("of")] || 0));
      var fill = el.firstChild; if (!fill) { fill = document.createElement("i"); fill.style.cssText = "display:block;height:100%;background:currentColor;border-radius:inherit;transition:width .2s"; el.appendChild(fill); if (!el.style.display) el.style.display = "block"; if (!el.style.height) el.style.height = "10px"; if (!el.style.background) el.style.background = "#fff3"; if (!el.style.color) el.style.color = "#ef4444"; el.style.borderRadius = el.style.borderRadius || "6px"; }
      fill.style.width = (v / max * 100) + "%";
    });
    document.querySelectorAll("game-inventory").forEach(function (el) {
      var out = [];
      (el.getAttribute("items") || "").split(/\\s+/).filter(Boolean).forEach(function (p) { var kv = p.split(":"), n = +state[kv[0]] || 0; if (n > 0) out.push("<span class='inv-item'>" + (kv[1] || kv[0]) + "\\u00D7" + n + "</span>"); });
      el.innerHTML = out.join(" ") || "";
    });
    document.querySelectorAll("[when]").forEach(function (el) { if (el.tagName === "GAME-RULE") return; el.style.display = cond(el.getAttribute("when")) ? "" : "none"; });
    check();
  }

  function parseLegend(text) {
    var legend = {};
    String(text || "").split("\\n").forEach(function (line) {
      var m = /^\\s*(\\S)\\s+([a-z]+)\\b(.*)$/.exec(line); if (!m) return;
      var d = { role: m[2], look: null, color: null, fx: [], needs: null, says: null, still: false };
      var rest = m[3].replace(/"([^"]*)"/, function (_, s) { d.says = s; return " "; });
      rest.split(/\\s+/).filter(Boolean).forEach(function (t) {
        var fx = /^([A-Za-z_]\\w*)([+-])(\\d+)$/.exec(t), nd = /^needs:(.+)$/.exec(t);
        if (fx) d.fx.push([fx[1], (fx[2] === "-" ? -1 : 1) * parseInt(fx[3], 10)]);
        else if (nd) d.needs = nd[1];
        else if (t === "still") d.still = true;
        else if (/^#[0-9a-f]{3,8}$/i.test(t) || (/^[a-z]+$/i.test(t) && window.CSS && CSS.supports("color", t))) d.color = t;
        else d.look = t;
      });
      legend[m[1]] = d;
    });
    return legend;
  }

  function World(el) {
    var legendEl = el.querySelector("game-legend"), legend = parseLegend(legendEl ? legendEl.textContent : "");
    var raw = Array.prototype.map.call(el.childNodes, function (n) { return n === legendEl ? "" : n.textContent; }).join("");
    var rows = raw.split("\\n").map(function (r) { return r.replace(/\\s+$/, ""); }).filter(function (r) { return r.trim(); });
    var cut = Math.min.apply(null, rows.map(function (r) { return r.length - r.replace(/^ */, "").length; }));
    rows = rows.map(function (r) { return r.slice(cut); });
    var cols = Math.max.apply(null, rows.map(function (r) { return r.length; })), tile = parseInt(el.getAttribute("tile"), 10) || 32;
    el.textContent = "";
    var cv = document.createElement("canvas"); cv.width = cols * tile; cv.height = rows.length * tile; cv.style.cssText = "display:block;max-width:100%;height:auto;image-rendering:pixelated"; el.appendChild(cv);
    var cx = cv.getContext("2d"), grid, me, enemies, lastMove = 0;
    function def(ch) { return legend[ch] || (ch === " " || ch === "." ? { role: "floor", fx: [] } : null); }
    function reset() {
      grid = []; enemies = []; me = { x: 0, y: 0 };
      rows.forEach(function (r, y) {
        grid.push([]);
        for (var x = 0; x < cols; x++) {
          var ch = x < r.length ? r[x] : " ", d = def(ch);
          if (d && d.role === "player") { me = { x: x, y: y }; d = { role: "floor", fx: [] }; }
          else if (d && d.role === "enemy") { enemies.push({ x: x, y: y, d: d }); d = { role: "floor", fx: [] }; }
          grid[y].push(d || { role: "floor", fx: [] });
        }
      });
      draw();
    }
    function paint(d, x, y) {
      cx.fillStyle = d.color || COLORS[d.role] || COLORS.floor; cx.fillRect(x * tile, y * tile, tile, tile);
      if (d.role === "floor") { cx.strokeStyle = "#ffffff08"; cx.strokeRect(x * tile + .5, y * tile + .5, tile - 1, tile - 1); }
      var g = d.look || GLYPHS[d.role];
      if (g && d.role !== "floor" && d.role !== "wall" || d.look) { cx.font = Math.floor(tile * .72) + "px system-ui,'Segoe UI Emoji'"; cx.textAlign = "center"; cx.textBaseline = "middle"; cx.fillStyle = "#fff"; cx.fillText(g, x * tile + tile / 2, y * tile + tile / 2 + 1); }
    }
    function draw() {
      for (var y = 0; y < grid.length; y++) for (var x = 0; x < cols; x++) paint(grid[y][x], x, y);
      enemies.forEach(function (e) { paint(e.d, e.x, e.y); });
      paint(legendPlayer, me.x, me.y);
    }
    var legendPlayer = { role: "player", fx: [] };
    for (var k in legend) if (legend[k].role === "player") legendPlayer = legend[k];
    function enemyAt(x, y) { for (var i = 0; i < enemies.length; i++) if (enemies[i].x === x && enemies[i].y === y) return i; return -1; }
    function free(x, y) { var c = grid[y] && grid[y][x]; return c && c.role !== "wall" && c.role !== "door" && c.role !== "npc" && enemyAt(x, y) < 0 && !(x === me.x && y === me.y); }
    function step(dx, dy) {
      if (over) return;
      var x = me.x + dx, y = me.y + dy, c = grid[y] && grid[y][x];
      if (!c || c.role === "wall") return;
      var i = enemyAt(x, y);
      if (i >= 0) { var en = enemies.splice(i, 1)[0]; apply(en.d.fx); if (en.d.says) say(en.d.says); draw(); return; }
      if (c.role === "door" || c.role === "exit") {
        var need = c.needs, bare = need && /^[A-Za-z_]\\w*$/.test(need);
        if (need && !cond(bare ? need + ">=1" : need)) { say(c.says || "It is locked."); return; }
        if (c.role === "door") { if (bare) apply([[need, -1]]); grid[y][x] = { role: "floor", fx: [] }; apply(c.fx); me = { x: x, y: y }; draw(); return; }
        me = { x: x, y: y }; draw(); apply(c.fx); finish("win", c.says); return;
      }
      if (c.role === "npc") { say(c.says || "..."); apply(c.fx); return; }
      me = { x: x, y: y };
      if (c.role === "item") { grid[y][x] = { role: "floor", fx: [] }; apply(c.fx); if (c.says) say(c.says); }
      draw();
    }
    function wander() {
      if (over) return;
      enemies.forEach(function (e) {
        if (e.d.still || Math.random() < .4) return;
        var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]], d = dirs[Math.floor(Math.random() * 4)], nx = e.x + d[0], ny = e.y + d[1];
        if (nx === me.x && ny === me.y) { apply(e.d.fx); enemies.splice(enemies.indexOf(e), 1); return; }
        if (free(nx, ny)) { e.x = nx; e.y = ny; }
      });
      draw();
    }
    window.addEventListener("keydown", function (e) {
      var key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if ((key === "r" || key === "R") && over) { restart(); return; }
      var v = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1], q: [-1, 0], z: [0, -1] }[key];
      if (!v) return; e.preventDefault();
      var now = Date.now(); if (now - lastMove < 90) return; lastMove = now; step(v[0], v[1]);
    });
    setInterval(wander, 650);
    reset();
    return { reset: reset, step: step, el: el, rows: rows, legend: legend, me: function () { return me; }, grid: function () { return grid; } };
  }

  function boxes() {
    var out = [], vw = window.innerWidth, vh = window.innerHeight, alerts = [];
    var all = Array.prototype.slice.call(document.body.querySelectorAll("*")).filter(function (el) {
      var r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      if (/^(SCRIPT|STYLE|LINK|META|CANVAS|I|BR|SPAN|GAME-LEGEND|GAME-RULE|GAME-STATE)$/.test(el.tagName) && !el.id) return false;
      return r.width > 0 && r.height > 0 && cs.display !== "none" && cs.visibility !== "hidden" && !/game-toast|game-over/.test(el.className + el.id);
    });
    function name(el) { return el.tagName.toLowerCase() + (el.id ? "#" + el.id : el.classList.length ? "." + el.classList[0] : ""); }
    all.forEach(function (el) {
      var r = el.getBoundingClientRect();
      out.push({ name: name(el), el: el, x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) });
    });
    out.forEach(function (a, i) {
      if (a.x < -2 || a.y < -2 || a.x + a.w > vw + 2) alerts.push("off screen: " + a.name);
      for (var j = i + 1; j < out.length; j++) {
        var b = out[j]; if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        var ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox > 4 && oy > 4) alerts.push("overlap: " + a.name + " / " + b.name + " (" + ox + "x" + oy + "px)");
      }
    });
    return { viewport: { w: vw, h: vh, scrollH: document.documentElement.scrollHeight }, boxes: out.map(function (b) { return { name: b.name, x: b.x, y: b.y, w: b.w, h: b.h }; }).slice(0, 60), alerts: alerts.slice(0, 20) };
  }

  function start() {
    document.querySelectorAll("game-state").forEach(function (el) { Array.prototype.forEach.call(el.attributes, function (a) { state[a.name] = num(a.value); }); });
    document.querySelectorAll("game-map").forEach(function (el) { maps.push(World(el)); });
    document.querySelectorAll("game-map game-legend").forEach(function () {});
    maps.forEach(function (m) { for (var k in m.legend) m.legend[k].fx.forEach(function (e) { if (!(e[0] in state)) state[e[0]] = 0; }); });
    document.querySelectorAll("game-rule").forEach(function (el) { rules.push({ when: el.getAttribute("when"), do: el.getAttribute("do"), say: el.getAttribute("say") }); });
    logEl = document.querySelector("game-log");
    for (var k in state) initial[k] = state[k];
    refresh();
  }
  window.__layout = boxes;
  window.__game = { state: state, maps: maps, restart: restart };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  return { state: state, report: boxes, maps: maps };
})();
`;

/** The reference the writer is given (the whole language, so the model keeps it in view). */
export const BLOCKS_DOC = `Layout is ordinary HTML and CSS in a <style> block (grid, flex, gap, position, sizes): write it as you always do. The game itself is made of these tags, which are already implemented; write no script and no game loop.
<game-state hp="3" gold="0"></game-state>  — the numbers the game keeps. Every attribute is a number; any name works.
<game-map tile="32"> ... </game-map>  — the world, one character per tile, drawn as text. Put a <game-legend> first, one line per character: "<char> <role> [look] [effects] [needs:...] ["words"] [still]".
  roles: wall (blocks), floor, player (start), item (picked up when walked on), enemy (walks about; walking into it defeats it and its effects apply), door (blocks until needs:), exit (win, when needs: is met), npc (says its words when walked into).
  look: an emoji or a colour (#c33 or red). effects: a state name and a signed number, e.g. gold+1 or hp-1. needs: a state name (it must be 1 or more; a door uses one up) or a test like needs:gold>=3.
  Keys: arrows or WASD move the player one tile. Characters not in the legend are floor.
<game-value of="gold"></game-value>  — shows a state number as text.   <game-bar of="hp" max="3"></game-bar>  — a bar, style its size and colour with CSS (color is the fill).
<game-inventory items="key:🔑 gold:🪙"></game-inventory>  — shows each of those that is 1 or more.   <game-log></game-log>  — the last message.
when="gold>=3"  — an attribute for any element: it is shown only while the test is true (and, && for both).
<game-rule when="hp<=0" do="lose" say="You died"></game-rule>  — do is win, lose or restart; say is shown. Give the game a way to be lost and a way to be won.
Place things with CSS only: put the map, the numbers and the log in a grid or a flex container with gaps, so nothing overlaps. Draw anything else (a title, panels) as normal HTML.`;

/** A whole game in this form, shown to the writer so it sees how the pieces fit (other games, only for the form). */
export const BLOCKS_EXAMPLE = `<!doctype html>
<html><head><meta charset="utf-8"><title>Crypt</title>
<style>
  body { margin: 0; min-height: 100vh; background: #0f1420; color: #e5e7eb; font: 16px system-ui; display: grid; place-items: center; }
  main { display: grid; grid-template-columns: auto 180px; gap: 16px; align-items: start; }
  aside { display: flex; flex-direction: column; gap: 12px; }
  game-map { border: 3px solid #334155; border-radius: 8px; overflow: hidden; }
  game-bar { color: #ef4444; }
  game-log { min-height: 40px; font-size: 14px; color: #cbd5e1; }
</style></head>
<body>
<game-state hp="3" gold="0" key="0"></game-state>
<main>
  <game-map tile="36">
    <game-legend>
      # wall #334155
      @ player
      k item key+1 🔑 "A key!"
      $ item gold+1 🪙
      e enemy hp-1 👾 still
      D door needs:key 🚪 "Locked."
      N npc 👴 "Bring me 3 coins and the exit opens."
      X exit needs:gold>=3 🏁 "The way is shut."
    </game-legend>
    ####################
    #@..$....#.....$...#
    #.####.#.#.###.###.#
    #..N...#.#..e..#...#
    #.####.#D#####.#.###
    #...k..#.....$.#..X#
    ####################
  </game-map>
  <aside>
    <h2>Crypt</h2>
    <div>Life <game-bar of="hp" max="3"></game-bar></div>
    <div>Gold <game-value of="gold"></game-value> / 3</div>
    <game-inventory items="key:🔑"></game-inventory>
    <game-log></game-log>
  </aside>
</main>
<game-rule when="hp<=0" do="lose" say="You died"></game-rule>
</body></html>
`;

/** The runtime added to a page that uses blocks but does not carry it. */
export function withBlocks(html: string): string {
  if (!/<game-(?:map|state)\b/i.test(html) || /id=["']blocks["']|var GameBlocks\s*=/.test(html)) return html;
  const tag = `<script id="blocks">${BLOCKS_SOURCE}</script>\n`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${tag}</body>`) : html + tag;
}

export const usesBlocks = (html: string) => /<game-map\b/i.test(html);

/** What is wrong with a page of blocks, read from its text (a map is text, so most mistakes can be seen without running it). */
export function blocksFlaw(html: string): string[] {
  const out: string[] = [];
  if (!usesBlocks(html)) return out;
  const maps = [...html.matchAll(/<game-map\b[^>]*>([\s\S]*?)<\/game-map\s*>/gi)];
  maps.forEach((m, n) => {
    const body = m[1];
    const legendText = /<game-legend\b[^>]*>([\s\S]*?)<\/game-legend\s*>/i.exec(body)?.[1] ?? "";
    const legend = new Map<string, string>();
    for (const line of legendText.split("\n")) {
      const l = /^\s*(\S)\s+([a-z]+)\b/.exec(line);
      if (l) legend.set(l[1], l[2]);
    }
    const rows = body.replace(/<game-legend\b[\s\S]*?<\/game-legend\s*>/i, "").split("\n").map((r) => r.replace(/\s+$/, "")).filter((r) => r.trim());
    const cut = Math.min(...rows.map((r) => r.length - r.replace(/^ */, "").length));
    const cells = rows.map((r) => r.slice(cut));
    const where = maps.length > 1 ? ` (map ${n + 1})` : "";
    if (!legend.size) out.push(`The map has no <game-legend>${where}: write one line per character ("# wall", "@ player").`);
    if (!cells.length) { out.push(`The map has no rows${where}.`); return; }
    const width = Math.max(...cells.map((r) => r.length));
    cells.forEach((r, y) => { if (r.length !== width) out.push(`Row ${y + 1} of the map is ${r.length} characters wide, the others ${width}${where}.`); });
    const players = cells.join("").split("").filter((c) => legend.get(c) === "player").length;
    if (players !== 1) out.push(`The map needs exactly one player character, it has ${players}${where}.`);
    const unknown = new Set(cells.join("").split("").filter((c) => c !== " " && c !== "." && !legend.has(c)));
    if (unknown.size) out.push(`These map characters are not in the legend: ${[...unknown].map((c) => `"${c}"`).join(" ")}${where}. Add a line for each, or use "." for floor.`);
    const walled = cells.join("").split("").some((c) => legend.get(c) === "wall");
    if (!walled && cells.length > 3) out.push(`The map has no wall${where}.`);
  });
  if (!/<game-rule\b[^>]*\bdo=["'](?:win|lose)/i.test(html) && !/\bexit\b/.test(html)) out.push("The game has no way to be won or lost: add an exit in the legend or a <game-rule>.");
  if (/<script\b/i.test(html.replace(/<script id=["']blocks["'][\s\S]*?<\/script>/i, ""))) out.push("Write no <script>: the blocks do the work.");
  return out;
}

export interface LayoutReport { viewport: { w: number; h: number; scrollH?: number }; boxes: { name: string; x: number; y: number; w: number; h: number }[]; alerts: string[] }

/** The layout of a page as a few lines of text for the model: a small plan, the exact boxes, the problems. */
export function layoutText(r: LayoutReport, cols = 48, rows = 14): string {
  const sx = cols / Math.max(1, r.viewport.w), sy = rows / Math.max(1, r.viewport.scrollH ?? r.viewport.h);
  const grid = Array.from({ length: rows }, () => Array(cols).fill("."));
  const named = r.boxes.filter((b) => /^game-|#/.test(b.name) || b.w * b.h > 3000).slice(0, 12);
  named.forEach((b, i) => {
    const ch = String.fromCharCode(65 + i);
    for (let y = Math.floor(b.y * sy); y <= Math.min(rows - 1, Math.floor((b.y + b.h) * sy - 0.01)); y++)
      for (let x = Math.floor(b.x * sx); x <= Math.min(cols - 1, Math.floor((b.x + b.w) * sx - 0.01)); x++)
        if (y >= 0 && x >= 0) grid[y][x] = grid[y][x] === "." ? ch : "*";
  });
  const key = named.map((b, i) => `${String.fromCharCode(65 + i)} ${b.name} ${b.x},${b.y} ${b.w}x${b.h}`).join("\n");
  return `${grid.map((row) => row.join("")).join("\n")}\n${key}\n${r.alerts.length ? r.alerts.join("\n") : "no overlap, nothing off screen"}`;
}
