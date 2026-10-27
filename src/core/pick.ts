/**
 * Pointing at a part of a page in the preview (the game is paused while the mode is on, so what is pointed at stays where it is), like inspecting an element of a web page: while the "Select" mode is on (a button of the
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
  /** A number the frame gives each part pointed at, to find it again (the marks and the chips of the chat share it). */
  uid?: number;
  /** What the level says is under the click (role, legend character, name), when it is a canvas of blocks. */
  role?: string;
  char?: string;
}

export const PICK_SHIM = [
  "(function(){",
  // the colour is the app's own accent (the window sends it), the same purple as every other selection of the app
  "var inspect=false,hov=null,layer=null,marks=[],uid=0,acc='#4e288f',ink='#ffffff';",
  "function lum(h){var m=/^#?([0-9a-f]{6})$/i.exec((h||'').trim());if(!m)return 0;var n=parseInt(m[1],16);return (0.2126*((n>>16)&255)+0.7152*((n>>8)&255)+0.0722*(n&255))/255}",
  "function root(){if(layer)return layer;layer=document.createElement('div');layer.style.cssText='position:absolute;left:0;top:0;width:0;height:0;z-index:2147483646;pointer-events:none';document.documentElement.appendChild(layer);return layer}",
  "function boxEl(){var d=document.createElement('div');d.style.cssText='position:absolute;box-sizing:border-box;border-radius:8px;transition:opacity .2s ease';paint(d);return d}",
  "function paint(d){d.style.border='2px solid '+acc;d.style.background='color-mix(in srgb,'+acc+' 12%,transparent)';d.style.boxShadow='0 0 0 3px color-mix(in srgb,'+acc+' 28%,transparent),inset 0 0 0 1px rgba(255,255,255,.5)'}",
  // the name, with what a click does, in a small rounded label over the part
  "function tip(){var t=document.createElement('div');t.style.cssText='position:absolute;left:0;bottom:calc(100% + 8px);display:flex;gap:7px;align-items:baseline;padding:5px 10px;border-radius:9px;background:#2b2b2b;color:#fff;font:600 12px/1.2 system-ui,sans-serif;white-space:nowrap;max-width:320px;box-shadow:0 2px 8px rgba(0,0,0,.3)';var n=document.createElement('span');n.style.cssText='overflow:hidden;text-overflow:ellipsis';var h=document.createElement('span');h.style.cssText='font-weight:400;opacity:.72';t.appendChild(n);t.appendChild(h);t.n=n;t.h=h;return t}",
  // once added: a rounded square with its number and a small tick, in the middle of the part
  "function badge(){var b=document.createElement('div');b.style.cssText='position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);min-width:32px;height:32px;padding:0 8px;box-sizing:border-box;border-radius:9px;display:flex;align-items:center;justify-content:center;background:'+acc+';color:'+ink+';font:700 16px/1 system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.3)';var n=document.createElement('span');b.appendChild(n);var k=document.createElement('i');k.textContent='\\u2713';k.style.cssText='position:absolute;right:-6px;top:-6px;width:16px;height:16px;border-radius:50%;background:#fff;color:'+acc+';font:700 11px/16px system-ui,sans-serif;text-align:center;font-style:normal;box-shadow:0 1px 3px rgba(0,0,0,.35)';b.appendChild(k);b.n=n;return b}",
  "function bounds(el){var r=el.getBoundingClientRect();var l=r.left,t=r.top,rr=r.right,b=r.bottom;var k=el.querySelectorAll?el.querySelectorAll('*'):[];for(var i=0;i<k.length&&i<60;i++){var q=k[i].getBoundingClientRect();if(q.width||q.height){l=Math.min(l,q.left);t=Math.min(t,q.top);rr=Math.max(rr,q.right);b=Math.max(b,q.bottom)}}return {left:l+scrollX,top:t+scrollY,width:rr-l,height:b-t}}",
  "function place(d,r){d.style.left=r.left+'px';d.style.top=r.top+'px';d.style.width=r.width+'px';d.style.height=Math.max(8,r.height)+'px'}",
  "function sel(el){var s=el.tagName.toLowerCase();if(el.id)s+='#'+el.id;else if(el.classList&&el.classList.length)s+='.'+el.classList[0];return s}",
  "function up(el,re){while(el&&el.nodeType===1){if(re.test(el.tagName))return el;el=el.parentElement}return null}",
  "function describe(e){var el=e.target;if(!el||el.nodeType!==1)return null;var info={tag:el.tagName.toLowerCase(),selector:sel(el)};",
  "var t=(el.innerText||el.textContent||'').replace(/\\s+/g,' ').trim();if(t&&el.children.length<4)info.text=t.slice(0,80);",
  "var sc=up(el,/^(X|GAME)-SCENE$/);if(sc)info.scene=sc.id;",
  "var art=up(el,/^(X|GAME)-ART$/);if(art){info.part='drawing';info.name=art.getAttribute('of')||'';info.selector=sel(art);return {info:info,el:art,key:'art:'+info.name}}",
  "var cv=el.tagName==='CANVAS'?el:null;var own=cv&&cv.api&&cv.api.at;var blk=cv&&!own&&up(cv,/^(X|GAME)-PLATFORMER$/);var api=own?cv.api:(blk&&blk.api);",
  "if(cv&&api&&api.at){var r=cv.getBoundingClientRect();var hit=api.at((e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height);var what=own?'game':'level';info.part=what;if(hit&&hit.kind!=='none'){info.part=hit.kind==='entity'?'thing in the '+what:'tile of the '+what;info.role=hit.role;info.char=hit.char;info.name=hit.name}return {info:info,el:cv,cell:hit,key:'cv:'+(hit?hit.name+':'+hit.char+':'+hit.role:'')}}",
  "var tile=up(el,/^DIV$/);if(tile&&tile.classList&&(tile.classList.contains('tile')||tile.classList.contains('entity'))&&up(tile,/^(X|GAME)-MAP$/)){info.part=tile.classList.contains('entity')?'thing on the map':'tile of the map';info.role=(tile.className||'').split(/\\s+/).filter(function(c){return c!=='tile'&&c!=='entity'})[0]||'';info.selector=sel(tile)+'.'+info.role;return {info:info,el:tile,key:'tile:'+info.part+info.role}}",
  "var blk2=up(el,/^(X|GAME)-(PLATFORMER|MAP|DIALOG|BATTLE|LIST)$/);if(blk2){info.part=blk2.tagName.toLowerCase().replace(/^game-/,'x-');info.selector=sel(blk2)}",
  "return {info:info,el:el,key:'el:'+info.selector+':'+(info.text||'')}}",
  "function rectOf(d){var r=bounds(d.el);if(d.cell&&d.cell.box){var c=d.el.getBoundingClientRect();var b=d.cell.box;r={left:c.left+scrollX+b.x*c.width,top:c.top+scrollY+b.y*c.height,width:b.w*c.width,height:b.h*c.height}}return r}",
  "function label(i){return i.part?(/^thing/.test(i.part)&&(i.name||i.role)?(i.name||i.role):(i.part+(i.name?' '+i.name:''))):(i.tag+(i.text?' \"'+i.text.slice(0,24)+'\"':''))}",
  "function marked(key){for(var j=0;j<marks.length;j++)if(marks[j].key===key)return marks[j];return null}",
  "function hover(e){var d=describe(e);if(!d){if(hov)hov.style.opacity=0;return}if(!hov){hov=boxEl();hov.tip=tip();hov.appendChild(hov.tip);root().appendChild(hov)}var m=marked(d.key);hov.style.opacity=1;hov.style.borderStyle=m?'solid':'dashed';var r=rectOf(d);place(hov,r);hov.tip.style.bottom=r.top<44?'auto':'calc(100% + 8px)';hov.tip.style.top=r.top<44?'calc(100% + 8px)':'auto';hov.tip.n.textContent=label(d.info);hov.tip.h.textContent=m?'click to take it off the message':'click to add to message'}",
  "function toggle(e){var d=describe(e);if(!d)return;var m=marked(d.key);if(m){marks.splice(marks.indexOf(m),1);m.box.remove();try{parent.postMessage({npuUnpick:m.uid},'*')}catch(x){}return}",
  "var u=++uid;d.info.uid=u;var box=boxEl();var bd=badge();bd.n.textContent='';box.appendChild(bd);place(box,rectOf(d));root().appendChild(box);marks.push({uid:u,key:d.key,d:d,box:box,badge:bd});try{parent.postMessage({npuPick:d.info},'*')}catch(x){}}",
  "function number(list){marks=marks.filter(function(m){var k=list.indexOf(m.uid);if(k<0){m.box.remove();return false}m.badge.n.textContent=k+1;return true})}",
  "function again(){for(var i=0;i<marks.length;i++)place(marks[i].box,rectOf(marks[i].d))}",
  "function restyle(){var dark=lum(acc)>0.6;ink=dark?'#1f1e1d':'#ffffff';for(var i=0;i<marks.length;i++){paint(marks[i].box);marks[i].badge.style.background=acc;marks[i].badge.style.color=ink;marks[i].badge.lastChild.style.color=acc}if(hov)paint(hov)}",
  "document.addEventListener('contextmenu',function(e){if(!inspect)return;e.preventDefault();e.stopPropagation();toggle(e)},true);",
  "document.addEventListener('mousemove',function(e){if(inspect)hover(e)},true);",
  "document.addEventListener('click',function(e){if(!inspect)return;e.preventDefault();e.stopPropagation();toggle(e);hover(e)},true);",
  "window.addEventListener('resize',again);setInterval(again,600);",
  "window.addEventListener('message',function(e){var d=e.data;if(!d)return;if(d.accent&&d.accent!==acc){acc=d.accent;restyle()}if(typeof d.npuInspect==='boolean'){inspect=d.npuInspect;window.__npuPaused=inspect;if(!inspect&&hov)hov.style.opacity=0;document.documentElement.style.cursor=inspect?'crosshair':''}if(d.npuMarks)number(d.npuMarks)});",
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
  if (p.part === "thing in the game") return `the ${p.name || p.role || "thing"} in the game`;
  if (p.part === "game") return "the game";
  if (p.part === "thing in the level") return `the ${p.role || "thing"}${p.name && p.name !== p.char ? ` "${p.name}"` : ""} in the level`;
  if (p.part === "tile of the level") return `the ${p.role || "tile"} tiles of the level`;
  if (p.part === "thing on the map") return `the ${p.role || "thing"} on the map`;
  if (p.part === "tile of the map") return `the ${p.role || "tile"} tiles of the map`;
  if (p.part === "level") return "the level";
  if (p.part) return `the ${p.part}${p.name ? ` "${p.name}"` : ""}`;
  return `the ${p.tag}${p.text ? ` "${p.text.length > 40 ? `${p.text.slice(0, 39)}…` : p.text}"` : ""}`;
}
