/* <x-calc name="total" value="prix * qte + 1"> writes an arithmetic expression of the state
 * into the state name. A small parser of our own reads it (no eval). See FICHES.md, "timer et calc". */
(function () {
  var ARITY = { min: [1, Infinity], max: [1, Infinity], round: [1, 2], floor: [1, 1], ceil: [1, 1], abs: [1, 1], count: [1, 2], sum: [1, 2] };
  var COMPARE = /^(==|!=|<=|>=|<|>)$/;
  // a chain of calc updates that never yields (calcs changing each other) is stopped
  var BURST_MAX = 2000, burst = 0, burstReset = false;

  /* ---------- reading the expression ---------- */
  function tokenize(src) {
    var re = /\s*(?:(\d+(?:\.\d+)?)|("[^"]*"|'[^']*')|([A-Za-z_]\w*(?:\.\w+)*)|(==|!=|<=|>=|[-+*\/%()<>,]))/y, out = [], pos = 0, m;
    while (pos < src.length) {
      re.lastIndex = pos;
      m = re.exec(src);
      if (!m) { if (/^\s*$/.test(src.slice(pos))) break; throw new Error("cannot read the expression: " + src.trim()); }
      pos = re.lastIndex;
      if (m[1] != null) out.push({ k: "num", v: parseFloat(m[1]) });
      else if (m[2] != null) out.push({ k: "str", v: m[2].slice(1, -1) });
      else if (m[3] != null) out.push({ k: "id", v: m[3] });
      else out.push({ k: "op", v: m[4] });
    }
    return out;
  }

  // Grammar: expr = term (+|- term)*, term = unary (*|/|% unary)*, unary = -unary | primary.
  // primary = number | "text" | true | false | state path | (expr) | fn(args).
  function parse(src) {
    var t = tokenize(src), i = 0;
    function isOp(v) { return !!t[i] && t[i].k === "op" && t[i].v === v; }
    function eat(v) { if (isOp(v)) { i++; return true; } return false; }
    function need(v) { if (!eat(v)) throw new Error("expected " + v + " in: " + src.trim()); }
    function expr() {
      var a = term(), op;
      while (isOp("+") || isOp("-")) { op = t[i++].v; a = { t: "bin", op: op, a: a, b: term() }; }
      return a;
    }
    function term() {
      var a = unary(), op;
      while (isOp("*") || isOp("/") || isOp("%")) { op = t[i++].v; a = { t: "bin", op: op, a: a, b: unary() }; }
      return a;
    }
    function unary() {
      if (eat("-")) return { t: "neg", a: unary() };
      if (eat("+")) return unary();
      return primary();
    }
    function primary() {
      var tok = t[i++], a;
      if (!tok) throw new Error("the expression ends too early: " + src.trim());
      if (tok.k === "num" || tok.k === "str") return { t: "lit", v: tok.v };
      if (tok.k === "op" && tok.v === "(") { a = expr(); need(")"); return a; }
      if (tok.k === "id") {
        if (tok.v === "true" || tok.v === "false") return { t: "lit", v: tok.v === "true" };
        return isOp("(") ? call(tok.v) : { t: "ref", path: tok.v };
      }
      throw new Error("unexpected " + tok.v + " in: " + src.trim());
    }
    // count(list) / count(list, field) / count(list, field OP value) / sum(list) / sum(list, field)
    function field() {
      var tok = t[i++];
      if (!tok || tok.k !== "id" || tok.v === "true" || tok.v === "false") throw new Error("expected a field name in: " + src.trim());
      var f = { t: "field", path: tok.v, op: null, value: null };
      if (t[i] && t[i].k === "op" && COMPARE.test(t[i].v)) { f.op = t[i++].v; f.value = primary(); }
      return f;
    }
    function call(name) {
      var arity = ARITY[name];
      if (!arity) throw new Error("unknown function: " + name);
      i++; // the "("
      var args = [];
      if (name === "count" || name === "sum") {
        if (!isOp(")")) { args.push(expr()); if (eat(",")) args.push(field()); }
      } else if (!isOp(")")) {
        do { args.push(expr()); } while (eat(","));
      }
      need(")");
      if (args.length < arity[0] || args.length > arity[1]) throw new Error("wrong number of arguments for " + name);
      if (name === "sum" && args[1] && args[1].op) throw new Error("sum takes a field, not a comparison: " + src.trim());
      return { t: "call", name: name, args: args };
    }
    var ast = expr();
    if (i < t.length) throw new Error("unexpected " + t[i].v + " in: " + src.trim());
    return ast;
  }

  // every state name the expression reads (its first part), to know when to recompute
  function refsOf(n, out) {
    if (!n) return out;
    if (n.t === "ref") out.push(n.path.split(".")[0]);
    if (n.t === "field") refsOf(n.value, out);
    refsOf(n.a, out); refsOf(n.b, out);
    if (n.args) n.args.forEach(function (x) { refsOf(x, out); });
    return out;
  }

  /* ---------- evaluating it ---------- */
  function label(n) { return n.t === "ref" ? n.path : "the value"; }
  function toNum(v, what) {
    if (typeof v === "number") return v;
    if (typeof v === "boolean") return v ? 1 : 0;
    if (v == null) return 0;
    if (typeof v === "string") {
      if (v.trim() === "") return 0;
      if (!isNaN(Number(v))) return Number(v);
    }
    throw new Error("not a number: " + what);
  }
  function numOrZero(v, what) { return v == null ? 0 : toNum(v, what); }
  function getField(item, path) {
    return path.split(".").reduce(function (o, k) { return o == null ? undefined : o[k]; }, item);
  }
  function compare(a, op, b) {
    switch (op) {
      case "==": return a == b;
      case "!=": return a != b;
      case "<": return a < b;
      case ">": return a > b;
      case "<=": return a <= b;
      default: return a >= b;
    }
  }
  function listOf(node) {
    var v = ev(node);
    if (!Array.isArray(v)) throw new Error("not a list: " + label(node));
    return v;
  }
  function countOf(n) {
    var rows = listOf(n.args[0]), f = n.args[1];
    if (!f) return rows.length;
    var want = f.op ? ev(f.value) : null;
    return rows.filter(function (item) {
      var v = getField(item, f.path);
      return f.op ? compare(v, f.op, want) : !!v;
    }).length;
  }
  function sumOf(n) {
    var rows = listOf(n.args[0]), f = n.args[1];
    return rows.reduce(function (s, item) {
      return s + (f ? numOrZero(getField(item, f.path), f.path) : numOrZero(item, "a list item"));
    }, 0);
  }
  function callFn(n) {
    var a = n.args;
    function num(x) { return toNum(ev(x), label(x)); }
    switch (n.name) {
      case "min": return Math.min.apply(null, a.map(num));
      case "max": return Math.max.apply(null, a.map(num));
      case "round": { var f = Math.pow(10, a[1] ? num(a[1]) : 0); return Math.round(num(a[0]) * f) / f; }
      case "count": return countOf(n);
      case "sum": return sumOf(n);
      default: return Math[n.name](num(a[0]));
    }
  }
  function binary(n) {
    var a = toNum(ev(n.a), label(n.a)), b = toNum(ev(n.b), label(n.b));
    switch (n.op) {
      case "+": return a + b;
      case "-": return a - b;
      case "*": return a * b;
      case "/": if (b === 0) throw new Error("division by zero"); return a / b;
      default: if (b === 0) throw new Error("division by zero"); return a % b;
    }
  }
  function ev(n) {
    switch (n.t) {
      case "lit": return n.v;
      case "ref": return X.get(n.path);
      case "neg": return -toNum(ev(n.a), label(n.a));
      case "bin": return binary(n);
      default: return callFn(n);
    }
  }

  /* ---------- the element ---------- */
  // writes only when the value changes, so calcs that read each other settle
  function put(name, v) {
    var cur = name.indexOf(".") < 0 ? X.all()[name] : X.get(name);
    if (cur !== v) X.set(name, v);
  }
  function countWrite() {
    if (!burstReset) { burstReset = true; setTimeout(function () { burst = 0; burstReset = false; }, 0); }
    return ++burst <= BURST_MAX;
  }
  function report(el, msg) {
    if (el._msg === msg) return;
    el._msg = msg;
    X.problems.push(msg);
  }

  X.define("calc", class extends HTMLElement {
    connectedCallback() {
      if (this._on) return;
      this._on = true;
      this._name = this.getAttribute("name") || "";
      this._msg = null;
      if (!this._name) { X.problems.push("calc without name=\"...\""); return; }
      try {
        this._ast = parse(this.getAttribute("value") || "");
        this._deps = refsOf(this._ast, []);
      } catch (e) {
        this._ast = null;
        this._error = "calc " + this._name + ": " + e.message;
      }
      X.on("restart", () => this.update());
      X.onChange("*", (n) => { if (this._deps && this._deps.indexOf(n) >= 0) this.update(); });
      this.update();
    }
    update() {
      if (!this._name || !this.isConnected) return;
      if (!countWrite()) { report(this, "calc loop stopped: " + this._name + " keeps changing the values it reads"); return; }
      var v = 0;
      try {
        if (this._error) throw new Error(this._error);
        if (this._deps.indexOf(this._name) >= 0) throw new Error("calc " + this._name + " reads its own value");
        v = toNum(ev(this._ast), "the value");
        if (!isFinite(v)) throw new Error("calc " + this._name + ": the result is not a finite number");
        this._msg = null;
      } catch (e) {
        v = 0;
        report(this, e.message.indexOf("calc ") === 0 ? e.message : "calc " + this._name + ": " + e.message);
      }
      put(this._name, v);
    }
  });
})();
