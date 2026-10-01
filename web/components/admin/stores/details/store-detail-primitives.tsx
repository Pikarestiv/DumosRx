"use client";

import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface DetailCardProps {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}

export function DetailCard({ title, icon, children, className }: DetailCardProps) {
  return (
    <Card className={`border-none shadow-sm bg-white dark:bg-slate-900 ${className ?? ""}`}>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            {icon}
          </div>
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
            {title}
          </h2>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

interface FieldProps {
  label: string;
  value: ReactNode;
  mono?: boolean;
}

export function Field({ label, value, mono }: FieldProps) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
      <p
        className={`text-sm font-bold text-slate-900 dark:text-slate-100 break-words ${
          mono ? "font-mono text-xs" : ""
        }`}
      >
        {value === null || value === undefined || value === "" ? "—" : value}
      </p>
    </div>
  );
}

interface StatTileProps {
  label: string;
  value: ReactNode;
  icon: ReactNode;
}

export function StatTile({ label, value, icon }: StatTileProps) {
  return (
    <Card className="relative overflow-hidden border-none shadow-sm bg-white dark:bg-slate-900">
      <StatTileBackdrop />
      <CardContent className="relative p-4 flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0 [&_svg]:h-4 [&_svg]:w-4">
            {icon}
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 truncate">{label}</p>
        </div>
        <p
          className="text-lg sm:text-xl font-black text-slate-900 dark:text-white leading-tight break-words"
          title={typeof value === "string" || typeof value === "number" ? String(value) : undefined}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

const STAT_TILE_BARS = [35, 60, 45, 85, 65];

function StatTileBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-y-0 right-0 flex w-28 items-end gap-2 pb-2.5 pr-3 [mask-image:linear-gradient(to_left,black,transparent)]"
    >
      {STAT_TILE_BARS.map((height, index) => (
        <div
          key={index}
          className="flex-1 rounded-sm bg-primary/25"
          style={{ height: `${height}%` }}
        />
      ))}
    </div>
  );
}
