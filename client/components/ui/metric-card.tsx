"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import React from "react";

export interface MetricCardProps {
  title: React.ReactNode;
  value: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  /** Background and text color classes for the icon container, e.g. "bg-blue-50 text-blue-700" */
  iconBgClass?: string;
  /** Extra classes for the value text (e.g. "text-amber-700 font-serif") */
  valueClassName?: string;
  /** Extra classes for the description text (e.g. "text-amber-700/70") */
  descriptionClassName?: string;
  /** Extra classes for the outer Card wrapper */
  className?: string;
  onClick?: () => void;
}

const METRIC_CARD_BARS = [35, 60, 45, 85, 65];

/**
 * Tailwind only generates classes it can find as literal substrings in
 * source, so a concatenated class like `bg-${color}-500/30` silently
 * renders nothing — every branch here must spell the full class out.
 */
function resolveBarClass(iconBgClass: string): string {
  if (iconBgClass.includes("destructive")) return "bg-destructive/30";
  if (iconBgClass.includes("blue")) return "bg-blue-500/30";
  if (iconBgClass.includes("violet")) return "bg-violet-500/30";
  if (iconBgClass.includes("emerald")) return "bg-emerald-500/30";
  if (iconBgClass.includes("sky")) return "bg-sky-500/30";
  if (iconBgClass.includes("amber")) return "bg-amber-500/30";
  if (iconBgClass.includes("red")) return "bg-red-500/30";
  if (iconBgClass.includes("chart-1")) return "bg-chart-1/30";
  if (iconBgClass.includes("primary")) return "bg-primary/30";
  return "bg-muted-foreground/25";
}

export function MetricCard({
  title,
  value,
  description,
  icon,
  iconBgClass = "bg-muted text-muted-foreground",
  valueClassName,
  descriptionClassName = "text-muted-foreground",
  className,
  onClick,
}: MetricCardProps) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden rounded-[14px] shadow-[0_1px_2px_rgba(28,25,23,0.04),0_1px_3px_rgba(28,25,23,0.03)] !p-0 !gap-0 m-0.5",
        onClick &&
          "group cursor-pointer transition-colors hover:border-primary/50",
        className,
      )}
      onClick={onClick}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 flex w-28 items-end gap-2 pb-2.5 pr-3 [mask-image:linear-gradient(to_left,black,transparent)]"
      >
        {METRIC_CARD_BARS.map((height, index) => (
          <div
            key={index}
            className={cn("flex-1 rounded-sm", resolveBarClass(iconBgClass))}
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
      <CardContent className="relative !p-2.5 sm:!p-3.5 !px-3.5 sm:!px-4.5 hover-scale flex flex-col h-full">
        <div className="flex items-center gap-2 mb-1.5 sm:mb-2.5">
          {icon && (
            <div
              className={cn(
                "hidden sm:flex w-8 h-8 rounded-lg items-center justify-center shrink-0",
                iconBgClass,
              )}
            >
              {icon}
            </div>
          )}
          <div className="text-[12.5px] text-muted-foreground font-medium flex items-center gap-1">
            {title}
            {onClick && (
              <ChevronRight className="h-3 w-3 text-muted-foreground/50 opacity-0 -translate-x-0.5 transition-all group-hover:opacity-100 group-hover:translate-x-0" />
            )}
          </div>
        </div>
        <div
          className={cn(
            "text-2xl font-semibold tracking-tight mb-0.5",
            valueClassName,
          )}
        >
          {value}
        </div>
        {description && (
          <div
            className={cn(
              "text-[11px] font-medium mt-auto",
              descriptionClassName,
            )}
          >
            {description}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
