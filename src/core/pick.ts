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
  /** A number the frame gives each part pointed at, to find it again (the marks and the chips of the chat share it). */
  uid?: number;
  /** What the level says is under the click (role, legend character, name), when it is a canvas of blocks. */
  role?: string;
  char?: string;
}

export const PICK_SHIM = [
  "(function(){",
  // the look is the app's own: the dark tab with a blue number of a chip, and the blue of that number
  "var inspect=false,hov=null,layer=null,marks=[],uid=0,BLUE='#2f6fdb',DARK='#3d3d3d';",
  "function root(){if(layer)return layer;layer=document.createElement('div');layer.style.cssText='position:absolute;left:0;top:0;width:0;height:0;z-index:2147483646;pointer-events:none';document.documentElement.appendChild(layer);return layer}",
  "function tab(label,on,n){var t=document.createElement('div');t.style.cssText='position:absolute;left:-2px;bottom:100%;display:flex;height:24px;align-items:flex-end;user-select:none';var l=document.createElement('b');l.style.cssText='display:block;box-sizing:border-box;min-width:40px;max-width:260px;height:24px;line-height:24px;padding:0 12px;border-radius:7px 0 0 0;background:'+DARK+';color:#fff;font:600 13px/24px system-ui,sans-serif;letter-spacing:.02em;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';l.textContent=label;var k=document.createElement('span');k.style.cssText='box-sizing:border-box;margin-left:2px;min-width:30px;height:24px;line-height:24px;padding:0 9px;border-radius:0 7px 0 0;color:#fff;font:600 13px/24px system-ui,sans-serif;text-align:center;white-space:nowrap';t.appendChild(l);t.appendChild(k);t.lab=l;t.pk=k;mark(t,on,n);return t}",
  "function mark(t,on,n){t.pk.style.background=on?BLUE:'#5a5a5a';t.pk.textContent=on?'\\u2713 '+(n||''):'+'}",
  "function boxEl(solid){var d=document.createElement('div');d.style.cssText='position:absolute;box-sizing:border-box;border-radius:6px;border:2px '+(solid?'solid':'dashed')+' '+BLUE+';background:rgba(47,111,219,'+(solid?'.14':'.08')+');transition:opacity .2s ease';return d}",
  "function bounds(el){var r=el.getBoundingClientRect();var l=r.left,t=r.top,rr=r.right,b=r.bottom;var k=el.querySelectorAll?el.querySelectorAll('*'):[];for(var i=0;i<k.length&&i<60;i++){var q=k[i].getBoundingClientRect();if(q.width||q.height){l=Math.min(l,q.left);t=Math.min(t,q.top);rr=Math.max(rr,q.right);b=Math.max(b,q.bottom)}}return {left:l+scrollX,top:t+scrollY,width:rr-l,height:b-t}}",
  "function place(d,r){d.style.left=r.left+'px';d.style.top=Math.max(r.top,26)+'px';d.style.width=r.width+'px';d.style.height=Math.max(8,r.height-(r.top<26?26-r.top:0))+'px'}",
  "function sel(el){var s=el.tagName.toLowerCase();if(el.id)s+='#'+el.id;else if(el.classList&&el.classList.length)s+='.'+el.classList[0];return s}",
  "function up(el,re){while(el&&el.nodeType===1){if(re.test(el.tagName))return el;el=el.parentElement}return null}",
  "function describe(e){var el=e.target;if(!el||el.nodeType!==1)return null;var info={tag:el.tagName.toLowerCase(),selector:sel(el)};",
  "var t=(el.innerText||el.textContent||'').replace(/\\s+/g,' ').trim();if(t&&el.children.length<4)info.text=t.slice(0,80);",
  "var sc=up(el,/^(X|GAME)-SCENE$/);if(sc)info.scene=sc.id;",
  "var art=up(el,/^(X|GAME)-ART$/);if(art){info.part='drawing';info.name=art.getAttribute('of')||'';info.selector=sel(art);return {info:info,el:art,key:'art:'+info.name}}",
  "var cv=el.tagName==='CANVAS'?el:null;var blk=cv&&up(cv,/^(X|GAME)-PLATFORMER$/);",
  "if(blk&&blk.api&&blk.api.at){var r=cv.getBoundingClientRect();var hit=blk.api.at((e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height);info.part='level';if(hit&&hit.kind!=='none'){info.part=hit.kind==='entity'?'thing in the level':'tile of the level';info.role=hit.role;info.char=hit.char;info.name=hit.name}return {info:info,el:cv,cell:hit,key:'cv:'+(hit?hit.char+':'+hit.role:'')}}",
  "var tile=up(el,/^DIV$/);if(tile&&tile.classList&&(tile.classList.contains('tile')||tile.classList.contains('entity'))&&up(tile,/^(X|GAME)-MAP$/)){info.part=tile.classList.contains('entity')?'thing on the map':'tile of the map';info.role=(tile.className||'').split(/\\s+/).filter(function(c){return c!=='tile'&&c!=='entity'})[0]||'';info.selector=sel(tile)+'.'+info.role;return {info:info,el:tile,key:'tile:'+info.part+info.role}}",
  "var blk2=up(el,/^(X|GAME)-(PLATFORMER|MAP|DIALOG|BATTLE|LIST)$/);if(blk2){info.part=blk2.tagName.toLowerCase().replace(/^game-/,'x-');info.selector=sel(blk2)}",
  "return {info:info,el:el,key:'el:'+info.selector+':'+(info.text||'')}}",
  "function rectOf(d){var r=bounds(d.el);if(d.cell&&d.cell.box){var c=d.el.getBoundingClientRect();var b=d.cell.box;r={left:c.left+scrollX+b.x*c.width,top:c.top+scrollY+b.y*c.height,width:b.w*c.width,height:b.h*c.height}}return r}",
  "function label(i){return i.part?i.part+(i.name?' '+i.name:''):i.tag+(i.text?' \"'+i.text.slice(0,24)+'\"':'')}",
  "function hover(e){var d=describe(e);if(!d){if(hov)hov.style.opacity=0;return}if(!hov){hov=boxEl(false);hov.tab=tab('',false);hov.appendChild(hov.tab);root().appendChild(hov)}hov.style.opacity=1;place(hov,rectOf(d));var was=false;for(var j=0;j<marks.length;j++)if(marks[j].key===d.key){was=marks[j].n||true}hov.tab.lab.textContent=label(d.info);mark(hov.tab,!!was,typeof was==='number'?was:'')}",
  "function toggle(e){var d=describe(e);if(!d)return;for(var i=0;i<marks.length;i++){if(marks[i].key===d.key){var m=marks.splice(i,1)[0];m.box.remove();try{parent.postMessage({npuUnpick:m.uid},'*')}catch(x){}return}}",
  "var uidNow=++uid;d.info.uid=uidNow;var box=boxEl(true);var t=tab(label(d.info),true,'');box.appendChild(t);place(box,rectOf(d));root().appendChild(box);marks.push({uid:uidNow,key:d.key,d:d,box:box,tab:t});try{parent.postMessage({npuPick:d.info},'*')}catch(x){}}",
  "function number(list){marks=marks.filter(function(m){var k=list.indexOf(m.uid);if(k<0){m.box.remove();return false}m.n=k+1;mark(m.tab,true,k+1);return true})}",
  "function again(){for(var i=0;i<marks.length;i++)place(marks[i].box,rectOf(marks[i].d))}",
  "document.addEventListener('contextmenu',function(e){if(!inspect)return;e.preventDefault();e.stopPropagation();toggle(e)},true);",
  "document.addEventListener('mousemove',function(e){if(inspect)hover(e)},true);",
  "document.addEventListener('click',function(e){if(!inspect)return;e.preventDefault();e.stopPropagation();toggle(e)},true);",
  "window.addEventListener('resize',again);setInterval(again,600);",
  "window.addEventListener('message',function(e){var d=e.data;if(!d)return;if(typeof d.npuInspect==='boolean'){inspect=d.npuInspect;if(!inspect&&hov)hov.style.opacity=0;document.documentElement.style.cursor=inspect?'crosshair':''}if(d.npuMarks)number(d.npuMarks)});",
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
