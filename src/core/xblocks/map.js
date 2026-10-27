/* Map block: a world seen from above, one character per tile, drawn with DOM (see FICHES.md, "map").
 * Legend line: <char> <role> [look] [effects] [needs:...] ["words"] [still] [to:scene] [as:name] */
(function () {
  var ROLES = { wall: 1, floor: 1, player: 1, item: 1, enemy: 1, door: 1, exit: 1, npc: 1, trap: 1, switch: 1, warp: 1 };
  var GLYPHS = { player: "\u{1F9D9}", item: "⭐", enemy: "\u{1F47E}", door: "\u{1F6AA}", exit: "\u{1F3C1}", npc: "\u{1F9D1}", trap: "⚠️", switch: "\u{1F518}", warp: "\u{1F300}" };
  var KEYS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], a: [-1, 0], d: [1, 0], q: [-1, 0], w: [0, -1], z: [0, -1], s: [0, 1] };
  var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  var EFFECT = /^[A-Za-z_]\w*(?:\+\+|--|(?:\+=|-=|=)-?\d+(?:\.\d+)?|[+-]\d+(?:\.\d+)?)$/;
  var WANDER_EVERY = 0.65, STEP_GAP = 90;

  var STYLE = [
    ":where(x-map,game-map){display:block;position:relative}",
    ":where(.map-grid){position:relative;display:grid;transition:transform .15s ease-out}",
    ":where(.map-grid .tile){box-sizing:border-box;display:flex;align-items:center;justify-content:center;overflow:hidden;background:var(--c,#1b2230);font-size:calc(var(--tile,32px)*.72);line-height:1;color:#fff}",
    ":where(.map-grid .tile.floor){box-shadow:inset 0 0 0 1px #ffffff08}",
    ":where(.map-grid .tile.wall){background:var(--c,#4b5563)}",
    ":where(.map-grid .tile.item){background:var(--c,#f59e0b)}",
    ":where(.map-grid .tile.door){background:var(--c,#92400e)}",
    ":where(.map-grid .tile.exit){background:var(--c,#16a34a)}",
    ":where(.map-grid .tile.npc){background:var(--c,#7c3aed)}",
    ":where(.map-grid .tile.trap){background:var(--c,#7f1d1d)}",
    ":where(.map-grid .tile.switch){background:var(--c,#0e7490)}",
    ":where(.map-grid .tile.warp){background:var(--c,#4c1d95)}",
    ":where(.map-grid .entity){position:absolute;left:0;top:0;box-sizing:border-box;display:flex;align-items:center;justify-content:center;font-size:calc(var(--tile,32px)*.72);line-height:1;color:#fff;pointer-events:none;z-index:1;transition:transform .09s linear}",
    ":where(.map-grid .entity.player){background:var(--c,#2563eb)}",
    ":where(.map-grid .entity.enemy){background:var(--c,#dc2626)}"
  ].join("\n");
  if (!document.getElementById("x-map-style")) {
    var st = document.createElement("style"); st.id = "x-map-style"; st.textContent = STYLE; document.head.appendChild(st);
  }

  var maps = [], effectNames = [], lastMove = 0;

  function warn(msg) { if (X.problems.indexOf(msg) < 0) X.problems.push(msg); }
  function isBare(n) { return /^[A-Za-z_]\w*$/.test(n); }
  /* needs: a bare state name must be 1 or more; anything else is a test */
  function ok(need) { if (!need) return true; return isBare(need) ? X.get(need) >= 1 : X.test(need); }
  function say(text) { if (text) X.say(X.fill(text, null)); }
  function blocked() { return X.get("dialog_open") >= 1 || X.get("battle_open") >= 1 || !!X.isOver(); }
  function dialogExists(name) {
    return Array.prototype.some.call(document.querySelectorAll("x-dialog,game-dialog"), function (d) { return d.id === name; });
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  /* a look "art:name" draws the drawn object of the art block (one tile big) */
  function artName(look) { var m = /^art:(\S+)$/.exec(look || ""); return m ? m[1] : ""; }

  /* a legend line: "# wall gold+1 needs:key #c33 "words" as:door" */
  function parseLegend(text) {
    var legend = {};
    String(text || "").replace(/\r/g, "").split("\n").forEach(function (line) {
      var m = /^\s*(\S)\s+([A-Za-z]+)(.*)$/.exec(line); if (!m) return;
      var d = { role: m[2].toLowerCase(), as: "", look: "", color: "", fx: [], needs: "", says: "", still: false, to: "" };
      var rest = m[3].replace(/"([^"]*)"/, function (_, s) { d.says = s; return " "; });
      rest.split(/\s+/).filter(Boolean).forEach(function (t) {
        var nd = /^needs:(.+)$/.exec(t), to = /^to:(.+)$/.exec(t), as = /^as:(.+)$/.exec(t);
        if (nd) d.needs = nd[1];
        else if (to) d.to = to[1];
        else if (as) d.as = as[1];
        else if (t === "still") d.still = true;
        else if (EFFECT.test(t)) { d.fx.push(t); var n = /^[A-Za-z_]\w*/.exec(t)[0]; if (effectNames.indexOf(n) < 0) effectNames.push(n); }
        else if (/^#[0-9a-f]{3,8}$/i.test(t) || (/^[a-z]+$/i.test(t) && window.CSS && CSS.supports("color", t))) d.color = t;
        else if (!d.look) d.look = t;
        else warn("map legend: unknown word " + t);
      });
      if (!ROLES[d.role]) { warn("unknown map role: " + d.role); d.role = "floor"; }
      legend[m[1]] = d;
    });
    return legend;
  }

  function blank(ch) {
    return { ch: ch, role: "floor", as: "", look: "", color: "", fx: "", says: "", needs: "", to: "", still: false };
  }

  function World(el, index) {
    var legendEl = el.querySelector("x-legend,game-legend");
    var legend = parseLegend(legendEl ? legendEl.textContent : "");
    var raw = Array.prototype.map.call(el.childNodes, function (n) { return n === legendEl ? "" : n.textContent; }).join("");
    var rows = raw.replace(/\r/g, "").split("\n").map(function (r) { return r.replace(/\s+/g, ""); }).filter(function (r) { return r.trim(); });
    if (!rows.length) { warn("a map has no rows"); rows = ["."]; }
    var cut = Math.min.apply(null, rows.map(function (r) { return r.match(/^ */)[0].length; }));
    rows = rows.map(function (r) { return r.slice(cut); });
    var cols = Math.max.apply(null, rows.map(function (r) { return r.length; }));
    var tile = parseInt(el.getAttribute("tile"), 10) || 32;
    var id = el.getAttribute("name") || el.id || "map" + (index + 1);
    var view = /^\s*(\d+)\s*[x*]\s*(\d+)\s*$/i.exec(el.getAttribute("view") || ""), viewW = 0, viewH = 0;
    if (view) { viewW = parseInt(view[1], 10); viewH = parseInt(view[2], 10); }
    else if (el.hasAttribute("view")) warn("map view must look like 15x11: " + el.getAttribute("view"));

    var G = [], start = null, playerDef = {}, spawns = [], grid, cellEls = [], playerEl = null, enemies = [], me = { x: 0, y: 0 }, acc = 0;

    function cellOf(ch) {
      var d = legend[ch];
      if (!d) { if (ch !== " " && ch !== ".") warn('map character "' + ch + '" is not in the legend (it is floor)'); return blank(ch); }
      return { ch: ch, role: d.role, as: d.as, look: d.look, color: d.color, fx: d.fx.join(" "), says: d.says, needs: d.needs, to: d.to, still: d.still };
    }
    /* the map as it is at the start: a fresh copy of the rows, the player and enemies taken out of the cells */
    function layout() {
      var out = [], s = null, spawn = [];
      rows.forEach(function (r, y) {
        out.push([]);
        for (var x = 0; x < cols; x++) {
          var ch = x < r.length ? r[x] : " ", d = legend[ch];
          if (d && d.role === "player") {
            if (!s) { s = { x: x, y: y }; playerDef = d; } else warn("the map has more than one player: the others are floor");
            out[y].push(blank(ch));
          } else if (d && d.role === "enemy") { spawn.push({ x: x, y: y, cell: cellOf(ch) }); out[y].push(blank(ch)); }
          else out[y].push(cellOf(ch));
        }
      });
      if (!s) { warn("a map has no player: the player starts at its top left corner"); s = { x: 0, y: 0 }; }
      return { G: out, start: s, spawns: spawn };
    }

    /* the drawn page: one div per tile, moving things as absolutely placed divs over them */
    el.textContent = "";
    grid = document.createElement("div"); grid.className = "map-grid";
    grid.style.cssText = "grid-template-columns:repeat(" + cols + "," + tile + "px);grid-template-rows:repeat(" + rows.length + "," + tile + "px);width:" + cols * tile + "px;height:" + rows.length * tile + "px";
    grid.style.setProperty("--tile", tile + "px");
    el.appendChild(grid);
    for (var y = 0; y < rows.length; y++) {
      cellEls[y] = [];
      for (var x = 0; x < cols; x++) { var n = document.createElement("div"); grid.appendChild(n); cellEls[y].push(n); }
    }
    if (view) { el.style.width = viewW * tile + "px"; el.style.height = viewH * tile + "px"; el.style.overflow = "hidden"; }
    el.setAttribute("data-map", id);

    function paint(x, y) {
      var c = G[y][x], node = cellEls[y][x];
      var cls = "tile " + c.role + (c.as ? " " + c.as : "");
      if (node._cls !== cls) {
        (node._cls || "").split(" ").forEach(function (k) { if (k) node.classList.remove(k); });
        cls.split(" ").forEach(function (k) { if (k) node.classList.add(k); });
        node._cls = cls;
      }
      if (c.color) node.style.setProperty("--c", c.color); else node.style.removeProperty("--c");
      paintLook(node, c.look, GLYPHS[c.role] || "");
    }
    function paintAll() { for (var y = 0; y < G.length; y++) for (var x = 0; x < cols; x++) paint(x, y); }
    /* a new art version (an x-asset changed) redraws every object that shows art */
    function repaint() {
      paintAll();
      enemies.forEach(function (en) { paintLook(en.el, en.cell.look, GLYPHS.enemy); });
      if (playerEl) paintLook(playerEl, playerDef.look, GLYPHS.player);
    }
    function setCell(x, y, c) { G[y][x] = c; paint(x, y); }

    /* the glyph of a cell or entity: its look (emoji, or the drawn object of art:name), else the default glyph */
    function paintLook(node, look, fallback) {
      var art = artName(look);
      if (art && typeof X.artHtml !== "function") { warn("map: art:" + art + " needs the art block (load it before this one)"); art = ""; look = null; }
      var key = art ? "art:" + art + "@" + X.artVersion : (look || fallback || "");
      if (node._look === key) return;
      node._look = key;
      if (art) node.innerHTML = X.artHtml(art, tile + "x" + tile);
      else node.textContent = look || fallback || "";
    }
    function entity(kind, def) {
      var n = document.createElement("div");
      n.className = "entity " + kind + (def.as ? " " + def.as : "");
      paintLook(n, def.look, GLYPHS[kind]);
      if (def.color) n.style.setProperty("--c", def.color);
      n.style.width = tile + "px"; n.style.height = tile + "px";
      grid.appendChild(n);
      return n;
    }
    function place(node, x, y) { node.style.transform = "translate(" + x * tile + "px," + y * tile + "px)"; }
    function camera() {
      if (!view) return;
      var W = viewW * tile, H = viewH * tile;
      var ox = clamp(me.x * tile + tile / 2 - W / 2, 0, Math.max(0, cols * tile - W));
      var oy = clamp(me.y * tile + tile / 2 - H / 2, 0, Math.max(0, rows.length * tile - H));
      grid.style.transform = "translate(" + -ox + "px," + -oy + "px)";
    }
    function visible() { return el.offsetParent !== null; }
    function live() { return visible() && !blocked(); }
    function setPos() { X.set("player_x", me.x); X.set("player_y", me.y); }

    function enemyAt(x, y) {
      for (var i = 0; i < enemies.length; i++) if (enemies[i].x === x && enemies[i].y === y) return enemies[i];
      return null;
    }
    function free(x, y) {
      var c = G[y] && G[y][x];
      return !!c && c.role !== "wall" && c.role !== "door" && c.role !== "npc" && !enemyAt(x, y) && !(x === me.x && y === me.y);
    }
    function emit(name, node, who, x, y) { X.emit(name, { el: node, x: x, y: y, name: who, map: id }); }
    function ctxOf(node, c, x, y) { return { el: node, x: x, y: y, name: c.as || c.ch, map: id }; }

    /* an enemy meets the player (walked into, or walked onto them): its effects, its words, it is gone */
    function meet(en) {
      enemies.splice(enemies.indexOf(en), 1);
      emit("hit:enemy", en.el, en.cell.as || en.cell.ch, en.x, en.y);
      if (en.cell.fx) X.run(en.cell.fx, ctxOf(en.el, en.cell, en.x, en.y));
      say(en.cell.says);
      en.el.remove();
    }

    function move(x, y) {
      me = { x: x, y: y };
      place(playerEl, x, y); camera(); setPos();
      emit("step", playerEl, "player", x, y);
    }

    function dialogOrWords(c, node, x, y) {
      var who = c.as || c.ch;
      emit("talk:" + who, node, who, x, y);
      if (!dialogExists(who)) say(c.says);
      if (c.fx) X.run(c.fx, ctxOf(node, c, x, y));
    }

    function step(dx, dy) {
      if (!live()) return false;
      var x = me.x + dx, y = me.y + dy;
      if (y < 0 || y >= G.length || x < 0 || x >= cols) return false;
      var en = enemyAt(x, y);
      if (en) { meet(en); return true; }
      var c = G[y][x], node = cellEls[y][x], who = c.as || c.ch;
      if (c.role === "wall") return false;
      if (c.role === "npc") { dialogOrWords(c, node, x, y); return false; }
      if (c.role === "door") {
        if (!ok(c.needs)) { say(c.says || "It is locked."); return false; }
        if (isBare(c.needs)) X.add(c.needs, -1);
        setCell(x, y, blank(c.ch));
        if (c.fx) X.run(c.fx, ctxOf(node, c, x, y));
        move(x, y);
        emit("open:door", node, who, x, y);
        emit("enter:door", node, who, x, y);
        return true;
      }
      if (c.role === "exit") {
        if (!ok(c.needs)) { say(c.says || "It is locked."); return false; }
        move(x, y);
        emit("enter:exit", node, who, x, y);
        if (c.fx) X.run(c.fx, ctxOf(node, c, x, y));
        X.finish("win", c.says);
        return true;
      }
      move(x, y);
      emit("enter:" + c.role, node, who, x, y);
      if (c.fx) X.run(c.fx, ctxOf(node, c, x, y));
      say(c.says);
      if (c.role === "item") {
        emit("pickup:item", node, who, x, y);
        emit("pickup:" + who, node, who, x, y);
        setCell(x, y, blank(c.ch));
      } else if (c.role === "switch") {
        setCell(x, y, blank(c.ch));
      } else if (c.role === "warp") {
        if (c.to) X.go(c.to); else warn("warp without a scene: add to:<scene> on its legend line");
      }
      return true;
    }

    function wander() {
      enemies.slice().forEach(function (en) {
        if (en.cell.still || Math.random() < 0.4) return;
        var d = DIRS[Math.floor(Math.random() * 4)], nx = en.x + d[0], ny = en.y + d[1];
        if (nx === me.x && ny === me.y) { meet(en); return; }
        if (free(nx, ny)) { en.x = nx; en.y = ny; place(en.el, nx, ny); }
      });
    }

    function reset() {
      var L = layout();
      G = L.G; me = { x: L.start.x, y: L.start.y }; spawns = L.spawns;
      enemies.forEach(function (en) { en.el.remove(); });
      enemies = spawns.map(function (s) { return { x: s.x, y: s.y, cell: s.cell, el: entity("enemy", s.cell) }; });
      enemies.forEach(function (en) { place(en.el, en.x, en.y); });
      if (playerEl) playerEl.remove();
      playerEl = entity("player", playerDef);
      place(playerEl, me.x, me.y);
      paintAll(); camera(); acc = 0;
      if (visible()) setPos();
    }

    reset();
    el.api = {
      step: step,
      me: function () { return { x: me.x, y: me.y }; },
      grid: function () { return G; },
      entities: function () {
        return [{ kind: "player", x: me.x, y: me.y }].concat(enemies.map(function (e) { return { kind: "enemy", x: e.x, y: e.y }; }));
      }
    };
    return {
      id: id, el: el, step: step, reset: reset, repaint: repaint, visible: visible, blocked: blocked,
      tick: function (dt) {
        if (!visible() || X.isOver()) return;
        acc += dt;
        while (acc >= WANDER_EVERY) { acc -= WANDER_EVERY; wander(); }
      }
    };
  }

  function initKeys() {
    var all = X.all();
    effectNames.forEach(function (n) { if (all[n] === undefined) X.set(n, 0); });
  }

  /* one keyboard handler for every map: the first visible map answers */
  X.on("keydown", function (d) {
    var e = d.event, t = e && e.target, v = e && KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    if (!v || (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    var m = null;
    for (var i = 0; i < maps.length; i++) if (maps[i].visible()) { m = maps[i]; break; }
    if (!m) return;
    e.preventDefault();
    if (m.blocked()) return;
    var now = Date.now(); if (now - lastMove < STEP_GAP) return; lastMove = now;
    m.step(v[0], v[1]);
  });
  X.on("restart", function () { maps.forEach(function (m) { m.reset(); }); initKeys(); });
  var artSeen = 0;
  X.loop(function (dt) {
    if ((X.artVersion || 0) !== artSeen) { artSeen = X.artVersion || 0; maps.forEach(function (m) { m.repaint(); }); }
    maps.forEach(function (m) { m.tick(dt); });
  });

  X.define("map", class extends HTMLElement {});
  X.ready(function () {
    document.querySelectorAll("x-map,game-map").forEach(function (el, i) { maps.push(World(el, i)); });
    initKeys();
  });
})();
