import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PageSpec } from "./catalog";
import { PageView } from "./blocks";
import { pageLook } from "./theme";
import { PAGE_SCRIPT } from "./css";
import { ANIMATE_CSS, AOS_CSS, AOS_JS, COUNTUP_JS, VENDOR_LICENSES } from "./vendor.generated";
import { ICON_LICENSE } from "./icons.generated";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Which libraries a page needs: only what it uses is put in the file. */
function needs(spec: PageSpec, motion: string) {
  const sections = (spec.sections ?? []).filter((x) => typeof x.type === "string");
  const on = motion !== "none";
    return {
    aos: on && sections.some((x) => x.type !== "hero" && x.animate !== "none"),
    animate: on,
    count: on && sections.some((x) => x.type === "stats" && Array.isArray(x.items) && (x.items as { value?: string }[]).some((it) => /\d/.test(String(it.value ?? ""))))
  };
}
interface Asset { name: string; kind: "css" | "js"; content: string; banner: string }
const BANNER = (what: string) => `/*! ${what} — MIT License, see licenses.txt */`;

function document(spec: PageSpec, mode: "inline" | "split"): { html: string; assets: Asset[] } {
  const look = pageLook(spec);
  const body = renderToStaticMarkup(createElement(PageView, { spec, look }));
  const n = needs(spec, look.motion);
  const head: Asset[] = [
    { name: "style.css", kind: "css", content: look.css, banner: "" },
    ...(n.animate ? [{ name: "vendor/animate.css", kind: "css" as const, content: ANIMATE_CSS, banner: BANNER("animate.css 4.1.1 (subset), Daniel Eden") }] : []),
    ...(n.aos ? [{ name: "vendor/aos.css", kind: "css" as const, content: AOS_CSS, banner: BANNER("AOS 2.3.4, Michał Sajnóg") }] : [])
  ];
  const tail: Asset[] = [
    ...(n.aos ? [{ name: "vendor/aos.js", kind: "js" as const, content: AOS_JS, banner: BANNER("AOS 2.3.4, Michał Sajnóg") }] : []),
    ...(n.count ? [{ name: "vendor/countUp.js", kind: "js" as const, content: COUNTUP_JS, banner: BANNER("countUp.js 2.10, inorganik") }] : []),
    ...(look.motion === "none" ? [] : [{ name: "script.js", kind: "js" as const, content: PAGE_SCRIPT, banner: "" }])
  ];
  const json = `<script type="application/json" id="site-spec">${JSON.stringify(spec).replace(/</g, "\\u003c")}</script>`;
  const tag = (a: Asset) => mode === "split" ? (a.kind === "css" ? `<link rel="stylesheet" href="${a.name}">` : `<script src="${a.name}"></script>`) : (a.kind === "css" ? `<style>\n${a.banner}\n${a.content.replace(/<\/style/gi, "<\\/style")}\n</style>` : `<script>\n${a.banner}\n${a.content.replace(/<\/script/gi, "<\\/script")}\n</script>`);
  const html = `<!DOCTYPE html>
<!-- Icons: Lucide (ISC License, Copyright Lucide Icons and Contributors). Animation libraries, when present: AOS, animate.css, countUp.js (MIT License). Full texts in licenses.txt of the exported site. -->
<html lang="${esc(spec.language || "en")}" data-motion="${look.motion}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(spec.title || "Site")}</title>
${head.map(tag).join("\n")}
${n.aos ? "<noscript><style>[data-aos]{opacity:1!important;transform:none!important}</style></noscript>" : ""}
</head>
<body>
${body}
${json}
${tail.map(tag).join("\n")}
</body>
</html>
`;
  return { html, assets: [...head, ...tail] };
}
/** The page as one self-contained HTML file: no network, the libraries it uses inside, the description kept inside so it can be edited again. */
export const pageToHtml = (spec: PageSpec): string => document(spec, "inline").html;
/** The page as the files of a small site, ready to put on any host: index.html, style.css, script.js, the libraries it uses in vendor/, licenses.txt and the description (page.json). */
export function pageToFiles(spec: PageSpec): { name: string; content: string }[] {
  const d = document(spec, "split");
  return [{ name: "index.html", content: d.html }, ...d.assets.map((a) => ({ name: a.name, content: `${a.banner ? `${a.banner}\n` : ""}${a.content}\n` })), { name: "licenses.txt", content: `${VENDOR_LICENSES}\n\n${ICON_LICENSE}\n` }, { name: "page.json", content: `${JSON.stringify(spec, null, 2)}\n` }];
}
/** The description found back in a page made by `pageToHtml`; null for any other page. */
export function pageSpecOf(html: string): PageSpec | null {
  const m = /<script type="application\/json" id="site-spec">([\s\S]*?)<\/script>/.exec(html);
  if (!m) return null;
  try { const v = JSON.parse(m[1]); return v && Array.isArray(v.sections) ? (v as PageSpec) : null; } catch { return null; }
}
