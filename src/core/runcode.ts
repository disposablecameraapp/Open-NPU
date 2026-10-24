/** What it takes to run an artifact's code on this machine: which program, with which file extension. */
export interface Runner {
  ext: string;
  /** Programs to try in order; the first one that exists runs the file. */
  programs: { cmd: string; args: string[]; asNode?: boolean }[];
  label: string;
}

export const isRunnable = (language: string) => runnerFor(language, "linux") !== null;

export function runnerFor(language: string, platform: string): Runner | null {
  const l = language.toLowerCase();
  if (/^(py|python|python3)$/.test(l)) {
    const programs = platform === "win32"
      ? [{ cmd: "python", args: ["-u"] }, { cmd: "py", args: ["-3", "-u"] }, { cmd: "python3", args: ["-u"] }]
      : [{ cmd: "python3", args: ["-u"] }, { cmd: "python", args: ["-u"] }];
    return { ext: "py", programs, label: "Python" };
  }
  if (/^(js|javascript|mjs|node)$/.test(l)) return { ext: "js", programs: [{ cmd: "node", args: [], asNode: true }], label: "JavaScript" };
  return null;
}

/** Keeps the end of a long output: what a program printed last matters most. */
export function clipOutput(text: string, max = 40_000): string {
  return text.length > max ? `…${text.slice(text.length - max)}` : text;
}
