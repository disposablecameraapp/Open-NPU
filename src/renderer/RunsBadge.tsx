/** Where a model runs on this PC, as the benchmark or the NPU load test saw it: the NPU is the one worth having. */
const INFO = {
  npu: { label: "NPU", hint: "Runs entirely on the NPU: the fastest, and the CPU stays free." },
  hybrid: { label: "Hybrid", hint: "Part of the model runs on the NPU and part on the CPU: slower than NPU only." },
  cpu: { label: "CPU", hint: "Runs on the CPU only: the slowest, and it keeps the CPU busy." }
} as const;

export function RunsBadge({ on }: { on?: "npu" | "hybrid" | "cpu" }) {
  if (!on) return null;
  return <span className={`badge runs-${on}`} title={INFO[on].hint}>{INFO[on].label}</span>;
}
