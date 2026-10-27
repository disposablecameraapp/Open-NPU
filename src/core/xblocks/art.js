/* Art block: drawn objects (SVG) placed by name. <x-asset name="oiseau" size="34x24" about="..."><svg>...</svg></x-asset>
 * defines an object (hidden); <x-art of="oiseau" [size="40x28"]> shows it inline. X.art / X.artHtml / X.artImage give the
 * same object to other blocks (map: inline, platformer: canvas image). See FICHES.md, "art". */
(function () {
  var SVG_NS = "http://www.w3.org/2000/svg", XLINK_NS = "http://www.w3.org/1999/xlink";
  var ASSET_SEL = "x-asset,game-asset", ART_SEL = "x-art,game-art", MAX_SVG = 512 * 1024;
  var NAME = /^[\p{L}\p{N}_][\p{L}\p{N}_-]*$/u;
  var STYLE = [
    ":where(x-asset,game-asset){display:none}",
    ":where(x-art,game-art){display:inline-block;line-height:0;vertical-align:middle}",
    ":where(.art){display:block}",
    ":where(.art-missing){display:inline-block;box-sizing:border-box;border:1px dashed #9999;background:#8882}"
  ].join("\n");
  if (!document.getElementById("x-art-style")) {
    var st = document.createElement("style"); st.id = "x-art-style"; st.textContent = STYLE; document.head.appendChild(st);
  }

  /* ---------- problems (each message once) ---------- */
  function warn(msg) { if (X.problems.indexOf(msg) < 0) X.problems.push(msg); }
  function own(obj, k) { return Object.prototype.hasOwnProperty.call(obj, k); }
  function escapeText(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  /* ---------- cleaning: the only way a drawing reaches the page ---------- */
  var DROP = { script: 1, foreignobject: 1, iframe: 1, object: 1, embed: 1, link: 1, meta: 1, base: 1, frame: 1, frameset: 1, handler: 1, listener: 1 };
  var TIMING = { animate: 1, set: 1, animatemotion: 1, animatetransform: 1 };
  function bad(v) { return /^(javascript|vbscript|data):/i.test(String(v).replace(/[\s\u0000-\u001f]/g, "")); }
  /* url(...) that points outside the drawing becomes none; url(#id) stays */
  function unurl(v) {
    return String(v).replace(/url\(\s*(['"]?)\s*([^'")]*?)\s*\1\s*\)/gi, function (m, q, u) { return u.charAt(0) === "#" ? m : "none"; });
  }
  function cleanAttrs(n) {
    Array.prototype.slice.call(n.attributes).forEach(function (a) {
      var name = a.name.toLowerCase(), v = a.value, local = (a.localName || "").toLowerCase();
      if (name.indexOf("xmlns") === 0) return;
      if (name.indexOf("on") === 0 || name === "xml:base" || name === "base") { n.removeAttributeNode(a); return; }
      if (local === "href") { if (v.trim().charAt(0) !== "#") n.removeAttributeNode(a); return; }
      if (bad(v)) { n.removeAttributeNode(a); return; }
      if (/url\(/i.test(v)) a.value = unurl(v);
    });
  }
  function cleanTree(el) {
    Array.prototype.slice.call(el.childNodes).forEach(function (n) {
      if (n.nodeType === 7) { el.removeChild(n); return; }
      if (n.nodeType !== 1) return;
      var ln = n.localName.toLowerCase();
      if (DROP[ln] || (TIMING[ln] && /^(on|href|xlink:href|src)/i.test(n.getAttribute("attributeName") || ""))) { el.removeChild(n); return; }
      if (ln === "style") n.textContent = unurl(n.textContent).replace(/@import[^;]*;?/gi, "");
      cleanAttrs(n);
      cleanTree(n);
    });
  }
  /* returns the safe SVG text, or "" when the text is not a plain drawing */
  function cleanSvg(text) {
    var s = String(text == null ? "" : text);
    if (s.length > MAX_SVG || /<!DOCTYPE|<!ENTITY/i.test(s)) return "";
    var a = s.search(/<svg[\s>\/]/i), b = s.toLowerCase().lastIndexOf("</svg>");
    if (a < 0 || b < a) return "";
    s = s.slice(a, b + 6);
    var head = /^<svg\b[^>]*>/i.exec(s)[0], fixed = head;
    if (!/\sxmlns\s*=/.test(head)) fixed = fixed.replace(/^<svg/i, '<svg xmlns="' + SVG_NS + '"');
    if (/xlink:/.test(s) && !/xmlns:xlink/.test(head)) fixed = fixed.replace(/^<svg/i, '<svg xmlns:xlink="' + XLINK_NS + '"');
    s = fixed + s.slice(head.length);
    var doc = new DOMParser().parseFromString(s, "image/svg+xml");
    if (doc.getElementsByTagName("parsererror").length) return "";
    var root = doc.documentElement;
    if (!root || root.localName !== "svg" || root.namespaceURI !== SVG_NS) return "";
    cleanAttrs(root);
    cleanTree(root);
    return new XMLSerializer().serializeToString(root);
  }
  /* copy of a clean drawing with some root attributes set (size, class) */
  function withRoot(svg, attrs) {
    var doc = new DOMParser().parseFromString(svg, "image/svg+xml"), root = doc.documentElement;
    if (!root || root.localName !== "svg") return svg;
    Object.keys(attrs).forEach(function (k) { if (attrs[k] != null && attrs[k] !== "") root.setAttribute(k, String(attrs[k])); });
    return new XMLSerializer().serializeToString(root);
  }
  function parseSize(s) {
    var m = /^\s*(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*$/i.exec(s || "");
    return m ? [parseFloat(m[1]), parseFloat(m[2])] : null;
  }
  function viewBoxSize(svg) {
    var m = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(svg);
    return m ? [parseFloat(m[1]), parseFloat(m[2])] : null;
  }

  /* ---------- the registry: X.assets[name] = { svg, w, h, about } ---------- */
  X.assets = Object.create(null);
  X.artVersion = 0;
  X.cleanSvg = cleanSvg;
  var htmlCache = Object.create(null), imgs = Object.create(null);

  function srcKey(el) {
    var s = el.querySelector("svg");
    return [el.getAttribute("name"), el.getAttribute("size"), el.getAttribute("about"), s ? s.outerHTML : ""].join("\n");
  }
  function readAsset(el) {
    var name = (el.getAttribute("name") || "").trim();
    var svgEl = el.querySelector("svg"), svg = svgEl ? cleanSvg(svgEl.outerHTML) : "";
    /* the page keeps only the cleaned drawing: the original is never loaded (an image link in it would be fetched) */
    if (svgEl) { var t = document.createElement("template"); t.innerHTML = svg; svgEl.replaceWith(t.content); }
    if (!NAME.test(name)) { warn("art: an x-asset needs a name made of letters, digits, _ or -: " + name); return null; }
    if (!svg) { warn('art: asset "' + name + '" is not a plain SVG drawing (it was left out)'); return null; }
    var sz = parseSize(el.getAttribute("size")) || viewBoxSize(svg) || [24, 24];
    if (!parseSize(el.getAttribute("size")) && !viewBoxSize(svg)) warn('art: asset "' + name + '" has no size or viewBox: 24x24 is used');
    return { name: name, entry: { svg: svg, w: sz[0], h: sz[1], about: el.getAttribute("about") || "" } };
  }
  /* reads every x-asset; only the ones whose text changed are cleaned again */
  function refreshAssets() {
    var next = Object.create(null), seen = Object.create(null);
    document.querySelectorAll(ASSET_SEL).forEach(function (el) {
      if (el._src !== srcKey(el)) { el._asset = readAsset(el); el._src = srcKey(el); }
      var a = el._asset; if (!a) return;
      if (seen[a.name]) warn('art: asset "' + a.name + '" is defined twice: the last one is used');
      seen[a.name] = true; next[a.name] = a.entry;
    });
    var names = Object.keys(next), changed = names.length !== Object.keys(X.assets).length;
    names.forEach(function (n) {
      var o = own(X.assets, n) ? X.assets[n] : null, a = next[n];
      if (!o || o.svg !== a.svg || o.w !== a.w || o.h !== a.h || o.about !== a.about) changed = true;
    });
    if (!changed) return;
    Object.keys(X.assets).forEach(function (k) { delete X.assets[k]; });
    names.forEach(function (n) { X.assets[n] = next[n]; });
    htmlCache = Object.create(null);
    X.artVersion++;
  }

  X.art = function (name) { return own(X.assets, name) ? X.assets[name] : null; };

  /* the drawing as inline SVG text, with the classes art art-<name> and a size (the asset's when none is given) */
  X.artHtml = function (name, size) {
    var a = X.art(name), wh = parseSize(size);
    if (!a) {
      if (!name) warn("art: an x-art needs an of=\"name\"");
      else warn('art: no asset named "' + name + '" (add an x-asset with this name)');
      var p = wh || [24, 24];
      return '<span class="art art-missing" style="width:' + p[0] + "px;height:" + p[1] + 'px"></span>';
    }
    wh = wh || [a.w, a.h];
    var key = name + "|" + wh[0] + "x" + wh[1] + "|" + X.artVersion;
    if (!htmlCache[key]) htmlCache[key] = withRoot(a.svg, { "class": "art art-" + name, width: wh[0], height: wh[1] });
    return htmlCache[key];
  };

  /* var(--x, fallback) becomes the value of --x on <body>, so the picture gets the page's colours */
  function resolveVars(svg) {
    var cs = document.body ? getComputedStyle(document.body) : null;
    return svg.replace(/var\(\s*--([\w-]+)\s*(?:,\s*((?:[^()]|\([^()]*\))*))?\)/g, function (all, name, fb) {
      var v = cs ? cs.getPropertyValue("--" + name).trim() : "";
      return v || (fb == null ? "" : fb.trim());
    });
  }
  function flush(e, img) {
    var w = e.waiting; e.waiting = [];
    w.forEach(function (f) { try { f(img); } catch (err) { X.problems.push(String(err)); } });
  }
  function makeEntry(key, svg, a) {
    var e = { key: key, img: null, url: "", ready: false, failed: false, waiting: [] };
    e.url = URL.createObjectURL(new Blob([withRoot(svg, { width: a.w, height: a.h })], { type: "image/svg+xml" }));
    var img = new Image();
    img.onload = function () { e.ready = true; e.img = img; flush(e, img); };
    img.onerror = function () { e.failed = true; warn("art: a drawing could not be made into an image"); flush(e, null); };
    img.src = e.url;
    return e;
  }
  /* cb(image) is called at once when the picture is ready, else when it loads; cb(null) for an unknown name or a failure.
   * The picture is made again when the drawing or the colours it uses change. */
  X.artImage = function (name, cb) {
    var a = X.art(name);
    if (!a) { warn('art: no asset named "' + name + '" (add an x-asset with this name)'); if (cb) cb(null); return; }
    var svg = resolveVars(a.svg), key = svg + "|" + a.w + "x" + a.h;
    var e = own(imgs, name) ? imgs[name] : null;
    if (!e || e.key !== key) {
      if (e && e.url) URL.revokeObjectURL(e.url);
      e = imgs[name] = makeEntry(key, svg, a);
    }
    if (e.failed) { if (cb) cb(null); return; }
    if (e.ready) { if (cb) cb(e.img); return; }
    if (cb && e.waiting.indexOf(cb) < 0) e.waiting.push(cb);
  };

  /* ---------- the page: x-asset definitions and x-art places ---------- */
  function paintArts() {
    document.querySelectorAll(ART_SEL).forEach(function (el) {
      var name = (el.getAttribute("of") || "").trim(), size = el.getAttribute("size") || "";
      var key = name + "|" + size + "|" + X.artVersion;
      if (el._artKey === key) return;
      el._artKey = key;
      el.innerHTML = X.artHtml(name, size);
    });
  }
  function touches(n, sel) { return n.nodeType === 1 && (n.matches(sel) || !!n.querySelector(sel)); }
  function inside(n, sel) { if (n.nodeType === 3) n = n.parentNode; return !!n && n.nodeType === 1 && !!n.closest(sel); }
  /* the state writes its values on <body>; those changes are not art changes */
  function onMutations(list) {
    var assetsDirty = false, artsDirty = false;
    list.forEach(function (rec) {
      if (rec.type === "attributes" && rec.target === document.body) return;
      if (rec.type === "childList" && inside(rec.target, ART_SEL)) return;
      if (inside(rec.target, ASSET_SEL)) assetsDirty = true;
      if (inside(rec.target, ART_SEL)) artsDirty = true;
      Array.prototype.forEach.call(rec.addedNodes, function (n) {
        if (touches(n, ASSET_SEL)) assetsDirty = true;
        if (touches(n, ART_SEL)) artsDirty = true;
      });
      Array.prototype.forEach.call(rec.removedNodes, function (n) {
        if (touches(n, ASSET_SEL)) assetsDirty = true;
        if (touches(n, ART_SEL)) artsDirty = true;
      });
    });
    if (assetsDirty) refreshAssets();
    if (assetsDirty || artsDirty) paintArts();
  }

  X.define("asset", class extends HTMLElement {});
  X.define("art", class extends HTMLElement {});
  X.ready(function () {
    refreshAssets();
    paintArts();
    new MutationObserver(onMutations).observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
  });
})();
