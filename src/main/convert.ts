import { execFile } from "child_process";
import { BrowserWindow } from "electron";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { legacyKind } from "../core/officeRead";

/** An office suite on this PC that can open the old formats: LibreOffice, found in its usual places or on the PATH. */
export function findOfficeSuite(): string | null {
  const win = ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"].map((e) => process.env[e]).filter((d): d is string => !!d)
    .flatMap((d) => [path.join(d, "LibreOffice", "program", "soffice.exe"), path.join(d, "Programs", "LibreOffice", "program", "soffice.exe")]);
  const nix = ["/usr/bin/soffice", "/usr/local/bin/soffice", "/Applications/LibreOffice.app/Contents/MacOS/soffice", "/opt/libreoffice/program/soffice"];
  return [...win, ...nix].find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } }) ?? null;
}

/** An old .doc, .xls or .ppt as the matching new format, made by the office suite; null when none is installed or it failed. */
export async function convertLegacy(name: string, bytes: Uint8Array): Promise<{ name: string; bytes: Uint8Array } | null> {
  const to = legacyKind(name), exe = findOfficeSuite();
  if (!to || !exe) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "open-npu-convert-"));
  try {
    const input = path.join(dir, `in${path.extname(name).toLowerCase()}`);
    fs.writeFileSync(input, bytes);
    await new Promise<void>((res, rej) => execFile(exe, ["--headless", "--norestore", `-env:UserInstallation=file://${path.join(dir, "profile").replace(/\\/g, "/")}`, "--convert-to", to, "--outdir", dir, input], { timeout: 90_000, windowsHide: true }, (e) => (e ? rej(e) : res())));
    const out = path.join(dir, `in.${to}`);
    return fs.existsSync(out) ? { name: name.replace(/\.[^.]+$/, `.${to}`), bytes: new Uint8Array(fs.readFileSync(out)) } : null;
  } catch { return null; } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ } }
}

/** A file made by this app as another format (odt, ods, odp, pdf), through the office suite; throws a readable message when there is none or it failed. */
export async function convertOffice(from: "docx" | "xlsx" | "pptx", bytes: Uint8Array, to: "odt" | "ods" | "odp" | "pdf"): Promise<Uint8Array> {
  const exe = findOfficeSuite();
  if (!exe) throw new Error("LibreOffice is not installed on this PC. Install it (libreoffice.org) to save as this format.");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "open-npu-convert-"));
  try {
    const input = path.join(dir, `in.${from}`);
    fs.writeFileSync(input, bytes);
    await new Promise<void>((res, rej) => execFile(exe, ["--headless", "--norestore", `-env:UserInstallation=file://${path.join(dir, "profile").replace(/\\/g, "/")}`, "--convert-to", to, "--outdir", dir, input], { timeout: 120_000, windowsHide: true }, (e) => (e ? rej(e) : res())));
    const out = path.join(dir, `in.${to}`);
    if (!fs.existsSync(out)) throw new Error("LibreOffice did not make the file.");
    return new Uint8Array(fs.readFileSync(out));
  } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ } }
}

/** A PDF printed from a page of HTML by this app's own engine, with no office suite. `slide` prints a 16:9 page per slide. */
export async function printPdf(html: string, slide = false): Promise<Uint8Array> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "open-npu-pdf-"));
  const file = path.join(dir, "page.html");
  const win = new BrowserWindow({ show: false, width: 1000, height: 700, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, partition: `pdf-${Date.now()}` } });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  try {
    fs.writeFileSync(file, html);
    await win.loadFile(file);
    await new Promise((r) => setTimeout(r, 300));
    const pdf = await win.webContents.printToPDF(slide
      ? { preferCSSPageSize: true, printBackground: true }
      : { pageSize: "A4", margins: { top: 0.8, bottom: 0.8, left: 0.8, right: 0.8 }, printBackground: true });
    return new Uint8Array(pdf);
  } finally {
    try { win.destroy(); } catch { /* gone */ }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ }
  }
}
