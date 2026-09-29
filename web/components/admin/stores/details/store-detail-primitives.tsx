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
          <div className="h-9 w-9 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500">
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
    <Card className="border-none shadow-sm bg-white dark:bg-slate-900">
      <CardContent className="p-5 flex items-center gap-4">
        <div className="h-11 w-11 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
          <p className="text-xl font-black text-slate-900 dark:text-white truncate">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
