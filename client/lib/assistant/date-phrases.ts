export interface DatePhraseResult {
  from: string;
  to: string;
  label: string;
}

export function toDateOnly(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function monthRange(d: Date, monthOffset: number): { from: string; to: string } {
  const first = new Date(d.getFullYear(), d.getMonth() + monthOffset, 1);
  const last = new Date(d.getFullYear(), d.getMonth() + monthOffset + 1, 0);
  return { from: toDateOnly(first), to: toDateOnly(last) };
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const DD_MM_YYYY = /\b(\d{2})\/(\d{2})\/(\d{4})\b/;
const RANGE_PHRASE = /\bfrom\s+(.+?)\s+to\s+(.+)$/;
const TODAY = /\btoday\b/;
const YESTERDAY = /\byesterday\b/;
const LAST_MONTH = /\blast\s+month\b/;
const THIS_MONTH = /\bthis\s+month\b/;

interface ResolvedToken {
  iso: string;
  label: string;
}

function parseSingleDateToken(token: string): ResolvedToken | null {
  const iso = token.match(ISO_DATE);
  if (iso) {
    const [, y, m, d] = iso;
    if (!isValidCalendarDate(Number(y), Number(m), Number(d))) return null;
    return { iso: `${y}-${m}-${d}`, label: `${y}-${m}-${d}` };
  }

  const ddmmyyyy = token.match(DD_MM_YYYY);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    if (!isValidCalendarDate(Number(y), Number(m), Number(d))) return null;
    return { iso: `${y}-${m}-${d}`, label: `${d}/${m}/${y}` };
  }

  return null;
}

function resolveDateToken(token: string, now: Date): ResolvedToken | null {
  const single = parseSingleDateToken(token);
  if (single) return single;
  if (TODAY.test(token)) return { iso: toDateOnly(now), label: "today" };
  if (YESTERDAY.test(token)) return { iso: toDateOnly(addDays(now, -1)), label: "yesterday" };
  return null;
}

function parseRangePhrase(text: string, now: Date): DatePhraseResult | null {
  const rangeMatch = text.match(RANGE_PHRASE);
  if (!rangeMatch) return null;

  const from = resolveDateToken(rangeMatch[1], now);
  const to = resolveDateToken(rangeMatch[2], now);
  if (!from || !to) return null;

  return { from: from.iso, to: to.iso, label: `${from.label} to ${to.label}` };
}

function parseSinglePhrase(text: string, now: Date): DatePhraseResult | null {
  if (TODAY.test(text)) {
    const today = toDateOnly(now);
    return { from: today, to: today, label: "today" };
  }

  if (YESTERDAY.test(text)) {
    const yesterday = toDateOnly(addDays(now, -1));
    return { from: yesterday, to: yesterday, label: "yesterday" };
  }

  if (LAST_MONTH.test(text)) {
    return { ...monthRange(now, -1), label: "last month" };
  }

  if (THIS_MONTH.test(text)) {
    return { ...monthRange(now, 0), label: "this month" };
  }

  const single = parseSingleDateToken(text);
  if (single) {
    return { from: single.iso, to: single.iso, label: single.label };
  }

  return null;
}

export function parseDatePhrase(text: string, now: Date): DatePhraseResult | null {
  return parseRangePhrase(text, now) ?? parseSinglePhrase(text, now);
}
