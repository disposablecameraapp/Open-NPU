import type { Theme } from "../slides";
import { inkOn, mixColor } from "../color";

const SERIF = /georgia|cambria|palatino|garamond|times/i;
export const stack = (f: string) => `'${f}', ${SERIF.test(f) ? "Georgia, 'Times New Roman', serif" : "'Segoe UI', system-ui, -apple-system, Calibri, Arial, sans-serif"}`;

/** The stylesheet of a page: the theme as CSS variables and the look of every block. */
export function pageCss(t: Theme, radius: string, space: string): string {
  const on = inkOn(t.accent), line = mixColor(t.bg, t.text, 0.14), a2 = t.accents[1] ?? t.accent;
  return `:root{--bg:#${t.bg};--text:#${t.text};--title:#${t.title};--muted:#${t.muted};--accent:#${t.accent};--accent2:#${a2};--panel:#${t.panel};--line:#${line};--on:#${on};--r:${radius};--sp:${space}}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--text);font:17px/1.65 ${stack(t.bodyFont)}}
h1,h2,h3{font-family:${stack(t.titleFont)};color:var(--title);line-height:1.15;margin:0 0 .5em}h1{font-size:clamp(2.3rem,5.5vw,4rem)}h2{font-size:clamp(1.7rem,3.4vw,2.5rem)}h3{font-size:1.2rem}p{margin:0 0 1em}a{color:var(--accent)}
.wrap{max-width:1080px;margin:0 auto;padding:0 24px}.muted{color:var(--muted)}
nav{position:sticky;top:0;z-index:10;background:color-mix(in srgb,var(--bg) 86%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}nav .wrap{display:flex;align-items:center;gap:20px;height:64px}nav b{font-family:${stack(t.titleFont)};color:var(--title);font-size:1.15rem;margin-right:auto}nav a{color:var(--text);text-decoration:none;font-size:.95rem}nav a:hover{color:var(--accent)}
@media(max-width:720px){nav a:not(.btn){display:none}}
.btn{display:inline-block;padding:.8em 1.5em;border-radius:var(--r);background:var(--accent);color:var(--on)!important;font-weight:600;text-decoration:none;border:2px solid var(--accent)}.btn.alt{background:transparent;color:var(--accent)!important}
section{padding:var(--sp) 0}section.alt{background:var(--panel)}section>.wrap>header{max-width:680px;margin-bottom:40px}section>.wrap>header.c{margin-left:auto;margin-right:auto;text-align:center}
.hero{position:relative;overflow:hidden;padding:calc(var(--sp)*1.3) 0}.hero .bg{position:absolute;inset:0;z-index:0}.hero .bg svg{width:100%;height:100%;display:block}.hero .bg:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,var(--bg) 0%,color-mix(in srgb,var(--bg) 60%,transparent) 45%,transparent 80%)}.hero.center .bg:after{background:radial-gradient(ellipse at center,color-mix(in srgb,var(--bg) 70%,transparent) 0%,transparent 70%)}.hero .wrap{position:relative;z-index:1}.hero .lead{font-size:1.25rem;max-width:620px;color:var(--muted)}.hero.center{text-align:center}.hero.center .lead{margin-left:auto;margin-right:auto}.hero .btns{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}.hero.center .btns{justify-content:center}
.hero.split .wrap{display:grid;grid-template-columns:1.1fr .9fr;gap:40px;align-items:center}.hero .art{aspect-ratio:1;border-radius:calc(var(--r)*3);background:linear-gradient(135deg,var(--accent),var(--accent2));display:grid;place-items:center;font-size:6rem;box-shadow:0 30px 60px -30px var(--accent)}@media(max-width:820px){.hero.split .wrap{grid-template-columns:1fr}.hero .art{display:none}}
.grid{display:grid;gap:22px;grid-template-columns:repeat(auto-fit,minmax(230px,1fr))}.card{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:26px}section.alt .card{background:var(--bg)}.card .ic{font-size:2rem;margin-bottom:10px;display:block;line-height:1}.ic svg,.art svg,.av svg,.tile svg{width:1.9rem;height:1.9rem;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.card .ic svg{color:var(--accent);width:2.1rem;height:2.1rem}.av svg{width:1.7rem;height:1.7rem}.hero .art svg{width:38%;height:38%;stroke-width:1.5;color:var(--on)}.tile svg{width:2.6rem;height:2.6rem;margin-bottom:4px}.card p{color:var(--muted);margin:0}
.price{font-size:2.4rem;font-weight:700;color:var(--title);font-family:${stack(t.titleFont)}}.card.pop{border:2px solid var(--accent);position:relative}.badge{display:inline-block;font-size:.75rem;font-weight:700;padding:.2em .8em;border-radius:99px;background:var(--accent);color:var(--on);margin-bottom:10px}ul.pts{list-style:none;padding:0;margin:14px 0 18px}ul.pts li{padding:5px 0 5px 24px;position:relative;color:var(--text)}ul.pts li:before{content:"✓";position:absolute;left:0;color:var(--accent);font-weight:700}
.stats .v{font-size:3rem;font-weight:700;color:var(--accent);font-family:${stack(t.titleFont)};line-height:1}.stats .card{text-align:center}
.steps .n{width:42px;height:42px;border-radius:50%;background:var(--accent);color:var(--on);display:grid;place-items:center;font-weight:700;margin-bottom:12px}
blockquote{margin:0;font-size:1.1rem;font-style:italic}.who{margin-top:14px;font-style:normal;font-size:.9rem;color:var(--muted)}
details{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px 22px;margin-bottom:12px}section.alt details{background:var(--bg)}summary{cursor:pointer;font-weight:600;color:var(--title)}details p{margin:12px 0 0;color:var(--muted)}
.tl{border-left:3px solid var(--accent);padding-left:26px;margin-left:8px}.tl .e{position:relative;margin-bottom:28px}.tl .e:before{content:"";position:absolute;left:-35px;top:6px;width:14px;height:14px;border-radius:50%;background:var(--accent)}.tl .when{font-weight:700;color:var(--accent)}
.av{width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent2));color:var(--on);display:grid;place-items:center;font-size:1.8rem;margin-bottom:12px}
.tile{aspect-ratio:4/3;border-radius:var(--r);display:grid;place-items:center;font-size:3rem;color:var(--on);text-align:center;padding:12px}.tile span{font-size:.95rem;font-weight:600}
.menu .row{display:flex;gap:12px;align-items:baseline;padding:12px 0;border-bottom:1px dashed var(--line)}.menu .row h3{margin:0}.menu .row .dots{flex:1}.menu .row .v{font-weight:700;color:var(--accent)}
.logos{display:flex;flex-wrap:wrap;gap:12px 36px;justify-content:center;color:var(--muted);font-weight:700;font-size:1.15rem;letter-spacing:.04em}
.cta{text-align:center;background:var(--accent);color:var(--on)}.cta h2,.cta p{color:var(--on)}.cta .btn{background:var(--on);color:var(--accent)!important;border-color:var(--on)}
form{display:grid;gap:14px;max-width:560px}input,textarea{font:inherit;padding:.8em 1em;border-radius:var(--r);border:1px solid var(--line);background:var(--bg);color:var(--text)}
footer{padding:40px 0;border-top:1px solid var(--line);color:var(--muted);font-size:.92rem}footer .wrap{display:flex;gap:20px;flex-wrap:wrap;justify-content:space-between}footer a{color:var(--muted);margin-left:16px}`;
}

