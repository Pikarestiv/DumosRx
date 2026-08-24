"use client";

import React, { useState, useEffect } from "react";
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

/**
 * Walks a raw digit string one character at a time and drops the first
 * digit that would make the day or month segment impossible to complete
 * validly (day > 31, month > 12, or a "00" segment), rather than accepting
 * every digit and only checking validity once all 8 are in. This is what
 * makes typing a month/year-only date (e.g. "11/2027", read as day 11 +
 * "month" 20) get stopped immediately instead of silently discarding the
 * whole entry.
 */
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
  placeholder?: string;
  disabled?: boolean;
  // Bounds for the calendar's quick month/year dropdown jump: pick years
  // that make sense for what's being entered (e.g. a birthdate needs the
  // past; a batch expiry needs the future). Defaults span 100 years back to
  // 10 years ahead, wide enough to never block a legitimate date.
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
  placeholder = "DD/MM/YYYY",
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

  // Sync internal state with external value
  useEffect(() => {
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
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Work from digits only: a slash can only ever come from the mask
    // itself, never from what the user types, so there's no way to end up
    // with a stray or doubled "/" no matter where they type or paste.
    const rawDigits = e.target.value.replace(/\D/g, "").slice(0, 8);
    // Reject (don't just clamp) any digit that would make the day or month
    // segment impossible to complete validly, e.g. typing "9" as the first
    // day digit, or "2" as the first month digit, is dropped rather than
    // producing a nonsense date like day 39 or month 20. Anyone trying to
    // type a month/year-only date (e.g. "11/2027") hits this on the very
    // first digit of the "month" segment, instead of silently discarding
    // their whole entry only once they reach 8 digits.
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
          placeholder={placeholder}
          value={inputValue}
          onChange={handleInputChange}
          disabled={disabled}
          className="pr-10"
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
