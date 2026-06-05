"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Users, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { ReferralSummary } from "./types";

interface ReferralsSummaryCardsProps {
  summary: ReferralSummary | null;
}

export function ReferralsSummaryCards({ summary }: ReferralsSummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            Total Referrals
          </CardTitle>
          <Users className="h-4 w-4 text-indigo-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-black text-slate-900 dark:text-slate-100">
            {summary?.total_referrals ?? 0}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Stores registered via links
          </p>
        </CardContent>
      </Card>

      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            Credits Awarded
          </CardTitle>
          <ArrowUpRight className="h-4 w-4 text-emerald-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
            ₦{summary?.total_credits_earned?.toLocaleString() ?? "0"}
          </div>
          <p className="text-xs text-slate-400 mt-1">Total rewards distributed</p>
        </CardContent>
      </Card>

      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            Credits Redeemed
          </CardTitle>
          <ArrowDownRight className="h-4 w-4 text-rose-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-black text-rose-600 dark:text-rose-400">
            ₦{summary?.total_credits_spent?.toLocaleString() ?? "0"}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Credits applied to offset checkouts
          </p>
        </CardContent>
      </Card>

      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            Active Referrers
          </CardTitle>
          <Users className="h-4 w-4 text-indigo-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-black text-slate-900 dark:text-slate-100">
            {summary?.active_referrers ?? 0}
          </div>
          <p className="text-xs text-slate-400 mt-1">Owners who earned credit</p>
        </CardContent>
      </Card>
    </div>
  );
}
