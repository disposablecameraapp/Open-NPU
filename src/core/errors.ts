import { FriendlyError } from "../shared/types";

interface Rule {
  id: string;
  test: RegExp;
  title: string;
  fix: string;
  /** Harmless lines are dropped instead of shown. */
  ignore?: boolean;
}

const RULES: Rule[] = [
  {
    id: "ram-low",
    test: /Only [\d.]+ GB of RAM is free/i,
    title: "Not enough free RAM for this model",
    fix: "The NPU works in the PC's own RAM, so a model needs that much free memory. Close other apps (Task Manager, Memory column), or restart the PC if the memory stays full after closing them, then try again."
  },
  {
    id: "bundle-too-big",
    test: /context index\s*=\s*3\s*:\s*err\s*5000|Could not create context from binary/i,
    title: "This precompiled model is too big for the current NPU driver",
    fix: "Pick a GGUF model instead, or install a newer NPU driver. On driver 30.0.220.3000 precompiled bundles above about 1.7B do not load."
  },
  { id: "dsp-info", test: /DSP_INFO\s+UNSUPPORTED_KEY/i, title: "Driver is older than the runtime", fix: "Harmless, ignored.", ignore: true },
  {
    id: "npu-overflow",
    test: /dspqueue_read failed|ggml-hex/i,
    title: "The model and its context did not fit in NPU memory",
    fix: "Open NPU will restart the server with a smaller context. Close other apps that use the NPU, then try again."
  },
  {
    id: "npu-sdk-error",
    test: /SDKError\s*\(Unknown error\)/i,
    title: "The NPU ran out of memory",
    fix: "The model plus its context is over this machine's NPU limit. Choose a smaller model or a shorter context."
  },
  {
    id: "connection-reset",
    test: /ERR_CONNECTION_RESET|ECONNRESET|ECONNREFUSED|fetch failed/i,
    title: "The local model server is not running",
    fix: "Open NPU is restarting it. If this keeps happening, look at the last server error in Settings."
  },
  {
    id: "ram-exhausted",
    test: /Server error.*(97|98|99)\s*%|out of memory|ENOMEM|std::bad_alloc/i,
    title: "Windows ran out of memory",
    fix: "Close browsers and other heavy apps before loading this model, then retry."
  },
  {
    id: "quant-missing",
    test: /requested quant\s*"?([A-Za-z0-9_]+)"?\s*not found/i,
    title: "This repo has no file in that format",
    fix: "Open NPU will try the official repo, then MXFP4, and warn you if only slower formats exist."
  },
  {
    id: "no-chipset",
    test: /Requested chipset not available/i,
    title: "No build of this model exists for this chip",
    fix: "This precompiled bundle has no Snapdragon X Elite build, so it is hidden on X1 laptops. Use a GGUF version."
  },
  {
    id: "win193",
    test: /WinError 193/i,
    title: "An x64 program tried to load ARM64 libraries",
    fix: "Open NPU only uses the GenieX command line and native ARM64 builds. Do not use the geniex Python package from an x64 Python."
  },
  { id: "sox", test: /SoX is not installed/i, title: "SoX is not installed", fix: "Only needed for audio features. Ignored.", ignore: true },
  {
    id: "npu-busy",
    test: /another (infer|session)|device or resource busy|already in use/i,
    title: "Another app is using the NPU",
    fix: "Close any open geniex infer window or other NPU chat app. Only one model can sit on the NPU at a time."
  }
];

export function translateError(raw: string): FriendlyError | null {
  for (const r of RULES) {
    if (r.test.test(raw)) {
      if (r.ignore) return null;
      return { id: r.id, title: r.title, fix: r.fix, raw };
    }
  }
  return null;
}

/** Fallback shown when nothing matched: still plain, never an empty box. */
export function genericError(raw: string): FriendlyError {
  return { id: "unknown", title: "Something went wrong", fix: "Details are below. If it repeats, restart Open NPU.", raw };
}

export function friendly(raw: string): FriendlyError | null {
  return translateError(raw) ?? (raw.trim() ? genericError(raw) : null);
}

/** True when the line is known to be harmless noise. */
export function isNoise(line: string): boolean {
  return RULES.some((r) => r.ignore && r.test.test(line));
}
