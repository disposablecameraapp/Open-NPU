/* Dialog block: a conversation drawn in a panel at the bottom of the page. The lines are the children of <x-dialog>.
 * Starts on the event talk:<id> or dialog:<id>. Enter, space or a click finishes the text, then goes on;
 * digits, arrows and Enter choose. Ends with dialog:end:<id> and talked_<id> + 1. */
(function () {
  var DEFAULT_SPEED = 40, LINE = /^(X|GAME)-LINE$/, CHOICE = /^(X|GAME)-CHOICE$/;
  var STYLE = [
    ":where(x-dialog, game-dialog) > :where(x-line, game-line) { display: none; }",
    ":where(.dialog-box) { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); width: min(640px, 92vw); box-sizing: border-box; padding: 14px 18px; border-radius: 10px; background: #14141cf2; color: #fff; font: 16px/1.45 system-ui, sans-serif; z-index: 40; }",
    ":where(.dialog-box) .who { font-weight: 700; margin-bottom: 4px; }",
    ":where(.dialog-box) .text { min-height: 1.45em; white-space: pre-wrap; }",
    ":where(.dialog-box) .ask { margin-top: 8px; font-weight: 600; }",
    ":where(.dialog-box) .choices { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }",
    ":where(.dialog-box) .choice { cursor: pointer; padding: 6px 10px; border-radius: 6px; background: #ffffff1f; }",
    ":where(.dialog-box) .choice.on { background: #ffffff47; outline: 2px solid #ffffffaa; }",
    ":where(.dialog-box) .hint { text-align: right; opacity: .6; min-height: 1em; }"
  ].join("\n");
  if (!document.getElementById("x-dialog-style")) {
    var style = document.createElement("style");
    style.id = "x-dialog-style"; style.textContent = STYLE;
    (document.head || document.documentElement).appendChild(style);
  }

  function textOf(el) {
    var s = "";
    Array.prototype.forEach.call(el.childNodes, function (n) {
      if (n.nodeType === 3) s += n.nodeValue;
      else if (n.nodeType === 1 && !CHOICE.test(n.tagName)) s += n.textContent;
    });
    return s.replace(/\s+/g, " ").trim();
  }
  function kids(el, re) { return Array.prototype.filter.call(el.children, function (c) { return re.test(c.tagName); }); }
  function parseSpeed(v) {
    if (v == null || v === "") return DEFAULT_SPEED;
    var n = parseFloat(v);
    if (!(n >= 0)) { X.problems.push("dialog speed must be a number of characters per second: " + v); return DEFAULT_SPEED; }
    return n;
  }
  function makePanel(id) {
    var p = document.createElement("div");
    p.className = "dialog-box"; p.setAttribute("data-dialog", id);
    p.innerHTML = '<div class="who"></div><div class="text"></div><div class="ask" hidden></div><div class="choices"></div><div class="hint"></div>';
    document.body.appendChild(p);
    return p;
  }

  X.define("dialog", class extends HTMLElement {
    connectedCallback() {
      if (this._wired) return;
      this._wired = true;
      var self = this, id = this.getAttribute("id");
      this.speed = parseSpeed(this.getAttribute("speed"));
      this.dialogId = id; this.active = false; this.typing = false; this.session = 0;
      this.panel = null; this.ui = null; this.options = []; this.hi = 0; this.cur = -1; this.lineList = [];
      if (!id) { X.problems.push("dialog without an id: its conversation cannot be started"); return; }
      if (!/^[a-z_][a-z0-9_]*$/.test(id)) X.problems.push('dialog id "' + id + '" should be a plain word (letters, digits, _)');
      X.on("talk:" + id, function () { self.start(); });
      X.on("dialog:" + id, function () { self.start(); });
      X.on("keydown", function (d) { self.onKey(d); });
      X.on("restart", function () { self.close(); });
      X.loop(function (dt) { self.tick(dt); });
      this.api = {
        start: function () { self.start(); },
        advance: function () { self.advance(); },
        choose: function (i) { self.choose(i); },
        open: function () { return self.active; }
      };
    }

    isShown() { return this.offsetParent !== null; }

    lines() {
      return kids(this, LINE).map(function (el) {
        return {
          el: el, id: el.getAttribute("id"), who: el.getAttribute("who") || "", when: el.getAttribute("when"),
          do: el.getAttribute("do"), next: el.getAttribute("next"), ask: el.getAttribute("ask"), text: textOf(el),
          options: kids(el, CHOICE).map(function (c) { return { el: c, text: textOf(c), when: c.getAttribute("when"), do: c.getAttribute("do"), goto: c.getAttribute("goto") }; })
        };
      });
    }

    start() {
      if (this.active || !this.dialogId || X.isOver()) return;
      if (!this.isShown()) { X.problems.push("dialog " + this.dialogId + " is hidden: its conversation did not start"); return; }
      if (X.get("dialog_open")) { X.problems.push("dialog " + this.dialogId + " not started: another dialog is open"); return; }
      this.lineList = this.lines();
      this.session++; this.active = true; this.cur = -1;
      X.set("dialog_open", 1);
      var self = this;
      this.panel = makePanel(this.dialogId);
      this.ui = {
        who: this.panel.querySelector(".who"), text: this.panel.querySelector(".text"), ask: this.panel.querySelector(".ask"),
        choices: this.panel.querySelector(".choices"), hint: this.panel.querySelector(".hint")
      };
      this.panel.addEventListener("click", function (e) {
        var b = e.target.closest ? e.target.closest(".choice") : null;
        if (b) return self.choose(Array.prototype.indexOf.call(self.ui.choices.children, b));
        self.advance();
      });
      this.showFrom(0);
    }

    /* Shows the first line from index i whose `when` holds; past the last line the conversation ends. */
    showFrom(i) {
      var L = this.lineList;
      while (i < L.length && !X.test(L[i].when)) i++;
      this.cur = i;
      if (i >= L.length) return this.finish();
      var line = L[i];
      X.run(line.do, { el: line.el });
      if (!this.active) return;
      if (X.isOver()) return this.finish();
      this.show(line);
    }

    show(line) {
      this.options = []; this.hi = 0;
      this.ui.who.textContent = X.fill(line.who, {}); this.ui.who.hidden = !line.who;
      this.ui.ask.hidden = true; this.ui.ask.textContent = "";
      this.ui.choices.textContent = ""; this.ui.hint.textContent = "";
      this.full = X.fill(line.text, {});
      this.typed = this.speed > 0 ? 0 : this.full.length;
      this.typing = this.typed < this.full.length;
      if (this.typing) this.ui.text.textContent = "";
      else this.settle();
    }

    /* The whole text is shown: the question and the choices appear, or the hint says "continue". */
    settle() {
      var line = this.lineList[this.cur];
      this.typing = false;
      this.ui.text.textContent = this.full;
      if (line.ask) { this.ui.ask.textContent = X.fill(line.ask, {}); this.ui.ask.hidden = false; }
      this.options = line.options.filter(function (o) { return X.test(o.when); });
      this.renderOptions();
      this.ui.hint.textContent = this.options.length ? "" : "▼";
    }

    renderOptions() {
      var self = this;
      this.ui.choices.textContent = "";
      this.options.forEach(function (o, i) {
        var b = document.createElement("div"); b.className = "choice";
        var k = document.createElement("span"); k.className = "key"; k.textContent = (i + 1) + ". ";
        b.appendChild(k); b.appendChild(document.createTextNode(X.fill(o.text, {})));
        self.ui.choices.appendChild(b);
      });
      this.highlight(0);
    }

    highlight(i) {
      this.hi = i;
      Array.prototype.forEach.call(this.ui.choices.children, function (b, j) { b.classList.toggle("on", j === i); });
    }

    tick(dt) {
      if (!this.typing || !this.isShown()) return;
      this.typed = Math.min(this.full.length, this.typed + dt * this.speed);
      var n = Math.floor(this.typed);
      this.ui.text.textContent = this.full.slice(0, n);
      if (n >= this.full.length) this.settle();
    }

    advance() {
      if (!this.active || !this.isShown()) return;
      if (this.typing) return this.settle();
      if (this.options.length) return;
      var line = this.lineList[this.cur];
      this.showFrom(line.next ? this.targetOf(line.next) : this.cur + 1);
    }

    choose(i) {
      if (!this.active || this.typing || !this.options[i] || !this.isShown()) return;
      var opt = this.options[i], line = this.lineList[this.cur], session = this.session;
      this.options = [];
      this.ui.choices.textContent = "";
      X.run(opt.do, { el: opt.el });
      if (session !== this.session) return;
      if (X.isOver()) return this.finish();
      var target = opt.goto ? this.targetOf(opt.goto) : line.next ? this.targetOf(line.next) : this.cur + 1;
      this.showFrom(target);
    }

    /* A line id, or "end"; an unknown id is reported and ends the conversation. */
    targetOf(name) {
      if (name === "end") return this.lineList.length;
      for (var i = 0; i < this.lineList.length; i++) if (this.lineList[i].id === name) return i;
      X.problems.push("dialog " + this.dialogId + ': no line named "' + name + '"');
      return this.lineList.length;
    }

    onKey(d) {
      if (!this.active || !this.isShown() || X.isOver()) return;
      var e = d.event || {}, k = d.key, self = this, n = this.options.length;
      var t = e.target;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      var act = null;
      if (n && /^[1-9]$/.test(k) && Number(k) <= n) act = function () { self.choose(Number(k) - 1); };
      else if (n && (k === "ArrowDown" || k === "ArrowUp")) act = function () { self.highlight((self.hi + (k === "ArrowDown" ? 1 : n - 1)) % n); };
      else if (k === "Enter") act = function () { if (n) self.choose(self.hi); else self.advance(); };
      else if (k === " ") act = function () { if (!n) self.advance(); };
      if (!act) return;
      if (e.preventDefault) e.preventDefault();
      if (e.repeat && (k === "Enter" || k === " ")) return;
      act();
    }

    finish() {
      if (!this.active) return;
      var id = this.dialogId;
      this.close();
      X.add("talked_" + id, 1);
      X.emit("dialog:end:" + id, { id: id });
    }

    /* Removes the panel without counting the conversation (also used by a restart). */
    close() {
      this.active = false; this.typing = false; this.options = []; this.session++;
      if (this.panel) this.panel.remove();
      this.panel = null; this.ui = null;
      if (X.get("dialog_open")) X.set("dialog_open", 0);
    }
  });
})();
