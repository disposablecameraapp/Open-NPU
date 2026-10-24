import { CatalogEntry, HardwareProfile, KvShape, Level, Verdict } from "../shared/types";
import { classifyArchitecture } from "./arch";
import { estimateTokPerSec, fitContext, maxContextTokens, npuNeededGB, usableBudgetGB } from "./memory";
import { QuantKind } from "./quant";

/** Newest driver known to still reject precompiled bundles above this size. */
export const NATIVE_BUNDLE_LIMIT_B = 1.7;

export interface FitInput {
  architecture: string;
  fileGB: number;
  kind: QuantKind | "native";
  paramsB?: number | null;
  isMoe?: boolean;
  kv?: KvShape;
  wantedContext: number;
  maxTestedContext?: number;
  engine: "llama_cpp" | "qairt";
  needsNewerDriver?: boolean;
}

const rank: Record<Level, number> = { green: 0, amber: 1, red: 2 };
const worse = (a: Level, b: Level): Level => (rank[a] >= rank[b] ? a : b);

/**
 * Score a model against this machine. Always returns a verdict; install stays allowed
 * (spec: a warning, never a block). green = expected fully on the NPU.
 */
export function scoreModel(input: FitInput, hw: HardwareProfile): Verdict {
  const reasons: string[] = [];
  let level: Level = "green";
  const bump = (l: Level, reason: string) => {
    level = worse(level, l);
    reasons.push(reason);
  };

  if (!hw.isSnapdragon || !hw.npuDetected) {
    bump("red", "No Hexagon NPU found on this machine.");
  }
  if (hw.emulated) {
    bump("red", "Open NPU is running emulated (x64); install the native ARM64 build.");
  }

  // Format
  if (input.engine === "qairt") {
    if (input.needsNewerDriver || ((input.paramsB ?? 0) > NATIVE_BUNDLE_LIMIT_B && driverBelowFix(hw))) {
      bump("red", `Precompiled bundles above ~${NATIVE_BUNDLE_LIMIT_B}B fail on NPU driver ${hw.npuDriverVersion ?? "this version"}.`);
    }
  } else {
    switch (input.kind) {
      case "q4_0": break;
      case "q8_0":
        if ((input.paramsB ?? 99) < 4) reasons.push("Q8_0: larger file, better quality for a tiny model.");
        else bump("amber", "Q8_0 is about twice the size of Q4_0 and slower.");
        break;
      case "mxfp4": bump("amber", "MXFP4 should work for MoE models but was not tested here."); break;
      case "kquant":
      case "iquant": bump("amber", "K-quant / IQ format: parts of the model may run on the CPU."); break;
      default: bump("amber", "File format not confirmed as Q4_0: NPU support unknown.");
    }
  }

  // Architecture
  const arch = classifyArchitecture(input.architecture);
  if (input.engine === "llama_cpp") {
    if (arch.cls === "partial-cpu") bump("amber", arch.reason + ".");
    else if (arch.cls === "unknown") bump("red", arch.reason + ".");
    else if (arch.cls === "unloadable") bump("red", arch.reason + ".");
  }

  // Memory
  const budget = hw.npuBudgetGB;
  const usable = usableBudgetGB(budget);
  const weightsOnly = npuNeededGB(input.fileGB, undefined, 0);
  let ctx = 0;
  if (weightsOnly > usable) {
    bump("red", `Needs about ${weightsOnly.toFixed(1)} GB of NPU memory; this machine has ${budget.toFixed(1)} GB.`);
  } else {
    ctx = fitContext({
      fileGB: input.fileGB,
      kv: input.kv,
      npuBudgetGB: budget,
      wanted: input.wantedContext,
      maxTested: input.maxTestedContext
    });
    if (ctx === 0) {
      bump("red", "Fits in memory but leaves no room for a usable context.");
    } else {
      if (!input.kv && !input.maxTestedContext && input.engine === "llama_cpp") {
        bump("amber", "Context size could not be checked (no attention-layer data).");
      }
      if (ctx < input.wantedContext) {
        const fitMax = maxContextTokens(input.fileGB, input.kv, budget);
        reasons.push(`Context shrunk to ${fmtCtx(ctx)} to fit NPU memory (max ${fmtCtx(Math.min(fitMax, input.maxTestedContext ?? fitMax))}).`);
      }
      const needed = npuNeededGB(input.fileGB, input.kv, ctx);
      if (needed > usable * 0.9) level = worse(level, "amber"), reasons.push(`Tight on memory: ${needed.toFixed(1)} of ${budget.toFixed(1)} GB.`);
    }
  }

  if (input.maxTestedContext && input.wantedContext > input.maxTestedContext) {
    reasons.push(`Longer contexts crashed during testing; capped at ${fmtCtx(input.maxTestedContext)}.`);
  }

  if (hw.npuBudgetSource === "estimated") {
    reasons.push("NPU memory limit is an estimate (about half of RAM); set the real number in Settings.");
  }

  if (reasons.length === 0) reasons.push("Standard architecture, Q4_0, fits in NPU memory: expected fully on the NPU.");
  const estNpuGB = ctx ? npuNeededGB(input.fileGB, input.kv, ctx) : weightsOnly;
  return {
    level,
    reasons,
    contextTokens: ctx,
    estNpuGB: Math.round(estNpuGB * 10) / 10,
    estTokPerSec: input.engine === "qairt" ? null : estimateTokPerSec(input.fileGB, !!input.isMoe),
    installAllowed: true
  };
}

function driverBelowFix(hw: HardwareProfile): boolean {
  // Only driver 30.0.225.10000 (X2, 32 GB) is known to load larger bundles; re-test when this changes.
  const v = hw.npuDriverVersion;
  if (!v) return true;
  const parts = v.split(".").map((x) => parseInt(x, 10) || 0);
  const fix = [30, 0, 225, 10000];
  for (let i = 0; i < 4; i++) {
    if ((parts[i] ?? 0) !== fix[i]) return (parts[i] ?? 0) < fix[i];
  }
  return false;
}

export function fmtCtx(n: number): string {
  return n >= 1024 ? `${Math.round(n / 1024)}K` : String(n);
}

export function scoreEntry(e: CatalogEntry, hw: HardwareProfile): Verdict {
  if (e.excluded) {
    return { level: "red", reasons: [e.excludeReason ?? "Known not to work."], contextTokens: 0, estNpuGB: e.sizeGB, estTokPerSec: null, installAllowed: true };
  }
  const kind: QuantKind | "native" = e.engine === "qairt" ? "native" : ((e.quant ?? "").toLowerCase() === "q4_0" ? "q4_0" : e.quant ? ((e.quant.toLowerCase().includes("mxfp4") ? "mxfp4" : "other")) : "other");
  return scoreModel(
    {
      architecture: e.architecture,
      fileGB: e.sizeGB,
      kind,
      paramsB: e.paramsB,
      isMoe: e.isMoe,
      kv: e.kv,
      wantedContext: e.recommendedContext,
      maxTestedContext: e.maxTestedContext,
      engine: e.engine,
      needsNewerDriver: e.needsNewerDriver
    },
    hw
  );
}
