"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { DateRangePicker, type DateRangeValue } from "@/components/ui/date-range-picker";
import { formatCurrency } from "@/lib/utils";
import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
import { genericFuzzySearch } from "@/lib/utils/search";
import { useAuth } from "@/lib/context/auth-context";
import { useStore } from "@/lib/context/store-context";
import {
  getResellerCommissionSales,
  getPendingResellerCommissionTotal,
} from "@/lib/db/queries/sales";
import { useRedeemResellerCommissionMutation } from "@/lib/hooks/use-redeem-reseller-commission-mutation";
import type { SaleWithDetails } from "@/lib/types/sale";

type StatusFilter = "all" | "redeemed" | "pending";

export function ResellerCommissionPanel() {
  const { user } = useAuth();
  const { storeProfile } = useStore();
  const currencyCode = storeProfile?.currency;
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateRange, setDateRange] = useState<DateRangeValue>({});
  const redeemMutation = useRedeemResellerCommissionMutation();

  const { data: pendingTotal } = useQuery({
    queryKey: ["resellerCommission", "pendingTotal"],
    queryFn: () => getPendingResellerCommissionTotal(),
  });

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ["resellerCommission", "list"],
    queryFn: () => getResellerCommissionSales(),
  });

  const filteredSales = useMemo(() => {
    let result = sales;

    if (dateRange.from) {
      result = result.filter(
        (s) => (s.created_at || "") >= `${dateRange.from} 00:00:00`,
      );
    }
    if (dateRange.to) {
      result = result.filter(
        (s) => (s.created_at || "") <= `${dateRange.to} 23:59:59`,
      );
    }

    if (statusFilter !== "all") {
      result = result.filter((s) =>
        statusFilter === "redeemed"
          ? !!s.reseller_commission_redeemed
          : !s.reseller_commission_redeemed,
      );
    }

    if (search.trim()) {
      const searchable = result.map((s) => ({
        id: s.id,
        transaction_number: s.transaction_number,
        customer_name: s.customer_name || "",
        item_names: s.item_names?.replace(/\|\|/g, " ") || "",
      }));
      const { results } = genericFuzzySearch(search, searchable, [
        "transaction_number",
        "customer_name",
        "item_names",
      ]);
      const matchedIds = new Set(results.map((r) => r.id));
      result = result.filter((s) => matchedIds.has(s.id));
    }

    return result;
  }, [sales, search, statusFilter, dateRange]);

  const handleRedeem = async (
    sale: SaleWithDetails,
    claimType: "commission" | "store_claim",
  ) => {
    try {
      await redeemMutation.mutateAsync({
        saleId: sale.id,
        userId: user?.id,
        claimType,
      });
      void queryClient.invalidateQueries({ queryKey: ["resellerCommission"] });
    } catch (error) {
      console.error("Failed to redeem reseller commission:", error);
      toast.error("Failed to redeem commission. Please try again.");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center gap-3">
          <div className="p-2 rounded-full bg-primary/10">
            <Wallet className="h-4 w-4 text-primary" />
          </div>
          <div>
            <CardTitle className="text-sm text-muted-foreground font-normal">
              Pending reseller commissions
            </CardTitle>
            <p className="text-xl font-bold">
              {formatCurrency(pendingTotal || 0, currencyCode)}
            </p>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reseller sales</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="Search receipt, customer, or product..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="sm:max-w-xs"
            />
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as StatusFilter)}
            >
              <SelectTrigger className="sm:w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Not redeemed</SelectItem>
                <SelectItem value="redeemed">Redeemed</SelectItem>
              </SelectContent>
            </Select>
            <DateRangePicker value={dateRange} onChange={setDateRange} />
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Receipt No</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Sale Total</TableHead>
                  <TableHead className="text-right">Markup</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!isLoading && filteredSales.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <EmptyState
                        icon={Wallet}
                        title="No reseller sales found"
                        className="py-8"
                      />
                    </TableCell>
                  </TableRow>
                )}
                {filteredSales.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell>
                      {sale.created_at
                        ? formatDateToDDMMYYYY(sale.created_at)
                        : ""}
                    </TableCell>
                    <TableCell className="font-medium">
                      {sale.transaction_number}
                    </TableCell>
                    <TableCell>{sale.customer_name || "Walk-in"}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(sale.total_amount, currencyCode)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(
                        sale.reseller_markup_amount || 0,
                        currencyCode,
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(
                        sale.reseller_commission_amount || 0,
                        currencyCode,
                      )}
                    </TableCell>
                    <TableCell>
                      {sale.reseller_commission_redeemed ? (
                        <span className="text-emerald-600 text-sm">
                          {sale.reseller_commission_claim_type ===
                          "store_claim"
                            ? "Store kept markup"
                            : "Redeemed"}
                          {sale.reseller_commission_redeemed_at &&
                            ` on ${formatDateToDDMMYYYY(sale.reseller_commission_redeemed_at)}`}
                        </span>
                      ) : (
                        <span className="text-amber-600 text-sm">Pending</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      {!sale.reseller_commission_redeemed && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleRedeem(sale, "commission")}
                            disabled={redeemMutation.isPending}
                          >
                            Redeem
                          </Button>
                          {(sale.reseller_markup_amount || 0) > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                void handleRedeem(sale, "store_claim")
                              }
                              disabled={redeemMutation.isPending}
                            >
                              Store Claims Markup
                            </Button>
                          )}
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
