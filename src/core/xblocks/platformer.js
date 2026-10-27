/* Platformer block: a side-view level read from a legend and ASCII rows, simulated on a fixed step (1/120 s)
 * and drawn on a canvas that fills its container. The canvas is transparent: the page's background shows through,
 * `sky="#hex"` paints one. Units are cells (one tile = 1, y grows downward). Boxes are given by their top-left corner;
 * the state player_x / player_y is the centre x and the top y of the player.
 * Roles: ground, brick, block, platform, pipe (solid, a tube), scenery (behind everything, no collision: as:cloud, as:bush,
 * as:hill), water (slows, does not hurt), coin, walker, flyer, spike, flag, spring, checkpoint (a flag that saves the
 * respawn point and applies its effects once per visit).
 * Legend effects: a plain effect token is the coin / block / flag effect, or for an enemy the effect of contact that hurts.
 * `stomp:<effects>` (no spaces) is applied when an enemy is stomped (none otherwise); `hurt:<effects>` overrides the plain one for contact.
 * `gives:big` on a block: hitting it from below sends out a mushroom; touching it sets big to 1. */
(function () {
  var FIX = 1 / 120, EPS = 1e-6, MAXFALL = 30, COYOTE = 0.1, BUFFER = 0.1, INVULN = 1;
  var VIEW_H = 18, WATER_SLOW = 0.55, FRAME_RATE = 8;
  var ROLES = { ground: 1, brick: 1, block: 1, platform: 1, pipe: 1, scenery: 1, water: 1, player: 1, coin: 1, walker: 1, flyer: 1,
    spike: 1, flag: 1, spring: 1, checkpoint: 1 };
  /* solid from every side; a used block stays solid. A platform is one-way (see topSolid). */
  var SOLID = { ground: 1, brick: 1, block: 1, used: 1, pipe: 1, spring: 1 };
  var GIVES = { big: 1 };
  var KEYS = { left: ["ArrowLeft", "KeyA", "KeyQ"], right: ["ArrowRight", "KeyD"], jump: ["ArrowUp", "KeyW", "KeyZ", "Space"], run: ["ShiftLeft", "ShiftRight"] };
  var MAPPED = {};
  Object.keys(KEYS).forEach(function (k) { KEYS[k].forEach(function (c) { MAPPED[c] = true; }); });
  var EFFECT = /^[A-Za-z_][\w.]*(\+\+|--|[+-]=|=|[+-]\d)|^(say|emit|go):/;
  var TOKEN = /[A-Za-z_]\w*:"[^"]*"|"[^"]*"|\S+/g;
  /* the mushroom that a block sends out: not a walker, it is never hurt by contact and never stomped */
  var MUSH = { role: "powerup", name: "mushroom", look: null, effects: "", text: null, stomp: null, hurt: null, needs: null, still: false, as: null };

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function isEmoji(s) { return /[^\x00-\x7F]/.test(s); }
  /* a look "art:name" draws the drawn object of the art block */
  function artName(look) { var m = /^art:(\S+)$/.exec(look || ""); return m ? m[1] : ""; }
  function typing() { var a = document.activeElement; return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName); }
  function gateOk(def) { return !def || !def.needs || X.test(def.needs); }
  function ctxOf(el, c, r, def) { return { el: el, x: c, y: r, name: def ? def.name : "" }; }
  function say(def) { if (def && def.text) X.say(def.text); }
  function overlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  function sideSolid(t) { return !!SOLID[t] || t === "wall"; }
  function topSolid(t) { return !!SOLID[t] || t === "platform"; }

  /* legend: <car> <rôle> [apparence] [effets] [needs:cond] ["paroles"] [still] [to:scène] [as:nom] [gives:big] */
  function parseLegend(text, problems) {
    var out = {};
    String(text).split(/\r?\n/).forEach(function (raw) {
      var line = raw.replace(/^\s+/, "");
      if (!line) return;
      var ch = line.charAt(0), toks = line.slice(1).match(TOKEN) || [];
      if (!toks.length) { problems.push("platformer: legend line without a role: " + line); return; }
      var role = toks.shift();
      if (!ROLES[role]) { problems.push("platformer: unknown role '" + role + "' for '" + ch + "'"); role = "air"; }
      var def = { role: role, ch: ch, name: ch, look: null, effects: "", stomp: null, hurt: null, needs: null, text: null, still: false, as: null, gives: null }, fx = [];
      toks.forEach(function (t) {
        if (t.charAt(0) === '"') def.text = t.slice(1, -1);
        else if (t === "still") def.still = true;
        else if (t.indexOf("as:") === 0) { def.as = t.slice(3); def.name = def.as; }
        else if (t.indexOf("needs:") === 0) def.needs = t.slice(6);
        else if (t.indexOf("stomp:") === 0) def.stomp = t.slice(6);
        else if (t.indexOf("hurt:") === 0) def.hurt = t.slice(5);
        else if (t.indexOf("gives:") === 0) {
          def.gives = t.slice(6);
          if (!GIVES[def.gives]) problems.push("platformer: gives:" + def.gives + " is not known (only gives:big)");
        }
        else if (t.indexOf("to:") === 0) { /* reserved for scenes */ }
        else if (EFFECT.test(t)) fx.push(t);
        else if (!def.look) def.look = t;
        else problems.push("platformer: unused word '" + t + "' for '" + ch + "'");
      });
      def.effects = fx.join(" ");
      out[ch] = def;
    });
    return out;
  }

  /* the level text is read once and the legend and text nodes are hidden from the page */
  function readLevel(el, problems) {
    var legendEl = null, legendText = "", text = "";
    Array.prototype.slice.call(el.childNodes).forEach(function (n) {
      if (n.nodeType === 3) { text += n.textContent; el.removeChild(n); }
      else if (n.nodeType === 1 && /^(X|GAME)-LEGEND$/.test(n.tagName)) { legendEl = n; legendText += n.textContent; }
    });
    if (legendEl) legendEl.hidden = true; else problems.push("platformer: no <x-legend>");
    var legend = parseLegend(legendText, problems);
    var lines = text.replace(/\r/g, "").split("\n");
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    if (!lines.length) { problems.push("platformer: no level rows"); lines = [" "]; }
    var indent = Infinity;
    lines.forEach(function (l) { if (l.trim()) indent = Math.min(indent, l.match(/^[ \t]*/)[0].length); });
    if (!isFinite(indent)) indent = 0;
    lines = lines.map(function (l) { return l.slice(indent).replace(/\s+$/, ""); });
    var cols = Math.max.apply(null, lines.map(function (l) { return l.length; })) || 1;
    lines = lines.map(function (l) { return l + " ".repeat(cols - l.length); });
    var start = null, players = 0;
    lines.forEach(function (l, r) {
      for (var c = 0; c < l.length; c++) {
        var d = legend[l.charAt(c)];
        if (d && d.role === "player") { players++; if (!start) start = { c: c, r: r }; }
      }
    });
    if (!start) { problems.push("platformer: no player (role player) in the level"); start = { c: Math.min(1, cols - 1), r: 0 }; }
    if (players > 1) problems.push("platformer: " + players + " players, the first one is used");
    return { cols: cols, rows: lines.length, lines: lines, legend: legend, start: start };
  }

  function mount(el) {
    if (el._platformer) return;
    el._platformer = true;
    if (!document.getElementById("x-platformer-style")) {
      var st = document.createElement("style");
      st.id = "x-platformer-style";
      st.textContent = ":where(x-platformer,game-platformer){display:block}" +
        ":where(x-platformer canvas,game-platformer canvas){display:block;max-width:100%;image-rendering:pixelated}";
      document.head.appendChild(st);
    }
    function num(name, dflt, min) {
      var raw = el.getAttribute(name);
      if (raw == null || raw === "") return dflt;
      var v = parseFloat(raw);
      if (!(v >= min)) { X.problems.push("platformer: " + name + " must be a number of at least " + min); return dflt; }
      return v;
    }
    /* tile: pixels per cell of the art drawings only; the level itself is scaled to the container */
    var tile = Math.round(num("tile", 32, 4)), view = Math.round(num("view", 16, 2));
    var gravity = num("gravity", 40, 1), jump = num("jump", 14, 1), speed = num("speed", 7, 0.5), runMul = num("run", 1.6, 1);
    var fallFx = el.hasAttribute("fall") ? el.getAttribute("fall") : "lives-=1";
    var sky = el.getAttribute("sky") || "";
    var lvl = readLevel(el, X.problems);
    var VW = Math.min(lvl.cols, view), VH = Math.min(lvl.rows, VIEW_H);
    var canvas = document.createElement("canvas");
    canvas.style.display = "block";
    canvas.style.margin = "0 auto";
    el.appendChild(canvas);
    var g2 = canvas.getContext("2d");
    var G = null, ents = [], P = null, held = {}, manual = false, acc = 0, clock = 0;
    var fitKey = "", scale = 1;
    var artImg = Object.create(null), artCb = Object.create(null), frameArt = Object.create(null);

    /* ---------- the level as cells and entities ---------- */
    function build() {
      G = { cols: lvl.cols, rows: lvl.rows, cells: [] };
      ents = [];
      for (var r = 0; r < lvl.rows; r++) {
        var row = [];
        for (var c = 0; c < lvl.cols; c++) {
          var def = lvl.legend[lvl.lines[r].charAt(c)] || null, role = def ? def.role : "air";
          if (role === "walker" || role === "flyer") { ents.push(spawn(role, def, c, r)); role = "air"; }
          if (role === "player") role = "air";
          row.push({ role: role, def: def });
        }
        G.cells.push(row);
      }
    }
    function spawn(kind, def, c, r) {
      return { kind: kind, def: def, name: def.name, x: c + 0.1, y: r + 0.2, base: r + 0.2, w: 0.8, h: 0.8,
        dir: kind === "walker" ? -1 : 1, speed: kind === "walker" ? 2 : 1.5, vy: 0, t: 0, anim: 0, grounded: false, dead: false, still: def.still };
    }
    /* the mushroom comes out on top of the block; it needs the cell above the block to be free */
    function spawnMush(c, r) {
      if (SOLID[roleAt(c, r - 1)]) { X.problems.push("platformer: no room above the block at column " + c + " for its mushroom"); return; }
      ents.push({ kind: "mush", def: MUSH, name: MUSH.name, x: c + 0.1, y: r - 0.8, base: r - 0.8, w: 0.8, h: 0.8,
        dir: 1, speed: 2.2, vy: 0, t: 0, anim: 0, grounded: false, dead: false, still: false });
    }
    function newPlayer() {
      var c = lvl.start.c, r = lvl.start.r;
      return { x: c + 0.1, y: r, w: 0.8, h: 1, vx: 0, vy: 0, face: 1, grounded: false, coyote: 0, jumpBuf: 0, jumpWas: false,
        invuln: 0, inside: {}, prevBottom: r + 1, spawn: { x: c + 0.1, y: r }, stride: 0 };
    }
    function sync() { X.set("player_x", P.x + P.w / 2); X.set("player_y", P.y); }
    function reset() { build(); P = newPlayer(); acc = 0; sync(); }
    X.on("restart", reset);
    reset();

    function roleAt(c, r) {
      if (c < 0 || c >= G.cols) return "wall";
      if (r < 0 || r >= G.rows) return "air";
      return G.cells[r][c].role;
    }
    /* a cell a box can enter: not a wall, not solid (scenery and water are open) */
    function openAt(c, r) { var t = roleAt(c, r); return t !== "wall" && !SOLID[t]; }
    function boxSolid(b) {
      for (var r = Math.floor(b.y + EPS); r <= Math.floor(b.y + b.h - EPS); r++)
        for (var c = Math.floor(b.x + EPS); c <= Math.floor(b.x + b.w - EPS); c++) if (SOLID[roleAt(c, r)]) return true;
      return false;
    }
    function inWater() {
      for (var r = Math.floor(P.y + EPS); r <= Math.floor(P.y + P.h - EPS); r++)
        for (var c = Math.floor(P.x + EPS); c <= Math.floor(P.x + P.w - EPS); c++) if (roleAt(c, r) === "water") return true;
      return false;
    }
    /* returns true when the box hit a wall (and is pushed out of it) */
    function moveX(b, dx) {
      if (!dx) return false;
      b.x += dx;
      var r0 = Math.floor(b.y + EPS), r1 = Math.floor(b.y + b.h - EPS), r;
      if (dx > 0) {
        var cr = Math.floor(b.x + b.w - EPS);
        for (r = r0; r <= r1; r++) if (sideSolid(roleAt(cr, r))) { b.x = cr - b.w; return true; }
      } else {
        var cl = Math.floor(b.x + EPS);
        for (r = r0; r <= r1; r++) if (sideSolid(roleAt(cl, r))) { b.x = cl + 1; return true; }
      }
      return false;
    }
    /* landed: the cell the box came down on; bump: the cell whose underside the head hit */
    function moveY(b, dy) {
      var prevBottom = b.y + b.h, out = { landed: null, bump: null }, c, t;
      b.y += dy;
      var c0 = Math.floor(b.x + EPS), c1 = Math.floor(b.x + b.w - EPS);
      if (dy > 0) {
        var rb = Math.floor(b.y + b.h - EPS);
        for (c = c0; c <= c1; c++) {
          t = roleAt(c, rb);
          if (SOLID[t] || (t === "platform" && prevBottom <= rb + EPS)) {
            b.y = rb - b.h; b.vy = 0; out.landed = { c: c, r: rb, role: t }; break;
          }
        }
      } else if (dy < 0) {
        var rt = Math.floor(b.y + EPS);
        for (c = c0; c <= c1; c++) {
          if (SOLID[roleAt(c, rt)]) { b.y = rt + 1; b.vy = 0; out.bump = { c: c, r: rt }; break; }
        }
      }
      return out;
    }

    /* ---------- input: the test hook, the keyboard, and the gates (dialogue, battle, typing) ---------- */
    function input() {
      var out = { left: false, right: false, jump: false, run: false };
      if (X.get("dialog_open") >= 1 || X.get("battle_open") >= 1 || typing()) return out;
      Object.keys(KEYS).forEach(function (name) {
        out[name] = KEYS[name].some(function (code) { return !!held[code] || (!manual && !!X.keys[code]); });
      });
      return out;
    }

    /* ---------- one fixed step ---------- */
    function tick() {
      var I = input();
      P.invuln = Math.max(0, P.invuln - FIX);
      fitHeight();
      tickPlayer(I);
      if (X.isOver()) return;
      touchCells();
      if (X.isOver()) return;
      tickEnts();
      touchEnts();
      if (X.isOver()) return;
      if (P.y > lvl.rows + 1) fall();
      sync();
    }
    function fitHeight() {
      var want = X.get("big") >= 1 ? 2 : 1;
      if (want === P.h) return;
      P.y -= want - P.h; P.h = want;
      for (var k = 0; k < 2 && boxSolid(P); k++) P.y -= 1;
    }
    function tickPlayer(I) {
      var was = P.grounded, wet = inWater();
      var dir = (I.right ? 1 : 0) - (I.left ? 1 : 0);
      var maxV = speed * (I.run ? runMul : 1) * (wet ? WATER_SLOW : 1);
      if (dir) {
        P.face = dir;
        P.vx = clamp(P.vx + dir * (was ? 60 : 35) * FIX, -maxV, maxV);
      } else {
        var f = (was ? 60 : 12) * FIX;
        P.vx = Math.abs(P.vx) <= f ? 0 : P.vx - Math.sign(P.vx) * f;
      }
      var edge = I.jump && !P.jumpWas;
      P.jumpWas = I.jump;
      P.jumpBuf = edge ? BUFFER : Math.max(0, P.jumpBuf - FIX);
      P.coyote = was ? COYOTE : Math.max(0, P.coyote - FIX);
      if (P.jumpBuf > 0 && P.coyote > 0) {
        P.vy = -jump; P.grounded = false; P.coyote = 0; P.jumpBuf = 0;
        X.emit("jump", { el: el });
      }
      /* a short hop: letting go of the jump while rising doubles gravity; water is lighter */
      P.vy = Math.min(MAXFALL, P.vy + gravity * (wet ? 0.4 : 1) * (P.vy < 0 && !I.jump ? 2.5 : 1) * FIX);
      P.prevBottom = P.y + P.h;
      if (moveX(P, P.vx * FIX)) P.vx = 0;
      var res = moveY(P, P.vy * FIX);
      P.grounded = !!res.landed;
      if (P.grounded) P.stride += Math.abs(P.vx) * FIX;
      if (res.landed && !was) X.emit("land", { el: el });
      if (res.landed && res.landed.role === "spring") {
        P.vy = -jump * 1.2; P.grounded = false;
        var sp = G.cells[res.landed.r][res.landed.c].def;
        if (sp && sp.effects) X.run(sp.effects, ctxOf(el, res.landed.c, res.landed.r, sp));
      }
      if (res.bump) bump(res.bump.c, res.bump.r);
    }
    function bump(c, r) {
      var cell = G.cells[r][c], def = cell.def, ctx = ctxOf(el, c, r, def);
      if (cell.role === "block" && gateOk(def)) {
        cell.role = "used";
        if (def && def.effects) X.run(def.effects, ctx);
        say(def);
        X.emit("hit:block", ctx);
        if (def && GIVES[def.gives]) spawnMush(c, r);
      } else if (cell.role === "brick") {
        if (X.get("big") >= 1) { cell.role = "air"; if (def && def.effects) X.run(def.effects, ctx); }
        X.emit("hit:brick", ctx);
      }
    }
    /* coins are taken on contact; spikes, flags and checkpoints act when the player enters them */
    function touchCells() {
      var now = {}, r, c, cell, def, key;
      var c0 = Math.max(0, Math.floor(P.x + EPS)), c1 = Math.min(G.cols - 1, Math.floor(P.x + P.w - EPS));
      var r0 = Math.max(0, Math.floor(P.y + EPS)), r1 = Math.min(G.rows - 1, Math.floor(P.y + P.h - EPS));
      for (r = r0; r <= r1; r++) {
        for (c = c0; c <= c1; c++) {
          cell = G.cells[r][c]; def = cell.def;
          if (cell.role === "coin" && gateOk(def)) {
            cell.role = "air";
            if (def && def.effects) X.run(def.effects, ctxOf(el, c, r, def));
            say(def);
            X.emit("coin", ctxOf(el, c, r, def));
          } else if (cell.role === "spike" || cell.role === "flag" || cell.role === "checkpoint") {
            key = c + "," + r; now[key] = true;
            if (!P.inside[key]) { enter(cell, c, r); if (X.isOver()) return; }
          }
        }
      }
      P.inside = now;
    }
    function enter(cell, c, r) {
      var def = cell.def;
      if (cell.role === "spike") hurt(def, c, r);
      else if (cell.role === "checkpoint") {
        P.spawn = { x: c + 0.1, y: r };
        if (def && def.effects) X.run(def.effects, ctxOf(el, c, r, def));
        say(def);
      } else if (cell.role === "flag") {
        if (gateOk(def)) { X.emit("flag", ctxOf(el, c, r, def)); X.finish("win", def && def.text ? def.text : undefined); }
        else say(def);
      }
    }
    function hurt(def, c, r) {
      if (P.invuln > 0 || X.isOver()) return;
      var ctx = ctxOf(el, c, r, def);
      if (X.get("big") >= 1) { X.set("big", 0); P.invuln = INVULN; X.emit("hurt", ctx); return; }
      var fx = def ? (def.hurt || def.effects) : "";
      if (fx) X.run(fx, ctx);
      X.emit("hurt", ctx);
      if (!X.isOver()) respawn();
    }
    function respawn() {
      X.set("big", 0);
      P.x = P.spawn.x; P.y = P.spawn.y; P.h = 1;
      P.vx = 0; P.vy = 0; P.grounded = false; P.coyote = 0; P.jumpBuf = 0; P.inside = {};
      P.invuln = INVULN;
    }
    function fall() {
      X.run(fallFx, { el: el });
      X.emit("fall", { el: el });
      if (!X.isOver()) respawn();
    }

    /* walkers and mushrooms turn at a wall or a ledge, flyers at a wall and bob up and down */
    function tickEnts() {
      ents.forEach(function (e) {
        if (e.dead || e.still) return;
        if (e.kind === "flyer") { e.t += FIX; e.y = e.base + Math.sin(e.t * 3) * 0.5; }
        else e.anim += FIX;
        if (moveX(e, e.dir * e.speed * FIX)) e.dir = -e.dir;
        if (e.kind === "flyer") return;
        e.vy = Math.min(MAXFALL, e.vy + gravity * FIX);
        var res = moveY(e, e.vy * FIX);
        e.grounded = !!res.landed;
        if (e.grounded && e.kind === "walker") {
          var fc = e.dir > 0 ? Math.floor(e.x + e.w - EPS) : Math.floor(e.x + EPS);
          if (!topSolid(roleAt(fc, Math.floor(e.y + e.h - EPS) + 1))) e.dir = -e.dir;
        }
        if (e.y > lvl.rows + 2) e.dead = true;
      });
    }
    /* a mushroom is taken on any contact; falling onto an enemy from above stomps it; any other contact hurts */
    function touchEnts() {
      ents.forEach(function (e) {
        if (e.dead || X.isOver() || !overlap(P, e)) return;
        var c = Math.floor(e.x + 0.4), r = Math.floor(e.y + 0.4), ctx = ctxOf(el, c, r, e.def);
        if (e.kind === "mush") { e.dead = true; X.set("big", 1); X.emit("powerup:big", ctx); return; }
        if (P.vy > 0 && P.prevBottom <= e.y + 0.35) {
          e.dead = true;
          if (e.def && e.def.stomp) X.run(e.def.stomp, ctx);
          say(e.def);
          X.emit("stomp:" + e.name, ctx);
          P.vy = -jump * 0.6; P.grounded = false;
        } else hurt(e.def, c, r);
      });
    }

    /* ---------- drawing: all in cell units (the canvas transform). A colour in the legend is the main colour of the
     * default look; an emoji or art: replaces it ---------- */
    function box(x, y, w, h, col) { g2.fillStyle = col; g2.fillRect(x, y, w, h); }
    function disc(x, y, rad, col) { g2.fillStyle = col; g2.beginPath(); g2.arc(x, y, rad, 0, Math.PI * 2); g2.fill(); }
    function hash(a, b, k) { var v = Math.sin(a * 127.1 + b * 311.7 + k * 74.7) * 43758.5453; return v - Math.floor(v); }
    function drawText(text, x, y, color, size, bold) {
      g2.fillStyle = color;
      g2.font = (bold ? "bold " : "") + size + "px system-ui, sans-serif";
      g2.textAlign = "center"; g2.textBaseline = "middle";
      g2.fillText(text, x, y);
    }
    /* the picture of an art look, drawn in the box (x, y, bw, bh) of cells; false while it is not ready */
    function drawArt(name, x, y, bw, bh) {
      var img = artFor(name), a = X.art ? X.art(name) : null;
      if (!img || !a) return false;
      var sw = a.w / tile, sh = a.h / tile, dw, dh;
      if (sw > bw || sh > bh) { dw = sw; dh = sh; }   /* bigger than the box: its own size in cells */
      else { var k = Math.min(bw / sw, bh / sh); dw = sw * k; dh = sh * k; }
      g2.drawImage(img, x + (bw - dw) / 2, y + bh - dh, dw, dh);
      return true;
    }

    function paintGround(c, r, col) {
      box(c, r, 1, 1, col || "#8d5a2b");
      for (var k = 0; k < 3; k++) disc(c + hash(c, r, k), r + 0.2 + hash(c, r, k + 3) * 0.7, 0.04 + hash(c, r, k + 6) * 0.03, "rgba(0,0,0,0.18)");
      box(c, r + 0.9, 1, 0.1, "rgba(0,0,0,0.25)");
      if (!SOLID[roleAt(c, r - 1)]) {
        box(c, r, 1, 0.2, "#5cb83a"); box(c, r + 0.2, 1, 0.04, "#3e8e2a");
        g2.fillStyle = "#4caf3a";
        for (var i = 0; i < 3; i++) {
          var x = c + 0.08 + i * 0.32 + hash(c, r, i) * 0.08;
          g2.beginPath(); g2.moveTo(x, r + 0.2); g2.lineTo(x + 0.05, r - 0.08); g2.lineTo(x + 0.1, r + 0.2); g2.fill();
        }
      }
    }
    function paintBrick(c, r, col) {
      var mortar = "rgba(245,226,196,0.85)";
      box(c, r, 1, 1, col || "#b5562c");
      box(c, r, 1, 0.07, mortar); box(c, r + 0.93, 1, 0.07, mortar);
      var jx = r % 2 ? c : c + 0.5;   /* the vertical joint changes from one course to the next */
      box(jx - 0.035, r, 0.07, 1, mortar);
      box(c, r, 1, 0.08, "rgba(255,255,255,0.18)"); box(c, r + 0.92, 1, 0.08, "rgba(0,0,0,0.25)");
    }
    function paintBlock(c, r, col, used) {
      if (used) {
        box(c, r, 1, 1, "#9e9e9e");
        g2.strokeStyle = "rgba(0,0,0,0.35)"; g2.lineWidth = 0.05; g2.strokeRect(c + 0.04, r + 0.04, 0.92, 0.92);
        return;
      }
      box(c, r, 1, 1, col || "#f4c542");
      box(c, r, 1, 0.1, "rgba(255,255,255,0.45)"); box(c, r, 0.1, 1, "rgba(255,255,255,0.25)");
      box(c, r + 0.9, 1, 0.1, "rgba(0,0,0,0.28)"); box(c + 0.9, r, 0.1, 1, "rgba(0,0,0,0.2)");
      g2.strokeStyle = "rgba(90,50,0,0.7)"; g2.lineWidth = 0.05; g2.strokeRect(c + 0.03, r + 0.03, 0.94, 0.94);
      drawText("?", c + 0.5, r + 0.53, "#7a4a00", 0.7, true);
    }
    function paintPlatform(c, r, col) {
      box(c, r, 1, 0.25, col || "#a0743a");
      box(c, r, 1, 0.06, "rgba(255,255,255,0.35)"); box(c, r + 0.22, 1, 0.03, "rgba(0,0,0,0.3)");
    }
    /* a tube: a wider cap where the top of a run of pipe is open; two cells side by side make a wide pipe */
    function paintPipe(c, r, col) {
      var body = col || "#2e9e3e", L = roleAt(c - 1, r) === "pipe", R = roleAt(c + 1, r) === "pipe";
      box(c, r, 1, 1, body);
      if (!L) box(c + 0.1, r, 0.12, 1, "rgba(255,255,255,0.35)");
      if (!R) box(c + 0.8, r, 0.2, 1, "rgba(0,0,0,0.3)");
      if (roleAt(c, r - 1) !== "pipe") {
        var x0 = c - (openAt(c - 1, r) ? 0.1 : 0), x1 = c + 1 + (openAt(c + 1, r) ? 0.1 : 0);
        box(x0, r, x1 - x0, 0.32, body);
        box(x0, r + 0.05, x1 - x0, 0.06, "rgba(255,255,255,0.35)");
        box(x0, r + 0.27, x1 - x0, 0.05, "rgba(0,0,0,0.35)");
        g2.strokeStyle = "rgba(0,40,0,0.6)"; g2.lineWidth = 0.04; g2.strokeRect(x0, r, x1 - x0, 0.32);
      }
    }
    function paintSpring(c, r, col) {
      box(c + 0.1, r + 0.86, 0.8, 0.14, "#424242");
      g2.strokeStyle = "#9e9e9e"; g2.lineWidth = 0.07;
      g2.beginPath(); g2.moveTo(c + 0.3, r + 0.86);
      for (var i = 1; i <= 6; i++) g2.lineTo(c + (i % 2 ? 0.7 : 0.3), r + 0.86 - i * 0.065);
      g2.stroke();
      box(c + 0.05, r + 0.34, 0.9, 0.16, col || "#e53935"); box(c + 0.05, r + 0.34, 0.9, 0.05, "rgba(255,255,255,0.35)");
    }
    function paintSpike(c, r, col) {
      box(c, r + 0.9, 1, 0.1, "#546e7a");
      for (var i = 0; i < 3; i++) {
        var x0 = c + i / 3, x1 = c + (i + 1) / 3, ax = c + (i + 0.5) / 3;
        g2.beginPath(); g2.moveTo(x0, r + 0.92); g2.lineTo(ax, r + 0.1); g2.lineTo(x1, r + 0.92); g2.closePath();
        g2.fillStyle = col || "#cfd8dc"; g2.fill();
        g2.strokeStyle = "#546e7a"; g2.lineWidth = 0.03; g2.stroke();
      }
    }
    /* the coin turns: its width follows a cosine */
    function paintCoin(c, r, col) {
      var w = 0.06 + Math.abs(Math.cos(clock * 3)) * 0.26;
      g2.beginPath(); g2.ellipse(c + 0.5, r + 0.5, w, 0.32, 0, 0, Math.PI * 2);
      g2.fillStyle = col || "#ffd54f"; g2.fill();
      g2.strokeStyle = "#b7860b"; g2.lineWidth = 0.05; g2.stroke();
      if (w > 0.14) {
        g2.beginPath(); g2.ellipse(c + 0.5, r + 0.5, w * 0.5, 0.2, 0, 0, Math.PI * 2);
        g2.strokeStyle = "rgba(255,255,255,0.7)"; g2.lineWidth = 0.04; g2.stroke();
      }
    }
    /* a pole of flag cells is drawn as one: the foot under the bottom cell, the cloth on the top one, waving */
    function paintFlag(c, r, col, base) {
      var role = G.cells[r][c].role;
      box(c + 0.46, r, 0.08, 1, "#e0e0e0"); box(c + 0.52, r, 0.02, 1, "rgba(0,0,0,0.25)");
      if (roleAt(c, r + 1) !== role) box(c + 0.3, r + 0.92, 0.4, 0.08, "#616161");
      if (roleAt(c, r - 1) === role) return;
      disc(c + 0.5, r + 0.04, 0.07, "#ffd54f");
      var xs = [], top = [], bot = [], i, k;
      for (i = 0; i <= 4; i++) {
        k = i / 4;
        xs.push(c + 0.54 + i * 0.1);
        top.push(r + 0.12 + k * 0.03 * Math.sin(clock * 6 + i * 1.1));
        bot.push(r + 0.4 + k * 0.03 * Math.sin(clock * 6 + i * 1.1 + 0.8));
      }
      g2.beginPath(); g2.moveTo(xs[0], top[0]);
      for (i = 1; i <= 4; i++) g2.lineTo(xs[i], top[i]);
      for (i = 4; i >= 0; i--) g2.lineTo(xs[i], bot[i]);
      g2.closePath();
      g2.fillStyle = col || base; g2.fill();
      g2.strokeStyle = "rgba(0,0,0,0.3)"; g2.lineWidth = 0.02; g2.stroke();
      disc(c + 0.74, r + 0.26, 0.05, "rgba(255,255,255,0.85)");
    }
    /* scenery: clouds, bushes and hills; a colour or an emoji replaces the default one */
    function paintScenery(c, r, def) {
      var kind = def && def.as ? def.as : "bush", col = def ? def.look : null;
      if (kind === "cloud") {
        var cl = col || "rgba(255,255,255,0.95)";
        disc(c + 0.3, r + 0.6, 0.26, cl); disc(c + 0.6, r + 0.48, 0.34, cl); disc(c + 0.9, r + 0.64, 0.24, cl);
        box(c, r + 0.62, 1, 0.26, cl);
        box(c, r + 0.8, 1, 0.08, "rgba(120,150,180,0.25)");
      } else if (kind === "hill") {
        g2.beginPath(); g2.moveTo(c, r + 1); g2.quadraticCurveTo(c + 0.5, r - 0.6, c + 1, r + 1); g2.closePath();
        g2.fillStyle = col || "#7cb342"; g2.fill();
      } else {
        var g = col || "#2e7d32";
        disc(c + 0.3, r + 0.72, 0.28, g); disc(c + 0.7, r + 0.72, 0.28, g); disc(c + 0.5, r + 0.56, 0.32, g);
        disc(c + 0.42, r + 0.46, 0.09, "rgba(255,255,255,0.22)");
      }
    }
    function paintWater(c, r, col) {
      g2.globalAlpha = 0.6; box(c, r, 1, 1, col || "#2196f3"); g2.globalAlpha = 1;
      if (roleAt(c, r - 1) !== "water") {
        g2.strokeStyle = "rgba(255,255,255,0.75)"; g2.lineWidth = 0.06;
        g2.beginPath(); g2.moveTo(c, r + 0.12);
        g2.quadraticCurveTo(c + 0.25, r + 0.02, c + 0.5, r + 0.12);
        g2.quadraticCurveTo(c + 0.75, r + 0.22, c + 1, r + 0.12);
        g2.stroke();
      }
    }
    function drawCell(c, r) {
      var cell = G.cells[r][c], t = cell.role, look = cell.def && cell.def.look, art = artName(look);
      if (art) { if (drawArt(art, c, r, 1, 1)) return; look = null; }
      if (look && isEmoji(look)) return drawText(look, c + 0.5, r + 0.55, "#000", 0.8, false);
      var col = look || null;
      if (t === "ground") paintGround(c, r, col);
      else if (t === "brick") paintBrick(c, r, col);
      else if (t === "block") paintBlock(c, r, col, false);
      else if (t === "used") paintBlock(c, r, null, true);
      else if (t === "platform") paintPlatform(c, r, col);
      else if (t === "pipe") paintPipe(c, r, col);
      else if (t === "water") paintWater(c, r, col);
      else if (t === "scenery") paintScenery(c, r, cell.def);
      else if (t === "spring") paintSpring(c, r, col);
      else if (t === "spike") paintSpike(c, r, col);
      else if (t === "coin") paintCoin(c, r, col);
      else if (t === "flag") paintFlag(c, r, col, "#2e7d32");
      else if (t === "checkpoint") paintFlag(c, r, col, "#42a5f5");
    }
    /* walking: the two frames alternate; the legs swap */
    function paintWalker(e, col) {
      var x = e.x, y = e.y, step = Math.floor(e.anim * FRAME_RATE) % 2, eye = e.dir > 0 ? 0.03 : -0.03;
      box(x + 0.12, y + (step ? 0.7 : 0.74), 0.2, 0.1, "#4e342e");
      box(x + 0.48, y + (step ? 0.74 : 0.7), 0.2, 0.1, "#4e342e");
      box(x + 0.2, y + 0.42, 0.4, 0.34, "#f5e6c8");
      disc(x + 0.32, y + 0.55, 0.09, "#fff"); disc(x + 0.48, y + 0.55, 0.09, "#fff");
      disc(x + 0.34 + eye, y + 0.57, 0.04, "#222"); disc(x + 0.5 + eye, y + 0.57, 0.04, "#222");
      g2.beginPath(); g2.ellipse(x + 0.4, y + 0.4, 0.4, 0.34, 0, Math.PI, Math.PI * 2);
      g2.fillStyle = col || "#8d5a2b"; g2.fill();
      box(x, y + 0.38, 0.8, 0.07, "rgba(0,0,0,0.2)");
      disc(x + 0.25, y + 0.22, 0.07, "#fff"); disc(x + 0.55, y + 0.2, 0.06, "#fff"); disc(x + 0.4, y + 0.13, 0.04, "#fff");
    }
    /* flying: the wings beat between two positions */
    function paintFlyer(e, col) {
      var x = e.x, y = e.y, up = Math.floor(e.t * FRAME_RATE) % 2 ? -0.1 : 0.08, body = col || "#1e88e5", wing = col || "#1565c0";
      g2.fillStyle = wing;
      g2.beginPath(); g2.moveTo(x + 0.3, y + 0.42); g2.lineTo(x - 0.02, y + 0.18 + up); g2.lineTo(x + 0.22, y + 0.5); g2.closePath(); g2.fill();
      g2.beginPath(); g2.moveTo(x + 0.5, y + 0.42); g2.lineTo(x + 0.82, y + 0.18 + up); g2.lineTo(x + 0.58, y + 0.5); g2.closePath(); g2.fill();
      g2.beginPath(); g2.ellipse(x + 0.4, y + 0.42, 0.24, 0.2, 0, 0, Math.PI * 2); g2.fillStyle = body; g2.fill();
      disc(x + 0.32, y + 0.36, 0.08, "#fff"); disc(x + 0.48, y + 0.36, 0.08, "#fff");
      disc(x + 0.34, y + 0.37, 0.04, "#111"); disc(x + 0.5, y + 0.37, 0.04, "#111");
    }
    /* the mushroom that a block sends out: red cap with white spots */
    function paintMushroom(e) {
      var x = e.x, y = e.y;
      box(x + 0.22, y + 0.42, 0.36, 0.36, "#fff3e0");
      g2.beginPath(); g2.ellipse(x + 0.4, y + 0.4, 0.4, 0.38, 0, Math.PI, Math.PI * 2); g2.fillStyle = "#e53935"; g2.fill();
      box(x, y + 0.38, 0.8, 0.06, "rgba(0,0,0,0.2)");
      disc(x + 0.26, y + 0.22, 0.08, "#fff"); disc(x + 0.56, y + 0.18, 0.07, "#fff"); disc(x + 0.42, y + 0.1, 0.05, "#fff");
      disc(x + 0.32, y + 0.58, 0.05, "#222"); disc(x + 0.48, y + 0.58, 0.05, "#222");
    }
    function drawEnt(e) {
      var look = e.def && e.def.look, art = artName(look);
      if (art) { if (drawArt(art, e.x, e.y, e.w, e.h)) return; look = null; }
      if (look && isEmoji(look)) return drawText(look, e.x + 0.4, e.y + 0.45, "#000", 0.8, false);
      var col = look || null;
      if (e.kind === "walker") paintWalker(e, col);
      else if (e.kind === "flyer") paintFlyer(e, col);
      else paintMushroom(e);
    }
    /* the player: a small man in a cap and overalls, facing the way it moves; big is taller; legs swap while walking */
    function paintPlayer() {
      var h = P.h, walking = P.grounded && Math.abs(P.vx) > 0.5, step = Math.floor(P.stride * 2) % 2, air = !P.grounded;
      var torso = h - 0.3;
      var liftL = walking ? (step ? 0.08 : 0) : (air ? 0.06 : 0), liftR = walking ? (step ? 0 : 0.08) : (air ? 0.06 : 0);
      var armTop = air ? 0.3 : 0.46, backTop = walking ? (step ? 0.5 : 0.42) : 0.46;
      g2.save();
      g2.translate(P.x + P.w / 2, P.y); g2.scale(P.face < 0 ? -1 : 1, 1);
      box(-0.2, torso, 0.18, h - 0.12 - liftL - torso, "#1e5bd8"); box(-0.22, h - 0.12 - liftL, 0.3, 0.12, "#4e342e");
      box(0.02, torso, 0.18, h - 0.12 - liftR - torso, "#1e5bd8"); box(0.0, h - 0.12 - liftR, 0.3, 0.12, "#4e342e");
      box(-0.24, 0.42, 0.48, torso - 0.42, "#1e5bd8");
      box(-0.26, 0.42, 0.52, 0.12, "#e53935");
      if (torso > 0.66) { disc(-0.1, 0.62, 0.035, "#ffd54f"); disc(0.1, 0.62, 0.035, "#ffd54f"); }
      box(-0.36, backTop, 0.12, torso - backTop - 0.02, "#e53935");
      box(0.24, armTop, 0.12, torso - armTop - 0.02, "#e53935");
      disc(0.3, torso - 0.02, 0.05, "#ffcc80");
      box(-0.24, 0.14, 0.48, 0.28, "#ffcc80");
      box(0.22, 0.25, 0.06, 0.07, "#f0a060");
      box(0.02, 0.22, 0.07, 0.09, "#222");
      box(0.0, 0.33, 0.2, 0.04, "#4e342e");
      box(-0.28, 0.02, 0.56, 0.14, "#e53935");
      box(0.0, 0.12, 0.34, 0.05, "#b71c1c");
      g2.restore();
    }
    /* the art pictures: one request per name and frame; the callback keeps the last picture ready */
    function artFor(name) {
      if (typeof X.artImage !== "function") { if (X.problems.indexOf("platformer: art:" + name + " needs the art block") < 0) X.problems.push("platformer: art:" + name + " needs the art block"); return null; }
      if (Object.prototype.hasOwnProperty.call(frameArt, name)) return frameArt[name];
      if (!artCb[name]) artCb[name] = function (img) { artImg[name] = img || null; };
      X.artImage(name, artCb[name]);
      return (frameArt[name] = artImg[name] || null);
    }
    /* the canvas takes the width of its container: `view` cells across (less when the level is narrower, then centred);
     * when the level is too tall for 80 % of the window, the whole picture is made smaller and keeps its proportions.
     * Its pixels per cell follow the screen (x devicePixelRatio), never more than `tile` (the drawing's own resolution). */
    function fit() {
      var W = el.clientWidth;
      if (!W) return;
      var dpr = window.devicePixelRatio || 1;
      var cell = Math.max(4, Math.min(W / view, Math.max(120, window.innerHeight * 0.8) / VH));
      var key = [W, dpr, cell, VW, VH].join(",");
      if (key === fitKey) return;
      fitKey = key;
      var k = Math.min(cell, tile);
      canvas.style.width = VW * cell + "px"; canvas.style.height = VH * cell + "px";
      canvas.width = Math.round(VW * k * dpr); canvas.height = Math.round(VH * k * dpr);
      scale = k * dpr;
    }
    /* the top-left cell of the view: it follows the player, bounded by the level */
    function camera() {
      return {
        x: clamp(P.x + P.w / 2 - VW / 2, 0, Math.max(0, G.cols - VW)),
        y: G.rows > VH ? clamp(P.y + P.h / 2 - VH / 2, 0, G.rows - VH) : 0
      };
    }
    function draw() {
      frameArt = Object.create(null);
      fit();
      var camX = camera().x, camY = camera().y;
      g2.setTransform(1, 0, 0, 1, 0, 0);
      g2.clearRect(0, 0, canvas.width, canvas.height);
      if (sky) { g2.fillStyle = sky; g2.fillRect(0, 0, canvas.width, canvas.height); }
      g2.setTransform(scale, 0, 0, scale, -camX * scale, -camY * scale);
      var c0 = Math.max(0, Math.floor(camX)), c1 = Math.min(G.cols, Math.ceil(camX + VW));
      var r0 = Math.max(0, Math.floor(camY)), r1 = Math.min(G.rows, Math.ceil(camY + VH));
      /* scenery first (behind everything), then the level */
      for (var layer = 0; layer < 2; layer++)
        for (var r = r0; r < r1; r++) for (var c = c0; c < c1; c++) {
          var t = G.cells[r][c].role;
          if (t === "air" || (t === "scenery") !== (layer === 0)) continue;
          drawCell(c, r);
        }
      ents.forEach(function (e) { if (!e.dead) drawEnt(e); });
      if (!(P.invuln > 0 && Math.floor(P.invuln * 6) % 2 === 0)) paintPlayer();   /* blinks 3 times a second at most */
    }

    /* ---------- running: real time from the loop, or fixed steps from the test hook ---------- */
    function visible() { return el.offsetParent !== null; }
    function advance(dt) {
      acc += dt;
      while (acc >= FIX - 1e-9 && !X.isOver()) { tick(); acc -= FIX; }
      if (X.isOver()) acc = 0;
    }
    function me() {
      return { x: P.x + P.w / 2, y: P.y, feet: P.y + P.h, vx: P.vx, vy: P.vy, grounded: P.grounded, big: X.get("big"),
        invuln: P.invuln, col: Math.floor(P.x + P.w / 2), feetRow: Math.floor(P.y + P.h - EPS) };
    }
    X.loop(function (dt) {
      if (!visible()) return;
      clock += dt;
      if (!manual) advance(Math.min(dt, 0.25));
      draw();
    });
    window.addEventListener("keydown", function (e) {
      if (MAPPED[e.code] && !typing() && visible() && !X.isOver()) e.preventDefault();
    });
    /* test hook: manual stepping (fixed steps, no real time), keys held by code, a placed player */
    el.api = {
      step: function (dt) { manual = true; advance(dt); },
      press: function (code) { held[code] = true; },
      release: function (code) { held[code] = false; },
      auto: function () { manual = false; held = {}; },
      place: function (x, y) { P.x = x - P.w / 2; P.y = y; P.vx = 0; P.vy = 0; P.grounded = false; P.inside = {}; },
      me: me,
      tile: function (c, r) { return roleAt(c, r); },
      entities: function () { return ents.map(function (e) { return { kind: e.kind, name: e.name, x: e.x, y: e.y, dead: e.dead }; }); },
      /* what is under a point of the canvas (fx, fy: fractions of its width and height, as a click), camera included.
       * An entity wins over the tile it stands in; null outside the canvas or the level */
      at: function (fx, fy) {
        if (!(fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1)) return null;
        var cam = camera(), x = cam.x + fx * VW, y = cam.y + fy * VH;
        var col = Math.floor(x), row = Math.floor(y);
        if (x < 0 || y < 0 || col >= G.cols || row >= G.rows) return null;
        var hit = null;
        if (x >= P.x && x < P.x + P.w && y >= P.y && y < P.y + P.h)
          hit = { kind: "entity", name: "player", role: "player", char: (lvl.lines[lvl.start.r] || "").charAt(lvl.start.c), box: [P.x, P.y, P.w, P.h] };
        ents.forEach(function (e) {
          if (!hit && !e.dead && x >= e.x && x < e.x + e.w && y >= e.y && y < e.y + e.h)
            hit = { kind: "entity", name: e.name, role: e.def ? e.def.role : "", char: e.def && e.def.ch ? e.def.ch : "", box: [e.x, e.y, e.w, e.h] };
        });
        if (!hit) {
          var ch = lvl.lines[row].charAt(col), def = lvl.legend[ch] || null;
          hit = def ? { kind: "tile", name: def.name, role: def.role, char: ch } : { kind: "none", name: ch, role: "air", char: ch };
          hit.box = [col, row, 1, 1];
        }
        var bx = hit.box, fr = { x: (bx[0] - cam.x) / VW, y: (bx[1] - cam.y) / VH, w: bx[2] / VW, h: bx[3] / VH };
        return { col: col, row: row, char: hit.char, role: hit.role, name: hit.name, kind: hit.kind, box: fr };
      }
    };
  }

  X.define("platformer", class extends HTMLElement {
    connectedCallback() { mount(this); }
  });
})();
