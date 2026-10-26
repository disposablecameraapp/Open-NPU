import { execFile } from "child_process";
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
