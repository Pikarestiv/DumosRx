"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TrendingUp, Landmark, CreditCard, ShieldAlert } from "lucide-react";
import { useAdminRevenue } from "@/lib/api/admin-hooks";
import { useDebounce } from "@/hooks/use-debounce";
import { StorePagination } from "@/components/admin/stores/store-pagination";
import { AdminSkeleton } from "@/components/admin/admin-skeleton";

function formatNaira(amount: number) {
  return `₦${amount.toLocaleString()}`;
}

export function RevenueOverview() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [provider, setProvider] = useState("all");
  const [plan, setPlan] = useState("all");

  const debouncedSearch = useDebounce(search, 500);

  const { data, isLoading, error } = useAdminRevenue({
    page,
    search: debouncedSearch,
    provider: provider === "all" ? "" : provider,
    plan: plan === "all" ? "" : plan,
  });

  const transactions = data?.transactions.data ?? [];
  const meta = data?.transactions.meta;
  const byPlanTier = data?.by_plan_tier ?? {};

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-slate-500 dark:text-slate-400">
              Total Subscription Revenue
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100">
              {formatNaira(data?.total_revenue ?? 0)}
            </div>
            <p className="text-xs text-slate-400 mt-1">All successful payments</p>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-slate-500 dark:text-slate-400">
              Automated Checkout
            </CardTitle>
            <CreditCard className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
              {formatNaira(data?.automated_revenue ?? 0)}
            </div>
            <p className="text-xs text-slate-400 mt-1">Paystack/Flutterwave, etc.</p>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-slate-500 dark:text-slate-400">
              Manual (Bank Transfer)
            </CardTitle>
            <Landmark className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
              {formatNaira(data?.manual_revenue ?? 0)}
            </div>
            <p className="text-xs text-slate-400 mt-1">Admin-activated plans</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            Revenue by Plan Tier
          </CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(byPlanTier).length === 0 ? (
            <p className="text-sm text-slate-400">No revenue recorded yet.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {Object.entries(byPlanTier).map(([tier, amount]) => (
                <div
                  key={tier}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-2"
                >
                  <span className="font-bold text-slate-900 dark:text-slate-100">{tier}</span>
                  <span className="text-slate-500 dark:text-slate-400">{formatNaira(amount)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800">
          <CardTitle className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            Transactions
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="flex flex-col sm:flex-row gap-3 p-6 border-b border-slate-100 dark:border-slate-800">
            <Input
              placeholder="Search by customer, email, or reference..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="sm:max-w-sm"
            />
            <Select value={provider} onValueChange={(v) => { setProvider(v); setPage(1); }}>
              <SelectTrigger className="sm:w-48">
                <SelectValue placeholder="Provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Providers</SelectItem>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                <SelectItem value="paystack">Paystack</SelectItem>
                <SelectItem value="flutterwave">Flutterwave</SelectItem>
              </SelectContent>
            </Select>
            <Select value={plan} onValueChange={(v) => { setPlan(v); setPage(1); }}>
              <SelectTrigger className="sm:w-48">
                <SelectValue placeholder="Plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Plans</SelectItem>
                <SelectItem value="starter">Starter</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <AdminSkeleton />
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <ShieldAlert className="h-10 w-10 text-rose-500" />
              <p className="text-rose-500 font-bold">
                {error instanceof Error ? error.message : "Failed to load revenue"}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                      <TableHead className="font-bold text-[10px] uppercase text-slate-400 pl-6">Date</TableHead>
                      <TableHead className="font-bold text-[10px] uppercase text-slate-400">Customer</TableHead>
                      <TableHead className="font-bold text-[10px] uppercase text-slate-400">Plan</TableHead>
                      <TableHead className="font-bold text-[10px] uppercase text-slate-400">Provider</TableHead>
                      <TableHead className="font-bold text-[10px] uppercase text-slate-400">Reference</TableHead>
                      <TableHead className="font-bold text-[10px] uppercase text-slate-400 text-right pr-6">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12 text-slate-400">
                          No transactions found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      transactions.map((txn) => (
                        <TableRow key={txn.id} className="border-slate-100 dark:border-slate-800">
                          <TableCell className="pl-6 text-sm text-slate-500">{txn.date}</TableCell>
                          <TableCell>
                            <div className="text-sm font-bold text-slate-900 dark:text-slate-100">{txn.customer ?? "—"}</div>
                            <div className="text-xs text-slate-400">{txn.email ?? ""}</div>
                          </TableCell>
                          <TableCell className="text-sm">{txn.plan}</TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={txn.is_manual ? "border-amber-300 text-amber-600" : "border-indigo-300 text-indigo-600"}
                            >
                              {txn.is_manual ? "Manual" : txn.provider}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-slate-500">{txn.reference}</TableCell>
                          <TableCell className="text-right pr-6 font-bold text-slate-900 dark:text-slate-100">
                            {formatNaira(txn.amount)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {meta && (
                <StorePagination
                  meta={meta}
                  onPageChange={setPage}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
