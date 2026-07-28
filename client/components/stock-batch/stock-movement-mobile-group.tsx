import {
  StockMovement,
  getTypeIcon,
  getTypeIconBg,
} from "./stock-movement-utils";

interface Props {
  groupLabel: string;
  movements: StockMovement[];
  onSelect: (movement: StockMovement) => void;
}

export function StockMovementMobileGroup({
  groupLabel,
  movements,
  onSelect,
}: Props) {
  return (
    <div className="mb-6">
      <div className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wide mb-2">
        {groupLabel}
      </div>
      <div className="flex flex-col gap-2">
        {movements.map((movement) => {
          const isPositive = movement.quantity > 0;
          const Icon = getTypeIcon(movement.type);
          const iconBg = getTypeIconBg(movement.type);

          let displayReason = movement.reason || movement.reference || "-";
          if (movement.type.toLowerCase() === "sale")
            displayReason = `Sale ${movement.reference}`;
          else if (
            movement.type.toLowerCase() === "purchase" ||
            movement.type.toLowerCase() === "restock"
          )
            displayReason = `PO-${movement.reference}`;

          const signColor =
            movement.type.toLowerCase() === "sale"
              ? "text-foreground"
              : isPositive
                ? "text-emerald-600"
                : "text-destructive";

          return (
            <div
              key={movement.id}
              onClick={() => onSelect(movement)}
              className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card shadow-sm cursor-pointer hover:bg-accent/50 transition-colors"
            >
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}
              >
                {Icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-semibold text-foreground truncate">
                  {movement.product}
                </div>
                <div className="text-[12px] text-muted-foreground truncate mt-0.5">
                  {displayReason} · {movement.user.split(" ")[0]}
                </div>
              </div>
              <div className={`text-[15px] font-bold shrink-0 ${signColor}`}>
                {isPositive ? "+" : ""}
                {movement.quantity}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
