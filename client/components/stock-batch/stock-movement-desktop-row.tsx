import { StockMovement, getTypeColor, formatMovementTime } from "./stock-movement-utils";

interface Props {
  movement: StockMovement;
  onSelect: () => void;
}

export function StockMovementDesktopRow({ movement, onSelect }: Props) {
  const isPositive = movement.quantity > 0;
  return (
    <div
      onClick={onSelect}
      className="grid grid-cols-[100px_1fr_130px_100px_1fr_120px] gap-2 px-4 py-3 items-center border-b border-border cursor-pointer hover:bg-accent/50 transition-colors"
    >
      <div className="text-[12px] text-muted-foreground">
        {formatMovementTime(movement.date)}
      </div>
      <div className="text-[13px] font-semibold truncate">{movement.product}</div>
      <div>
        <span
          className={`text-[11px] font-semibold px-2 py-0.5 rounded-md capitalize ${getTypeColor(movement.type)}`}
        >
          {movement.type}
        </span>
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