/**
 * What moves is done by libraries (AOS for scroll reveals, animate.css for entrances, countUp.js for figures, tsParticles for
 * particles: all MIT, see vendor.generated.ts). This is what no library covers: hover lifts, the hero effects made of CSS
 * (aurora, floating shapes, a shifting gradient), the typed title. Nothing moves when the system asks for less motion.
 */
export const ANIMATION_CSS = `.card,.btn{transition:transform .25s ease,box-shadow .25s ease,background .25s}.card:hover{transform:translateY(-5px);box-shadow:0 18px 34px -22px var(--accent)}.btn:hover{transform:translateY(-2px);box-shadow:0 12px 24px -14px var(--accent)}
html[data-motion=lively] .card:hover{transform:translateY(-8px) scale(1.02)}html[data-motion=lively] .btn:hover{transform:translateY(-3px) scale(1.05)}
[data-aos]{pointer-events:auto}
.hero .bg>div{overflow:hidden}.hero canvas.particles{position:absolute;inset:0;width:100%;height:100%}
.hero.fx-gradient .bg{background:linear-gradient(120deg,var(--bg),color-mix(in srgb,var(--accent) 22%,var(--bg)),color-mix(in srgb,var(--accent2) 18%,var(--bg)),var(--bg));background-size:320% 320%}
.hero .orb{position:absolute;border-radius:50%;filter:blur(60px);opacity:.45}.hero .orb.o1{width:420px;height:420px;background:var(--accent);left:-80px;top:-100px}.hero .orb.o2{width:380px;height:380px;background:var(--accent2);right:-60px;top:20px}.hero .orb.o3{width:300px;height:300px;background:var(--accent);right:30%;bottom:-120px;opacity:.3}
.hero .shape{position:absolute;border:3px solid var(--accent);border-radius:30%;opacity:.35}.hero .shape.s1{width:90px;height:90px;left:8%;top:22%}.hero .shape.s2{width:60px;height:60px;right:12%;top:18%;border-radius:50%}.hero .shape.s3{width:120px;height:120px;right:22%;bottom:10%}.hero .shape.s4{width:50px;height:50px;left:30%;bottom:14%;border-radius:50%;background:var(--accent2);border:0;opacity:.25}
.caret:after{content:"|";margin-left:2px;color:var(--accent)}
@media(prefers-reduced-motion:no-preference){.hero.fx-gradient .bg{animation:npu-shift 16s ease infinite}.hero .orb{animation:npu-drift 18s ease-in-out infinite}.hero .orb.o2{animation-delay:-6s}.hero .orb.o3{animation-delay:-12s}.hero .shape{animation:npu-float 9s ease-in-out infinite}.hero .shape.s2{animation-delay:-3s}.hero .shape.s3{animation-delay:-5s}.hero .shape.s4{animation-delay:-7s}.caret:after{animation:npu-blink 1s steps(1) infinite}}
@keyframes npu-shift{0%{background-position:0 50%}50%{background-position:100% 50%}100%{background-position:0 50%}}@keyframes npu-drift{0%,100%{transform:translate(0,0)}50%{transform:translate(60px,40px)}}@keyframes npu-float{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-26px) rotate(18deg)}}@keyframes npu-blink{50%{opacity:0}}`;

