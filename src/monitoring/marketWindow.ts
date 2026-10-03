import type { MonitorSettings } from "./monitorTypes.ts";

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timezone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timezone);
  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  formatterCache.set(timezone, formatter);
  return formatter;
}

function getZonedParts(date: Date, timezone: string): ZonedParts {
  const parts = getFormatter(timezone).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    weekday: String(values.weekday || ""),
  };
}

export function getLocalDateKey(date: Date, timezone: string): string {
  const parts = getZonedParts(date, timezone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function toMinutes(clockTime: string): number {
  const [hourText, minuteText] = String(clockTime || "").split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`Invalid clock time: ${clockTime}`);
  }

  return hour * 60 + minute;
}

function isBusinessDay(weekday: string): boolean {
  return ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday);
}

export function isWithinMarketWindow(date: Date, settings: MonitorSettings): boolean {
  const parts = getZonedParts(date, settings.timezone);
  if (!isBusinessDay(parts.weekday)) {
    return false;
  }

  const currentMinutes = parts.hour * 60 + parts.minute;
  const startMinutes = toMinutes(settings.marketWindowStart);
  const endMinutes = toMinutes(settings.marketWindowEnd);

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

export function findNextMonitorRun(after: Date, settings: MonitorSettings): Date | null {
  const intervalMinutes = Math.max(1, Number(settings.pollIntervalMinutes || 120));
  const startMinutes = toMinutes(settings.marketWindowStart);
  const endMinutes = toMinutes(settings.marketWindowEnd);
  const candidate = new Date(after.getTime());
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);

  for (let offset = 0; offset < 60 * 24 * 14; offset += 1) {
    const nextCandidate = new Date(candidate.getTime() + offset * 60000);
    const parts = getZonedParts(nextCandidate, settings.timezone);

    if (!isBusinessDay(parts.weekday)) {
      continue;
    }

    const currentMinutes = parts.hour * 60 + parts.minute;
    if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
      continue;
    }

    const minutesSinceStart = currentMinutes - startMinutes;
    if (minutesSinceStart % intervalMinutes === 0) {
      return nextCandidate;
    }
  }

  return null;
}

export function isLastMonitorSlotOfDay(date: Date, settings: MonitorSettings): boolean {
  const currentDateKey = getLocalDateKey(date, settings.timezone);
  const nextRun = findNextMonitorRun(date, settings);
  if (!nextRun) {
    return true;
  }

  return getLocalDateKey(nextRun, settings.timezone) !== currentDateKey;
}