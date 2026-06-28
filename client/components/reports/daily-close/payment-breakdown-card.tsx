import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

interface PaymentBreakdownCardProps {
  currencyCode?: string;
  aggregatedTotals: {
    cash: number;
    card: number;
    transfer: number;
    credit: number;
    cardAccounts?: Record<string, {name: string; total: number}>;
    transferAccounts?: Record<string, {name: string; total: number}>;
  };
}

export function PaymentBreakdownCard({
  currencyCode,
  aggregatedTotals,
}: PaymentBreakdownCardProps) {
  const cardAccounts = Object.values(aggregatedTotals.cardAccounts || {});
  const transferAccounts = Object.values(aggregatedTotals.transferAccounts || {});

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif">Payment Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex justify-between items-center border-b pb-2">
            <span className="font-medium text-muted-foreground">Cash</span>
            <span className="font-bold">
              {formatCurrency(aggregatedTotals.cash, currencyCode)}
            </span>
          </div>

          <div className="border-b pb-2">
            <div className="flex justify-between items-center mb-1">
              <span className="font-medium text-muted-foreground">Card / POS</span>
              <span className="font-bold">
                {formatCurrency(aggregatedTotals.card, currencyCode)}
              </span>
            </div>
            {cardAccounts.length > 0 && (
              <div className="pl-4 space-y-1">
                {cardAccounts.map((acc, i) => (
                  <div key={i} className="flex justify-between items-center text-xs text-muted-foreground">
                    <span>↳ {acc.name}</span>
                    <span>{formatCurrency(acc.total, currencyCode)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-b pb-2">
            <div className="flex justify-between items-center mb-1">
              <span className="font-medium text-muted-foreground">Transfer / Mobile</span>
              <span className="font-bold">
                {formatCurrency(aggregatedTotals.transfer, currencyCode)}
              </span>
            </div>
            {transferAccounts.length > 0 && (
              <div className="pl-4 space-y-1">
                {transferAccounts.map((acc, i) => (
                  <div key={i} className="flex justify-between items-center text-xs text-muted-foreground">
                    <span>↳ {acc.name}</span>
                    <span>{formatCurrency(acc.total, currencyCode)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-between items-center pb-2">
            <span className="font-medium text-muted-foreground">Credit Sales</span>
            <span className="font-bold">
              {formatCurrency(aggregatedTotals.credit, currencyCode)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
