/* <x-timer> runs a state change on a clock; <x-clock> shows a state as a time.
 * Plain browser script: only X and the DOM (see FICHES.md, "timer et calc"). */
(function () {
  // "1s", "500ms", "2m", "1.5" (seconds) -> seconds; null when unreadable
  function seconds(text) {
    var m = /^\s*(\d+(?:\.\d+)?)\s*(ms|s|m)?\s*$/.exec(String(text));
    if (!m) return null;
    var n = parseFloat(m[1]);
    return m[2] === "ms" ? n / 1000 : m[2] === "m" ? n * 60 : n;
  }
  function nameOf(el) { return el.id || "timer"; }

  X.define("timer", class extends HTMLElement {
    connectedCallback() {
      if (this._on) return;
      this._on = true;
      var every = this.getAttribute("every"), after = this.getAttribute("after"), times = this.getAttribute("times");
      this._do = this.getAttribute("do");
      this._while = this.getAttribute("while");
      this._start = this.getAttribute("start");
      if (!this._do) X.problems.push("timer " + nameOf(this) + " has no do=\"...\"");
      if (every == null && after == null) X.problems.push("timer " + nameOf(this) + " needs every or after: 1s used");
      // every repeats; after alone fires once
      this._period = null;
      if (every != null || after == null) {
        this._period = every == null ? 1 : seconds(every);
        if (this._period == null || this._period <= 0) { X.problems.push("timer: cannot read every=\"" + every + "\", 1s used"); this._period = 1; }
      }
      this._delay = after == null ? this._period : seconds(after);
      if (this._delay == null) { X.problems.push("timer: cannot read after=\"" + after + "\", 0s used"); this._delay = 0; }
      this._max = this._period == null ? 1 : Infinity;
      if (times != null) {
        var n = parseInt(times, 10);
        if (n >= 1) this._max = n; else X.problems.push("timer: times=\"" + times + "\" must be 1 or more");
      }
      this.reset();
      X.on("restart", () => { this._gen++; this.reset(); });
      X.loop((dt) => this.tick(dt));
    }
    reset() {
      this._gen = (this._gen || 0);
      this._t = 0; this._next = this._delay; this._fired = 0; this._done = false;
      this._started = !this._start;
    }
    tick(dt) {
      // a hidden timer (its scene is not shown) does not run
      if (this._done || !this.isConnected || this.offsetParent === null || X.isOver()) return;
      if (!this._started) { if (!X.test(this._start)) return; this._started = true; }
      if (!X.test(this._while)) return;
      this._t += dt;
      var gen = this._gen;
      while (!this._done && this._t >= this._next) {
        this._fired++;
        this._next = this._period == null ? Infinity : this._next + this._period;
        if (this._do) X.run(this._do, { el: this });
        // the effect may restart the game or end it: stop here
        if (gen !== this._gen || X.isOver()) return;
        X.emit("tick:" + nameOf(this), { el: this });
        if (this._fired >= this._max) { this._done = true; X.emit("end:" + nameOf(this), { el: this }); }
      }
    }
  });

  var CLOCK_CSS = ":where(x-clock,game-clock){font-variant-numeric:tabular-nums}";
  var FORMATS = { "m:ss": 1, "mm:ss": 1, "s": 1 };

  function styleOnce(id, css) {
    if (document.getElementById(id)) return;
    var s = document.createElement("style");
    s.id = id; s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }
  // seconds -> "75" (s), "1:15" (m:ss), "01:15" (mm:ss); a negative value keeps its sign
  function clockText(value, format) {
    var sign = value < 0 ? "-" : "", t = Math.floor(Math.abs(value));
    if (format === "s") return sign + t;
    var m = Math.floor(t / 60), s = String(t % 60).padStart(2, "0");
    return sign + (format === "mm:ss" ? String(m).padStart(2, "0") : String(m)) + ":" + s;
  }

  X.define("clock", class extends HTMLElement {
    connectedCallback() {
      if (this._on) return;
      this._on = true;
      var path = this.getAttribute("of") || "", format = this.getAttribute("format") || "m:ss";
      if (!path) X.problems.push("clock without of=\"...\"");
      if (!FORMATS[format]) { X.problems.push("clock: unknown format \"" + format + "\", m:ss used"); format = "m:ss"; }
      this.classList.add("clock");
      styleOnce("x-clock-style", CLOCK_CSS);
      var show = () => { if (this.isConnected) this.textContent = clockText(Number(X.get(path)) || 0, format); };
      X.onChange(path.split(".")[0], show);
      show();
    }
  });
})();
