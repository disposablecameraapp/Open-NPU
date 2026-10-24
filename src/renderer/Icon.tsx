export const ICONS = {
  plus: "M12 5v14M5 12h14",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5",
  chat: "M4 5h16v11H9l-5 4z",
  cube: "M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5",
  gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19 12l2-1-2-3-2 .5-1.5-1L15 5h-4l-.5 2.5-1.5 1L7 8l-2 3 2 1v1l-2 1 2 3 2-.5 1.5 1L11 21h4l.5-2.5 1.5-1 2 .5 2-3-2-1z",
  copy: "M9 9h11v11H9zM5 15V4h11",
  check: "M5 13l4 4L19 7",
  speaker: "M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  download: "M12 4v11M7 11l5 5 5-5M5 20h14",
  close: "M6 6l12 12M18 6L6 18",
  up: "M12 19V5M6 11l6-6 6 6",
  stop: "M7 7h10v10H7z"
};

export function Icon({ d, size = 18, fill }: { d: string; size?: number; fill?: boolean }) {
  return <svg className="ico" viewBox="0 0 24 24" width={size} height={size} fill={fill ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}

export function IconButton({ d, label, onClick, className = "", disabled }: { d: string; label: string; onClick: () => void; className?: string; disabled?: boolean }) {
  return <button type="button" className={`iconbtn ${className}`} title={label} aria-label={label} onClick={onClick} disabled={disabled}><Icon d={d} size={16} /></button>;
}
