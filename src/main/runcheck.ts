import { BrowserWindow } from "electron";
import { execFile } from "child_process";
import type { ArtifactSegment } from "../core/artifacts";
import { FileLike, bundleHtml, pageLinking } from "../core/bundle";
import {
  CLICKS_SCRIPT, CheckReport, KEYS_SCRIPT, PageProblem, REPORT_SCRIPT, SNAP_SCRIPT, canvasNotes, describeProblems, instrumentedDocument, isJs, isPython, jsSyntaxError
} from "../core/codecheck";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const withTimeout = <T>(p: Promise<T>, ms: number, what: string) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(what)), ms))]);

/** The page as a small JPEG data URL, or undefined when the window gave nothing to capture. */
async function screenshot(wc: Electron.WebContents): Promise<string | undefined> {
  try {
    const img = await withTimeout(wc.capturePage(), 3000, "no screenshot");
    if (img.isEmpty()) return undefined;
    return `data:image/jpeg;base64,${img.resize({ width: 640 }).toJPEG(70).toString("base64")}`;
  } catch { return undefined; }
}

/**
 * Loads the page in a hidden window with the same CSP as the preview (no network), presses keys and clicks buttons,
 * and reports what threw. A page that never answers (endless loop) is reported as such and the window destroyed.
 */
async function runPage(html: string, locate?: Parameters<typeof describeProblems>[4]): Promise<CheckReport> {
  const win = new BrowserWindow({
    show: false, width: 900, height: 700,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, partition: `check-${Date.now()}` }
  });
  const wc = win.webContents;
  wc.setAudioMuted(true);
  wc.setWindowOpenHandler(() => ({ action: "deny" }));
  wc.on("will-navigate", (e) => e.preventDefault());
  let crashed = false;
  wc.on("render-process-gone", () => { crashed = true; });
  try {
    const url = `data:text/html;charset=utf-8;base64,${Buffer.from(instrumentedDocument(html), "utf8").toString("base64")}`;
    await withTimeout(win.loadURL(url), 8000, "The page took too long to load.");
    await wait(900);
    const snap = () => withTimeout(wc.executeJavaScript(SNAP_SCRIPT), 4000, "The page froze.") as Promise<string[]>;
    const snaps = [await snap()];
    await withTimeout(wc.executeJavaScript(KEYS_SCRIPT), 4000, "The page froze when keys were pressed.");
    await wait(700);
    snaps.push(await snap());
    await withTimeout(wc.executeJavaScript(CLICKS_SCRIPT), 4000, "The page froze when its buttons were clicked.");
    await wait(700);
    snaps.push(await snap());
    const shot = await screenshot(wc);
    const r = await withTimeout(wc.executeJavaScript(REPORT_SCRIPT), 4000, "The page froze (endless loop?).") as { problems: PageProblem[]; blank: boolean };
    return { ran: "page", errors: crashed ? ["The page crashed."] : describeProblems(r.problems, r.blank, html, 6, locate), notes: canvasNotes(snaps), shot };
  } catch (e) {
    return { ran: "page", errors: [crashed ? "The page crashed." : (e as Error).message] };
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

const PY_PARSE = "import ast,sys\ntry:\n    ast.parse(sys.stdin.read())\nexcept SyntaxError as e:\n    print('SyntaxError: %s (line %s)' % (e.msg, e.lineno))\n    sys.exit(1)\n";

/** Syntax check with the Python on the PATH, if there is one. Missing Python is "not checked", never an error. */
function pythonSyntax(code: string): Promise<CheckReport> {
  const exe = process.platform === "win32" ? "python" : "python3";
  return new Promise((resolve) => {
    const child = execFile(exe, ["-c", PY_PARSE], { timeout: 5000, windowsHide: true }, (err, out) => {
      if (!err) return resolve({ ran: "syntax", errors: [] });
      const m = /SyntaxError: .*/.exec(String(out));
      resolve(m ? { ran: "syntax", errors: [m[0]] } : { ran: "none", errors: [] });
    });
    child.stdin?.on("error", () => undefined);
    child.stdin?.end(code);
  });
}

/** The page with the stylesheets and scripts it links put in; links to files nobody wrote are errors. */
async function runBundled(page: FileLike, files: FileLike[]): Promise<CheckReport> {
  const b = bundleHtml(page.content, files.filter((f) => f !== page));
  const r = await runPage(b.html, b.locate);
  const missing = b.missing.map((n) => `${page.title} links ${n}, but no file with that name was written.`);
  return { ...r, errors: [...missing, ...r.errors] };
}

/**
 * Runs one file. `files` is the whole project (the newest version of every file of the chat): a page is run with the
 * files it links, and a stylesheet or script is checked by running the page that links it.
 */
export async function checkArtifact(a: ArtifactSegment, files: FileLike[] = []): Promise<CheckReport> {
  if (a.kind === "html") return runBundled(a, files);
  if (a.kind === "code" && isJs(a.language)) {
    const e = jsSyntaxError(a.content);
    const page = pageLinking(a, files);
    if (e || !page) return { ran: "syntax", errors: e ? [e] : [] };
    return runBundled(page, files);
  }
  if (a.kind === "code" && a.language === "css") {
    const page = pageLinking(a, files);
    return page ? runBundled(page, files) : { ran: "none", errors: [] };
  }
  if (a.kind === "code" && isPython(a.language)) return pythonSyntax(a.content);
  return { ran: "none", errors: [] };
}
