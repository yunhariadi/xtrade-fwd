export interface Killzone {
  name: string;
  startHour: number;  // UTC hour
  startMinute: number;
  endHour: number;    // UTC hour
  endMinute: number;
  color: string;
}

// Standard ICT Killzones (all in UTC)
export const KILLZONES: Killzone[] = [
  { name: "Asian",        startHour: 1,  startMinute: 0, endHour: 5,  endMinute: 0, color: "rgba(233, 30, 99, 0.07)" },
  { name: "London Open",  startHour: 6,  startMinute: 0, endHour: 9,  endMinute: 0, color: "rgba(0, 188, 212, 0.07)" },
  { name: "New York",     startHour: 12, startMinute: 0, endHour: 14, endMinute: 0, color: "rgba(255, 93, 0, 0.07)" },
  { name: "London Close", startHour: 14, startMinute: 0, endHour: 16, endMinute: 0, color: "rgba(33, 87, 243, 0.07)" },
];

/**
 * Check if a Unix seconds timestamp falls within a killzone.
 */
export function isInKillzone(timeUnixSeconds: number, kz: Killzone): boolean {
  const date = new Date(timeUnixSeconds * 1000);
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();
  const totalMinutes = hour * 60 + minute;
  const kzStart = kz.startHour * 60 + kz.startMinute;
  const kzEnd = kz.endHour * 60 + kz.endMinute;

  if (kzStart <= kzEnd) {
    return totalMinutes >= kzStart && totalMinutes < kzEnd;
  }
  // Wraps midnight
  return totalMinutes >= kzStart || totalMinutes < kzEnd;
}

/**
 * Get the killzone a candle is in (or null if none).
 */
export function getKillzone(timeUnixSeconds: number): Killzone | null {
  for (const kz of KILLZONES) {
    if (isInKillzone(timeUnixSeconds, kz)) return kz;
  }
  return null;
}

/** A concrete killzone occurrence with absolute open/close times. */
export interface KillzoneWindow {
  name: string;
  /** Unix seconds — window open. */
  start: number;
  /** Unix seconds — window close. */
  end: number;
  /** True when `now` falls inside [start, end). */
  active: boolean;
  /** Seconds until `start` (0 if already active or in the past edge). */
  secondsUntilStart: number;
  /** Seconds until `end`. */
  secondsUntilEnd: number;
}

/**
 * Resolve every killzone to its current-or-next concrete occurrence around
 * `nowUnixSeconds`, so an agent can time analysis to session transitions
 * without hardcoding UTC hours. For each killzone we anchor to today's UTC
 * midnight; if that occurrence has already closed we roll forward a day. All
 * times are Unix seconds.
 */
export function getKillzoneWindows(nowUnixSeconds: number): {
  now: number;
  current: KillzoneWindow | null;
  next: KillzoneWindow | null;
  windows: KillzoneWindow[];
} {
  const DAY = 86_400;
  const now = Math.floor(nowUnixSeconds);
  // UTC midnight of the day containing `now`.
  const utcMidnight = Math.floor(now / DAY) * DAY;

  const windows: KillzoneWindow[] = KILLZONES.map((kz) => {
    const startOffset = kz.startHour * 3600 + kz.startMinute * 60;
    let endOffset = kz.endHour * 3600 + kz.endMinute * 60;
    // Killzones that wrap past midnight have end <= start; push end to next day.
    if (endOffset <= startOffset) endOffset += DAY;

    let start = utcMidnight + startOffset;
    let end = utcMidnight + endOffset;
    // Already fully in the past today → use tomorrow's occurrence.
    if (end <= now) {
      start += DAY;
      end += DAY;
    }

    const active = now >= start && now < end;
    return {
      name: kz.name,
      start,
      end,
      active,
      secondsUntilStart: Math.max(0, start - now),
      secondsUntilEnd: end - now,
    };
  }).sort((a, b) => a.start - b.start);

  const current = windows.find((w) => w.active) ?? null;
  const next = windows.find((w) => !w.active) ?? null;
  return { now, current, next, windows };
}
