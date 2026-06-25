import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

interface PaymentBreakdownCardProps {
  currencyCode?: string;
  aggregatedTotals: {
    cash: number;
    card: number;
    transfer: number;
    credit: number;
  };
}

export function PaymentBreakdownCard({
  currencyCode,
  aggregatedTotals,
}: PaymentBreakdownCardProps) {
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
          <div className="flex justify-between items-center border-b pb-2">
            <span className="font-medium text-muted-foreground">
              Card / POS
            </span>
            <span className="font-bold">
              {formatCurrency(aggregatedTotals.card, currencyCode)}
            </span>
          </div>
          <div className="flex justify-between items-center border-b pb-2">
            <span className="font-medium text-muted-foreground">
              Transfer / Mobile
            </span>
            <span className="font-bold">
              {formatCurrency(aggregatedTotals.transfer, currencyCode)}
            </span>
          </div>
          <div className="flex justify-between items-center pb-2">
            <span className="font-medium text-muted-foreground">
              Credit Sales
            </span>
            <span className="font-bold">
              {formatCurrency(aggregatedTotals.credit, currencyCode)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
