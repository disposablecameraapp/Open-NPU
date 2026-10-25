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

/** The pip name of a module when it differs from the name used in `import`. */
const PIP_NAMES: Record<string, string> = {
  cv2: "opencv-python", PIL: "pillow", sklearn: "scikit-learn", yaml: "pyyaml", bs4: "beautifulsoup4", skimage: "scikit-image",
  dotenv: "python-dotenv", serial: "pyserial", docx: "python-docx", pptx: "python-pptx", fitz: "pymupdf", dateutil: "python-dateutil",
  OpenSSL: "pyOpenSSL", Crypto: "pycryptodome", jwt: "pyjwt", git: "gitpython", usb: "pyusb", win32api: "pywin32", win32com: "pywin32"
};

/** The package a failed Python run is missing ("No module named 'requests'"), or null. Only top-level modules count. */
export function missingModule(output: string): { module: string; pip: string } | null {
  const all = [...output.matchAll(/No module named ['"]([\w.]+)['"]/g)];
  const last = all[all.length - 1];
  if (!last) return null;
  const module = last[1].split(".")[0];
  return { module, pip: PIP_NAMES[module] ?? module };
}

/** `pip install x` typed in the terminal must install for the same Python that runs the programs, so it becomes `<python> -m pip install x`. */
export function withPip(command: string, python: { cmd: string; args: string[] }): string {
  const m = command.match(/^\s*(pip3?|python3?\s+-m\s+pip|py\s+(?:-3\s+)?-m\s+pip)(?=\s|$)(.*)$/s);
  if (!m) return command;
  const launch = [python.cmd, ...python.args.filter((a) => a !== "-u")].join(" ");
  return `${launch} -m pip${m[2]}`;
}
