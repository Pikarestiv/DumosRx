"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface StatCard {
  title: string;
  value: string;
  description: string;
  icon: LucideIcon;
  trend: string;
  colorScheme?: "blue" | "green" | "red" | "amber" | "default";
}

interface DashboardStatsProps {
  statsCards: StatCard[];
  isCompact?: boolean;
}

export function DashboardStats({ statsCards, isCompact }: DashboardStatsProps) {
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
      <div
        className="flex overflow-x-auto sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-4 pb-4 sm:pb-0 hide-scrollbar snap-x snap-mandatory"
      >
        {statsCards.map((stat) => {
          const colors = getColorStyles(stat.colorScheme);
          return (
            <Card
              key={stat.title}
              className={`min-w-[240px] sm:min-w-0 snap-center shrink-0 border-border bg-card shadow-sm hover:shadow-md transition-all ${isCompact ? "pb-0 pt-0" : "pb-4"}`}
            >
              <CardHeader
                className={`flex flex-row items-center justify-between space-y-0 ${isCompact ? "p-4 pb-2" : "pb-2"}`}
              >
                <CardTitle className="text-sm font-semibold text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <div className={`p-2 rounded-lg ${colors.wrapper}`}>
                  <stat.icon className={`h-4 w-4 ${colors.icon}`} />
                </div>
              </CardHeader>
              <CardContent className={isCompact ? "p-4 pt-0" : ""}>
                <div className="text-2xl font-black text-foreground tracking-tight">
                  {stat.value}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${colors.wrapper} ${colors.trend}`}>
                    {stat.trend}
                  </span>
                  <span className="text-[11px] text-muted-foreground font-medium truncate">
                    {stat.description}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
