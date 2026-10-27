import { withBlocks } from "./gameBlocks";
import { iconFor, iconMarkup } from "./page/icons";
/** The runtime of the game engine, as plain browser script, and the way a page gets it. Kept apart so the window can load it without the rest of the engine. */

/** The runtime, as plain browser script. No dependency, no network. */
export const ENGINE_SOURCE = String.raw`
var Game = (function () {
  var NAV = { Space: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1 };
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function iconImg(name, color) {
    var p = (window.__icons || {})[name]; if (!p) return null;
    var im = new Image();
    im.src = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="' + (color || "#fff") + '" fill-opacity="0.45" stroke="' + (color || "#fff") + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>');
    return im;
  }
  // what a small model leaves out or writes the way most game code does, mended before the game starts: per-frame numbers (gravity 0.5,
  // a jump of -8, a speed of 3) become per-second ones, a thing spawned from an edge moves inward and goes away when it leaves, what a key
  // pushes up falls back down, the thing the player moves stays on the screen, and lives that rules use exist
  function settle(input) {
    var sp = JSON.parse(JSON.stringify(input || {}));
    var things = (sp.things || []).filter(function (t) { return t && t.name; }), rules = (sp.rules || []).filter(Boolean);
    var by = {}; things.forEach(function (t) { by[t.name] = t; });
    var acts = []; rules.forEach(function (r) { (r.do || []).forEach(function (a) { if (a) acts.push({ a: a, w: r.when || {} }); }); });
    function sec(v) { return typeof v === "number" && v !== 0 && Math.abs(v) < 20 ? v * 60 : v; }
    things.forEach(function (t) { t.vx = sec(t.vx); t.vy = sec(t.vy); t.speed = sec(t.speed); if (t.gravity > 0 && t.gravity < 20) t.gravity *= 3600; });
    acts.forEach(function (x) { if (x.a.op === "velocity") { x.a.vx = sec(x.a.vx); x.a.vy = sec(x.a.vy); } });
    acts.forEach(function (x) {
      if (x.a.op !== "spawn" || !by[x.a.name]) return;
      var t = by[x.a.name], at = x.a.at || (t.pair ? "right" : "top");
      if (!(t.vx || t.vy || t.gravity || (t.control && t.control !== "none"))) { if (at === "right") t.vx = -160; else if (at === "left") t.vx = 160; else if (at === "top") t.vy = 140; else if (at === "bottom") t.vy = -140; }
      if (["right", "left", "top", "bottom"].indexOf(at) >= 0 && (!t.edges || t.edges === "keep")) t.edges = "remove";
    });
    things.forEach(function (t) { if (t.pair > 0) { if (t.vx === undefined && !t.vy) t.vx = -180; if (!t.edges || t.edges === "keep") t.edges = "remove"; if (!t.w) t.w = 60; } });
    var player = {}; things.forEach(function (t) { if (t.control && t.control !== "none") player[t.name] = 1; });
    acts.forEach(function (x) { if ((x.w.key || x.w.click) && x.a.who && x.a.who !== "a" && x.a.who !== "b") player[x.a.who] = 1; });
    Object.keys(player).forEach(function (n) { var t = by[n]; if (t && t.edges === "remove") t.edges = "stop"; });
    acts.forEach(function (x) { var t = by[x.a.who]; if ((x.w.key || x.w.click) && x.a.op === "velocity" && t && x.a.vy < 0 && !t.gravity && !(t.control && t.control !== "none")) t.gravity = 900; });
    if (!sp.lives && acts.some(function (x) { return x.a.op === "lives"; })) sp.lives = 3;
    return sp;
  }
  function run(spec) {
    spec = settle(spec);
    var W = spec.width || 480, H = spec.height || 640;
    var host = document.getElementById("game") || document.body;
    var cv = document.createElement("canvas");
    cv.width = W; cv.height = H; cv.tabIndex = 0;
    cv.style.cssText = "display:block;margin:0 auto;max-width:100%;touch-action:none;outline:none";
    host.appendChild(cv);
    var cx = cv.getContext("2d");
    var g = { width: W, height: H, score: 0, lives: spec.lives || 0, state: "play", message: "", time: 0, items: [], templates: {}, keys: {}, pointer: { x: W / 2, y: H / 2 }, _on: { update: [], over: [] } };
    (spec.things || []).forEach(function (t) { g.templates[t.name] = t; });
    var timers = [], fired = {}, pid = 0, hurtUntil = 0;
    var spawned = {};
    (spec.rules || []).forEach(function (r) { (r.do || []).forEach(function (a) { if (a.op === "spawn" && a.name) spawned[a.name] = 1; }); });
    function make(t, at, from) {
      var w = t.w || (t.shape === "circle" ? 20 : 30), h = t.h || (t.shape === "circle" ? w : 30);
      var it = { name: t.name, t: t, shape: t.shape || "rect", color: t.color || "#e8e8e8", text: t.text, w: w, h: h, x: 0, y: 0, vx: t.vx || 0, vy: t.vy || 0, age: 0, dead: false };
      if (at === "top") { it.x = rnd(0, W - w); it.y = -h; }
      else if (at === "bottom") { it.x = rnd(0, W - w); it.y = H; }
      else if (at === "left") { it.x = -w; it.y = rnd(0, H - h); }
      else if (at === "right") { it.x = W; it.y = rnd(0, H - h); }
      else if (at === "center") { it.x = (W - w) / 2; it.y = (H - h) / 2; }
      else if (at === "hit" && from) { it.x = from.x + from.w / 2 - w / 2; it.y = from.y + from.h / 2 - h / 2; }
      else if (at === "random" || (t.x == null && t.y == null)) { it.x = rnd(0, W - w); it.y = rnd(0, H / 2); }
      else { it.x = (t.x == null ? 0.5 : t.x) * (W - w); it.y = (t.y == null ? 0.5 : t.y) * (H - h); }
      g.items.push(it);
      return it;
    }
    // a barrier of two parts with an opening at a random height: both parts share an id so they go together
    function makePair(t, at) {
      var w = t.w || 60, gap = t.pair, pad = Math.max(30, H * 0.12), cy = rnd(pad + gap / 2, H - pad - gap / 2), id = ++pid, x = at === "left" ? -w : at === "random" || at === "center" ? (W - w) / 2 : W, out = [];
      [[0, cy - gap / 2], [cy + gap / 2, H]].forEach(function (b) {
        var it = { name: t.name, t: t, shape: t.shape || "rect", color: t.color || "#e8e8e8", text: t.text, w: w, h: b[1] - b[0], x: x, y: b[0], vx: t.vx || 0, vy: t.vy || 0, age: 0, dead: false, pid: id };
        g.items.push(it); out.push(it);
      });
      return out[0];
    }
    function build() {
      g.items = []; g.score = 0; g.lives = spec.lives || 0; g.state = "play"; g.message = ""; g.time = 0; fired = {}; hurtUntil = 0;
      timers = [];
      (spec.rules || []).forEach(function (r, i) { if (r.when && r.when.every > 0) timers[i] = r.when.every; });
      (spec.things || []).forEach(function (t) {
        // a thing that rules spawn is a kind of thing, not one that exists at the start (unless it says how many)
        if (spawned[t.name] && !t.count && !t.grid) return;
        if (t.grid && t.grid.length === 2) {
          var gap = t.gap == null ? 4 : t.gap, w = t.w || 40, h = t.h || 16;
          var x0 = (t.x == null ? 0.5 : t.x) * W - (t.grid[0] * (w + gap) - gap) / 2, y0 = (t.y == null ? 0.1 : t.y) * H;
          for (var r = 0; r < t.grid[1]; r++) for (var c = 0; c < t.grid[0]; c++) {
            var it = make(t, "none"); it.x = x0 + c * (w + gap); it.y = y0 + r * (h + gap);
          }
        } else if (t.pair > 0) {
          makePair(t, "right");
        } else {
          var n = t.count || 1;
          for (var k = 0; k < n; k++) { var one = make(t, n > 1 ? "random" : "none"); if (t.life) one.life = t.life; }
        }
      });
      (spec.rules || []).forEach(function (r) { if (r.when && r.when.start) act(r.do, {}); });
    }
    function targets(who, ctx) {
      if (who === "a") return ctx.a ? [ctx.a] : [];
      if (who === "b") return ctx.b ? [ctx.b] : [];
      return g.items.filter(function (i) { return i.name === who && !i.dead; });
    }
    // remove: the thing named, or the n nearest the left (a barrier of two parts is one); each removed one can give points
    function removeThings(a, ctx) {
      var all = targets(a.who, ctx), seen = {}, groups = [];
      all.forEach(function (i) { var k = i.pid ? "p" + i.pid : "i" + groups.length; if (!seen[k]) { seen[k] = []; groups.push(seen[k]); } seen[k].push(i); });
      if (a.by > 0 && a.who !== "a" && a.who !== "b") groups.sort(function (p, q) { return p[0].x - q[0].x; });
      var n = a.by > 0 && a.who !== "a" && a.who !== "b" ? Math.min(a.by, groups.length) : groups.length;
      for (var k = 0; k < n; k++) { groups[k].forEach(function (i) { i.dead = true; }); if (a.each) g.score += a.each; }
      // a part of a barrier that was hit takes its other part with it
      all.forEach(function (i) { if (i.dead && i.pid) g.items.forEach(function (j) { if (j.pid === i.pid) j.dead = true; }); });
    }
    function act(list, ctx) {
      (list || []).forEach(function (a) {
        if (g.state !== "play") return;
        var op = a.op, by = a.by == null ? 1 : a.by;
        if (op === "score") g.score += by;
        else if (op === "lives") { var d = a.by == null ? -1 : a.by; if (d < 0) { if (g.time < hurtUntil) return; hurtUntil = g.time + 1; } g.lives += d; if (spec.lives > 0 && g.lives <= 0) finish("lose", a.text); }
        else if (op === "lose") finish("lose", a.text);
        else if (op === "win") finish("win", a.text);
        else if (op === "remove") removeThings(a, ctx);
        else if (op === "spawn") { var tp = g.templates[a.name]; if (tp) { if (tp.pair > 0) makePair(tp, a.at || "right"); else make(tp, a.at || "top", ctx.a || ctx.b); } }
        else if (op === "velocity") targets(a.who, ctx).forEach(function (i) { if (a.vx != null) i.vx = a.vx; if (a.vy != null) i.vy = a.vy; });
        else if (op === "speedUp") targets(a.who, ctx).forEach(function (i) { var f = a.by || 1.05; i.vx *= f; i.vy *= f; });
        else if (op === "bounce") targets(a.who, ctx).forEach(function (i) {
          var o = i === ctx.a ? ctx.b : ctx.a; if (!o) { i.vx = -i.vx; i.vy = -i.vy; return; }
          var dx = (i.x + i.w / 2) - (o.x + o.w / 2), dy = (i.y + i.h / 2) - (o.y + o.h / 2);
          var ox = (i.w + o.w) / 2 - Math.abs(dx), oy = (i.h + o.h) / 2 - Math.abs(dy);
          if (ox < oy) i.vx = dx < 0 ? -Math.abs(i.vx) : Math.abs(i.vx); else i.vy = dy < 0 ? -Math.abs(i.vy) : Math.abs(i.vy);
          // a paddle sends the ball left or right according to where it was hit
          if (ox >= oy && o.t && o.t.control && o.t.control !== "none") i.vx = (dx / (o.w / 2)) * Math.max(Math.abs(i.vy), 150);
        });
      });
      spec.rules && spec.rules.forEach(function (r, i) { if (r.when && r.when.score != null && !fired[i] && g.score >= r.when.score) { fired[i] = 1; act(r.do, {}); } });
    }
    function finish(kind, text) {
      g.state = kind === "win" ? "won" : "over";
      g.message = text || (kind === "win" ? "You win!" : "Game over");
      g._on.over.forEach(function (f) { f(g); });
    }
    function hits(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
    function step(dt) {
      g.time += dt;
      var k = g.keys;
      g.items.forEach(function (i) {
        var t = i.t, sp = t.speed || 260, c = t.control || "none";
        if (c === "arrows" || c === "horizontal") { i.vx = ((k.ArrowRight || k.KeyD) ? 1 : 0) * sp - ((k.ArrowLeft || k.KeyA) ? 1 : 0) * sp; }
        if (c === "arrows" || c === "vertical") { i.vy = ((k.ArrowDown || k.KeyS) ? 1 : 0) * sp - ((k.ArrowUp || k.KeyW) ? 1 : 0) * sp; }
        if (c === "mouse" || c === "mouseX") i.x += (g.pointer.x - i.w / 2 - i.x) * Math.min(1, dt * 20);
        if (c === "mouse") i.y += (g.pointer.y - i.h / 2 - i.y) * Math.min(1, dt * 20);
        if (t.gravity) i.vy += t.gravity * dt;
        i.x += i.vx * dt; i.y += i.vy * dt; i.age += dt;
        if (i.life && i.age > i.life) i.dead = true;
        var e = t.edges || (c !== "none" ? "stop" : "keep");
        if (e === "remove") { if (i.x > W || i.x + i.w < 0 || i.y > H || i.y + i.h < 0) { if (i.age > 0.2) i.dead = true; } }
        else if (e === "wrap") { if (i.x > W) i.x = -i.w; if (i.x + i.w < 0) i.x = W; if (i.y > H) i.y = -i.h; if (i.y + i.h < 0) i.y = H; }
        else if (e === "stop" || e === "bounce") {
          if (i.x < 0) { i.x = 0; if (e === "bounce") i.vx = Math.abs(i.vx); }
          if (i.x + i.w > W) { i.x = W - i.w; if (e === "bounce") i.vx = -Math.abs(i.vx); }
          if (i.y < 0) { i.y = 0; if (e === "bounce") i.vy = Math.abs(i.vy); }
          if (i.y + i.h > H) { i.y = H - i.h; if (e === "bounce") i.vy = -Math.abs(i.vy); else i.vy = Math.min(i.vy, 0); }
        }
      });
      (spec.rules || []).forEach(function (r, ri) {
        var w = r.when || {};
        if (w.every > 0) { timers[ri] -= dt; if (timers[ri] <= 0) { timers[ri] += w.every; act(r.do, {}); } }
        if (w.hit && w.hit.length === 2) {
          var A = g.items.filter(function (i) { return i.name === w.hit[0] && !i.dead; }), B = g.items.filter(function (i) { return i.name === w.hit[1] && !i.dead; });
          A.forEach(function (a) { B.forEach(function (b) { if (a !== b && !a.dead && !b.dead && hits(a, b)) act(r.do, { a: a, b: b }); }); });
        }
      });
      g.items = g.items.filter(function (i) { return !i.dead; });
      g._on.update.forEach(function (f) { f(dt, g); });
    }
    function draw() {
      cx.fillStyle = spec.background || "#10131a"; cx.fillRect(0, 0, W, H);
      g.items.forEach(function (i) {
        cx.fillStyle = i.color;
        if (i.shape === "circle") { cx.beginPath(); cx.arc(i.x + i.w / 2, i.y + i.h / 2, i.w / 2, 0, 6.2832); cx.fill(); }
        else if (i.shape === "icon") { if (!i.img) i.img = iconImg(i.t.icon, i.color); if (i.img && i.img.complete && i.img.naturalWidth) cx.drawImage(i.img, i.x, i.y, i.w, i.h); else { cx.beginPath(); cx.arc(i.x + i.w / 2, i.y + i.h / 2, i.w / 2, 0, 6.2832); cx.fill(); } }
        else if (i.shape === "text") { cx.font = Math.round(i.h) + "px sans-serif"; cx.textBaseline = "top"; cx.fillText(i.text || i.name, i.x, i.y); }
        else cx.fillRect(i.x, i.y, i.w, i.h);
      });
      cx.fillStyle = "#fff"; cx.font = "bold 18px sans-serif"; cx.textBaseline = "top"; cx.textAlign = "left";
      cx.fillText("Score " + g.score + (spec.lives > 0 ? "   Lives " + g.lives : ""), 10, 8);
      if (g.state !== "play") {
        cx.fillStyle = "rgba(0,0,0,.6)"; cx.fillRect(0, 0, W, H);
        cx.fillStyle = "#fff"; cx.textAlign = "center"; cx.font = "bold 32px sans-serif"; cx.fillText(g.message, W / 2, H / 2 - 30);
        cx.font = "18px sans-serif"; cx.fillText("Press Space or click to play again", W / 2, H / 2 + 14); cx.textAlign = "left";
      }
    }
    function onKey(e) {
      g.keys[e.code] = true;
      if (NAV[e.code]) e.preventDefault();
      if (g.state !== "play") { if (e.code === "Space" || e.code === "Enter") build(); return; }
      (spec.rules || []).forEach(function (r) { var k = r.when && r.when.key; if (k && (k === e.code || k === e.key || "Key" + k.toUpperCase() === e.code)) act(r.do, {}); });
    }
    function point(e) { var r = cv.getBoundingClientRect(), p = e.touches ? e.touches[0] : e; g.pointer.x = (p.clientX - r.left) * W / r.width; g.pointer.y = (p.clientY - r.top) * H / r.height; }
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", function (e) { g.keys[e.code] = false; });
    cv.addEventListener("mousemove", point); cv.addEventListener("touchmove", function (e) { point(e); e.preventDefault(); }, { passive: false });
    function down(e) {
      point(e); cv.focus();
      if (g.state !== "play") { build(); return; }
      (spec.rules || []).forEach(function (r) { if (r.when && r.when.click) act(r.do, {}); });
    }
    cv.addEventListener("mousedown", down); cv.addEventListener("touchstart", down, { passive: true });
    g.on = function (what, fn) { (g._on[what] = g._on[what] || []).push(fn); return g; };
    g.add = function (name, props) { var t = g.templates[name]; if (!t) return null; var it = make(t, "none"); for (var p in props) it[p] = props[p]; return it; };
    g.things = function (name) { return g.items.filter(function (i) { return i.name === name; }); };
    g.over = function (text) { finish("lose", text); };
    g.win = function (text) { finish("win", text); };
    g.restart = build;
    var last = 0;
    function frame(ts) {
      var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
      if (g.state === "play") step(dt);
      draw();
      requestAnimationFrame(frame);
    }
    build();
    requestAnimationFrame(frame);
    return g;
  }
  return { run: run };
})();
`;

