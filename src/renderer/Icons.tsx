const base = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;
export const PlusIcon = () => <svg {...base}><path d="M12 5v14M5 12h14" /></svg>;
export const SearchIcon = () => <svg {...base}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>;
export const ProjectIcon = () => <svg {...base}><rect x="4" y="9" width="16" height="11" rx="2.5" /><path d="M7 5.5h10M9 2.5h6" /></svg>;
export const ArtifactIcon = () => <svg {...base}><rect x="3.5" y="8" width="11" height="12" rx="2.5" /><path d="M9 8V6.5A2.5 2.5 0 0 1 11.5 4H17a3.5 3.5 0 0 1 3.5 3.5V15a2.5 2.5 0 0 1-2.5 2.5h-1.5" /></svg>;
export const ClockIcon = () => <svg {...base}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>;
export const BriefcaseIcon = () => <svg {...base}><rect x="3.5" y="8" width="17" height="11.5" rx="2.5" /><path d="M9 8V6.5A1.5 1.5 0 0 1 10.5 5h3A1.5 1.5 0 0 1 15 6.5V8" /></svg>;
export const ChipIcon = () => <svg {...base}><rect x="6.5" y="6.5" width="11" height="11" rx="2" /><path d="M9.5 3.5v3M14.5 3.5v3M9.5 17.5v3M14.5 17.5v3M3.5 9.5h3M3.5 14.5h3M17.5 9.5h3M17.5 14.5h3" /></svg>;
export const GearIcon = () => <svg {...base}><circle cx="12" cy="12" r="3" /><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M6 18l1.4-1.4M16.6 7.4 18 6" /></svg>;
