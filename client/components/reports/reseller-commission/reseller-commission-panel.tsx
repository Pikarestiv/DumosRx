"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
import { useAuth } from "@/lib/context/auth-context";
import { useStore } from "@/lib/context/store-context";
import { getSaleByTransactionNumber, getPendingResellerCommissionTotal } from "@/lib/db/queries/sales";
import { useRedeemResellerCommissionMutation } from "@/lib/hooks/use-redeem-reseller-commission-mutation";
import type { SaleWithDetails } from "@/lib/types/sale";

export function ResellerCommissionPanel() {
  const { user } = useAuth();
  const { storeProfile } = useStore();
  const currencyCode = storeProfile?.currency;
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [lookedUpSale, setLookedUpSale] = useState<SaleWithDetails | null | undefined>(undefined);
  const redeemMutation = useRedeemResellerCommissionMutation();

  const { data: pendingTotal } = useQuery({
    queryKey: ["resellerCommission", "pendingTotal"],
    queryFn: () => getPendingResellerCommissionTotal(),
  });

  const handleLookup = async () => {
    if (!search.trim()) return;
    const sale = await getSaleByTransactionNumber(search.trim());
    setLookedUpSale(sale);
  };

  const handleRedeem = async () => {
    if (!lookedUpSale) return;
    try {
      await redeemMutation.mutateAsync({ saleId: lookedUpSale.id, userId: user?.id });
      const refreshed = await getSaleByTransactionNumber(lookedUpSale.transaction_number);
      setLookedUpSale(refreshed);
      queryClient.invalidateQueries({ queryKey: ["resellerCommission", "pendingTotal"] });
    } catch (error) {
      console.error("Failed to redeem reseller commission:", error);
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
          <CardTitle className="text-base">Redeem commission</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Enter receipt / transaction number"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLookup()}
            />
            <Button onClick={handleLookup}>
              <Search className="h-4 w-4 mr-2" />
              Look up
            </Button>
          </div>

          {lookedUpSale === null && (
            <p className="text-sm text-muted-foreground">No sale found for that receipt number.</p>
          )}

          {lookedUpSale && !lookedUpSale.is_reseller_sale && (
            <p className="text-sm text-muted-foreground">
              That sale (#{lookedUpSale.transaction_number}) isn&apos;t a reseller sale.
            </p>
          )}

          {lookedUpSale && !!lookedUpSale.is_reseller_sale && (
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Sale total</span>
                <span className="font-medium">
                  {formatCurrency(lookedUpSale.total_amount, currencyCode)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Commission</span>
                <span className="font-medium">
                  {formatCurrency(lookedUpSale.reseller_commission_amount || 0, currencyCode)}
                </span>
              </div>
              {lookedUpSale.reseller_commission_redeemed ? (
                <p className="text-sm text-emerald-600 pt-2">
                  Already redeemed
                  {lookedUpSale.reseller_commission_redeemed_at &&
                    ` on ${formatDateToDDMMYYYY(lookedUpSale.reseller_commission_redeemed_at)}`}
                  .
                </p>
              ) : (
                <Button
                  className="w-full mt-2"
                  onClick={handleRedeem}
                  disabled={redeemMutation.isPending}
                >
                  Mark as Redeemed
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
