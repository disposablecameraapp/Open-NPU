/** Small models answer with LaTeX ($$ \frac{a}{b} $$). No math engine is bundled: turn it into readable plain text (a/b, ×, ², π). */
const SYMBOLS: Record<string, string> = {
  times: "×", cdot: "·", div: "÷", pm: "±", mp: "∓", approx: "≈", neq: "≠", ne: "≠", leq: "≤", le: "≤", geq: "≥", ge: "≥",
  infty: "∞", to: "→", rightarrow: "→", leftarrow: "←", Rightarrow: "⇒", Leftarrow: "⇐", Leftrightarrow: "⇔", leftrightarrow: "↔",
  degree: "°", circ: "°", ldots: "…", dots: "…", cdots: "…", sum: "∑", prod: "∏", int: "∫", partial: "∂", nabla: "∇",
  in: "∈", notin: "∉", subset: "⊂", cup: "∪", cap: "∩", forall: "∀", exists: "∃", neg: "¬", land: "∧", lor: "∨",
  quad: " ", qquad: " ", alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", theta: "θ", lambda: "λ",
  mu: "μ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", phi: "φ", varphi: "φ", omega: "ω", Delta: "Δ", Sigma: "Σ", Omega: "Ω",
  Pi: "Π", Phi: "Φ", Gamma: "Γ", Theta: "Θ", Lambda: "Λ", eta: "η", zeta: "ζ", kappa: "κ", nu: "ν", xi: "ξ", chi: "χ", psi: "ψ",
  iota: "ι", upsilon: "υ", vartheta: "ϑ", varsigma: "ς", varrho: "ϱ", Psi: "Ψ", Xi: "Ξ", Upsilon: "Υ",
  mid: "|", setminus: "∖", emptyset: "∅", varnothing: "∅", angle: "∠", triangle: "△", perp: "⊥", parallel: "∥", implies: "⟹", iff: "⟺",
  propto: "∝", equiv: "≡", sim: "∼", cong: "≅", ast: "∗", star: "⋆", ell: "ℓ", hbar: "ℏ", prime: "′", vdots: "⋮", ddots: "⋱",
  lt: "<", gt: ">", lfloor: "⌊", rfloor: "⌋", lceil: "⌈", rceil: "⌉", langle: "⟨", rangle: "⟩", lbrace: "{", rbrace: "}",
  subseteq: "⊆", supset: "⊃", supseteq: "⊇", oplus: "⊕", otimes: "⊗", wedge: "∧", vee: "∨", mapsto: "↦", longrightarrow: "⟶",
  uparrow: "↑", downarrow: "↓", therefore: "∴", because: "∵", ll: "≪", gg: "≫", lbrack: "[", rbrack: "]", euro: "€", pounds: "£",
  nonumber: "", notag: "", hline: "", big: "", Big: "", bigg: "", Bigg: "", bigl: "", bigr: "", Bigl: "", Bigr: "", biggl: "", biggr: "",
  limits: "", nolimits: "", centering: "", noindent: "", newline: "\n", lvert: "|", rvert: "|", lVert: "‖", rVert: "‖", vert: "|", Vert: "‖",
};
const BB: Record<string, string> = { R: "ℝ", N: "ℕ", Z: "ℤ", Q: "ℚ", C: "ℂ", P: "ℙ", E: "𝔼" };
const ACCENT: Record<string, string> = { bar: "\u0304", overline: "\u0304", hat: "\u0302", widehat: "\u0302", vec: "\u20D7", tilde: "\u0303", widetilde: "\u0303", dot: "\u0307", ddot: "\u0308", underline: "\u0332" };
const DROP_ARG = new Set(["hspace", "vspace", "phantom", "hphantom", "vphantom", "label", "color", "tag*", "qedhere"]);
const MATRIX: Record<string, [string, string]> = { matrix: ["", ""], smallmatrix: ["", ""], pmatrix: ["(", ")"], bmatrix: ["[", "]"], Bmatrix: ["{", "}"], vmatrix: ["|", "|"], Vmatrix: ["‖", "‖"], array: ["", ""] };
const SUP: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "n": "ⁿ", "i": "ⁱ", "(": "⁽", ")": "⁾" };
const SUB: Record<string, string> = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋", "(": "₍", ")": "₎" };
const WRAPPERS = new Set(["boxed", "underbrace", "overbrace", "text", "textbf", "textit", "mathrm", "mathbf", "mathit", "mathbb", "mathcal", "operatorname", "boldsymbol", "mbox", "displaystyle", "textstyle"]);

function readGroup(s: string, i: number): [string, number] {
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === "\\") { j++; continue; }
    if (s[j] === "{") depth++;
    else if (s[j] === "}" && --depth === 0) return [s.slice(i + 1, j), j + 1];
  }
  return [s.slice(i + 1), s.length];
}

