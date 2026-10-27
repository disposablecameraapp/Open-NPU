/**
 * Pointing at a part of a page in the preview, like inspecting an element of a web page: while the "Select" mode is on (a button of the
 * panel; when it is off the page gets every click, left and right, as a game may use them) the part under the pointer is lit up, and a click
 * sends what it is to the window, which asks what should change and sends the request to the chat with the part named. Written for any page; on a page of blocks it also knows the drawings (`x-art`), the tiles of a
 * map and what is under the click on the canvas of a level (`api.at`), and the name of the scene, so the change goes straight to the
 * right part (see `xedit.ts`) instead of being searched for.
 */

export interface PickInfo {
  /** The element, short: `button#play.big`. */
  selector: string;
  tag: string;
  text?: string;
  /** What kind of part it is, for pages of blocks: "drawing", "level", "map tile", "panel"... */
  part?: string;
  /** Its name in the page: the drawing's name, the legend name of the thing, the scene. */
  name?: string;
  /** The scene it is in. */
  scene?: string;
  /** What the level says is under the click (role, legend character, name), when it is a canvas of blocks. */
  role?: string;
  char?: string;
}

export const PICK_SHIM = [
  "(function(){",
  "var inspect=false,box=null,tip=null;",
  "function mk(){if(box)return;box=document.createElement('div');box.style.cssText='position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #4f8cff;background:rgba(79,140,255,.16);border-radius:3px;box-sizing:border-box;display:none;transition:left .12s ease,top .12s ease,width .12s ease,height .12s ease,opacity .2s ease';tip=document.createElement('div');tip.style.cssText='position:absolute;left:-2px;top:-22px;background:#4f8cff;color:#fff;font:600 11px system-ui,sans-serif;padding:2px 7px;border-radius:3px;white-space:nowrap;max-width:260px;overflow:hidden;text-overflow:ellipsis';box.appendChild(tip);document.documentElement.appendChild(box)}",
  "function show(r,label){mk();box.style.display='block';box.style.left=r.left+'px';box.style.top=Math.max(r.top,22)+'px';box.style.width=r.width+'px';box.style.height=(r.top<22?r.height-(22-r.top):r.height)+'px';tip.textContent=label}",
  "function hide(){if(box)box.style.display='none'}",
  "function bounds(el){var r=el.getBoundingClientRect();var l=r.left,t=r.top,rr=r.right,b=r.bottom;var k=el.querySelectorAll?el.querySelectorAll('*'):[];for(var i=0;i<k.length&&i<60;i++){var q=k[i].getBoundingClientRect();if(q.width||q.height){l=Math.min(l,q.left);t=Math.min(t,q.top);rr=Math.max(rr,q.right);b=Math.max(b,q.bottom)}}return {left:l,top:t,width:rr-l,height:b-t}}",
  "function sel(el){var s=el.tagName.toLowerCase();if(el.id)s+='#'+el.id;else if(el.classList&&el.classList.length)s+='.'+el.classList[0];return s}",
  "function up(el,re){while(el&&el.nodeType===1){if(re.test(el.tagName))return el;el=el.parentElement}return null}",
  "function describe(e){var el=e.target;if(!el||el.nodeType!==1)return null;var info={tag:el.tagName.toLowerCase(),selector:sel(el)};",
  "var t=(el.innerText||el.textContent||'').replace(/\\s+/g,' ').trim();if(t&&el.children.length<4)info.text=t.slice(0,80);",
  "var sc=up(el,/^(X|GAME)-SCENE$/);if(sc)info.scene=sc.id;",
  "var art=up(el,/^(X|GAME)-ART$/);if(art){info.part='drawing';info.name=art.getAttribute('of')||'';info.selector=sel(art);return {info:info,el:art}}",
  "var cv=el.tagName==='CANVAS'?el:null;var blk=cv&&up(cv,/^(X|GAME)-PLATFORMER$/);",
  "if(blk&&blk.api&&blk.api.at){var r=cv.getBoundingClientRect();var hit=blk.api.at((e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height);info.part='level';if(hit&&hit.kind!=='none'){info.part=hit.kind==='entity'?'thing in the level':'tile of the level';info.role=hit.role;info.char=hit.char;info.name=hit.name}return {info:info,el:cv,cell:hit,rect:r}}",
  "var tile=up(el,/^DIV$/);if(tile&&tile.classList&&(tile.classList.contains('tile')||tile.classList.contains('entity'))&&up(tile,/^(X|GAME)-MAP$/)){info.part=tile.classList.contains('entity')?'thing on the map':'tile of the map';info.role=(tile.className||'').split(/\\s+/).filter(function(c){return c!=='tile'&&c!=='entity'})[0]||'';info.selector=sel(tile)+'.'+info.role;return {info:info,el:tile}}",
  "var blk2=up(el,/^(X|GAME)-(PLATFORMER|MAP|DIALOG|BATTLE|LIST)$/);if(blk2){info.part=blk2.tagName.toLowerCase().replace(/^game-/,'x-');info.selector=sel(blk2)}",
  "return {info:info,el:el}}",
  "function pick(e){var d=describe(e);if(!d)return;var r=bounds(d.el);",
  "if(d.rect&&d.cell&&d.cell.box){var b=d.cell.box;r={left:d.rect.left+b.x*d.rect.width,top:d.rect.top+b.y*d.rect.height,width:b.w*d.rect.width,height:b.h*d.rect.height}}",
  "show(r,(d.info.part?d.info.part+(d.info.name?' '+d.info.name:''):d.info.selector));try{parent.postMessage({npuPick:d.info},'*')}catch(x){}}",
  "document.addEventListener('contextmenu',function(e){if(!inspect)return;e.preventDefault();e.stopPropagation();pick(e)},true);",
  "document.addEventListener('mousemove',function(e){if(!inspect)return;var d=describe(e);if(d){var r=bounds(d.el);show(r,d.info.part?d.info.part+(d.info.name?' '+d.info.name:''):d.info.selector)}},true);",
  "document.addEventListener('click',function(e){if(!inspect)return;e.preventDefault();e.stopPropagation();pick(e)},true);",
  "document.addEventListener('keydown',function(e){if(e.key==='Escape'&&box&&box.style.display!=='none'){hide();try{parent.postMessage({npuPick:null},'*')}catch(x){}}},true);",
  "window.addEventListener('message',function(e){var d=e.data;if(!d)return;if(typeof d.npuInspect==='boolean'){inspect=d.npuInspect;if(!inspect)hide();document.documentElement.style.cursor=inspect?'crosshair':''}if(d.npuPickClear)hide()});",
  "})();"
].join("");

