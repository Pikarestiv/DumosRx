import { DEFAULT_STOREFRONT_LOCALE, translate, type StorefrontLocale } from "@/lib/storefront-i18n";

export const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface DayHours {
  open: string;
  close: string;
}

export type OpeningHours = Partial<Record<Weekday, DayHours | null>>;

export type OpenStatus =
  | { state: "open"; closesAt: string }
  | { state: "closed"; opensAt: string; opensOn: "today" | "tomorrow" | Weekday };

const MONDAY_2024 = Date.UTC(2024, 0, 1);
const DAY_MS = 24 * 60 * 60 * 1000;
const MONDAY_FIRST: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const dayLabel = (day: Weekday, locale: StorefrontLocale): string =>
  new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" })
    .format(new Date(MONDAY_2024 + MONDAY_FIRST.indexOf(day) * DAY_MS))
    .replace(/\.$/, "");


const minutesOf = (clock: string) => {
  const [hours, minutes] = clock.split(":").map(Number);
  return hours * 60 + minutes;
};

const isClock = (value: unknown): value is string => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

const validDay = (day: DayHours | null | undefined): day is DayHours =>
  Boolean(day && isClock(day.open) && isClock(day.close) && minutesOf(day.open) < minutesOf(day.close));

export function formatClock(clock: string, locale: StorefrontLocale = DEFAULT_STOREFRONT_LOCALE): string {
  const [hours, minutes] = clock.split(":").map(Number);
  if (locale === "fr") return `${String(hours).padStart(2, "0")}h${String(minutes).padStart(2, "0")}`;
  const suffix = hours >= 12 ? "pm" : "am";
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelve}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

interface ClockReading {
  day: number;
  minutes: number;
}

const WEEKDAY_INDEX = new Map<string, number>(WEEKDAYS.map((day, index) => [day, index]));

function readClock(now: Date, timeZone?: string | null): ClockReading {
  if (timeZone && timeZone !== "UTC") {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).formatToParts(now);
      const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
      const day = WEEKDAY_INDEX.get(part("weekday").toLowerCase().slice(0, 3));
      if (day !== undefined) return { day, minutes: Number(part("hour")) * 60 + Number(part("minute")) };
    } catch {
      // An unknown time zone name falls through to the visitor's own clock.
    }
  }
  return { day: now.getDay(), minutes: now.getHours() * 60 + now.getMinutes() };
}

export function openStatus(hours: OpeningHours | null | undefined, now: Date, timeZone?: string | null): OpenStatus | null {
  if (!hours || !WEEKDAYS.some((day) => validDay(hours[day]))) return null;

  const { day: today, minutes: nowMinutes } = readClock(now, timeZone);
  const todayHours = hours[WEEKDAYS[today]];

  if (validDay(todayHours) && nowMinutes >= minutesOf(todayHours.open) && nowMinutes < minutesOf(todayHours.close)) {
    return { state: "open", closesAt: todayHours.close };
  }
  if (validDay(todayHours) && nowMinutes < minutesOf(todayHours.open)) {
    return { state: "closed", opensAt: todayHours.open, opensOn: "today" };
  }

  for (let offset = 1; offset <= 7; offset += 1) {
    const day = WEEKDAYS[(today + offset) % 7];
    const dayHours = hours[day];
    if (validDay(dayHours)) {
      return { state: "closed", opensAt: dayHours.open, opensOn: offset === 1 ? "tomorrow" : day };
    }
  }
  return null;
}

export function describeOpenStatus(status: OpenStatus, locale: StorefrontLocale = DEFAULT_STOREFRONT_LOCALE): string {
  if (status.state === "open") return translate(locale, "status.open", { time: formatClock(status.closesAt, locale) });
  const time = formatClock(status.opensAt, locale);
  if (status.opensOn === "today") return translate(locale, "status.closed.today", { time });
  if (status.opensOn === "tomorrow") return translate(locale, "status.closed.tomorrow", { time });
  return translate(locale, "status.closed.day", { day: dayLabel(status.opensOn, locale), time });
}

export function summarizeHours(hours: OpeningHours | null | undefined, locale: StorefrontLocale = DEFAULT_STOREFRONT_LOCALE): string | null {
  if (!hours) return null;
  const groups: { days: Weekday[]; range: string }[] = [];

  for (const day of MONDAY_FIRST) {
    const dayHours = hours[day];
    if (!validDay(dayHours)) continue;
    const range = `${formatClock(dayHours.open, locale)} – ${formatClock(dayHours.close, locale)}`;
    const last = groups[groups.length - 1];
    const previous = MONDAY_FIRST[MONDAY_FIRST.indexOf(day) - 1];
    if (last && last.range === range && last.days[last.days.length - 1] === previous) {
      last.days.push(day);
    } else {
      groups.push({ days: [day], range });
    }
  }

  if (groups.length === 0) return null;
  return groups
    .map(({ days, range }) => {
      const span = days.length === 1 ? dayLabel(days[0], locale) : `${dayLabel(days[0], locale)} – ${dayLabel(days[days.length - 1], locale)}`;
      return `${span} · ${range}`;
    })
    .join("; ");
}
