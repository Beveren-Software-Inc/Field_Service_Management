/** Company-zone clock helpers. Visit times are site-local wall clocks, never UTC dates. */

export function getCompanyTimeZone(): string {
  const boot = (
    window as unknown as {
      frappe?: { boot?: { sysdefaults?: { time_zone?: string }; time_zone?: string } };
    }
  ).frappe?.boot;
  const zone = boot?.sysdefaults?.time_zone || boot?.time_zone;
  if (zone && isValidTimeZone(zone)) return zone;
  return "UTC";
}

function isValidTimeZone(zone: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function zoneOffsetMs(epoch: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(epoch));
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  let hour = pick("hour");
  if (hour === 24) hour = 0;
  const asUtc = Date.UTC(pick("year"), pick("month") - 1, pick("day"), hour, pick("minute"), pick("second"));
  return asUtc - epoch;
}

/** Interpret `YYYY-MM-DD HH:mm:ss` as a wall clock in `timeZone` and return the UTC epoch. */
export function wallToEpoch(wall: string, timeZone = getCompanyTimeZone()): number {
  const normalized = wall.trim().replace("T", " ").slice(0, 19);
  const [datePart, timePart = "00:00:00"] = normalized.split(" ");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute, second = 0] = timePart.split(":").map(Number);
  const guess = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0);
  const corrected = guess - zoneOffsetMs(guess - zoneOffsetMs(guess, timeZone), timeZone);
  return corrected;
}

export function epochToWall(epoch: number, timeZone = getCompanyTimeZone()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(epoch));
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";
  const hour = pick("hour") === "24" ? "00" : pick("hour");
  return `${pick("year")}-${pick("month")}-${pick("day")} ${hour}:${pick("minute")}:${pick("second")}`;
}

export function todayKey(timeZone = getCompanyTimeZone()): string {
  return epochToWall(Date.now(), timeZone).slice(0, 10);
}

export function addDaysKey(key: string, days: number, timeZone = getCompanyTimeZone()): string {
  const epoch = wallToEpoch(`${key} 12:00:00`, timeZone) + days * 24 * 60 * 60 * 1000;
  return epochToWall(epoch, timeZone).slice(0, 10);
}

export function startOfWeekKey(key: string, timeZone = getCompanyTimeZone()): string {
  const epoch = wallToEpoch(`${key} 12:00:00`, timeZone);
  const name = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(new Date(epoch));
  const index = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(name);
  return addDaysKey(key, index === -1 ? 0 : -index, timeZone);
}

export function formatDayHeading(key: string, timeZone = getCompanyTimeZone()): string {
  const epoch = wallToEpoch(`${key} 12:00:00`, timeZone);
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date(epoch));
}

export function formatShortDay(key: string, timeZone = getCompanyTimeZone()): string {
  const epoch = wallToEpoch(`${key} 12:00:00`, timeZone);
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
  }).format(new Date(epoch));
}

export function formatWall(value: string, timeZone = getCompanyTimeZone()): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(wallToEpoch(value, timeZone)));
}

export function formatTime(value: string, timeZone = getCompanyTimeZone()): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(wallToEpoch(value, timeZone)));
}

/** Calendar date from a date-picker Date, using the picked year/month/day rather than UTC. */
export function dateToKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function monthBounds(anchor: string, timeZone = getCompanyTimeZone()): { start: string; end: string } {
  const [year, month] = anchor.split("-").map(Number);
  const startKey = `${year}-${String(month).padStart(2, "0")}-01`;
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const endKey = addDaysKey(next, -1, timeZone);
  return { start: `${startKey} 00:00:00`, end: `${endKey} 23:59:59` };
}

export function yearBounds(anchor: string): { start: string; end: string } {
  const year = anchor.slice(0, 4);
  return { start: `${year}-01-01 00:00:00`, end: `${year}-12-31 23:59:59` };
}
