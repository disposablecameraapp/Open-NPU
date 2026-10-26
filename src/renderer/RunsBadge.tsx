/** Where a model runs on this PC, as the benchmark or the NPU load test saw it. A model nobody measured says so, instead of a guess. */
const INFO = {
  npu: { label: "NPU", hint: "Runs entirely on the NPU: the fastest, and the CPU stays free." },
  hybrid: { label: "NPU + CPU", hint: "Hybrid: part of the model runs on the NPU and part on the CPU, so the CPU stays busy. Slower than the NPU alone." },
  gpu: { label: "GPU", hint: "Runs on the graphics chip: fast, but it does not use the NPU and it draws more power." },
  cpu: { label: "CPU", hint: "Runs on the CPU only: the slowest, and it keeps the CPU busy." }
} as const;

export function RunsBadge({ on, native }: { on?: "npu" | "hybrid" | "gpu" | "cpu"; native?: boolean }) {
  if (!on) return <span className="badge runs-untested" title="Where this model runs was not measured yet. It is known once it has been tried on a PC.">Not tested</span>;
  if (on === "npu" && native) return <span className="badge runs-native" title="Compiled for the NPU and seen running on it alone: light, fast and quiet.">Native NPU</span>;
  return <span className={`badge runs-${on}`} title={INFO[on].hint}>{INFO[on].label}</span>;
}
