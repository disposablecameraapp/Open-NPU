/* Opens a page of blocks in Chromium: the core and the named block files are added before </body>, as the app does.
 * Usage: const { open } = require("./harness.cjs"); const t = await open(html, ["map"]); ... await t.close(); */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const dir = path.join(__dirname, "..", "..", "src", "core", "xblocks");
const source = (name) => fs.readFileSync(path.join(dir, name + ".js"), "utf8");

async function open(html, blocks = [], size = { width: 900, height: 600 }) {
  const scripts = ["core", ...blocks].map((n) => `<script data-block="${n}">${source(n)}</script>`).join("\n");
  const page0 = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, scripts + "</body>") : html + scripts;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: size });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.setContent(page0);
  await page.waitForTimeout(150);
  return {
    page, errors,
    state: () => page.evaluate(() => JSON.parse(JSON.stringify(window.X.all()))),
    problems: () => page.evaluate(() => window.X.problems.slice()),
    press: async (key, times = 1, gap = 120) => { for (let i = 0; i < times; i++) { await page.keyboard.press(key); await page.waitForTimeout(gap); } },
    close: () => browser.close(),
  };
}
function check(name, ok, extra = "") { console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); if (!ok) process.exitCode = 1; }
module.exports = { open, check };
