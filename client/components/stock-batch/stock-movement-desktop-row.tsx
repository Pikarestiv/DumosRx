import { StockMovement, getTypeColor, getTypeLabel, formatMovementTime } from "./stock-movement-utils";
import { useUppercaseDisplayClass } from "@/lib/hooks/use-uppercase-display";

interface Props {
  movement: StockMovement;
  onSelect: () => void;
}

export function StockMovementDesktopRow({ movement, onSelect }: Props) {
  const isPositive = movement.quantity > 0;
  const capsClass = useUppercaseDisplayClass();
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className="grid grid-cols-[100px_1fr_130px_100px_1fr_120px] gap-2 px-4 py-3 items-center border-b border-border cursor-pointer hover:bg-accent/50 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <div className="text-[12px] text-muted-foreground">
        {formatMovementTime(movement.date)}
      </div>
      <div className={`text-[13px] font-semibold truncate ${capsClass}`}>{movement.product}</div>
      <div className="flex items-center gap-1.5">
        <span
          className={`text-[11px] font-semibold px-2 py-0.5 rounded-md capitalize ${getTypeColor(movement.type)}`}
        >
          {getTypeLabel(movement.type)}
        </span>
        {movement.needsReview && (
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700"
            title="Requested by a cashier - not yet reviewed"
          >
            Needs Review
          </span>
        )}
      </div>
      <div
        className={`text-[14px] font-semibold ${isPositive ? "text-emerald-700" : "text-destructive"}`}
      >
        {isPositive ? "+" : ""}
        {movement.quantity}
      </div>
      <div className="text-[12px] text-muted-foreground truncate">
        {movement.reference || movement.reason || "-"}
      </div>
      <div className="text-[12px] text-foreground truncate">{movement.user}</div>
    </div>
  );
}
