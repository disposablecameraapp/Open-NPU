/* Battle block: turn-based fights (Pokemon-like). Plain browser script, uses only X and the DOM.
 * Fighters and moves are children of <x-battle>. Hit points live in the state as <key>_hp (key = id or name in
 * lower case), so the page can read them, show them in CSS (--<key>_hp) or change them with effects. */
(function () {
  var NORMAL = "normal";
  var FALLBACK = { name: "Lutte", power: 3, type: NORMAL, effect: "", start: Infinity, left: Infinity };
  var SPRITES = { you: "🙂", enemy: "👾" };
  var instances = [], current = null, types = {}, keysInUse = {}, styled = false;

  function make(tag, cls, s) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (s != null) e.textContent = s;
    return e;
  }
  function list(s) {
    return String(s || "").split(",").map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean);
  }
  function num(el, name, def, min) {
    var raw = el.getAttribute(name);
    if (raw == null || raw.trim() === "") return def;
    var v = parseFloat(raw);
    if (!isFinite(v)) { X.problems.push("battle: " + name + " is not a number: " + raw); return def; }
    return Math.max(min, v);
  }
  function slug(s) {
    var k = String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (!k) k = "fighter";
    if (!/^[a-z]/.test(k)) k = "f_" + k;
    return k;
  }

  /* ---------- reading the page ---------- */
  function readTypes() {
    types = {};
    document.querySelectorAll("x-type,game-type").forEach(function (el) {
      var n = (el.getAttribute("name") || "").trim().toLowerCase();
      if (n) types[n] = { strong: list(el.getAttribute("strong")), weak: list(el.getAttribute("weak")) };
    });
  }
  /* A type's list says which defenders its attacks hit hard (strong) or weakly (weak). */
  function effectiveness(attType, defType) {
    var t = types[attType];
    if (!t) return 1;
    if (t.strong.indexOf(defType) >= 0) return 2;
    if (t.weak.indexOf(defType) >= 0) return 0.5;
    return 1;
  }
  function fighter(el) {
    var side = (el.getAttribute("side") || "enemy").trim().toLowerCase();
    if (side !== "you" && side !== "enemy") { X.problems.push("battle: side must be you or enemy: " + side); side = "enemy"; }
    var name = el.getAttribute("name") || el.id || (side === "you" ? "Vous" : "Ennemi");
    var base = slug(el.id || name), key = base, n = 2;
    while (keysInUse[key]) key = base + "_" + n++;
    keysInUse[key] = true;
    var hp = num(el, "hp", 10, 1);
    var f = {
      key: key, name: name, side: side, sprite: el.getAttribute("sprite") || SPRITES[side],
      type: (el.getAttribute("type") || NORMAL).trim().toLowerCase(), max: hp,
      attack: num(el, "attack", 5, 0), defense: num(el, "defense", 5, 1), speed: num(el, "speed", 5, 0), moves: []
    };
    el._fighter = f;
    return f;
  }
  function move(el, f) {
    var uses = num(el, "uses", Infinity, 0);
    return {
      name: el.getAttribute("name") || "Attaque", power: num(el, "power", 5, 0),
      type: (el.getAttribute("type") || f.type).trim().toLowerCase(), effect: el.getAttribute("effect") || "",
      start: uses, left: uses
    };
  }
  function readFighters(host) {
    var out = [], cur = null;
    host.querySelectorAll("x-fighter,game-fighter,x-move,game-move").forEach(function (el) {
      if (/fighter$/.test(el.tagName.toLowerCase())) { cur = fighter(el); out.push(cur); return; }
      var holder = el.closest("x-fighter,game-fighter"), f = (holder && holder._fighter) || cur;
      if (!f) { X.problems.push("battle: a move is outside any fighter"); return; }
      f.moves.push(move(el, f));
    });
    return out;
  }

  /* ---------- hit points in the state ---------- */
  function hpOf(f) { return Math.max(0, X.get(f.key + "_hp")); }
  function alive(f) { return !!f && hpOf(f) > 0; }
  function setHp(f, v) { X.set(f.key + "_hp", Math.max(0, Math.min(f.max, v))); }
  /* Sets the maximum first, so X.set keeps the value in range. Full: every fighter; otherwise only the fallen ones. */
  function putStart(b, full) {
    b.fighters.forEach(function (f) {
      X.set(f.key + "_hp_max", f.max);
      if (full || hpOf(f) <= 0) X.set(f.key + "_hp", f.max);
    });
  }
  function resetMoves(b) { b.fighters.forEach(function (f) { f.moves.forEach(function (m) { m.left = m.start; }); }); }
  function pick(f) {
    var c = f.moves.filter(function (m) { return m.left > 0; });
    return c.length ? c[Math.floor(Math.random() * c.length)] : FALLBACK;
  }

  /* ---------- the panel ---------- */
  function log(b, s) { b.log.push(s); if (b.log.length > 60) b.log.shift(); }
  function build(b) {
    b.panel = make("div", "battle-ui");
    var box = make("div", "battle-box");
    b.field = make("div", "field");
    b.menu = make("div", "menu");
    b.logEl = make("div", "log");
    box.appendChild(b.field); box.appendChild(b.menu); box.appendChild(b.logEl);
    b.panel.appendChild(box);
    b.host.appendChild(b.panel);
  }
  function closePanel(b) { if (b.panel) { b.panel.remove(); b.panel = null; } }
  function card(b, f) {
    var hp = hpOf(f), pct = Math.round(100 * hp / f.max);
    var c = make("div", "fighter " + f.side + (hp <= 0 ? " ko" : "") + (b.lastHit === f.key ? " hit" : ""));
    c.setAttribute("data-key", f.key);
    c.appendChild(make("div", "sprite", f.sprite));
    var nm = make("div", "name", f.name);
    nm.appendChild(make("span", "type", f.type));
    c.appendChild(nm);
    var bar = make("div", "hp-bar"), fill = make("div", "hp-fill" + (pct <= 25 ? " low" : ""));
    fill.style.width = Math.max(0, pct) + "%";
    bar.appendChild(fill); c.appendChild(bar);
    c.appendChild(make("div", "hp-text", hp + " / " + f.max + " PV"));
    return c;
  }
  function usesText(m) { return m.left === Infinity ? "" : " (" + m.left + ")"; }
  /* The menu for the current mode, as { label, go | act, disabled }. */
  function items(b) {
    var out = [];
    if (b.mode === "main") {
      out.push({ label: "Combattre", go: "moves" });
      var yous = b.fighters.filter(function (f) { return f.side === "you" && alive(f); });
      if (yous.length >= 2) out.push({ label: "Changer", go: "switch" });
      out.push({ label: "Fuir", act: { kind: "flee" } });
    } else if (b.mode === "moves") {
      var ms = b.you.moves.slice();
      if (!ms.some(function (m) { return m.left > 0; })) ms.push(FALLBACK);
      ms.forEach(function (m) {
        out.push({ label: m.name + (m === FALLBACK ? "" : usesText(m)), act: { kind: "move", move: m }, disabled: m.left <= 0 });
      });
      out.push({ label: "Retour", go: "main" });
    } else if (b.mode === "switch") {
      b.fighters.forEach(function (f) {
        if (f.side === "you" && f !== b.you && alive(f)) out.push({ label: f.name + " (" + hpOf(f) + "/" + f.max + ")", act: { kind: "switch", f: f } });
      });
      if (!b.forced) out.push({ label: "Retour", go: "main" });
    }
    return out;
  }
  function render(b) {
    if (!b.panel || !b.active) return;
    b.field.textContent = "";
    b.field.appendChild(card(b, b.enemy));
    b.field.appendChild(card(b, b.you));
    b.lastHit = null;
    b.menu.textContent = "";
    var its = items(b);
    if (b.cursor >= its.length) b.cursor = 0;
    its.forEach(function (it, i) {
      var btn = make("button", i === b.cursor ? "sel" : "", it.label);
      btn.type = "button";
      btn.setAttribute("data-index", i);
      if (it.disabled) btn.disabled = true;
      btn.addEventListener("click", function () { choose(b, i); });
      b.menu.appendChild(btn);
    });
    b.logEl.textContent = "";
    b.log.slice(-4).forEach(function (l) { b.logEl.appendChild(make("div", "line", l)); });
  }

  /* ---------- the fight ---------- */
  function strike(b, att, def, mv) {
    if (mv.left !== Infinity) mv.left--;
    var eff = effectiveness(mv.type, def.type);
    log(b, att.name + " utilise " + mv.name + ".");
    if (mv.power > 0) {
      var roll = 0.85 + 0.15 * Math.random();
      var dmg = Math.max(1, Math.round(mv.power * att.attack / Math.max(1, def.defense) * roll * eff));
      setHp(def, hpOf(def) - dmg);
      log(b, def.name + " perd " + dmg + " PV.");
      if (eff > 1) log(b, "C'est tres efficace !");
      else if (eff < 1) log(b, "Ce n'est pas tres efficace.");
      b.lastHit = def.key;
      X.emit("hit:" + def.key, { el: b.host, damage: dmg });
      if (!alive(def)) { log(b, def.name + " est K.O. !"); X.emit("ko:" + def.key, { el: b.host }); }
    }
    if (mv.effect) X.run(mv.effect, { el: b.host });
  }
  function enemyAttack(b) {
    if (alive(b.enemy) && alive(b.you)) strike(b, b.enemy, b.you, pick(b.enemy));
  }
  /* Fainted fighters are replaced; the battle ends when a side has no one left. */
  function afterTurn(b) {
    if (b.done) return;
    if (!alive(b.enemy)) {
      var next = b.fighters.filter(function (f) { return f.side === "enemy" && alive(f); })[0];
      if (!next) return finish(b, "won");
      b.enemy = next;
      log(b, next.name + " entre en scene !");
    }
    if (!alive(b.you)) {
      if (!b.fighters.some(function (f) { return f.side === "you" && alive(f); })) return finish(b, "lost");
      b.mode = "switch"; b.forced = true;
      log(b, "Choisissez le combattant suivant.");
    } else {
      b.mode = "main"; b.forced = false;
    }
    b.cursor = 0;
  }
  function turn(b, act) {
    var me = b.you, en = b.enemy;
    if (act.kind === "flee") {
      var chance = Math.min(0.95, Math.max(0.1, 0.5 * me.speed / Math.max(1, en.speed)));
      if (Math.random() < chance) { log(b, "Vous prenez la fuite !"); return finish(b, "fled"); }
      log(b, "Impossible de fuir !");
      enemyAttack(b);
    } else if (act.kind === "switch") {
      b.you = act.f;
      log(b, "Go, " + act.f.name + " !");
      enemyAttack(b);
    } else {
      /* the faster one acts first; ties go to the player; a fainted fighter does not act */
      var order = en.speed > me.speed ? ["enemy", "you"] : ["you", "enemy"];
      order.forEach(function (side) {
        var att = side === "you" ? b.you : b.enemy, def = side === "you" ? b.enemy : b.you;
        if (alive(att) && alive(def)) strike(b, att, def, side === "you" ? act.move : pick(att));
      });
    }
    afterTurn(b);
  }
  function choose(b, i) {
    if (!b.active || b.done || X.isOver()) return;
    var it = items(b)[i];
    if (!it || it.disabled) return;
    b.cursor = 0;
    if (it.go) { b.mode = it.go; render(b); return; }
    turn(b, it.act);
    render(b);
  }
  function start(b) {
    if (b.active || X.isOver() || (current && current !== b)) return;
    readTypes();
    putStart(b, false);
    resetMoves(b);
    b.you = b.fighters.filter(function (f) { return f.side === "you"; })[0];
    b.enemy = b.fighters.filter(function (f) { return f.side === "enemy"; })[0];
    if (!b.you || !b.enemy) { X.problems.push("battle " + b.id + ": needs a you fighter and an enemy"); return; }
    b.active = true; b.done = false; b.mode = "main"; b.forced = false; b.cursor = 0; b.log = [];
    current = b;
    X.set("battle_open", 1);
    X.set("battle_result", "");
    log(b, "Un combat commence !");
    log(b, b.enemy.name + " apparait !");
    build(b);
    render(b);
  }
  function finish(b, result) {
    b.done = true; b.active = false; b.mode = "main"; b.forced = false;
    closePanel(b);
    if (current === b) current = null;
    X.set("battle_result", result);
    X.set("battle_open", 0);
    X.emit("battle:" + result + ":" + b.id, { el: b.host });
    var fx = result === "won" ? b.onWin : result === "lost" ? b.onLose : b.onFlee;
    if (fx) X.run(fx, { el: b.host });
  }

  /* ---------- keys: only while the panel is shown ---------- */
  function onKey(d) {
    var b = current, e = d.event;
    if (!b || !b.active || X.isOver() || !e) return;
    if (!b.panel || !b.panel.getClientRects().length) return;
    var t = e.target; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    var its = items(b), n = its.length, k = e.key;
    if (!n) return;
    if (k === "ArrowUp" || k === "ArrowDown") {
      e.preventDefault();
      var step = k === "ArrowDown" ? 1 : -1;
      for (var s = 1; s <= n; s++) {
        var c = (b.cursor + step * s + n * 2) % n;
        if (!its[c].disabled) { b.cursor = c; break; }
      }
      render(b);
    } else if (k === "Enter" || k === " " || k === "Spacebar") {
      e.preventDefault(); choose(b, b.cursor);
    } else if (/^[1-9]$/.test(k)) {
      e.preventDefault(); choose(b, parseInt(k, 10) - 1);
    } else if ((k === "Escape" || k === "Backspace") && b.mode !== "main" && !b.forced) {
      e.preventDefault(); b.mode = "main"; b.cursor = 0; render(b);
    }
  }
  function onRestart() {
    instances.forEach(function (b) {
      if (current === b) current = null;
      b.active = false; b.done = true; b.mode = "main"; b.forced = false; b.log = []; b.lastHit = null;
      closePanel(b);
      putStart(b, true);
      resetMoves(b);
    });
  }
  X.on("keydown", onKey);
  X.on("restart", onRestart);

  function injectStyle() {
    if (styled || document.getElementById("x-battle-style")) return;
    styled = true;
    var s = make("style");
    s.id = "x-battle-style";
    s.textContent = [
      ":where(x-fighter,game-fighter,x-move,game-move,x-type,game-type){display:none}",
      ":where(.battle-ui){position:fixed;inset:0;z-index:45;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6);font:14px system-ui,sans-serif;color:#f4f4f4}",
      ":where(.battle-box){width:min(560px,94vw);display:grid;gap:10px;padding:14px;border-radius:12px;background:#1d2230;box-shadow:0 10px 30px #000a}",
      ":where(.field){display:grid;grid-template-columns:1fr 1fr;gap:10px}",
      ":where(.fighter){display:grid;gap:4px;justify-items:start;padding:10px;border-radius:10px;background:#2a3142}",
      ":where(.fighter.you){box-shadow:inset 0 -3px 0 #4f8cff}",
      ":where(.fighter.enemy){box-shadow:inset 0 -3px 0 #e05555}",
      ":where(.fighter.ko){opacity:.4}",
      ":where(.fighter.hit){animation:x-battle-hit .35s}",
      "@keyframes x-battle-hit{0%,100%{transform:none}30%{transform:translateX(-6px)}60%{transform:translateX(5px)}}",
      "@media (prefers-reduced-motion: reduce){:where(.fighter.hit){animation:none}}",
      ":where(.sprite){font-size:34px;line-height:1.1}",
      ":where(.name){font-weight:700}",
      ":where(.type){margin-left:6px;font-size:11px;font-weight:400;opacity:.7;text-transform:uppercase}",
      ":where(.hp-bar){width:100%;height:8px;border-radius:4px;background:#000;overflow:hidden}",
      ":where(.hp-fill){height:100%;background:#4caf50;transition:width .3s}",
      ":where(.hp-fill.low){background:#e05555}",
      ":where(.hp-text){font-size:12px;opacity:.85}",
      ":where(.menu){display:grid;grid-template-columns:1fr 1fr;gap:6px}",
      ":where(.menu button){padding:9px;border:0;border-radius:8px;background:#3a4460;color:inherit;font:inherit;cursor:pointer;text-align:left}",
      ":where(.menu button.sel){outline:2px solid #ffd54f}",
      ":where(.menu button:disabled){opacity:.4;cursor:default}",
      ":where(.log){min-height:4.2em;padding:8px;border-radius:8px;background:#000;font:13px/1.45 ui-monospace,monospace}"
    ].join("\n");
    document.head.appendChild(s);
  }

  X.define("battle", class extends HTMLElement {
    connectedCallback() {
      if (this._b) return;
      injectStyle();
      var b = {
        host: this, id: this.getAttribute("id") || "battle", fighters: [], you: null, enemy: null,
        active: false, done: false, mode: "main", forced: false, cursor: 0, log: [], lastHit: null,
        panel: null, field: null, menu: null, logEl: null,
        onWin: this.getAttribute("on-win"), onLose: this.getAttribute("on-lose"), onFlee: this.getAttribute("on-flee")
      };
      this._b = b;
      b.fighters = readFighters(this);
      if (!b.fighters.length) X.problems.push("battle " + b.id + ": no fighter");
      instances.push(b);
      putStart(b, false);
      resetMoves(b);
      X.on("battle:" + b.id, function () { start(b); });
      this.api = {
        start: function () { start(b); },
        choose: function (i) { choose(b, i); },
        state: function () {
          return {
            open: b.active, result: X.get("battle_result"), mode: b.mode,
            menu: items(b).map(function (it) { return it.label; }),
            fighters: b.fighters.map(function (f) {
              return { key: f.key, name: f.name, side: f.side, hp: hpOf(f), max: f.max, active: f === b.you || f === b.enemy };
            }),
            log: b.log.slice()
          };
        }
      };
    }
  });
})();
