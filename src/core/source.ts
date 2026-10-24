import type { SourceId } from "../shared/types";
import { quantFromName } from "./quant";

export type { SourceId };

export const SOURCE_NAMES: Record<SourceId, string> = { hf: "Hugging Face", docker: "Docker Hub", modelscope: "ModelScope", aihub: "Qualcomm AI Hub" };

/** What a pasted text means. Whatever the person pastes (link, command, repo id, name), it ends up as one of these. */
export type ModelRef =
  | { kind: "hf"; repo: string; quant: string | null }
  | { kind: "docker"; namespace: string; name: string; tag: string | null }
  | { kind: "modelscope"; id: string; quant: string | null }
  | { kind: "aihub"; name: string }
  /** Not a link to a model: look for it by name. `note` says why when a link was turned into a search. */
  | { kind: "search"; query: string; note?: string };

const COMMAND = /^\s*(?:\$\s*)?(?:geniex\s+(?:pull|infer|serve|remove)|ollama\s+(?:run|pull)|docker\s+model\s+(?:pull|run|inspect)|hf\s+download|huggingface-cli\s+download|git\s+clone|(?:llama-cli|llama-server)\s+(?:-hf|--hf-repo))\s+/i;
const HF_HOSTS = /^(?:www\.)?(?:huggingface\.co|hf\.co)$/i;
const MS_HOSTS = /^(?:www\.)?modelscope\.(?:cn|ai)$/i;
const DOCKER_HOSTS = /^(?:docker\.io|index\.docker\.io|registry-1\.docker\.io)$/i;

const quantOf = (s: string | null | undefined) => (s && /^(?:i?q\d|mxfp4|bf16|f16|f32)/i.test(s) ? s.toUpperCase() : null);
const clean = (s: string) => s.replace(/^[\s"'`<(]+|[\s"'`>),.;]+$/g, "");

function splitTag(seg: string): { name: string; tag: string | null } {
  const i = seg.indexOf(":");
  return i < 0 ? { name: seg, tag: null } : { name: seg.slice(0, i), tag: seg.slice(i + 1) || null };
}

function fromUrl(raw: string): ModelRef {
  let url: URL;
  try { url = new URL(raw); } catch { return { kind: "search", query: raw }; }
  const host = url.hostname.toLowerCase();
  const seg = url.pathname.split("/").filter(Boolean).map((x) => decodeURIComponent(x));

  if (HF_HOSTS.test(host)) {
    if (seg[0] === "datasets" || seg[0] === "spaces") return { kind: "search", query: seg.slice(1, 3).join(" "), note: "That link is not a model." };
    if (seg[0] === "models" && !seg[1]) return { kind: "search", query: url.searchParams.get("search") ?? "" };
    const [org, last] = seg[0] === "models" ? [seg[1], seg[2]] : [seg[0], seg[1]];
    if (!org || !last) return { kind: "search", query: seg.join(" ") };
    const { name, tag } = splitTag(last);
    const file = seg.slice(-1)[0];
    const fromFile = /\.gguf$/i.test(file ?? "") ? quantFromName(file)?.quant ?? null : null;
    return { kind: "hf", repo: `${org}/${name}`, quant: quantOf(tag) ?? fromFile };
  }
  if (MS_HOSTS.test(host)) {
    const at = seg[0] === "models" ? 1 : 0;
    const [org, last] = [seg[at], seg[at + 1]];
    if (!org || !last) return { kind: "search", query: seg.join(" ") };
    const { name, tag } = splitTag(last);
    return { kind: "modelscope", id: `${org}/${name}`, quant: quantOf(tag) };
  }
  if (host === "hub.docker.com") {
    // /r/ai/qwen3 , /r/ai/qwen3/tags , /_/name (official images are not models)
    if (seg[0] === "r" && seg[1] && seg[2]) return { kind: "docker", namespace: seg[1], name: seg[2], tag: null };
    if (seg[0] === "u" && seg[1]) return { kind: "search", query: seg[1] };
    return { kind: "search", query: seg.join(" ") };
  }
  if (host === "ollama.com" || host === "www.ollama.com") {
    const name = splitTag(seg[0] === "library" ? seg[1] ?? "" : seg[1] ?? seg[0] ?? "").name;
    return { kind: "search", query: name.replace(/[-_]/g, " "), note: "Ollama's files cannot be pulled by GenieX. Looking for the same model in the other sources." };
  }
  if (host.endsWith("aihub.qualcomm.com")) {
    return { kind: "search", query: (seg[seg.length - 1] ?? "").replace(/[-_]/g, " "), note: "Looking for that model among Qualcomm's native bundles and the other sources." };
  }
  return { kind: "search", query: raw, note: `${host} is not a model source Open NPU knows; searching for the text instead.` };
}

/** Understands links, commands and ids in any of the usual spellings. Never throws; unknown input becomes a search. */
export function parseModelInput(input: string): ModelRef {
  let s = input.trim();
  if (!s) return { kind: "search", query: "" };
  const hadCommand = COMMAND.test(s);
  s = s.replace(COMMAND, "");
  if (hadCommand || /^\S+$/.test(s)) s = s.split(/\s+/).find((t) => !t.startsWith("-") && !/^(?:aihub|hf|modelscope|docker|localfs)$/i.test(t)) ?? s;
  s = clean(s);
  if (!s) return { kind: "search", query: input.trim() };
  if (/\s/.test(s)) return { kind: "search", query: s };

  // "hf.co/org/repo:Q4_0", "docker.io/ai/gemma3": a host without a scheme
  if (/^https?:\/\//i.test(s)) return fromUrl(s);
  if (/^[\w-]+(?:\.[\w-]+)+\//.test(s) && !/^[\w-]+\.(?:gguf)$/i.test(s)) {
    const host = s.split("/")[0];
    if (DOCKER_HOSTS.test(host)) {
      const [ns, last] = s.split("/").slice(1);
      if (ns && last) { const { name, tag } = splitTag(last); return { kind: "docker", namespace: ns, name, tag }; }
    }
    return fromUrl(`https://${s}`);
  }
  const parts = s.split("/");
  if (/^ai-hub-models$/i.test(parts[0]) && parts[1]) return { kind: "aihub", name: parts[1] };
  if (parts.length === 2 && /^[\w.-]+$/.test(parts[0]) && /^[\w.-]+(?::[\w.-]+)?$/.test(parts[1])) {
    const { name, tag } = splitTag(parts[1]);
    if (parts[0].toLowerCase() === "ai") return { kind: "docker", namespace: "ai", name, tag };
    return { kind: "hf", repo: `${parts[0]}/${name}`, quant: quantOf(tag) };
  }
  return { kind: "search", query: s };
}

/** What GenieX is given to pull a model, per source. Hugging Face pins the quant so the CLI does not stop to ask. */
export function pullRef(r: { kind: "hf"; repo: string; quant: string | null } | { kind: "docker"; namespace: string; name: string; tag: string | null } | { kind: "modelscope"; id: string; quant: string | null } | { kind: "aihub"; name: string }): string {
  switch (r.kind) {
    case "hf": return r.quant ? `${r.repo}:${r.quant}` : r.repo;
    case "docker": return `docker.io/${r.namespace}/${r.name}${r.tag ? `:${r.tag}` : ""}`;
    case "modelscope": return `https://modelscope.cn/models/${r.id}${r.quant ? `:${r.quant}` : ""}`;
    case "aihub": return `ai-hub-models/${r.name}`;
  }
}
