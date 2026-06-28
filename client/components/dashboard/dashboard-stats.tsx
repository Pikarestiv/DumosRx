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
          trend: "text-blue-600 dark:text-blue-400"
        };
      case "green":
        return {
          wrapper: "border-emerald-500/20 bg-emerald-500/5",
          icon: "text-emerald-500",
          trend: "text-emerald-600 dark:text-emerald-400"
        };
      case "red":
        return {
          wrapper: "border-destructive/20 bg-destructive/5",
          icon: "text-destructive",
          trend: "text-destructive"
        };
      case "amber":
        return {
          wrapper: "border-amber-500/20 bg-amber-500/5",
          icon: "text-amber-500",
          trend: "text-amber-600 dark:text-amber-400"
        };
      default:
        return {
          wrapper: "border-border",
          icon: "text-primary",
          trend: "text-primary"
        };
    }
  };

  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 ${isCompact ? 'mb-2' : ''}`}>
      {statsCards.map((stat) => {
        const colors = getColorStyles(stat.colorScheme);
        return (
          <Card key={stat.title} className={`${colors.wrapper} transition-colors`}>
            <CardHeader className={`flex flex-row items-center justify-between space-y-0 ${isCompact ? 'p-3 pb-1' : 'pb-2'}`}>
              <CardTitle className="text-xs font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-4 w-4 ${colors.icon}`} />
            </CardHeader>
            <CardContent className={isCompact ? 'p-3 pt-0 pb-3' : ''}>
              <div className="text-xl font-bold text-foreground">
                {stat.value}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {stat.description}
              </p>
              <p className={`text-[10px] font-bold mt-1 uppercase tracking-wider ${colors.trend}`}>
                {stat.trend}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
