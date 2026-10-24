"use client";

import React, { useState } from "react";
import { format, isValid, parse } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

// Walks a raw digit string one character at a time and drops the first digit that would make the day or month segment impo…
// Rationale: docs/CLIENT_COMMENTS.md#block-components-ui-date-picker-input-tsx-L17
export function sanitizeDateDigits(digits: string): string {
  let result = "";
  for (let i = 0; i < digits.length; i++) {
    const digit = digits[i];

    if (i === 0) {
      // Day tens digit: 0-3
      if (Number(digit) > 3) break;
    } else if (i === 1) {
      // Day units digit
      const tens = result[0];
      if (tens === "3" && Number(digit) > 1) break; // day can't exceed 31
      if (tens === "0" && digit === "0") break; // no day 00
    } else if (i === 2) {
      // Month tens digit: 0-1
      if (Number(digit) > 1) break;
    } else if (i === 3) {
      // Month units digit
      const tens = result[2];
      if (tens === "1" && Number(digit) > 2) break; // month can't exceed 12
      if (tens === "0" && digit === "0") break; // no month 00
    }
    result += digit;
  }
  return result;
}

interface DatePickerInputProps {
  value?: string; // Expects YYYY-MM-DD
  onChange?: (value: string) => void;
  className?: string;
  // Extra classes applied to the text input itself, not the wrapper — needed to strip its border/shadow/ring when it's neste…
  // Rationale: docs/CLIENT_COMMENTS.md#block-components-ui-date-picker-input-tsx-L57
  inputClassName?: string;
  placeholder?: string;
  // Accessible name for the text input, for the dense ledger tables where the visible column header is not programmatically…
  // Rationale: docs/CLIENT_COMMENTS.md#block-components-ui-date-picker-input-tsx-L62
  ariaLabel?: string;
  disabled?: boolean;
  // Bounds for the calendar's quick month/year dropdown jump:
  // Rationale: docs/CLIENT_COMMENTS.md#line-components-ui-date-picker-input-tsx-L67
  fromYear?: number;
  toYear?: number;
  // Blocks dates before/after today, e.g. an expense date can't be in the
  // future, a batch expiry can't be in the past.
  disablePast?: boolean;
  disableFuture?: boolean;
}

export function DatePickerInput({
  value,
  onChange,
  className,
  inputClassName,
  placeholder = "DD/MM/YYYY",
  ariaLabel,
  disabled = false,
  fromYear,
  toYear,
  disablePast = false,
  disableFuture = false,
}: DatePickerInputProps) {
  const [date, setDate] = useState<Date | undefined>(
    value ? new Date(value) : undefined,
  );
  const [inputValue, setInputValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [syncedValue, setSyncedValue] = useState<typeof value | null>(null);

  if (syncedValue !== value) {
    setSyncedValue(value);
    if (value) {
      const parsedDate = new Date(value);
      if (isValid(parsedDate)) {
        setDate(parsedDate);
        setInputValue(format(parsedDate, "dd/MM/yyyy"));
      } else {
        setDate(undefined);
        setInputValue("");
      }
    } else {
      setDate(undefined);
      setInputValue("");
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Work from digits only:
    // Rationale: docs/CLIENT_COMMENTS.md#line-components-ui-date-picker-input-tsx-L116
    const rawDigits = e.target.value.replace(/\D/g, "").slice(0, 8);
    // Reject (don't just clamp) any digit that would make the day or month segment impossible to complete validly, e.g.
    // Rationale: docs/CLIENT_COMMENTS.md#line-components-ui-date-picker-input-tsx-L120
    const digits = sanitizeDateDigits(rawDigits);

    let formatted = digits;
    if (digits.length > 4) {
      formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    } else if (digits.length > 2) {
      formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    }

    setInputValue(formatted);

    if (digits.length === 8) {
      const parsedDate = parse(formatted, "dd/MM/yyyy", new Date());
      if (isValid(parsedDate)) {
        setDate(parsedDate);
        onChange?.(format(parsedDate, "yyyy-MM-dd"));
        return;
      }
    }
    // Incomplete or invalid so far: clear the external value but keep
    // their typing on screen.
    onChange?.("");
  };

  const handleSelect = (selectedDate: Date | undefined) => {
    setDate(selectedDate);
    if (selectedDate && isValid(selectedDate)) {
      setInputValue(format(selectedDate, "dd/MM/yyyy"));
      onChange?.(format(selectedDate, "yyyy-MM-dd"));
      setIsOpen(false);
    } else {
      setInputValue("");
      onChange?.("");
    }
  };

  const now = new Date();
  const startMonth = new Date((fromYear ?? now.getFullYear() - 100), 0, 1);
  const endMonth = new Date((toYear ?? now.getFullYear() + 10), 11, 31);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const disabledMatcher = disablePast
    ? { before: today }
    : disableFuture
      ? { after: today }
      : undefined;

  return (
    <div className={cn("relative", className)}>
      <div className="flex w-full items-center">
        <Input
          type="text"
          inputMode="numeric"
          aria-label={ariaLabel}
          placeholder={placeholder}
          value={inputValue}
          onChange={handleInputChange}
          disabled={disabled}
          className={cn("pr-10", inputClassName)}
        />
        <Popover open={isOpen} onOpenChange={setIsOpen} modal={true}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-0 h-full px-3 py-2 text-muted-foreground hover:bg-transparent hover:text-foreground"
              disabled={disabled}
            >
              <CalendarIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={date}
              onSelect={handleSelect}
              captionLayout="dropdown"
              startMonth={startMonth}
              endMonth={endMonth}
              disabled={disabledMatcher}
              defaultMonth={date}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
