"use client";

import { MetricCard } from "@/components/ui/metric-card";
import { LucideIcon } from "lucide-react";

interface StatCard {
  title: string;
  value: string;
  comparison?: string;
  icon: LucideIcon;
  colorScheme?: "blue" | "green" | "red" | "amber" | "default";
}

interface DashboardStatsProps {
  statsCards: StatCard[];
}

export function DashboardStats({ statsCards }: DashboardStatsProps) {
  const getColorStyles = (color?: string) => {
    switch (color) {
      case "blue":
        return {
          wrapper: "border-blue-500/20 bg-blue-500/5",
          icon: "text-blue-500",
          trend: "text-blue-600 dark:text-blue-400",
        };
      case "green":
        return {
          wrapper: "border-emerald-500/20 bg-emerald-500/5",
          icon: "text-emerald-500",
          trend: "text-emerald-600 dark:text-emerald-400",
        };
      case "red":
        return {
          wrapper: "border-destructive/20 bg-destructive/5",
          icon: "text-destructive",
          trend: "text-destructive",
        };
      case "amber":
        return {
          wrapper: "border-amber-500/20 bg-amber-500/5",
          icon: "text-amber-500",
          trend: "text-amber-600 dark:text-amber-400",
        };
      default:
        return {
          wrapper: "border-border",
          icon: "text-primary",
          trend: "text-primary",
        };
    }
  };

  return (
    <div className="-mx-4 sm:mx-0 px-4 sm:px-0">
      <div className="flex overflow-x-auto sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-[10px] sm:gap-4 pb-4 sm:pb-0 hide-scrollbar snap-x snap-mandatory">
        {statsCards.map((stat) => {
          const colors = getColorStyles(stat.colorScheme);
          return (
            <MetricCard
              key={stat.title}
              className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border"
              title={stat.title}
              value={stat.value}
              valueClassName="font-black"
              icon={<stat.icon className={`h-4 w-4 ${colors.icon}`} />}
              iconBgClass={colors.wrapper}
              description={stat.comparison}
            />
          );
        })}
      </div>
    </div>
  );
}
