import type { ReactNode } from "react";

interface Props {
  label: string;
  value: ReactNode;
  valueClassName?: string;
}

/** Shared label/value row for the stacked detail sections in dashboard detail dialogs. */
export function DetailRow({ label, value, valueClassName = "" }: Props) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wide mb-1">
        {label}
      </div>
      <div className={`text-[13px] text-foreground ${valueClassName}`}>{value}</div>
    </div>
  );
}
