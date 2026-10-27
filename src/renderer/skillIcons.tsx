/** The icon library for skills: one line drawing each, searchable by name and keywords. No pictures, so nothing bad can be uploaded. */
export interface SkillIcon { id: string; label: string; keywords: string; d: string }

export const SKILL_ICONS: SkillIcon[] = [
  { id: "code", label: "Code", keywords: "programming developer html script", d: "M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 6l-3 12" },
  { id: "terminal", label: "Terminal", keywords: "shell command console cli", d: "M4 5h16v14H4zM8 10l3 2-3 2M13 15h4" },
  { id: "bug", label: "Bug", keywords: "debug error fix", d: "M9 8a3 3 0 016 0v1H9V8zM8 9h8v6a4 4 0 01-8 0V9zM4 12h4M16 12h4M5 6l3 2M19 6l-3 2M5 19l3-2M19 19l-3-2" },
  { id: "chart", label: "Chart", keywords: "data graph statistics bars analytics", d: "M5 20V10M12 20V4M19 20v-7" },
  { id: "table", label: "Table", keywords: "spreadsheet grid rows columns", d: "M4 5h16v14H4zM4 10h16M4 15h16M10 5v14" },
  { id: "diagram", label: "Diagram", keywords: "flow schema structure org tree", d: "M9 4h6v5H9zM3 15h6v5H3zM15 15h6v5h-6zM12 9v3M6 15v-3h12v3" },
  { id: "list", label: "List", keywords: "bullets items outline", d: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" },
  { id: "checklist", label: "Checklist", keywords: "tasks todo planning steps", d: "M5 6l2 2 3-3M13 7h6M5 13l2 2 3-3M13 14h6M5 20h14" },
  { id: "globe", label: "Globe", keywords: "language world web international", d: "M3 12a9 9 0 1018 0 9 9 0 00-18 0zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" },
  { id: "translate", label: "Translate", keywords: "language translation foreign", d: "M4 5h9M8 3v2M6 5c1 4 3 6 6 8M12 5c-1 4-3 7-7 9M13 20l4-9 4 9M14.5 17h5" },
  { id: "pen", label: "Pen", keywords: "write writing edit text", d: "M4 20l4-1 11-11-3-3L5 16l-1 4zM14 6l3 3" },
  { id: "quote", label: "Quote", keywords: "citation text speech", d: "M7 7h4v5c0 3-1 4-4 5M15 7h4v5c0 3-1 4-4 5" },
  { id: "mail", label: "Mail", keywords: "email message letter", d: "M4 6h16v12H4zM4 7l8 6 8-6" },
  { id: "chat", label: "Chat", keywords: "conversation message talk", d: "M4 5h16v11H9l-5 4V5z" },
  { id: "megaphone", label: "Megaphone", keywords: "announce marketing post social", d: "M4 10v4h3l7 4V6L7 10H4zM17 9a4 4 0 010 6" },
  { id: "book", label: "Book", keywords: "study learn read course", d: "M5 4h10a3 3 0 013 3v13H8a3 3 0 01-3-3V4zM5 17a3 3 0 013-3h10" },
  { id: "graduation", label: "Graduation", keywords: "school education student exam", d: "M2 9l10-5 10 5-10 5L2 9zM6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5" },
  { id: "flask", label: "Flask", keywords: "science experiment chemistry lab", d: "M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3M8 15h8" },
  { id: "bulb", label: "Light bulb", keywords: "idea brainstorm creative", d: "M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z" },
  { id: "sparkle", label: "Sparkle", keywords: "magic new generate creative", d: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM18 16l.8 2.2L21 19l-2.2.8L18 22l-.8-2.2L15 19l2.2-.8L18 16z" },
  { id: "target", label: "Target", keywords: "goal focus aim objective", d: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 8a4 4 0 100 8 4 4 0 000-8zM12 12h.01" },
  { id: "rocket", label: "Rocket", keywords: "launch startup project fast", d: "M12 3c4 2 6 6 5 11l-3 3h-4l-3-3C6 9 8 5 12 3zM10 17l-2 4M14 17l2 4M12 9h.01" },
  { id: "trophy", label: "Trophy", keywords: "win goal success award", d: "M8 4h8v5a4 4 0 01-8 0V4zM8 6H4v1a3 3 0 003 3M16 6h4v1a3 3 0 01-3 3M12 13v4M8 20h8" },
  { id: "scale", label: "Balance", keywords: "decision pros cons compare law justice", d: "M12 4v16M6 20h12M5 8h14M5 8l-3 7a3 3 0 006 0L5 8zM19 8l-3 7a3 3 0 006 0l-3-7z" },
  { id: "calendar", label: "Calendar", keywords: "date schedule plan day", d: "M5 5h14v15H5zM5 10h14M9 3v4M15 3v4" },
  { id: "clock", label: "Clock", keywords: "time timer deadline", d: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2" },
  { id: "flag", label: "Flag", keywords: "milestone goal mark", d: "M5 21V4M5 5h12l-2 4 2 4H5" },
  { id: "pin", label: "Place", keywords: "map location travel", d: "M12 21s-6-6-6-11a6 6 0 0112 0c0 5-6 11-6 11zM12 8a2 2 0 100 4 2 2 0 000-4z" },
  { id: "home", label: "Home", keywords: "house everyday life family", d: "M4 11l8-7 8 7M6 10v10h12V10M10 20v-6h4v6" },
  { id: "utensils", label: "Food", keywords: "recipe meal cooking kitchen", d: "M6 3v8M9 3v8M6 8h3M7.5 11v10M17 3c-2 2-2 6 0 8v10" },
  { id: "coffee", label: "Coffee", keywords: "break drink cafe", d: "M5 8h11v6a4 4 0 01-4 4H9a4 4 0 01-4-4V8zM16 9h2a2 2 0 010 5h-2M8 3v2M12 3v2" },
  { id: "heart", label: "Heart", keywords: "health love care wellbeing", d: "M12 20s-7-4.5-7-10a4 4 0 017-2.5A4 4 0 0119 10c0 5.5-7 10-7 10z" },
  { id: "money", label: "Money", keywords: "finance budget price coin", d: "M12 3a9 9 0 100 18 9 9 0 000-18zM14.5 9.5h-4a1.5 1.5 0 000 3h3a1.5 1.5 0 010 3h-4M12 7v10" },
  { id: "cart", label: "Cart", keywords: "shopping store buy", d: "M3 4h3l2 11h10l2-8H7M9 20h.01M17 20h.01" },
  { id: "user", label: "Person", keywords: "profile people me", d: "M12 4a4 4 0 100 8 4 4 0 000-8zM5 20a7 7 0 0114 0" },
  { id: "users", label: "People", keywords: "team meeting group", d: "M9 5a3 3 0 100 6 3 3 0 000-6zM3 19a6 6 0 0112 0M16 6a3 3 0 010 5M17 14a6 6 0 014 5" },
  { id: "file", label: "File", keywords: "document page paper", d: "M7 3h7l4 4v14H7zM14 3v4h4" },
  { id: "folder", label: "Folder", keywords: "project files organize", d: "M3 6h6l2 2h10v11H3z" },
  { id: "image", label: "Picture", keywords: "photo design media", d: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9h.01" },
  { id: "music", label: "Music", keywords: "audio song sound", d: "M9 18V6l10-2v12M9 18a3 3 0 11-3-3 3 3 0 013 3zM19 16a3 3 0 11-3-3 3 3 0 013 3z" },
  { id: "camera", label: "Camera", keywords: "photo video", d: "M4 8h4l2-3h4l2 3h4v11H4zM12 11a3 3 0 100 6 3 3 0 000-6z" },
  { id: "search", label: "Search", keywords: "find research look", d: "M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4" },
  { id: "link", label: "Link", keywords: "url connect web", d: "M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" },
  { id: "bolt", label: "Bolt", keywords: "fast quick energy power", d: "M13 3L5 13h6l-1 8 8-10h-6l1-8z" },
  { id: "shield", label: "Shield", keywords: "security safe privacy", d: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" },
  { id: "lock", label: "Lock", keywords: "private password secure", d: "M6 11h12v9H6zM8 11V8a4 4 0 018 0v3" },
  { id: "sliders", label: "Settings", keywords: "options tune configure", d: "M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M6 15v4" },
  { id: "wrench", label: "Tool", keywords: "fix repair build", d: "M14 6a4 4 0 005 5l-9 9a2 2 0 01-3-3l9-9a4 4 0 00-2-2z" },
  { id: "sun", label: "Sun", keywords: "morning day weather", d: "M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" },
  { id: "moon", label: "Moon", keywords: "night sleep evening", d: "M20 14A8 8 0 019 4a8 8 0 1011 10z" },
  { id: "cloud", label: "Cloud", keywords: "weather online", d: "M7 18a4 4 0 010-8 5 5 0 019.5-1A4.5 4.5 0 0117 18H7z" },
  { id: "leaf", label: "Leaf", keywords: "nature plant garden eco", d: "M5 19C5 10 10 5 20 4c0 10-5 15-14 15zM5 19l8-8" },
  { id: "star", label: "Star", keywords: "favorite other general", d: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z" },
  { id: "copy", label: "Copy", keywords: "duplicate", d: "M8 8h11v12H8zM5 16V4h11" },
  { id: "trash", label: "Trash", keywords: "delete remove", d: "M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" },
  { id: "download", label: "Download", keywords: "export save", d: "M12 4v12M7 11l5 5 5-5M5 20h14" },
  { id: "upload", label: "Import", keywords: "load file", d: "M12 16V4M7 9l5-5 5 5M5 20h14" },
  { id: "plus", label: "Plus", keywords: "add new create", d: "M12 5v14M5 12h14" },
  { id: "x", label: "Close", keywords: "cancel remove", d: "M6 6l12 12M18 6L6 18" }
];

/** The icon a category gets when the skill chose none. */
export const CATEGORY_ICON: Record<string, string> = { create: "sparkle", code: "code", data: "chart", language: "globe", writing: "pen", study: "book", everyday: "home", planning: "checklist", ideas: "bulb", other: "star" };

export const iconById = (id: string | undefined) => SKILL_ICONS.find((i) => i.id === id);

/** The library searched by name and keywords; everything when nothing is typed. */
export function searchIcons(q: string): SkillIcon[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  // each typed word must start a word of the name or keywords ("mo" finds moon and money, not "remove")
  return words.length ? SKILL_ICONS.filter((i) => { const hay = `${i.id} ${i.label} ${i.keywords}`.toLowerCase().split(/\s+/); return words.every((w) => hay.some((h) => h.startsWith(w))); }) : SKILL_ICONS;
}

export function Glyph({ id, size = 22 }: { id: string; size?: number }) {
  const icon = iconById(id) ?? iconById("star")!;
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={icon.d} /></svg>;
}
