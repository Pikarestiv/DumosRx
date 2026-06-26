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

interface DatePickerInputProps {
  value?: string; // Expects YYYY-MM-DD
  onChange?: (value: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function DatePickerInput({
  value,
  onChange,
  className,
  placeholder = "DD/MM/YYYY",
  disabled = false,
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
    let val = e.target.value;

    // Auto-insert slashes
    if (val.length === 2 && inputValue.length === 1 && !val.includes("/")) {
      val += "/";
    } else if (
      val.length === 5 &&
      inputValue.length === 4 &&
      (val.match(/\//g) || []).length === 1
    ) {
      val += "/";
    }

    // Strip non-digits and slashes, limit length to 10
    val = val.replace(/[^\d/]/g, "").slice(0, 10);

    setInputValue(val);

    // If it's a complete date string, try to parse it
    if (val.length === 10) {
      const parsedDate = parse(val, "dd/MM/yyyy", new Date());
      if (isValid(parsedDate)) {
        setDate(parsedDate);
        onChange?.(format(parsedDate, "yyyy-MM-dd"));
      }
    } else {
      // If they deleted part of it, clear the external value but keep their typing
      onChange?.("");
    }
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

  return (
    <div className={cn("relative", className)}>
      <div className="flex w-full items-center">
        <Input
          type="text"
          placeholder={placeholder}
          value={inputValue}
          onChange={handleInputChange}
          disabled={disabled}
          className="pr-10"
        />
        <Popover open={isOpen} onOpenChange={setIsOpen}>
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
            <Calendar mode="single" selected={date} onSelect={handleSelect} />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
