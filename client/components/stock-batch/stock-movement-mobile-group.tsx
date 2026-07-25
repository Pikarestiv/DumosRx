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
      <div className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wide md:px-4 mb-2">
        {groupLabel}
      </div>
      <div className="bg-card border border-border rounded-[14px] md:mx-4 shadow-sm overflow-hidden">
        {movements.map((movement, i) => {
          const isPositive = movement.quantity > 0;
          const Icon = getTypeIcon(movement.type);
          const iconBg = getTypeIconBg(movement.type);
          const isLast = i === movements.length - 1;

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
              className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-accent/50 transition-colors ${!isLast ? "border-b border-border/40" : ""}`}
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
