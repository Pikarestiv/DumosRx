import Link from "next/link";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { formatCurrency } from "@/lib/utils";
import type { FigureBreakdown } from "@/lib/utils/daily-close-breakdown";

interface FigureBreakdownModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  breakdown: FigureBreakdown;
  totalLabel: string;
  footnote?: string;
  currencyCode?: string;
}

function SignedAmount({ amount, currencyCode }: { amount: number; currencyCode?: string }) {
  const sign = amount < 0 ? "−" : "";
  return (
    <span className="tabular-nums whitespace-nowrap">
      {sign}
      {formatCurrency(Math.abs(amount), currencyCode)}
    </span>
  );
}

export function FigureBreakdownModal({
  open,
  onOpenChange,
  title,
  description,
  breakdown,
  totalLabel,
  footnote,
  currencyCode,
}: FigureBreakdownModalProps) {
  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={<span className="font-serif">{title}</span>}
      description={description}
      className="sm:max-w-md"
    >
      <div className="flex flex-col gap-4 pb-2">
        <dl className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm divide-y divide-slate-200 dark:divide-slate-800">
          {breakdown.lines.map((line) => (
            <div key={line.label} className="flex items-start justify-between gap-4 px-4 py-3 text-[13px]">
              <dt className="text-muted-foreground">
                {line.label}
                {line.href && (
                  <Link
                    href={line.href}
                    className="block text-[11.5px] text-primary underline-offset-2 hover:underline"
                  >
                    View in Expenses
                  </Link>
                )}
              </dt>
              <dd className="font-medium text-foreground">
                <SignedAmount amount={line.amount} currencyCode={currencyCode} />
              </dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-4 px-4 py-3 text-[14px] font-semibold">
            <dt>{totalLabel}</dt>
            <dd className="font-serif">
              <SignedAmount amount={breakdown.total} currencyCode={currencyCode} />
            </dd>
          </div>
        </dl>
        {footnote && <p className="text-[11.5px] text-muted-foreground">{footnote}</p>}
      </div>
    </ResponsiveModal>
  );
}
