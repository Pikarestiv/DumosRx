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

const DAY_LABELS: Record<Weekday, string> = {
  sun: "Sun",
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
};

const MONDAY_FIRST: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const minutesOf = (clock: string) => {
  const [hours, minutes] = clock.split(":").map(Number);
  return hours * 60 + minutes;
};

const isClock = (value: unknown): value is string => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

const validDay = (day: DayHours | null | undefined): day is DayHours =>
  Boolean(day && isClock(day.open) && isClock(day.close) && minutesOf(day.open) < minutesOf(day.close));

export function formatClock(clock: string): string {
  const [hours, minutes] = clock.split(":").map(Number);
  const suffix = hours >= 12 ? "pm" : "am";
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelve}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

export function openStatus(hours: OpeningHours | null | undefined, now: Date): OpenStatus | null {
  if (!hours || !WEEKDAYS.some((day) => validDay(hours[day]))) return null;

  const today = now.getDay();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
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

export function describeOpenStatus(status: OpenStatus): string {
  if (status.state === "open") return `Open · closes at ${formatClock(status.closesAt)}`;
  const when = status.opensOn === "today" || status.opensOn === "tomorrow" ? status.opensOn : DAY_LABELS[status.opensOn];
  return `Closed · opens ${when} at ${formatClock(status.opensAt)}`;
}

export function summarizeHours(hours: OpeningHours | null | undefined): string | null {
  if (!hours) return null;
  const groups: { days: Weekday[]; range: string }[] = [];

  for (const day of MONDAY_FIRST) {
    const dayHours = hours[day];
    if (!validDay(dayHours)) continue;
    const range = `${formatClock(dayHours.open)} – ${formatClock(dayHours.close)}`;
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
      const span = days.length === 1 ? DAY_LABELS[days[0]] : `${DAY_LABELS[days[0]]} – ${DAY_LABELS[days[days.length - 1]]}`;
      return `${span} · ${range}`;
    })
    .join("; ");
}
