import type { Theme } from "../slides";
import { colorOf, primsSvg, themeOf } from "../slides";
import { BG_KINDS, backgroundPrims, legalize, seedOf } from "../look";
import { RADII, SPACING, type PageSpec } from "./catalog";
import { ANIMATION_CSS, pageCss } from "./css";

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
/** The theme of a page: a listed theme, a made one's id or plain words (the same reading as for slides), an accent if one was named, readable colours guaranteed. */
export function pageTheme(spec: PageSpec): Theme {
  let t = themeOf(`Theme: ${text(spec.theme) || "clean"}\n\n---\n#`);
  const accent = text(spec.accent) ? colorOf(text(spec.accent)) : undefined;
  if (accent) t = { ...t, accent, accents: [accent, ...t.accents.slice(1)] };
  return legalize(t).theme;
}
export interface PageLook { theme: Theme; css: string; heroSvg: string; motion: string; icons: string }
/** Everything the blocks need to be drawn: the theme, its stylesheet and the hero's procedural background. */
export function pageLook(spec: PageSpec): PageLook {
  const theme = pageTheme(spec);
  const kind = (BG_KINDS as readonly string[]).includes(text(spec.background)) ? (text(spec.background) as (typeof BG_KINDS)[number]) : (theme.bgkind ?? "mesh");
  const seed = Number.isInteger(spec.seed) ? (spec.seed as number) : seedOf(text(spec.title) || "page");
  const motion = (["none", "subtle", "lively"].includes(text(spec.motion)) ? text(spec.motion) : "subtle");
  const icons = ["icons", "emoji", "none"].includes(text(spec.icon_style)) ? text(spec.icon_style) : "icons";
  return { theme, motion, icons, css: `${pageCss(theme, RADII[text(spec.radius)] ?? RADII.medium, SPACING[text(spec.spacing)] ?? SPACING.comfortable)}\n${ANIMATION_CSS}`, heroSvg: primsSvg(backgroundPrims(kind, seed, theme, 0.9), "xMidYMid slice") };
}
