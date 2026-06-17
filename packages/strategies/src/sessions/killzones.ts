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
