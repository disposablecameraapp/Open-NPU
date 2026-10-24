import type { Schedule, ScheduledTask } from "../shared/types";

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function parseTime(t: string): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return h < 24 && mi < 60 ? { h, m: mi } : null;
}

export function validateSchedule(s: Schedule, now: number): string | null {
  switch (s.kind) {
    case "once": return Number.isFinite(s.at) && s.at > now ? null : "Pick a time in the future.";
    case "interval": return Number.isFinite(s.everyMin) && s.everyMin >= 1 ? null : "Repeat at least every minute.";
    case "daily": return parseTime(s.time) ? null : "Use a time like 08:30.";
    case "weekly": return !parseTime(s.time) ? "Use a time like 08:30." : s.days.length === 0 ? "Pick at least one day." : null;
  }
}

/** First moment strictly after `after` the schedule fires, in local time; null when it never will again. */
export function nextRun(s: Schedule, after: number): number | null {
  switch (s.kind) {
    case "once": return s.at > after ? s.at : null;
    case "interval": return after + Math.max(1, s.everyMin) * 60_000;
    case "daily":
    case "weekly": {
      const t = parseTime(s.time);
      if (!t) return null;
      const days = s.kind === "weekly" ? s.days : [0, 1, 2, 3, 4, 5, 6];
      if (days.length === 0) return null;
      const d = new Date(after);
      for (let i = 0; i < 8; i++) {
        const c = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i, t.h, t.m, 0, 0);
        if (c.getTime() > after && days.includes(c.getDay())) return c.getTime();
      }
      return null;
    }
  }
}

export function describeSchedule(s: Schedule): string {
  switch (s.kind) {
    case "once": return `Once, ${new Date(s.at).toLocaleString()}`;
    case "interval": return s.everyMin % 60 === 0 ? `Every ${s.everyMin / 60 === 1 ? "hour" : `${s.everyMin / 60} hours`}` : `Every ${s.everyMin} min`;
    case "daily": return `Every day at ${s.time}`;
    case "weekly": {
      const d = [...s.days].sort();
      const label = d.join() === "1,2,3,4,5" ? "weekdays" : d.join() === "0,6" ? "weekends" : d.map((x) => DAY[x]).join(", ");
      return `${label[0].toUpperCase()}${label.slice(1)} at ${s.time}`;
    }
  }
}

export function isDue(t: ScheduledTask, now: number): boolean {
  return t.enabled && !t.running && t.nextRun !== null && t.nextRun <= now;
}
