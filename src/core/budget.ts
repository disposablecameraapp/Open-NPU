import { CatalogEntry, ComputeTarget, HardwareProfile, VoiceModel, VoiceSettings } from "../shared/types";
import { OVERHEAD_GB, usableBudgetGB } from "./memory";
import { voiceModel } from "./voiceModels";

/** NPU memory a voice model needs: weights + working buffers. Estimate; replace with measured runs. */
export function voiceNpuGB(m: VoiceModel): number {
  return Math.round((m.sizeMB / 1024) * 1.3 * 100) / 100 + 0.3;
}

export interface BudgetLine {
  role: "chat" | "stt" | "tts";
  name: string;
  onNpu: boolean;
  gb: number;
}

export interface BudgetPlan {
  lines: BudgetLine[];
  budgetGB: number;
  usableGB: number;
  /** NPU memory taken by the voice models alone. */
  voiceGB: number;
  totalGB: number;
  fits: boolean;
  /** Plain-words advice when it does not fit. */
  advice: string | null;
}

/**
 * Sum what every model switched to the NPU will need. Chat, dictation and read-aloud can share
 * the NPU when the total fits the machine's limit; GenieX itself only ever hosts one chat model.
 */
export function planNpu(opts: {
  hw: HardwareProfile;
  chat: { entry: CatalogEntry | null; compute: ComputeTarget; estNpuGB: number } | null;
  voice: VoiceSettings;
}): BudgetPlan {
  const lines: BudgetLine[] = [];
  const { hw, chat, voice } = opts;
  if (chat?.entry) lines.push({ role: "chat", name: chat.entry.name, onNpu: chat.compute === "npu" || chat.compute === "hybrid", gb: chat.estNpuGB });
  const stt = voiceModel(voice.sttModelId);
  const tts = voiceModel(voice.ttsModelId);
  if (stt) lines.push({ role: "stt", name: stt.name, onNpu: voice.sttCompute === "npu", gb: voiceNpuGB(stt) });
  if (tts) lines.push({ role: "tts", name: tts.name, onNpu: voice.ttsCompute === "npu", gb: voiceNpuGB(tts) });

  const onNpu = lines.filter((l) => l.onNpu);
  // The chat estimate already includes the runtime overhead once; do not add it again.
  const totalGB = Math.round(onNpu.reduce((n, l) => n + l.gb, 0) * 10) / 10;
  const usableGB = Math.round(usableBudgetGB(hw.npuBudgetGB) * 10) / 10;
  const voiceGB = Math.round(onNpu.filter((l) => l.role !== "chat").reduce((n, l) => n + l.gb, 0) * 100) / 100;
  const fits = totalGB <= usableGB;
  let advice: string | null = null;
  if (!fits) {
    const biggest = [...onNpu].sort((a, b) => b.gb - a.gb)[0];
    advice = `Everything on the NPU needs about ${totalGB} GB, this machine allows ${usableGB} GB. Move ${biggest.role === "chat" ? "the chat model" : biggest.role === "stt" ? "dictation" : "read-aloud"} to the CPU, or pick a smaller model.`;
  }
  return { lines, budgetGB: hw.npuBudgetGB, usableGB, voiceGB, totalGB, fits, advice };
}

/**
 * Hardware as the chat model sees it: the voice models that live on the NPU come out of its budget,
 * and a chat model on CPU/GPU is limited by RAM instead of NPU memory.
 */
export function effectiveHardware(hw: HardwareProfile, voice: VoiceSettings, chatCompute: ComputeTarget): HardwareProfile {
  if (chatCompute === "cpu" || chatCompute === "gpu") {
    return { ...hw, npuBudgetGB: Math.round(hw.ramGB * 0.55 * 10) / 10, npuBudgetSource: "estimated", offNpu: true };
  }
  const stt = voiceModel(voice.sttModelId);
  const tts = voiceModel(voice.ttsModelId);
  let used = 0;
  if (stt && voice.sttCompute === "npu") used += voiceNpuGB(stt);
  if (tts && voice.ttsCompute === "npu") used += voiceNpuGB(tts);
  if (used === 0) return hw;
  // usable() applies the safety factor to the whole budget; remove the voice share before that.
  return { ...hw, npuBudgetGB: Math.max(0, Math.round((hw.npuBudgetGB - used / 0.92) * 10) / 10) };
}

export { OVERHEAD_GB };
