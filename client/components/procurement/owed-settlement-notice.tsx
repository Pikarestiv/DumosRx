"use client";

import { PackageCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useOutstandingBackorders } from "@/lib/hooks/use-outstanding-backorders";
import { useStockVisibility } from "@/lib/hooks/use-stock-visibility";
import { useDisplayName } from "@/lib/hooks/use-uppercase-display";
import { describeOwedSettlement } from "@/lib/utils/stock-status";

export interface ReceivingLine {
  productId: string;
  baseUnits: number;
}

export function OwedSettlementNotice({ lines }: { lines: ReceivingLine[] }) {
  const receivingByProduct = new Map<string, number>();
  for (const line of lines) {
    receivingByProduct.set(line.productId, (receivingByProduct.get(line.productId) ?? 0) + line.baseUnits);
  }
  const productIds = [...receivingByProduct.keys()].sort();
  const owed = useOutstandingBackorders(productIds);
  const { canSeeQuantities } = useStockVisibility();
  const displayName = useDisplayName();

  const affected = owed.filter((o) => (receivingByProduct.get(o.productId) ?? 0) > 0);
  if (affected.length === 0) return null;

  return (
    <Alert data-testid="owed-settlement-notice">
      <PackageCheck className="w-4 h-4" />
      <AlertTitle>Some of this delivery was already sold</AlertTitle>
      <AlertDescription>
        <ul className="space-y-1">
          {affected.map((o) => (
            <li key={o.productId}>
              <span className="font-medium text-foreground">{displayName(o.productName)}:</span>{" "}
              {describeOwedSettlement(o.outstanding, receivingByProduct.get(o.productId) ?? 0, canSeeQuantities)}
            </li>
          ))}
        </ul>
        <p className="mt-2">
          Those sales are re-costed at this delivery&apos;s cost, so profit already reported for the days they were
          sold will change.
        </p>
      </AlertDescription>
    </Alert>
  );
}
