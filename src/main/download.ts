import * as fs from "fs";
import * as http from "http";
import * as https from "https";

/** Resumable download to a file with progress. Follows redirects; throws on HTTP errors. */
export function downloadFile(url: string, dest: string, onPercent: (p: number | null) => void, signal?: { cancelled: boolean }): Promise<void> {
  const part = dest + ".part";
  const get = (u: string, redirects = 0): Promise<void> => new Promise((resolve, reject) => {
    if (redirects > 6) return reject(new Error("Too many redirects"));
    const have = fs.existsSync(part) ? fs.statSync(part).size : 0;
    const lib = u.startsWith("https:") ? https : http;
    const req = lib.get(u, { headers: { "User-Agent": "open-npu", ...(have ? { Range: `bytes=${have}-` } : {}) } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(get(new URL(res.headers.location, u).toString(), redirects + 1));
      }
      if (res.statusCode === 416) { res.resume(); return resolve(); }
      if (!res.statusCode || res.statusCode >= 400) { res.resume(); return reject(new Error(`Download failed (HTTP ${res.statusCode})`)); }
      const resumed = res.statusCode === 206;
      const total = (parseInt(String(res.headers["content-length"] ?? "0"), 10) || 0) + (resumed ? have : 0);
      let got = resumed ? have : 0;
      const out = fs.createWriteStream(part, { flags: resumed ? "a" : "w" });
      res.on("data", (b: Buffer) => {
        got += b.length;
        if (signal?.cancelled) req.destroy(new Error("cancelled"));
        onPercent(total ? Math.round((got / total) * 100) : null);
      });
      res.pipe(out);
      out.on("finish", () => resolve());
      out.on("error", reject);
      res.on("error", reject);
    });
    req.on("error", reject);
  });
  return get(url).then(() => { fs.renameSync(part, dest); });
}
