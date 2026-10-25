// Stand-in for geniex.exe used by tests: `fake-geniex serve --host H --nctx N`, `pull`, `version`, `list`.
const http = require("http");
const args = process.argv.slice(2);
const cmd = args[0];
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };

if (cmd === "version") { console.log("geniex 0.0.0-fake"); process.exit(0); }
if (cmd === "list") { console.log("NAME SIZE\nunsloth/Qwen3-4B-Thinking-2507-GGUF:Q4_0  2.3 GB"); process.exit(0); }
if (cmd === "pull") {
  let p = 0;
  const t = setInterval(() => { p += 25; console.log(`Downloading ${p}%`); if (p >= 100) { clearInterval(t); process.exit(process.env.FAKE_PULL_FAIL ? 1 : 0); } }, 20);
  return;
}
if (cmd !== "serve") { console.error("unknown command"); process.exit(2); }

const [host, port] = (opt("--host") || "127.0.0.1:18181").split(":");
const nctx = parseInt(opt("--nctx") || "4096", 10);
const limit = parseInt(process.env.FAKE_NCTX_LIMIT || "0", 10);
if (limit && nctx > limit) {
  console.error("DSP_INFO UNSUPPORTED_KEY: 49");
  console.error("ggml-hex: dspqueue_read failed: 0x80000406");
  process.exit(1);
}
if (process.env.FAKE_MAP_FAIL) {
  console.error("ggml-hex: HTP0 buffer mapping failed : domain_id 3 size 622333952 fd 9 error 0x00000200");
  process.exit(1);
}
const server = http.createServer((req, res) => {
  if (req.url === "/v1/models") { res.setHeader("content-type", "application/json"); return res.end(JSON.stringify({ data: [{ id: "fake" }] })); }
  if (req.url === "/v1/chat/completions") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      globalThis.lastBody = JSON.parse(body);
      res.writeHead(200, { "content-type": "text/event-stream" });
      const parts = ["<thi", "nk>Plan it. ", "</think>", "Hello", " there", "!"];
      let i = 0;
      const t = setInterval(() => {
        if (i < parts.length) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: parts[i++] } }] })}\n\n`);
        else {
          res.write(`data: ${JSON.stringify({ choices: [], usage: { completion_tokens: 6 } })}\n\n`);
          res.write("data: [DONE]\n\n");
          res.end();
          clearInterval(t);
        }
      }, 15);
    });
    return;
  }
  res.statusCode = 404; res.end();
});
server.listen(parseInt(port, 10), host, () => console.log(`listening ${host}:${port} nctx=${nctx}`));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
