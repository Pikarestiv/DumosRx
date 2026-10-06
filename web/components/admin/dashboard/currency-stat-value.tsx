import { formatMoney } from "@/lib/utils/currency";

interface CurrencyStatValueProps {
  totals: Record<string, number>;
  emptyLabel?: string;
}

export function CurrencyStatValue({
  totals,
  emptyLabel = "No payments yet",
}: CurrencyStatValueProps) {
  const entries = Object.entries(totals ?? {});

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-0.5">
      {entries.map(([currency, amount]) => (
        <p key={currency} className="text-2xl font-black text-foreground">
          {formatMoney(amount, currency)}
        </p>
      ))}
    </div>
  );
}
