/* Platformer block: a side-view level read from a legend and ASCII rows, simulated on a fixed step (1/120 s)
 * and drawn on a canvas. Units are cells (one tile = 1, y grows downward). Boxes are given by their top-left corner;
 * the state player_x / player_y is the centre x and the top y of the player.
 * Roles: ground, brick, block, platform, player, coin, walker, flyer, spike, flag, spring, checkpoint (a flag that saves
 * the respawn point and applies its effects once per visit).
 * Legend effects: a plain effect token is the coin / block / flag effect, or for an enemy the effect of contact that hurts.
 * `stomp:<effects>` (no spaces) is applied when an enemy is stomped (none otherwise); `hurt:<effects>` overrides the plain one for contact. */
(function () {
  var FIX = 1 / 120, EPS = 1e-6, MAXFALL = 30, COYOTE = 0.1, BUFFER = 0.1, INVULN = 1, VIEW_H = 10, SKY = "#bfe6ff";
  var ROLES = { ground: 1, brick: 1, block: 1, platform: 1, player: 1, coin: 1, walker: 1, flyer: 1, spike: 1, flag: 1, spring: 1, checkpoint: 1 };
  /* solid from every side; a used block stays solid. A platform is one-way (see topSolid). */
  var SOLID = { ground: 1, brick: 1, block: 1, used: 1, spring: 1 };
  var COLOR = { ground: "#8d5a2b", brick: "#b5562c", block: "#f4c542", used: "#9e9e9e", platform: "#a0743a", spring: "#e53935",
    spike: "#90a4ae", coin: "#ffd54f", flag: "#2e7d32", checkpoint: "#42a5f5", player: "#e53935", walker: "#8e44ad", flyer: "#1e88e5" };
  var KEYS = { left: ["ArrowLeft", "KeyA", "KeyQ"], right: ["ArrowRight", "KeyD"], jump: ["ArrowUp", "KeyW", "KeyZ", "Space"], run: ["ShiftLeft", "ShiftRight"] };
  var MAPPED = {};
  Object.keys(KEYS).forEach(function (k) { KEYS[k].forEach(function (c) { MAPPED[c] = true; }); });
  var EFFECT = /^[A-Za-z_][\w.]*(\+\+|--|[+-]=|=|[+-]\d)|^(say|emit|go):/;
  var TOKEN = /[A-Za-z_]\w*:"[^"]*"|"[^"]*"|\S+/g;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function isEmoji(s) { return /[^\x00-\x7F]/.test(s); }
  function typing() { var a = document.activeElement; return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName); }
  function gateOk(def) { return !def || !def.needs || X.test(def.needs); }
  function ctxOf(el, c, r, def) { return { el: el, x: c, y: r, name: def ? def.name : "" }; }
  function say(def) { if (def && def.text) X.say(def.text); }
  function overlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  function sideSolid(t) { return !!SOLID[t] || t === "wall"; }
  function topSolid(t) { return !!SOLID[t] || t === "platform"; }

  /* legend: <car> <rôle> [apparence] [effets] [needs:cond] ["paroles"] [still] [to:scène] [as:nom] */
  function parseLegend(text, problems) {
    var out = {};
    String(text).split(/\r?\n/).forEach(function (raw) {
      var line = raw.replace(/^\s+/, "");
      if (!line) return;
      var ch = line.charAt(0), toks = line.slice(1).match(TOKEN) || [];
      if (!toks.length) { problems.push("platformer: legend line without a role: " + line); return; }
      var role = toks.shift();
      if (!ROLES[role]) { problems.push("platformer: unknown role '" + role + "' for '" + ch + "'"); role = "air"; }
      var def = { role: role, name: ch, look: null, effects: "", stomp: null, hurt: null, needs: null, text: null, still: false, as: null }, fx = [];
      toks.forEach(function (t) {
        if (t.charAt(0) === '"') def.text = t.slice(1, -1);
        else if (t === "still") def.still = true;
        else if (t.indexOf("as:") === 0) { def.as = t.slice(3); def.name = def.as; }
        else if (t.indexOf("needs:") === 0) def.needs = t.slice(6);
        else if (t.indexOf("stomp:") === 0) def.stomp = t.slice(6);
        else if (t.indexOf("hurt:") === 0) def.hurt = t.slice(5);
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
        ":where(x-platformer canvas,game-platformer canvas){display:block;max-width:100%;height:auto;image-rendering:pixelated}";
      document.head.appendChild(st);
    }
    function num(name, dflt, min) {
      var raw = el.getAttribute(name);
      if (raw == null || raw === "") return dflt;
      var v = parseFloat(raw);
      if (!(v >= min)) { X.problems.push("platformer: " + name + " must be a number of at least " + min); return dflt; }
      return v;
    }
    var tile = Math.round(num("tile", 32, 4)), view = Math.round(num("view", 16, 2));
    var gravity = num("gravity", 40, 1), jump = num("jump", 14, 1), speed = num("speed", 7, 0.5), runMul = num("run", 1.6, 1);
    var fallFx = el.hasAttribute("fall") ? el.getAttribute("fall") : "lives-=1";
    var lvl = readLevel(el, X.problems);
    var VW = Math.min(lvl.cols, view), VH = Math.min(lvl.rows, VIEW_H);
    var canvas = document.createElement("canvas");
    canvas.width = VW * tile; canvas.height = VH * tile;
    el.appendChild(canvas);
    var g2 = canvas.getContext("2d");
    var G = null, ents = [], P = null, held = {}, manual = false, acc = 0;

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
        dir: kind === "walker" ? -1 : 1, speed: kind === "walker" ? 2 : 1.5, vy: 0, t: 0, grounded: false, dead: false, still: def.still };
    }
    function newPlayer() {
      var c = lvl.start.c, r = lvl.start.r;
      return { x: c + 0.1, y: r, w: 0.8, h: 1, vx: 0, vy: 0, face: 1, grounded: false, coyote: 0, jumpBuf: 0, jumpWas: false,
        invuln: 0, inside: {}, prevBottom: r + 1, spawn: { x: c + 0.1, y: r } };
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
    function boxSolid(b) {
      for (var r = Math.floor(b.y + EPS); r <= Math.floor(b.y + b.h - EPS); r++)
        for (var c = Math.floor(b.x + EPS); c <= Math.floor(b.x + b.w - EPS); c++) if (SOLID[roleAt(c, r)]) return true;
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
      var was = P.grounded;
      var dir = (I.right ? 1 : 0) - (I.left ? 1 : 0);
      var maxV = speed * (I.run ? runMul : 1);
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
      /* a short hop: letting go of the jump while rising doubles gravity */
      P.vy = Math.min(MAXFALL, P.vy + gravity * (P.vy < 0 && !I.jump ? 2.5 : 1) * FIX);
      P.prevBottom = P.y + P.h;
      if (moveX(P, P.vx * FIX)) P.vx = 0;
      var res = moveY(P, P.vy * FIX);
      P.grounded = !!res.landed;
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

    /* walkers turn at a wall or a ledge, flyers at a wall and bob up and down */
    function tickEnts() {
      ents.forEach(function (e) {
        if (e.dead || e.still) return;
        if (e.kind === "flyer") { e.t += FIX; e.y = e.base + Math.sin(e.t * 3) * 0.5; }
        if (moveX(e, e.dir * e.speed * FIX)) e.dir = -e.dir;
        if (e.kind !== "walker") return;
        e.vy = Math.min(MAXFALL, e.vy + gravity * FIX);
        var res = moveY(e, e.vy * FIX);
        e.grounded = !!res.landed;
        if (e.grounded) {
          var fc = e.dir > 0 ? Math.floor(e.x + e.w - EPS) : Math.floor(e.x + EPS);
          if (!topSolid(roleAt(fc, Math.floor(e.y + e.h - EPS) + 1))) e.dir = -e.dir;
        }
        if (e.y > lvl.rows + 2) e.dead = true;
      });
    }
    /* falling onto an enemy from above (the feet were above its top) stomps it; any other contact hurts */
    function touchEnts() {
      ents.forEach(function (e) {
        if (e.dead || X.isOver() || !overlap(P, e)) return;
        var c = Math.floor(e.x + 0.4), r = Math.floor(e.y + 0.4), ctx = ctxOf(el, c, r, e.def);
        if (P.vy > 0 && P.prevBottom <= e.y + 0.35) {
          e.dead = true;
          if (e.def && e.def.stomp) X.run(e.def.stomp, ctx);
          say(e.def);
          X.emit("stomp:" + e.name, ctx);
          P.vy = -jump * 0.6; P.grounded = false;
        } else hurt(e.def, c, r);
      });
    }

    /* ---------- drawing ---------- */
    function drawText(text, x, y, color, size, bold) {
      g2.fillStyle = color;
      g2.font = (bold ? "bold " : "") + size + "px system-ui, sans-serif";
      g2.textAlign = "center"; g2.textBaseline = "middle";
      g2.fillText(text, x, y);
    }
    function drawCell(c, r) {
      var cell = G.cells[r][c], t = cell.role, look = cell.def && cell.def.look;
      if (look && isEmoji(look)) return drawText(look, c + 0.5, r + 0.55, "#000", 0.8, false);
      var col = look || COLOR[t];
      g2.fillStyle = col;
      if (t === "ground") {
        g2.fillRect(c, r, 1, 1);
        if (!SOLID[roleAt(c, r - 1)]) { g2.fillStyle = "#4caf50"; g2.fillRect(c, r, 1, 0.15); }
      } else if (t === "brick") {
        g2.fillRect(c, r, 1, 1);
        g2.strokeStyle = "rgba(0,0,0,0.3)"; g2.lineWidth = 0.05;
        g2.beginPath(); g2.moveTo(c, r + 0.5); g2.lineTo(c + 1, r + 0.5); g2.moveTo(c + 0.5, r); g2.lineTo(c + 0.5, r + 0.5); g2.stroke();
      } else if (t === "block" || t === "used") {
        g2.fillRect(c, r, 1, 1);
        if (t === "block") drawText("?", c + 0.5, r + 0.55, "#7a4a00", 0.7, true);
      } else if (t === "platform") {
        g2.fillRect(c, r, 1, 0.25);
      } else if (t === "spring") {
        g2.fillRect(c, r + 0.45, 1, 0.55);
        g2.fillStyle = "#fff"; g2.fillRect(c + 0.2, r + 0.6, 0.6, 0.08); g2.fillRect(c + 0.2, r + 0.8, 0.6, 0.08);
      } else if (t === "spike") {
        g2.beginPath();
        for (var i = 0; i < 3; i++) { g2.moveTo(c + i / 3, r + 1); g2.lineTo(c + (i + 0.5) / 3, r + 0.1); g2.lineTo(c + (i + 1) / 3, r + 1); }
        g2.fill();
      } else if (t === "coin") {
        g2.beginPath(); g2.arc(c + 0.5, r + 0.5, 0.32, 0, Math.PI * 2); g2.fill();
      } else if (t === "flag" || t === "checkpoint") {
        g2.fillStyle = "#616161"; g2.fillRect(c + 0.45, r, 0.08, 1);
        g2.fillStyle = col; g2.beginPath();
        g2.moveTo(c + 0.53, r + 0.1); g2.lineTo(c + 0.95, r + 0.3); g2.lineTo(c + 0.53, r + 0.5); g2.fill();
      }
    }
    function drawEnt(e) {
      var look = e.def && e.def.look;
      if (look && isEmoji(look)) return drawText(look, e.x + 0.4, e.y + 0.45, "#000", 0.8, false);
      g2.fillStyle = look || COLOR[e.kind];
      if (e.kind === "walker") {
        g2.fillRect(e.x, e.y + 0.2, e.w, e.h - 0.2);
        g2.fillStyle = "#fff"; g2.beginPath();
        g2.arc(e.x + 0.27, e.y + 0.4, 0.1, 0, Math.PI * 2); g2.arc(e.x + 0.53, e.y + 0.4, 0.1, 0, Math.PI * 2);
        g2.fill();
      } else {
        g2.beginPath(); g2.ellipse(e.x + 0.4, e.y + 0.4, 0.4, 0.28, 0, 0, Math.PI * 2); g2.fill();
      }
    }
    function drawPlayer() {
      g2.fillStyle = COLOR.player; g2.fillRect(P.x, P.y, P.w, P.h);
      g2.fillStyle = "#ffcc80"; g2.fillRect(P.x + 0.1, P.y + 0.08, P.w - 0.2, 0.3);
      g2.fillStyle = "#000"; g2.fillRect(P.face > 0 ? P.x + 0.5 : P.x + 0.2, P.y + 0.18, 0.1, 0.1);
    }
    function draw() {
      var camX = clamp(P.x + P.w / 2 - VW / 2, 0, Math.max(0, G.cols - VW));
      var camY = G.rows > VH ? clamp(P.y + P.h / 2 - VH / 2, 0, G.rows - VH) : 0;
      g2.setTransform(1, 0, 0, 1, 0, 0);
      g2.fillStyle = SKY; g2.fillRect(0, 0, canvas.width, canvas.height);
      g2.setTransform(tile, 0, 0, tile, -camX * tile, -camY * tile);
      var c0 = Math.max(0, Math.floor(camX)), c1 = Math.min(G.cols, Math.ceil(camX + VW));
      var r0 = Math.max(0, Math.floor(camY)), r1 = Math.min(G.rows, Math.ceil(camY + VH));
      for (var r = r0; r < r1; r++) for (var c = c0; c < c1; c++) if (G.cells[r][c].role !== "air") drawCell(c, r);
      ents.forEach(function (e) { if (!e.dead) drawEnt(e); });
      if (!(P.invuln > 0 && Math.floor(P.invuln * 10) % 2 === 0)) drawPlayer();
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
      entities: function () { return ents.map(function (e) { return { kind: e.kind, name: e.name, x: e.x, y: e.y, dead: e.dead }; }); }
    };
  }

  X.define("platformer", class extends HTMLElement {
    connectedCallback() { mount(this); }
  });
})();
