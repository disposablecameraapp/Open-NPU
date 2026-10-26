import * as path from "path";

/**
 * Official GenieX Windows ARM64 CLI installer (Qualcomm AI Hub docs, "CLI Install").
 * Found by web search; could not be downloaded from the build sandbox, so the
 * installer's flags and install location are not known: see locateGeniex().
 */
export const GENIEX_INSTALLER_URL = "https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-geniex/geniex-cli.exe";

export type StepId = "geniex" | "voice-stt" | "voice-tts";
export type StepState = "pending" | "running" | "done" | "error" | "skipped";

export interface SetupStep {
  id: StepId;
  label: string;
  detail: string;
  state: StepState;
  percent: number | null;
  message: string | null;
  /** Plain-words problem and what to do. */
  error: string | null;
}

export interface SetupState {
  active: boolean;
  /** Something is missing and the person has not yet said whether it may be downloaded. */
  awaitingConfirm: boolean;
  steps: SetupStep[];
}

/**
 * Where geniex.exe may be after the installer ran: paths printed by the installer,
 * the documented %LOCALAPPDATA%\GenieX CLI folder, and the usual per-user / machine locations.
 */
export function geniexCandidates(installerOutput: string, env: NodeJS.ProcessEnv): string[] {
  const out: string[] = [];
  for (const m of installerOutput.matchAll(/([A-Za-z]:\\[^\r\n"'<>|*?]*?geniex(?:\.exe)?)(?=[\s"'<>|]|$)/gi)) {
    const p = m[1].trim();
    out.push(/\.exe$/i.test(p) ? p : path.win32.join(p, "geniex.exe"));
  }
  // directories printed for PATH ("... added to PATH: C:\Users\x\AppData\Local\GenieX CLI")
  for (const m of installerOutput.matchAll(/([A-Za-z]:\\[^\r\n"'<>|*?]+)/g)) {
    const p = m[1].trim().replace(/[.,;]+$/, "");
    if (!/\.\w{2,4}$/.test(p)) out.push(path.win32.join(p, "geniex.exe"));
  }
  const w = path.win32;
  if (env.LOCALAPPDATA) {
    out.push(w.join(env.LOCALAPPDATA, "GenieX CLI", "geniex.exe"), w.join(env.LOCALAPPDATA, "Programs", "GenieX CLI", "geniex.exe"), w.join(env.LOCALAPPDATA, "Programs", "GenieX", "geniex.exe"), w.join(env.LOCALAPPDATA, "GenieX", "geniex.exe"));
  }
  if (env.USERPROFILE) out.push(w.join(env.USERPROFILE, ".geniex", "bin", "geniex.exe"), w.join(env.USERPROFILE, "geniex", "geniex.exe"));
  for (const k of ["ProgramFiles", "ProgramFiles(Arm)"]) {
    if (env[k]) out.push(w.join(env[k]!, "GenieX CLI", "geniex.exe"), w.join(env[k]!, "GenieX", "geniex.exe"));
  }
  for (const dir of (env.Path ?? env.PATH ?? "").split(";").filter(Boolean)) out.push(w.join(dir, "geniex.exe"));
  return [...new Set(out)];
}

export function locateGeniex(installerOutput: string, env: NodeJS.ProcessEnv, exists: (p: string) => boolean): string | null {
  return geniexCandidates(installerOutput, env).find((p) => exists(p)) ?? null;
}

export function initialSteps(needs: { geniex: boolean; stt: boolean; tts: boolean }, names: { stt: string; tts: string }): SetupStep[] {
  const mk = (id: StepId, label: string, detail: string, needed: boolean): SetupStep => ({
    id, label, detail, state: needed ? "pending" : "done", percent: null, message: needed ? null : "Already installed", error: null
  });
  return [
    mk("geniex", "GenieX runtime (runs models on the NPU)", "Qualcomm's command-line runtime, downloaded from Qualcomm", needs.geniex),
    mk("voice-stt", `Dictation model: ${names.stt}`, "Speech to text, runs locally", needs.stt),
    mk("voice-tts", `Read-aloud model: ${names.tts}`, "Text to speech, runs locally", needs.tts)
  ];
}

export const setupFinished = (s: SetupStep[]) => s.every((x) => x.state === "done" || x.state === "skipped" || x.state === "error");
