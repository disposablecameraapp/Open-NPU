/* Core of the blocks (plain browser script, no modules). Every block file uses only the `X` object defined here.
 * State is the only bridge between the logic (blocks) and the page (HTML and CSS):
 *   - numbers become CSS variables and data- attributes on <body> (--hp, data-hp), texts become data- attributes
 *   - data-when / data-click / data-key / data-bind and <x-value> <x-list> read and write the state
 * Tags use the prefix x- (game- is accepted as an alias). */
(function () {
  var S = {}, initial = {}, dirty = {}, flushing = false, handlers = [], changeHandlers = [], defs = [], booted = false, rules = [], loops = [], sceneNow = null, over = null, problems = [];
  var X = window.X = { problems: problems, keys: {}, version: 1 };
  /* a block is a box, a scene that is hidden stays hidden, the pieces that only carry data show nothing; :where keeps the author's CSS stronger */
  var base = document.createElement("style"); base.id = "x-base";
  base.textContent = ":where(x-scene,x-map,x-platformer,x-battle,x-list,game-scene,game-map,game-list){display:block}x-scene[hidden],game-scene[hidden]{display:none!important}:where(x-state,x-rule,x-legend,game-state,game-rule,game-legend){display:none}";
  (document.head || document.documentElement).appendChild(base);

  /* ---------- state ---------- */
  function getPath(path) {
    var parts = String(path).split("."), v = S[parts[0]];
    for (var i = 1; i < parts.length && v != null; i++) v = parts[i] === "length" && v.length != null ? v.length : v[parts[i]];
    return v;
  }
  function setPath(path, value) {
    var parts = String(path).split(".");
    if (parts.length === 1) { if (S[parts[0]] === value) return; S[parts[0]] = value; mark(parts[0]); return; }
    var o = S[parts[0]]; if (o == null) return;
    for (var i = 1; i < parts.length - 1 && o != null; i++) o = o[parts[i]];
    if (o == null) return;
    o[parts[parts.length - 1]] = value; mark(parts[0]);
  }
  function mark(name) { dirty[name] = true; if (!flushing) { flushing = true; Promise.resolve().then(flush); } }
  function clamp(name, v) {
    var max = S[name + "_max"], min = S[name + "_min"];
    if (typeof v === "number") { if (typeof max === "number" && v > max) v = max; if (typeof min === "number" && v < min) v = min; }
    return v;
  }
  X.get = function (path) { var v = getPath(path); return v === undefined ? 0 : v; };
  X.set = function (path, value) { if (path.indexOf(".") < 0) value = clamp(path, value); setPath(path, value); };
  X.add = function (path, d) { var v = getPath(path); X.set(path, (typeof v === "number" ? v : 0) + d); };
  X.all = function () { return S; };
  X.onChange = function (name, fn) { var h = { name: name, fn: fn }; changeHandlers.push(h); return function () { var i = changeHandlers.indexOf(h); if (i >= 0) changeHandlers.splice(i, 1); }; };

  function flush() {
    flushing = false;
    var names = Object.keys(dirty); dirty = {};
    names.forEach(function (n) {
      var v = S[n], b = document.body;
      if (b && /^[a-z][a-z0-9_]*$/.test(n) && (typeof v === "number" || typeof v === "string" || typeof v === "boolean")) {
        b.setAttribute("data-" + n, String(v));
        if (typeof v === "number") b.style.setProperty("--" + n, String(v));
      }
      changeHandlers.forEach(function (h) { if (h.name === n || h.name === "*") try { h.fn(n, v); } catch (e) { problems.push(String(e)); } });
      X.emit("change:" + n, { value: v });
    });
    render(); checkRules();
  }

  /* ---------- conditions: a tiny, safe expression reader (no eval) ---------- */
  function tokens(src) {
    var out = [], re = /\s*(&&|\|\||==|!=|>=|<=|>|<|!|\(|\)|-?\d+(?:\.\d+)?|"[^"]*"|'[^']*'|[A-Za-z_][\w.]*)/g, m, last = 0;
    while ((m = re.exec(src)) && m.index === last) { out.push(m[1]); last = re.lastIndex; }
    return last === String(src).replace(/\s+$/, "").length || /^\s*$/.test(String(src).slice(last)) ? out : null;
  }
  function value(tok) {
    if (/^-?\d/.test(tok)) return parseFloat(tok);
    if (/^["']/.test(tok)) return tok.slice(1, -1);
    if (tok === "true") return true; if (tok === "false") return false;
    return X.get(tok);
  }
  X.test = function (src) {
    if (src == null || !String(src).trim()) return true;
    var t = tokens(src); if (!t) { problems.push("cannot read the condition: " + src); return false; }
    var i = 0;
    function atom() {
      var k = t[i++];
      if (k === "!") return !atom();
      if (k === "(") { var v = or(); i++; return v; }
      var a = value(k), op = t[i];
      if (/^(==|!=|>=|<=|>|<)$/.test(op)) { i++; var b = value(t[i++]); switch (op) { case "==": return a == b; case "!=": return a != b; case ">=": return a >= b; case "<=": return a <= b; case ">": return a > b; default: return a < b; } }
      return !!a;
    }
    function and() { var v = atom(); while (t[i] === "&&") { i++; var r = atom(); v = v && r; } return v; }
    function or() { var v = and(); while (t[i] === "||") { i++; var r = and(); v = v || r; } return v; }
    try { var r = !!or(); if (i < t.length) { problems.push("cannot read the condition: " + src); return false; } return r; } catch (e) { problems.push(String(e)); return false; }
  };

  /* ---------- effects: gold += 1, hp-=1, gold+1, hp++, name = "Ana", say:"text", go:town, emit:event, restart, win, lose ---------- */
  var ACTIONS = { say: 1, go: 1, emit: 1, toggle: 1, add: 1, remove: 1 }, BARE = { restart: 1, win: 1, lose: 1 };
  function literal(tok) {
    if (tok == null) return 0;
    if (/^-?\d+(\.\d+)?$/.test(tok)) return parseFloat(tok);
    if (/^["']/.test(tok)) return tok.slice(1, -1);
    if (tok === "true") return true; if (tok === "false") return false;
    if (/^[A-Za-z_][\w.]*$/.test(tok) && getPath(tok) !== undefined) return getPath(tok);
    return tok;
  }
  function objectOf(src) {
    var o = {}, re = /([A-Za-z_]\w*)\s*:\s*("[^"]*"|'[^']*'|[^,}]+)/g, m;
    while ((m = re.exec(src))) o[m[1]] = literal(m[2].trim());
    return o;
  }
  X.run = function (src, ctx) {
    if (src == null) return;
    var s = X.fill(String(src), ctx);
    var re = /\s*(?:([A-Za-z_][\w.]*)\s*(?::\s*([^\s;{]+\s*\{[^}]*\}|\{[^}]*\}|"[^"]*"|'[^']*'|[\w.]+\s+\d+(?=\s|;|$)|[^\s;]+)|(\+\+|--)|(\+=|-=|=|\+|-)\s*("[^"]*"|'[^']*'|-?[^\s;=][^\s;]*))?)\s*;?/g, m;
    var guard = 0;
    var prev = 0;
    while (re.lastIndex < s.length && guard++ < 100 && (m = re.exec(s))) {
      if (/[^\s;]/.test(s.slice(prev, m.index))) problems.push("cannot read the effect near: " + s.slice(prev, m.index).trim().slice(0, 20));
      prev = re.lastIndex;
      var name = m[1]; if (!name) continue;
      if (m[2] != null && ACTIONS[name]) action(name, m[2], ctx);
      else if (m[3]) X.add(name, m[3] === "++" ? 1 : -1);
      else if (m[4] && m[5] == null) problems.push("the effect on " + name + " has no value");
      else if (m[4]) {
        var v = literal(m[5]), op = m[4];
        if (op === "=") X.set(name, v);
        else if (typeof v === "string" && op === "+=") X.set(name, String(X.get(name)) + v);
        else X.add(name, (op === "-=" || op === "-" ? -1 : 1) * (typeof v === "number" ? v : 0));
      } else if (BARE[name]) action(name, null, ctx);
      else problems.push("unknown effect: " + name);
    }
    if (/[^\s;]/.test(s.slice(prev))) problems.push("cannot read the effect near: " + s.slice(prev).trim().slice(0, 20));
  };
  function action(name, arg, ctx) {
    if (name === "say") X.say(arg && /^["']/.test(arg) ? arg.slice(1, -1) : arg);
    else if (name === "go") X.go(arg);
    else if (name === "emit") X.emit(arg, ctx || {});
    else if (name === "restart") X.restart();
    else if (name === "win") X.finish("win");
    else if (name === "lose") X.finish("lose");
    else if (name === "toggle") X.set(arg, !getPath(arg));
    else if (name === "add") { var p = /^(\S+?)\s*(\{[^}]*\})$/.exec(arg) || /^(\S+)\s+(\{.*\})$/.exec(arg); if (!p) return; var l = S[p[1]]; if (!Array.isArray(l)) S[p[1]] = l = []; l.push(objectOf(p[2])); mark(p[1]); }
    else if (name === "remove") { var q = String(arg).split(/\s+/), arr = S[q[0]]; if (Array.isArray(arr)) { arr.splice(parseInt(q[1], 10), 1); mark(q[0]); } }
  }
  /* {name} and {item.field}/{index} in a text become the state value or the item's */
  X.fill = function (text, ctx) {
    return String(text).replace(/\{([A-Za-z_][\w.]*)\}/g, function (all, p) {
      var parts = p.split("."), v;
      if (ctx && parts[0] === "index" && ctx.index != null) return ctx.index;
      if (ctx && ctx.item != null && typeof ctx.item === "object" && parts[0] in ctx.item) { v = ctx.item; for (var i = 0; i < parts.length && v != null; i++) v = v[parts[i]]; return v == null ? "" : v; }
      if (ctx && ctx.item != null && parts[0] === "item") return ctx.item;
      v = getPath(p); return v === undefined ? all : v;
    });
  };

  /* ---------- events ---------- */
  X.on = function (pattern, fn) { var h = { pattern: pattern, fn: fn }; handlers.push(h); return function () { var i = handlers.indexOf(h); if (i >= 0) handlers.splice(i, 1); }; };
  function matches(pattern, name) { return pattern === "*" || pattern === name || (pattern.slice(-2) === ":*" && name.indexOf(pattern.slice(0, -1)) === 0); }
  X.emit = function (name, detail) {
    detail = detail || {};
    handlers.slice().forEach(function (h) { if (matches(h.pattern, name)) try { h.fn(detail, name); } catch (e) { problems.push(String(e)); } });
    rules.forEach(function (r) { if (r.on && matches(r.on, name) && X.test(r.when)) X.run(r.do, detail); });
    var el = detail.el, verb = name.split(":")[0];
    if (el && el.classList && /^[a-z]+$/.test(verb)) { el.classList.add("fx-" + verb); setTimeout(function () { el.classList.remove("fx-" + verb); }, 500); }
  };

  /* ---------- messages, end of game, restart, scenes ---------- */
  var logEl = null;
  X.say = function (text) {
    if (text == null || text === "") return;
    if (logEl) logEl.textContent = text;
    var t = document.createElement("div"); t.className = "x-toast"; t.textContent = text;
    t.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#000c;color:#fff;padding:8px 14px;border-radius:8px;font:14px system-ui;pointer-events:none;z-index:50";
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 1800);
    X.emit("say", { text: text });
  };
  X.finish = function (kind, text) {
    if (over || window.__xLive) return; over = kind;
    var o = document.createElement("div"); o.id = "x-over";
    o.style.cssText = "position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:#000a;color:#fff;font:700 32px system-ui;z-index:60;cursor:pointer;text-align:center";
    o.innerHTML = "<div></div><div style='font:400 15px system-ui;opacity:.8'>Press R or click to play again</div>";
    o.firstChild.textContent = text || (kind === "win" ? "You win!" : "Game over");
    o.addEventListener("click", X.restart); document.body.appendChild(o);
    X.emit(kind, {});
  };
  X.isOver = function () { return over; };
  X.restart = function () {
    var o = document.getElementById("x-over"); if (o) o.remove(); over = null;
    for (var k in S) if (!(k in initial)) delete S[k];
    for (var k2 in initial) S[k2] = JSON.parse(JSON.stringify(initial[k2]));
    for (var n in S) mark(n);
    rules.forEach(function (r) { r.was = false; });
    X.emit("restart", {});
    if (sceneNow) X.go(firstScene, true);
  };
  var firstScene = null;
  X.go = function (id, quiet) {
    var all = document.querySelectorAll("x-scene,game-scene"), found = false;
    all.forEach(function (el) { if (el.id === id) found = true; });
    if (!found) { problems.push("no scene named " + id); return; }
    all.forEach(function (el) { el.hidden = el.id !== id; });
    sceneNow = id; if (!quiet) X.emit("enter:" + id, {});
  };
  X.scene = function () { return sceneNow; };

  /* ---------- loop and keys shared by every block ---------- */
  X.loop = function (fn) { loops.push(fn); };
  var last = 0;
  function frame(ts) {
    var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
    if (!over && !window.__npuPaused) loops.forEach(function (f) { try { f(dt); } catch (e) { problems.push(String(e)); } });
    requestAnimationFrame(frame);
  }
  window.addEventListener("keydown", function (e) {
    X.keys[e.code] = true; X.keys[e.key] = true;
    if (e.key === "r" || e.key === "R") { if (over) { X.restart(); return; } }
    var el = e.target, typing = el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
    if (typing) return;
    document.querySelectorAll("[data-key]").forEach(function (n) {
      (n.getAttribute("data-key") || "").split(";").forEach(function (part) {
        var m = /^\s*([^:]+?)\s*:\s*(.+)$/.exec(part); if (!m) return;
        if (m[1] === e.key || m[1] === e.code || (m[1].toLowerCase() === "space" && e.code === "Space")) { e.preventDefault(); X.run(m[2], { el: n }); }
      });
    });
    X.emit("keydown", { key: e.key, code: e.code, event: e });
  });
  window.addEventListener("keyup", function (e) { X.keys[e.code] = false; X.keys[e.key] = false; X.emit("keyup", { key: e.key, code: e.code }); });
  document.addEventListener("click", function (e) {
    var n = e.target.closest && e.target.closest("[data-click]"); if (!n) return;
    var ctx = { el: n }, row = n.closest("[data-index]"); if (row) { ctx.index = parseInt(row.getAttribute("data-index"), 10); var lst = S[row.getAttribute("data-of")]; if (lst) ctx.item = lst[ctx.index]; }
    X.run(n.getAttribute("data-click"), ctx);
  });
  document.addEventListener("input", function (e) {
    var n = e.target; if (!n.getAttribute || !n.getAttribute("data-bind")) return;
    var v = n.type === "checkbox" ? n.checked : n.type === "number" || n.type === "range" ? parseFloat(n.value) || 0 : n.value;
    X.set(n.getAttribute("data-bind"), v);
  });
  document.addEventListener("submit", function (e) {
    var n = e.target; if (!n.getAttribute || !n.getAttribute("data-submit")) return;
    e.preventDefault(); X.run(n.getAttribute("data-submit"), { el: n });
  });

  /* ---------- the page side: data-when, <x-value>, <x-list>, data-bind ---------- */
  function render() {
    document.querySelectorAll("x-value,game-value").forEach(function (el) { var v = getPath(el.getAttribute("of")); el.textContent = v === undefined ? "0" : String(v); });
    document.querySelectorAll("[data-when],[when]").forEach(function (el) {
      if (/^(X|GAME)-RULE$/.test(el.tagName)) return;
      el.style.display = X.test(el.getAttribute("data-when") || el.getAttribute("when")) ? "" : "none";
    });
    document.querySelectorAll("[data-bind]").forEach(function (el) {
      var v = getPath(el.getAttribute("data-bind")); if (v === undefined) return;
      if (el.type === "checkbox") el.checked = !!v; else if (document.activeElement !== el) el.value = String(v);
    });
    document.querySelectorAll("x-list,game-list").forEach(function (el) {
      var name = el.getAttribute("of"), list = getPath(name), tpl = el.querySelector("template"); if (!tpl || !Array.isArray(list)) return;
      var key = JSON.stringify(list); if (el._key === key) return; el._key = key;
      Array.prototype.slice.call(el.children).forEach(function (c) { if (c !== tpl) c.remove(); });
      list.forEach(function (item, i) {
        var html = tpl.innerHTML.replace(/\{([A-Za-z_][\w.]*)\}/g, function (all, p) { var s = X.fill("{" + p + "}", { item: item, index: i }); return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); });
        var box = document.createElement("div"); box.style.display = "contents"; box.setAttribute("data-index", i); box.setAttribute("data-of", name); box.innerHTML = html; el.appendChild(box);
      });
    });
  }
  function checkRules() {
    rules.forEach(function (r) {
      if (r.on || over) return;
      var now = X.test(r.when);
      if (now && !r.was) { r.was = true; X.run(r.do, {}); } else if (!now) r.was = false;
    });
  }

  /* ---------- blocks register here; their tags are defined once the state is read ---------- */
  X.define = function (name, cls) { defs.push([name, cls]); if (booted) register(name, cls); };
  X.ready = function (fn) { if (booted) fn(); else defs.push([null, fn]); };
  function register(name, cls) {
    ["x-", "game-"].forEach(function (p) {
      if (customElements.get(p + name)) return;
      try { customElements.define(p + name, p === "x-" ? cls : class extends cls {}); } catch (e) { problems.push(String(e)); }
    });
  }
  function boot() {
    document.querySelectorAll("x-state,game-state").forEach(function (el) {
      Array.prototype.forEach.call(el.attributes, function (a) {
        if (a.name === "save" || a.name === "id" || a.name === "class" || a.name === "style") return;
        var n = a.name.replace(/-/g, "_"), v = a.value;
        if (/^\s*[\[{]/.test(v)) { try { S[n] = JSON.parse(v.replace(/'/g, '"')); return; } catch (e) { problems.push("bad list in " + a.name); } }
        var f = parseFloat(v); S[n] = String(f) === v.trim() ? f : v;
      });
      var slot = el.getAttribute("save");
      if (slot) { try { var saved = JSON.parse(localStorage.getItem("x-save-" + slot) || "null"); if (saved) for (var k in saved) S[k] = saved[k]; } catch (e) {} el.__slot = slot; }
    });
    document.querySelectorAll("x-rule,game-rule").forEach(function (el) { rules.push({ when: el.getAttribute("when"), on: el.getAttribute("on"), do: el.getAttribute("do") || (el.getAttribute("say") ? 'say:"' + el.getAttribute("say") + '"' : ""), say: el.getAttribute("say"), was: false }); });
    rules.forEach(function (r) { if (r.do && /^(win|lose)$/.test(r.do) && r.say) r.do = r.do + ""; });
    document.querySelectorAll("[data-when],[when]").forEach(function () {});
    var scenes = document.querySelectorAll("x-scene,game-scene");
    // a page seen while it is still being written (window.__xLive) shows the scene being written, the last one
    if (scenes.length) { var shown = window.__xLive ? scenes.length - 1 : 0; firstScene = scenes[0].id; sceneNow = scenes[shown].id; scenes.forEach(function (el, i) { el.hidden = i !== shown; }); }
    logEl = document.querySelector("x-log,game-log");
    booted = true;
    var pending = defs.slice(); defs.length = 0;
    pending.forEach(function (d) { if (d[0]) register(d[0], d[1]); else d[1](); });
    for (var key in S) initial[key] = JSON.parse(JSON.stringify(S[key]));
    for (var n in S) mark(n);
    window.addEventListener("beforeunload", function () { document.querySelectorAll("x-state[save],game-state[save]").forEach(function (el) { try { localStorage.setItem("x-save-" + el.getAttribute("save"), JSON.stringify(S)); } catch (e) {} }); });
    requestAnimationFrame(frame);
  }
  /* a game is seen whole: when the page is taller or wider than the window it is scaled down to fit (never up), so nothing is lost off screen.
     Measured at full size and set again in the same turn, so no frame is drawn in between. */
  var fitTimer = 0, fitSig = "";
  function fit() {
    if (window.__xNoFit) return;
    var d = document.documentElement, was = d.style.zoom;
    d.style.zoom = "";
    var h = d.scrollHeight, w = d.scrollWidth, ih = window.innerHeight, iw = window.innerWidth;
    var z = Math.min(1, ih / Math.max(1, h), iw / Math.max(1, w));
    z = z > 0.97 ? 1 : Math.max(0.4, Math.round(z * 100) / 100);
    var next = z < 1 ? String(z) : "";
    d.style.zoom = next;
    if (next !== was) fitSig = "";
  }
  function fitSoon() { clearTimeout(fitTimer); fitTimer = setTimeout(fit, 120); }
  window.addEventListener("resize", fitSoon);
  setInterval(function () { var sig = document.documentElement.scrollHeight + "x" + document.documentElement.scrollWidth + "x" + window.innerHeight + "x" + window.innerWidth; if (sig !== fitSig) { fitSig = sig; fit(); } }, 600);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { boot(); fitSoon(); }); else { boot(); fitSoon(); }

  /* ---------- layout report: boxes, overlaps and boxes off screen, as data for a text report ---------- */
  X.report = function () {
    var out = [], vw = window.innerWidth, alerts = [];
    var all = Array.prototype.slice.call(document.body.querySelectorAll("*")).filter(function (el) {
      var r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      if (/^(SCRIPT|STYLE|LINK|META|CANVAS|I|BR|SPAN|TEMPLATE)$/.test(el.tagName) && !el.id) return false;
      if (/^X-(STATE|RULE|FLAG)$/.test(el.tagName) || /^GAME-(STATE|RULE)$/.test(el.tagName)) return false;
      return r.width > 0 && r.height > 0 && cs.display !== "none" && cs.visibility !== "hidden" && !/x-toast|x-over/.test(el.className + el.id) && cs.display !== "contents";
    });
    function name(el) { return el.tagName.toLowerCase() + (el.id ? "#" + el.id : el.classList.length ? "." + el.classList[0] : ""); }
    all.forEach(function (el) { var r = el.getBoundingClientRect(); out.push({ name: name(el), el: el, x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) }); });
    out.forEach(function (a, i) {
      if (a.x < -2 || a.y < -2 || a.x + a.w > vw + 2) alerts.push("off screen: " + a.name);
      for (var j = i + 1; j < out.length; j++) {
        var b = out[j]; if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        var ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox > 4 && oy > 4) alerts.push("overlap: " + a.name + " / " + b.name + " (" + ox + "x" + oy + "px)");
      }
    });
    return { viewport: { w: vw, h: window.innerHeight, scrollH: document.documentElement.scrollHeight }, boxes: out.map(function (b) { return { name: b.name, x: b.x, y: b.y, w: b.w, h: b.h }; }).slice(0, 60), alerts: alerts.slice(0, 20) };
  };
})();
