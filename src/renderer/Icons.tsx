const base = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;
export const PlusIcon = () => <svg {...base}><path d="M12 5v14M5 12h14" /></svg>;
export const SearchIcon = () => <svg {...base}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>;
export const ProjectIcon = () => <svg {...base}><rect x="4" y="9" width="16" height="11" rx="2.5" /><path d="M7 5.5h10M9 2.5h6" /></svg>;
export const PinIcon = () => <svg {...base} width={14} height={14}><path d="M9 4h6l-1 6 3 3H7l3-3-1-6zM12 13v7" /></svg>;
export const ArtifactIcon = () => <svg {...base}><rect x="3.5" y="8" width="11" height="12" rx="2.5" /><path d="M9 8V6.5A2.5 2.5 0 0 1 11.5 4H17a3.5 3.5 0 0 1 3.5 3.5V15a2.5 2.5 0 0 1-2.5 2.5h-1.5" /></svg>;
export const ClockIcon = () => <svg {...base}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>;
export const BriefcaseIcon = () => <svg {...base}><rect x="3.5" y="8" width="17" height="11.5" rx="2.5" /><path d="M9 8V6.5A1.5 1.5 0 0 1 10.5 5h3A1.5 1.5 0 0 1 15 6.5V8" /></svg>;
export const ChipIcon = () => <svg {...base}><rect x="6.5" y="6.5" width="11" height="11" rx="2" /><path d="M9.5 3.5v3M14.5 3.5v3M9.5 17.5v3M14.5 17.5v3M3.5 9.5h3M3.5 14.5h3M17.5 9.5h3M17.5 14.5h3" /></svg>;
export const GearIcon = () => <svg {...base}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2zM15 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0z" /></svg>;

const small = { ...base, width: 14, height: 14 } as const;
export const ThinkingIcon = () => <svg {...small}><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z" /></svg>;
export const VisionIcon = () => <svg {...small}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.8" /></svg>;
export const CodeIcon = () => <svg {...small}><path d="m8.5 8-4 4 4 4M15.5 8l4 4-4 4M13.5 5.5l-3 13" /></svg>;
export const MoeIcon = () => <svg {...small}><rect x="4" y="4" width="6" height="6" rx="1.5" /><rect x="14" y="4" width="6" height="6" rx="1.5" /><rect x="4" y="14" width="6" height="6" rx="1.5" /><rect x="14" y="14" width="6" height="6" rx="1.5" /></svg>;
export const LongIcon = () => <svg {...small}><path d="M3.5 12h17M7 8.5 3.5 12 7 15.5M17 8.5l3.5 3.5-3.5 3.5" /></svg>;
export const NativeIcon = () => <svg {...small}><rect x="6.5" y="6.5" width="11" height="11" rx="2" /><path d="M9.5 3.5v3M14.5 3.5v3M9.5 17.5v3M14.5 17.5v3M3.5 9.5h3M3.5 14.5h3M17.5 9.5h3M17.5 14.5h3" /></svg>;

export const SlidersIcon = () => <svg {...base}><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></svg>;
export const GlobeIcon = () => <svg {...small}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.4 3.6 5.2 3.6 8.5S14.500 18.100 12 20.500C9.500 18.100 8.400 15.300 8.400 12S9.500 5.900 12 3.500Z" /></svg>;
export const LoopIcon = () => <svg {...small}><path d="M4.500 12a7.500 7.500 0 0 1 13-5.100L19.500 9M19.500 4.500V9H15M19.500 12a7.500 7.500 0 0 1-13 5.100L4.500 15M4.500 19.500V15H9" /></svg>;
export const CheckShieldIcon = () => <svg {...small}><path d="M12 3.500 5 6v5.500c0 4.200 2.800 7.300 7 9 4.200-1.700 7-4.800 7-9V6l-7-2.500Z" /><path d="m9 12 2.200 2.200L15.200 10" /></svg>;
export const AgentsIcon = () => <svg {...small}><circle cx="12" cy="6.500" r="2.500" /><circle cx="6" cy="17" r="2.500" /><circle cx="18" cy="17" r="2.500" /><path d="M12 9v3M12 12l-4.500 3M12 12l4.500 3" /></svg>;

