/**
 * Daily time slots in Asia/Dhaka (UTC+6, no DST).
 * All functions are pure and take `now` so they can be tested with an injected clock.
 */

export type Slot = { start: string; end: string }; // "HH:MM" Dhaka local time

const DHAKA_OFFSET_MIN = 6 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_SCHEDULE_4: Slot[] = [
  { start: "09:00", end: "12:00" },
  { start: "12:00", end: "15:00" },
  { start: "15:00", end: "18:00" },
  { start: "18:00", end: "21:00" },
];

export const DEFAULT_SCHEDULE_5: Slot[] = [
  { start: "09:00", end: "11:30" },
  { start: "11:30", end: "14:00" },
  { start: "14:00", end: "16:30" },
  { start: "16:30", end: "19:00" },
  { start: "19:00", end: "21:30" },
];

export function toMinutes(hhmm: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) throw new Error(`Invalid time ${hhmm}`);
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (h > 24 || mm > 59 || (h === 24 && mm !== 0)) throw new Error(`Invalid time ${hhmm}`);
  return h * 60 + mm;
}

/** Validate a schedule: correct count, HH:MM, start<end, non-overlapping. Returns an error string or null. */
export function validateSchedule(slots: unknown, count: number): string | null {
  if (!Array.isArray(slots)) return "Schedule must be a list";
  if (slots.length !== count) return `Schedule must have exactly ${count} slots`;
  const parsed: { s: number; e: number }[] = [];
  for (const raw of slots) {
    const slot = raw as Slot;
    if (typeof slot?.start !== "string" || typeof slot?.end !== "string") return "Each slot needs start and end";
    let s: number, e: number;
    try {
      s = toMinutes(slot.start);
      e = toMinutes(slot.end);
    } catch {
      return `Invalid time in slot ${slot.start}-${slot.end}`;
    }
    if (s >= e) return `Slot ${slot.start}-${slot.end} must end after it starts`;
    if (e - s < 30) return `Slot ${slot.start}-${slot.end} is shorter than 30 minutes`;
    parsed.push({ s, e });
  }
  const sorted = [...parsed].sort((a, b) => a.s - b.s);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].s < sorted[i - 1].e) return "Slots must not overlap";
  }
  return null;
}

/** Minutes since Dhaka midnight. */
export function dhakaMinuteOfDay(now: Date): number {
  const total = Math.floor(now.getTime() / 60000) + DHAKA_OFFSET_MIN;
  return ((total % 1440) + 1440) % 1440;
}

/** UTC instant of Dhaka midnight for the Dhaka day containing `now`. */
export function dhakaMidnight(now: Date): Date {
  const minute = dhakaMinuteOfDay(now);
  const ms = now.getTime() - minute * 60000 - (now.getTime() % 60000);
  return new Date(ms);
}

export function isWithinSlot(slot: Slot, now: Date): boolean {
  const m = dhakaMinuteOfDay(now);
  return m >= toMinutes(slot.start) && m < toMinutes(slot.end);
}

export type SlotWindow = { start: Date; end: Date; active: boolean };

/** The current window if active, else the next upcoming window. */
export function currentOrNextWindow(slot: Slot, now: Date): SlotWindow {
  const midnight = dhakaMidnight(now).getTime();
  const s = toMinutes(slot.start) * 60000;
  const e = toMinutes(slot.end) * 60000;
  const todayStart = new Date(midnight + s);
  const todayEnd = new Date(midnight + e);
  if (now < todayStart) return { start: todayStart, end: todayEnd, active: false };
  if (now < todayEnd) return { start: todayStart, end: todayEnd, active: true };
  return { start: new Date(midnight + DAY_MS + s), end: new Date(midnight + DAY_MS + e), active: false };
}

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
export function toBnDigits(s: string): string {
  return s.replace(/\d/g, (d) => BN_DIGITS[parseInt(d, 10)]);
}

/** "সকাল ৯:০০" style label. */
export function formatClock(hhmm: string): string {
  const mins = toMinutes(hhmm);
  const h24 = Math.floor(mins / 60) % 24;
  const mm = mins % 60;
  let period = "রাত";
  if (h24 >= 5 && h24 < 12) period = "সকাল";
  else if (h24 >= 12 && h24 < 15) period = "দুপুর";
  else if (h24 >= 15 && h24 < 18) period = "বিকাল";
  else if (h24 >= 18 && h24 < 20) period = "সন্ধ্যা";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${period} ${toBnDigits(`${h12}:${String(mm).padStart(2, "0")}`)}`;
}

export function formatSlot(slot: Slot): string {
  return `${formatClock(slot.start)} – ${formatClock(slot.end)}`;
}

/** Format a Date in Dhaka local time for display. */
export function formatDhaka(d: Date, withTime = true): string {
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: "Asia/Dhaka",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  };
  return new Intl.DateTimeFormat("bn-BD", opts).format(d);
}