/** Starts the libraries from what the page says (data attributes), types the title and draws the particles. */
export const PAGE_SCRIPT = `(function(){
var root=document.documentElement,reduce=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches,lively=root.getAttribute("data-motion")==="lively";
if(window.AOS)AOS.init({duration:lively?1000:750,easing:"ease-out-cubic",once:true,offset:60,disable:reduce});
if(window.countUp&&!reduce)[].forEach.call(document.querySelectorAll("[data-count]"),function(e){new countUp.CountUp(e,parseFloat(e.getAttribute("data-count")),{prefix:e.getAttribute("data-prefix")||"",suffix:e.getAttribute("data-suffix")||"",decimalPlaces:+(e.getAttribute("data-decimals")||0),duration:2.2,enableScrollSpy:true,scrollSpyOnce:true})});
var h=document.querySelector(".hero.fx-typewriter h1");if(h&&!reduce){var full=h.textContent;h.textContent="";h.classList.add("caret");var i=0;(function t(){h.textContent=full.slice(0,++i);if(i<full.length)setTimeout(t,55);else setTimeout(function(){h.classList.remove("caret")},1500)})()}
var pc=document.getElementById("particles");if(pc&&!reduce){var x=pc.getContext("2d"),w,hh,col=pc.getAttribute("data-color")||"#888",P=[];function sz(){w=pc.width=pc.offsetWidth;hh=pc.height=pc.offsetHeight}sz();addEventListener("resize",sz);for(var k=0;k<60;k++)P.push({x:Math.random()*w,y:Math.random()*hh,vx:(Math.random()-.5)*.6,vy:(Math.random()-.5)*.6});(function a(){x.clearRect(0,0,w,hh);for(var i=0;i<P.length;i++){var p=P[i];p.x=(p.x+p.vx+w)%w;p.y=(p.y+p.vy+hh)%hh;x.globalAlpha=.7;x.fillStyle=col;x.beginPath();x.arc(p.x,p.y,2.2,0,6.3);x.fill();for(var j=i+1;j<P.length;j++){var q=P[j],d=Math.hypot(p.x-q.x,p.y-q.y);if(d<130){x.globalAlpha=.3*(1-d/130);x.strokeStyle=col;x.beginPath();x.moveTo(p.x,p.y);x.lineTo(q.x,q.y);x.stroke()}}}requestAnimationFrame(a)})()}
})();`;