/** A preview document with the picker, right after its CSP (a script that runs before the page's own). */
export function withPicker(doc: string): string {
  if (doc.includes("npuInspect")) return doc;
  const tag = `<script>${PICK_SHIM}</script>`;
  const meta = doc.match(/<meta http-equiv="Content-Security-Policy"[^>]*>/);
  return meta ? doc.replace(meta[0], `${meta[0]}${tag}`) : doc.replace(/<head[^>]*>/i, (m) => `${m}${tag}`);
}

/** What the part is called, in the words the person would use. */
export function pickLabel(p: PickInfo): string {
  if (p.part === "drawing") return `the drawing "${p.name}"`;
  if (p.part === "thing in the level") return `the ${p.role || "thing"}${p.name && p.name !== p.char ? ` "${p.name}"` : ""} in the level`;
  if (p.part === "tile of the level") return `the ${p.role || "tile"} tiles of the level`;
  if (p.part === "thing on the map") return `the ${p.role || "thing"} on the map`;
  if (p.part === "tile of the map") return `the ${p.role || "tile"} tiles of the map`;
  if (p.part === "level") return "the level";
  if (p.part) return `the ${p.part}${p.name ? ` "${p.name}"` : ""}`;
  return `the ${p.tag}${p.text ? ` "${p.text.length > 40 ? `${p.text.slice(0, 39)}…` : p.text}"` : ""}`;
}

/** The request sent to the chat: the part named with where it is, and what should change. */
export function pickRequest(p: PickInfo, file: string, comment: string): string {
  const where = p.scene ? ` (screen ${p.scene})` : "";
  const what = `${pickLabel(p)}${where}`;
  const detail = [`element: ${p.selector}`, p.role ? `role: ${p.role}` : "", p.char ? `legend character: ${p.char}` : "", p.text ? `text: "${p.text}"` : ""].filter(Boolean).join(", ");
  return `Change ${what} in ${file}: ${comment.trim()}\n(I pointed at it in the preview — ${detail})`;
}
