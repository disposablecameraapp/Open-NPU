import { ICON_PATHS } from "./icons.generated";
import { iconFor, iconMarkup } from "./icons";

/**
 * The icons offered to a page or a game written by hand: Lucide (ISC), the same set as the websites made of blocks. A page that wants them
 * writes <script src="lib:icons"></script> and calls icon("heart"), or puts <i data-icon="heart"></i> in its HTML. The app writes into the
 * file only the icons the page names, as inline SVG, so the file needs no network and no library. Using icons is always optional.
 */
const CALL = /\b(?:icon|iconImage)\(\s*["'`]([^"'`]{1,40})["'`]/g;
const ATTR = /\bdata-icon\s*=\s*["']([^"']{1,40})["']/g;
const WORD = /["'`]([a-z][a-z0-9-]{1,30})["'`]/g;

/** The icons a page names: the ones it asks for (an exact name or a meaning such as "secure"), and any string that is an icon name. */
export function iconsUsed(page: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const re of [CALL, ATTR]) for (const m of page.matchAll(re)) { const n = iconFor(m[1]); if (n) out[m[1]] = iconMarkup(n); }
  for (const m of page.matchAll(WORD)) if (ICON_PATHS[m[1]] && !out[m[1]]) out[m[1]] = iconMarkup(m[1]);
  return out;
}

/** The script that gives a page its icon(name, {size, color, stroke}) (an SVG string), iconImage(name, options) (an Image for a canvas) and data-icon elements. */
export function iconsSource(page: string): string {
  const map = JSON.stringify(iconsUsed(page));
  return `(function(){var I=${map};
function svg(n,o){o=o||{};var p=I[n];if(!p)return"";var s=o.size||24;return'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="'+s+'" height="'+s+'" fill="none" stroke="'+(o.color||"currentColor")+'" stroke-width="'+(o.stroke||2)+'" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+p+'</svg>'}
window.icon=svg;
window.iconImage=function(n,o){var im=new Image();im.src="data:image/svg+xml;utf8,"+encodeURIComponent(svg(n,o));return im};
function hydrate(){var a=document.querySelectorAll("[data-icon]");for(var i=0;i<a.length;i++){var e=a[i];if(!e.firstChild)e.innerHTML=svg(e.getAttribute("data-icon"),{size:+e.getAttribute("data-size")||24})}}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",hydrate);else hydrate();})();`;
}

/** The line that tells a writer about the option. Short on purpose: it is part of every file-writing prompt. */
export const ICONS_NOTE = 'Icons are optional: <script src="lib:icons"></script> gives icon("heart", {size: 24, color}) (an inline SVG string), <i data-icon="star"></i> in the HTML, and iconImage("rocket") (an Image for a canvas). Names are Lucide icons (heart, star, rocket, shield, user, mail, home, play, trophy, zap, flame, skull...); a meaning such as "secure" also works. Never link an icon CDN; an emoji or no icon at all is just as fine.';
