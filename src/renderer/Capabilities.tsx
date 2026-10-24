import type React from "react";
import { CapId, capabilities } from "../core/capabilities";
import { AudioIcon, CodeIcon, DistilledIcon, EmbeddingIcon, GlobeIcon, LongIcon, MathIcon, MoeIcon, NativeIcon, RoleplayIcon, ThinkingIcon, ToolsIcon, UncensoredIcon, VisionIcon } from "./Icons";

export const CAP_ICON: Record<CapId, () => React.JSX.Element> = {
  thinking: ThinkingIcon, vision: VisionIcon, code: CodeIcon, moe: MoeIcon, long: LongIcon, native: NativeIcon,
  tools: ToolsIcon, multilingual: GlobeIcon, math: MathIcon, roleplay: RoleplayIcon, uncensored: UncensoredIcon, audio: AudioIcon, distilled: DistilledIcon, embedding: EmbeddingIcon
};

/** Small icons for what a model can do. `compact` = icons only (menus); otherwise icon and word (model cards). */
export function CapBadges({ entry, compact }: { entry: Parameters<typeof capabilities>[0]; compact?: boolean }) {
  const caps = capabilities(entry);
  if (!caps.length) return null;
  const native = !compact && caps.find((c) => c.id === "native");
  return (
    <span className={`caps ${compact ? "compact" : ""}`}>
      {native && (
        <span className="native-banner" title={`${native.label}: ${native.hint}`}>
          <NativeIcon />
          <span className="native-text"><strong>Native NPU</strong><span>Light, fast and quiet: the PC barely notices</span></span>
        </span>
      )}
      {caps.filter((c) => !native || c.id !== "native").map((c) => {
        const Icon = CAP_ICON[c.id];
        return <span key={c.id} className={`cap cap-${c.id}`} title={`${c.label}: ${c.hint}`} aria-label={c.label}><Icon />{!compact && <span>{c.label}</span>}</span>;
      })}
    </span>
  );
}
