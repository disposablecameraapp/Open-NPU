export const ICONS = {
  plus: "M12 5v14M5 12h14",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5",
  chat: "M4 5h16v11H9l-5 4z",
  cube: "M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5",
  gear: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2zM15 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0z",
  copy: "M9 9h11v11H9zM5 15V4h11",
  check: "M5 13l4 4L19 7",
  speaker: "M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  download: "M12 4v11M7 11l5 5 5-5M5 20h14",
  close: "M6 6l12 12M18 6L6 18",
  up: "M12 19V5M6 11l6-6 6 6",
  stop: "M7 7h10v10H7z",
  edit: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  retry: "M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"
};

export function Icon({ d, size = 18, fill }: { d: string; size?: number; fill?: boolean }) {
  return <svg className="ico" viewBox="0 0 24 24" width={size} height={size} fill={fill ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}

export function IconButton({ d, label, onClick, className = "", disabled }: { d: string; label: string; onClick: () => void; className?: string; disabled?: boolean }) {
  return <button type="button" className={`iconbtn ${className}`} title={label} aria-label={label} onClick={onClick} disabled={disabled}><Icon d={d} size={16} /></button>;
}