/** The engine added to a page that uses it but does not carry it (a writer that followed `ENGINE_DOC`). */
export function withEngine(html: string): string {
  return withBlocks(withGameEngine(html));
}

/** The icons a page that holds its own `Game.run` names (`icon: "heart"`): the engine draws them from this table, and a name it does not find is drawn as a plain disc. */
function iconsTag(html: string): string {
  if (/id=["']icons["']|__icons\s*=/.test(html)) return "";
  const names = [...new Set([...html.matchAll(/["']?\bicon["']?\s*:\s*["']([^"'\n]{1,40})["']/g)].map((m) => m[1]))];
  const map: Record<string, string> = {};
  for (const n of names) { const r = iconFor(n); if (r) map[n] = iconMarkup(r); }
  return Object.keys(map).length ? `<script id="icons">window.__icons=${JSON.stringify(map).replace(/</g, "\\u003c")};</script>\n` : "";
}

function withGameEngine(html: string): string {
  if (!/\bGame\.run\s*\(/.test(html) || /id=["']engine["']|var Game\s*=/.test(html)) return html;
  const tag = `${iconsTag(html)}<script id="engine">${ENGINE_SOURCE}</script>\n`;
  const at = html.search(/<script\b/i);
  return at >= 0 ? html.slice(0, at) + tag + html.slice(at) : html.replace(/<\/body>/i, `${tag}</body>`);
}
