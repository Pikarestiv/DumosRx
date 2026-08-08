"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
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
        "rounded-[14px] shadow-[0_1px_2px_rgba(28,25,23,0.04),0_1px_3px_rgba(28,25,23,0.03)] !p-0 !gap-0", 
        onClick && "cursor-pointer transition-colors hover:border-primary/50", 
        className
      )}
      onClick={onClick}
    >
      <CardContent className="!p-2.5 sm:!p-3.5 !px-3.5 sm:!px-4.5 hover-scale flex flex-col h-full">
        <div className="flex items-center justify-between mb-1.5 sm:mb-2.5">
          <div className="text-[12.5px] text-muted-foreground font-medium">
            {title}
          </div>
          {icon && (
            <div className={cn("hidden sm:flex w-8 h-8 rounded-lg items-center justify-center shrink-0", iconBgClass)}>
              {icon}
            </div>
          )}
        </div>
        <div className={cn("text-2xl font-semibold tracking-tight mb-0.5", valueClassName)}>
          {value}
        </div>
        {description && (
          <div className={cn("text-[11px] font-medium mt-auto", descriptionClassName)}>
            {description}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
