import { describe, expect, it } from "vitest";
import { missingModule, withPip } from "../src/core/runcode";

describe("missingModule", () => {
  it("finds the package a Python run lacks", () => {
    expect(missingModule("Traceback...\nModuleNotFoundError: No module named 'requests'")).toEqual({ module: "requests", pip: "requests" });
    expect(missingModule("ModuleNotFoundError: No module named 'cv2'")?.pip).toBe("opencv-python");
    expect(missingModule("ModuleNotFoundError: No module named 'PIL.Image'")?.pip).toBe("pillow");
    expect(missingModule("all good")).toBeNull();
  });
});

describe("withPip", () => {
  const py = { cmd: "py", args: ["-3", "-u"] };
  it("makes pip use the Python that runs the programs", () => {
    expect(withPip("pip install numpy", py)).toBe("py -3 -m pip install numpy");
    expect(withPip("pip3 list", { cmd: "python3", args: ["-u"] })).toBe("python3 -m pip list");
    expect(withPip("python -m pip install x", py)).toBe("py -3 -m pip install x");
  });
  it("leaves other commands alone", () => {
    expect(withPip("dir", py)).toBe("dir");
    expect(withPip("pipenv install", py)).toBe("pipenv install");
  });
});
