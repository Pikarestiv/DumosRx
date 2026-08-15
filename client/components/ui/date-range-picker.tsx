"use client";

import { useEffect, useState } from "react";
import {
  format,
  isValid,
  parse,
  startOfToday,
  subDays,
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfYear,
  subYears,
  endOfYear,
} from "date-fns";
import { Calendar as CalendarIcon, X } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { sanitizeDateDigits } from "@/components/ui/date-picker-input";

export interface DateRangeValue {
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
}

interface DateRangePickerProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  className?: string;
}

function toIso(date: Date | undefined) {
  return date ? format(date, "yyyy-MM-dd") : undefined;
}

function preset(from: Date, to: Date): DateRangeValue {
  return { from: toIso(from), to: toIso(to) };
}

const PRESETS: { label: string; getRange: () => DateRangeValue }[] = [
  { label: "Today", getRange: () => preset(startOfToday(), startOfToday()) },
  {
    label: "Yesterday",
    getRange: () => preset(subDays(startOfToday(), 1), subDays(startOfToday(), 1)),
  },
  { label: "Last 7 days", getRange: () => preset(subDays(startOfToday(), 6), startOfToday()) },
  { label: "Last 30 days", getRange: () => preset(subDays(startOfToday(), 29), startOfToday()) },
  { label: "This month", getRange: () => preset(startOfMonth(startOfToday()), startOfToday()) },
  {
    label: "Last month",
    getRange: () => preset(startOfMonth(subMonths(startOfToday(), 1)), endOfMonth(subMonths(startOfToday(), 1))),
  },
  { label: "Year to date", getRange: () => preset(startOfYear(startOfToday()), startOfToday()) },
  {
    label: "Last year",
    getRange: () => preset(startOfYear(subYears(startOfToday(), 1)), endOfYear(subYears(startOfToday(), 1))),
  },
];

/** Dual-month range calendar + preset sidebar + editable start/end text
 * inputs in one popover — modeled on Moniebook's date-range picker
 * (refs/refs-jpg/MB-Date-Picker.jpg), which the pilot user specifically
 * called out as better than this app's single preset dropdown. Uses
 * DD/MM/YYYY (not Moniebook's MM/DD/YYYY) to stay consistent with every
 * other date input already in this app. */
export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>(() =>
    value.from
      ? { from: new Date(value.from), to: value.to ? new Date(value.to) : undefined }
      : undefined,
  );
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");

  useEffect(() => {
    if (value.from) {
      const from = new Date(value.from);
      const to = value.to ? new Date(value.to) : undefined;
      setRange({ from, to });
      setFromInput(isValid(from) ? format(from, "dd/MM/yyyy") : "");
      setToInput(to && isValid(to) ? format(to, "dd/MM/yyyy") : "");
    } else {
      setRange(undefined);
      setFromInput("");
      setToInput("");
    }
  }, [value.from, value.to]);

  const applyRange = (next: DateRange | undefined) => {
    setRange(next);
    setFromInput(next?.from ? format(next.from, "dd/MM/yyyy") : "");
    setToInput(next?.to ? format(next.to, "dd/MM/yyyy") : "");
    onChange({ from: toIso(next?.from), to: toIso(next?.to) });
  };

  const handlePreset = (getRange: () => DateRangeValue) => {
    const r = getRange();
    const from = r.from ? new Date(r.from) : undefined;
    const to = r.to ? new Date(r.to) : undefined;
    applyRange(from ? { from, to } : undefined);
    setIsOpen(false);
  };

  const handleTextInput = (which: "from" | "to", raw: string) => {
    const digits = sanitizeDateDigits(raw.replace(/\D/g, "").slice(0, 8));
    let formatted = digits;
    if (digits.length > 4) {
      formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    } else if (digits.length > 2) {
      formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    }

    if (which === "from") setFromInput(formatted);
    else setToInput(formatted);

    if (digits.length !== 8) return;
    const parsed = parse(formatted, "dd/MM/yyyy", new Date());
    if (!isValid(parsed)) return;

    const nextRange: DateRange = {
      from: which === "from" ? parsed : range?.from,
      to: which === "to" ? parsed : range?.to,
    };
    setRange(nextRange);
    onChange({ from: toIso(nextRange.from), to: toIso(nextRange.to) });
  };

  const label =
    range?.from && range?.to
      ? `${format(range.from, "d MMM yyyy")} – ${format(range.to, "d MMM yyyy")}`
      : range?.from
        ? format(range.from, "d MMM yyyy")
        : "Select date range";

  // Desktop check, not mobile check — matches ResponsiveModal's convention
  // (defaults to the mobile/Drawer branch during SSR and before the media
  // query resolves, which is the safer default on a touch-first app).
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const trigger = (
    <Button
      variant="outline"
      onClick={!isDesktop ? () => setIsOpen(true) : undefined}
      className={cn("h-9 justify-start gap-2 text-[13px] font-normal", className)}
    >
      <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0 group-hover:text-accent-foreground" />
      <span className="truncate">{label}</span>
    </Button>
  );

  const dateInputs = (
    <div className="flex items-center gap-2">
      <Input
        value={fromInput}
        onChange={(e) => handleTextInput("from", e.target.value)}
        placeholder="DD/MM/YYYY"
        className="w-[120px] h-8 text-[12.5px]"
        inputMode="numeric"
      />
      <span className="text-muted-foreground">→</span>
      <Input
        value={toInput}
        onChange={(e) => handleTextInput("to", e.target.value)}
        placeholder="DD/MM/YYYY"
        className="w-[120px] h-8 text-[12.5px]"
        inputMode="numeric"
      />
    </div>
  );

  if (isDesktop) {
    return (
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="flex">
            <div className="flex flex-col gap-1 p-2 border-r border-border w-[150px] shrink-0">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => handlePreset(p.getRange)}
                  className="text-left px-2.5 py-1.5 rounded-md text-[12.5px] whitespace-nowrap text-foreground hover:bg-accent transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="p-3 flex flex-col gap-2.5">
              {dateInputs}
              <Calendar
                mode="range"
                numberOfMonths={2}
                selected={range}
                onSelect={applyRange}
                defaultMonth={range?.from}
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  // Mobile: a dual-month calendar + sidebar of presets doesn't fit a phone
  // viewport (it was opening off-screen, unreachable — see the bug this
  // replaced). A bottom Drawer with a single month and presets as a
  // horizontal chip row, matching ResponsiveModal's established
  // Popover-on-desktop/Drawer-on-mobile split, fixes that.
  return (
    <>
      {trigger}
      <Drawer open={isOpen} onOpenChange={setIsOpen}>
        <DrawerContent className="max-h-[85vh] flex flex-col px-4">
          <DrawerHeader className="text-left mb-2 px-0 flex flex-row items-start justify-between">
            <DrawerTitle>Select Date Range</DrawerTitle>
            <DrawerClose className="p-1">
              <X className="h-5 w-5 opacity-70" />
              <span className="sr-only">Close</span>
            </DrawerClose>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto flex flex-col gap-3 pb-4">
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => handlePreset(p.getRange)}
                  className="shrink-0 px-3 py-1.5 rounded-full text-[12.5px] whitespace-nowrap text-foreground bg-muted hover:bg-accent transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
            {dateInputs}
            <Calendar
              mode="range"
              numberOfMonths={1}
              selected={range}
              onSelect={applyRange}
              defaultMonth={range?.from}
              className="mx-auto"
            />
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
