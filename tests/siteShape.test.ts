import { describe, it, expect } from "vitest";
import { SITE_TEMPLATES, shapePage } from "../src/core/templates/site";

const flat = { language: "en", hero: { title: "Vietnam", subtitle: "From reform", cta_text: "Explore" },
  features: [{ title: "Trade", description: "Open markets", icon: "trending-up" }],
  steps: [{ step: 1, title: "Doi Moi", description: "1986" }],
  stats: [{ label: "GDP", value: "6.5%", unit: "yearly" }],
  pricing: { title: "Sectors", items: [{ name: "Manufacturing", description: "Electronics", price: "High" }] },
  testimonials: [{ quote: "Great", author: "Corp", role: "CEO" }],
  faq: [{ question: "Why?", answer: "Because" }],
  timeline: [{ year: "1986", event: "Doi Moi" }] };

describe("a page written with one key per block", () => {
  it("becomes sections, with the hero first", () => {
    const s = shapePage(flat).sections as { type: string }[];
    expect(s[0].type).toBe("hero");
    expect(s.map((x) => x.type)).toEqual(["hero", "features", "steps", "stats", "pricing", "testimonials", "faq", "timeline"]);
  });
  it("passes the checks and draws its content", () => {
    const t = SITE_TEMPLATES[0];
    expect(t.problems(flat)).toEqual([]);
    const html = t.render(flat).source;
    expect(html).toContain("Doi Moi");
    expect(html).toContain("Manufacturing");
  });
  it("is not drawn live while it has no section", () => {
    expect(SITE_TEMPLATES[0].render({ title: "x" }, { live: true }).source).toBe("");
  });
});