export const ToolsIcon = () => <svg {...small}><path d="M14.500 6.500a4 4 0 0 0 4.800 4.800L12 18.600a2.100 2.100 0 0 1-3-3L16.300 8.300A4 4 0 0 0 14.500 6.500Z" /><path d="M5.500 18.500l1 1" /></svg>;
export const MathIcon = () => <svg {...small}><path d="M18 5.500H7l5 6.500-5 6.500h11" /></svg>;
export const RoleplayIcon = () => <svg {...small}><path d="M4.500 6.500h10a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H9l-3.500 3v-3h-1a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Z" /><path d="M17.500 10h2a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-.5v2.500L15.500 17" /></svg>;
export const UncensoredIcon = () => <svg {...small}><rect x="5" y="11" width="14" height="9.500" rx="2" /><path d="M8 11V8a4 4 0 0 1 7.700-1.500" /></svg>;
export const AudioIcon = () => <svg {...small}><path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 10.500v3" /></svg>;
export const DistilledIcon = () => <svg {...small}><path d="M12 3.500c3 4 5.500 6.800 5.500 10a5.500 5.500 0 0 1-11 0c0-3.200 2.500-6 5.500-10Z" /></svg>;
export const EmbeddingIcon = () => <svg {...small}><circle cx="6" cy="7" r="1.800" /><circle cx="17" cy="6" r="1.800" /><circle cx="12" cy="17" r="1.800" /><path d="M7.600 8l3.300 7.300M15.800 7.500l-3 8M7.800 6.800l7.400-.6" /></svg>;

/** Open NPU mark: a hexagon (the Hexagon NPU) around one active core. Flat, no tile: the outline follows the text colour, the core the accent. */
export const LogoMark = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
    <path d="M27.24 5.25Q32 2.5 36.76 5.25L52.78 14.5Q57.55 17.25 57.55 22.75L57.55 41.25Q57.55 46.75 52.78 49.5L36.76 58.75Q32 61.5 27.24 58.75L11.22 49.5Q6.45 46.75 6.45 41.25L6.45 22.75Q6.45 17.25 11.22 14.5Z" fill="none" stroke="currentColor" strokeWidth="6.8" strokeLinejoin="round" />
    <path d="M30.27 19.8Q32 18.8 33.73 19.8L41.7 24.4Q43.43 25.4 43.43 27.4L43.43 36.6Q43.43 38.6 41.7 39.6L33.73 44.2Q32 45.2 30.27 44.2L22.3 39.6Q20.57 38.6 20.57 36.6L20.57 27.4Q20.57 25.4 22.3 24.4Z" fill="var(--logo-core, #ab91dc)" stroke="var(--logo-core, #ab91dc)" strokeWidth="3.4" strokeLinejoin="round" />
  </svg>
);

export const MonitorIcon = () => <svg {...base}><rect x="3.500" y="4.500" width="17" height="11.500" rx="2" /><path d="M9 20h6M12 16v4" /></svg>;
export const RefreshIcon = () => <svg {...base}><path d="M4.500 12a7.500 7.500 0 0 1 13-5.100L19.500 9M19.500 4.500V9H15M19.500 12a7.500 7.500 0 0 1-13 5.100L4.500 15M4.500 19.500V15H9" /></svg>;
export const HelpIcon = () => <svg {...base}><circle cx="12" cy="12" r="8.500" /><path d="M9.700 9.500a2.400 2.400 0 0 1 4.600.9c0 1.600-2.300 2-2.300 3.400M12 17h.01" /></svg>;
export const TerminalIcon = () => <svg {...base}><rect x="3.500" y="5" width="17" height="14" rx="2.500" /><path d="m7.500 10 2.500 2-2.500 2M12.500 14.500h4" /></svg>;
export const LayersIcon = () => <svg {...base}><path d="m12 4 8.500 4.500L12 13 3.500 8.500 12 4ZM3.500 12.500 12 17l8.500-4.500M3.500 16 12 20.500 20.500 16" /></svg>;
export const ActivityIcon = () => <svg {...base}><path d="M3 12h4l2.500-6 5 12 2.500-6H21" /></svg>;
export const CompareIcon = () => <svg {...base}><path d="M8 4v16M16 4v16M4.500 8 8 4.500 11.500 8M12.500 16l3.500 3.500 3.500-3.500" /></svg>;
export const GaugeIcon = () => <svg {...base}><path d="M4.500 17a8 8 0 1 1 15 0M12 13l3.500-4" /><circle cx="12" cy="13" r="1" /></svg>;
