const STYLE_PROPS = ["fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "opacity", "font-size", "font-weight", "font-family", "text-anchor"];

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

const fileName = (title: string, ext: string) => `${(title || "chart").toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "chart"}.${ext}`;

/** The chart as shown, as a standalone SVG: the page's styles written into each element, a background, no hover read-out. */
function standaloneSvg(svg: SVGSVGElement): { text: string; w: number; h: number } {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const from = [svg, ...svg.querySelectorAll("*")], to = [clone, ...clone.querySelectorAll("*")];
  from.forEach((el, i) => {
    const cs = getComputedStyle(el);
    const style = STYLE_PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(";");
    to[i].setAttribute("style", style);
  });
  clone.querySelectorAll(".chart-hover").forEach((n) => n.remove());
  const vb = svg.viewBox.baseVal;
  const w = vb.width || 620, h = vb.height || 340;
  let bg = getComputedStyle(document.body).backgroundColor;
  if (!bg || bg === "rgba(0, 0, 0, 0)") bg = "#ffffff";
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("width", String(w)); rect.setAttribute("height", String(h)); rect.setAttribute("fill", bg);
  clone.insertBefore(rect, clone.firstChild);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(w)); clone.setAttribute("height", String(h));
  return { text: new XMLSerializer().serializeToString(clone), w, h };
}

export function exportSvg(svg: SVGSVGElement, title: string) {
  download(new Blob([standaloneSvg(svg).text], { type: "image/svg+xml" }), fileName(title, "svg"));
}

export async function exportPng(svg: SVGSVGElement, title: string) {
  const { text, w, h } = standaloneSvg(svg);
  const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((ok, bad) => { img.onload = () => ok(); img.onerror = () => bad(new Error("the chart could not be turned into a picture")); img.src = url; });
    const c = document.createElement("canvas");
    c.width = w * 2; c.height = h * 2;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.scale(2, 2);
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/png"));
    if (blob) download(blob, fileName(title, "png"));
  } finally { URL.revokeObjectURL(url); }
}

export function exportJson(raw: string, title: string) {
  download(new Blob([raw.trim() + "\n"], { type: "application/json" }), fileName(title, "json"));
}