function readArg(s: string, i: number): [string, number] {
  while (s[i] === " ") i++;
  if (s[i] === "{") return readGroup(s, i);
  const m = s[i] === "\\" ? /^\\[A-Za-z]+/.exec(s.slice(i)) : null;
  if (m) return [m[0], i + m[0].length];
  return [s[i] ?? "", i + 1];
}

const wrap = (t: string) => (/^[\p{L}\p{N}.,]+$/u.test(t) ? t : `(${t})`);

function script(kind: "^" | "_", t: string): string {
  const map = kind === "^" ? SUP : SUB;
  if (t && [...t].every((c) => map[c])) return [...t].map((c) => map[c]).join("");
  return `${kind}${/^[\p{L}\p{N}]+$/u.test(t) ? t : `(${t})`}`;
}

const rows = (body: string) => body.split(/\\\\(?:\[[^\]]*\])?/).map((r) => r.trim()).filter(Boolean);

function environment(env: string, body: string): string {
  const name = env.replace(/\*$/, "");
  if (name in MATRIX) {
    const [l, r] = MATRIX[name];
    const b = name === "array" ? body.replace(/^\s*\{[^}]*\}/, "") : body;
    return `${l}${rows(b).map((row) => row.split("&").map((c) => convert(c).trim()).join(", ")).join("; ")}${r}`;
  }
  const lines = rows(body).map((row) => convert(row.replace(/&/g, " ")).trim());
  return (name === "cases" ? lines.map((l) => `{ ${l}`) : lines).join("\n");
}

function convert(tex: string): string {
  let out = "";
  let i = 0;
  while (i < tex.length) {
    const c = tex[i];
    if (c === "\\") {
      const m = /^\\([A-Za-z]+)/.exec(tex.slice(i));
      if (!m) {
        const n = tex[i + 1] ?? "";
        out += n === "\\" ? "\n" : n === "," || n === ";" || n === ":" ? " " : n === "!" ? "" : n;
        i += 2;
        if (n === "\\" && tex[i] === "[") { const e = tex.indexOf("]", i); if (e > 0) i = e + 1; }
        continue;
      }
      const cmd = m[1];
      i += m[0].length;
      if (cmd === "frac" || cmd === "dfrac" || cmd === "tfrac") {
        let a: string, b: string;
        [a, i] = readArg(tex, i);
        [b, i] = readArg(tex, i);
        out += `${wrap(convert(a).trim())}/${wrap(convert(b).trim())}`;
      } else if (cmd === "sqrt") {
        let a: string;
        [a, i] = readArg(tex, i);
        const t = convert(a).trim();
        out += /^[\p{L}\p{N}.]+$/u.test(t) ? `√${t}` : `√(${t})`;
      } else if (cmd === "binom" || cmd === "dbinom" || cmd === "tbinom") {
        let a: string, b: string;
        [a, i] = readArg(tex, i);
        [b, i] = readArg(tex, i);
        out += `C(${convert(a).trim()}, ${convert(b).trim()})`;
      } else if (cmd === "begin") {
        let env: string;
        [env, i] = readGroup(tex, i);
        const end = tex.indexOf(`\\end{${env}}`, i);
        out += environment(env, end < 0 ? tex.slice(i) : tex.slice(i, end));
        i = end < 0 ? tex.length : end + env.length + 6;
      } else if (cmd === "end") {
        [, i] = readGroup(tex, i);
      } else if (cmd === "mathbb") {
        let a: string;
        [a, i] = readArg(tex, i);
        out += BB[a] ?? convert(a);
      } else if (cmd in ACCENT) {
        let a: string;
        [a, i] = readArg(tex, i);
        const t = convert(a).trim();
        out += t.length === 1 ? t + ACCENT[cmd] : cmd === "vec" ? `${t}⃗` : t;
      } else if (cmd === "textcolor" || cmd === "overset" || cmd === "underset") {
        [, i] = readArg(tex, i);
        let a: string;
        [a, i] = readArg(tex, i);
        out += convert(a);
      } else if (DROP_ARG.has(cmd) || cmd === "tag") {
        let a: string;
        [a, i] = readArg(tex, i);
        if (cmd === "tag") out += `(${convert(a).trim()})`;
        if (cmd === "color") continue;
      } else if (cmd === "left" || cmd === "right") {
        if (tex[i] === ".") i++;
      } else if (WRAPPERS.has(cmd)) {
        if (cmd === "displaystyle" || cmd === "textstyle") continue;
        let a: string;
        [a, i] = readArg(tex, i);
        out += convert(a);
      } else {
        out += SYMBOLS[cmd] ?? cmd;
      }
    } else if (c === "^" || c === "_") {
      let a: string;
      [a, i] = readArg(tex, i + 1);
      out += script(c, convert(a).trim());
    } else if (c === "{" || c === "}") {
      i++;
    } else {
      out += c === "~" ? " " : c;
      i++;
    }
  }
  return out;
}

export function texToText(tex: string): string {
  return convert(tex).split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
}
