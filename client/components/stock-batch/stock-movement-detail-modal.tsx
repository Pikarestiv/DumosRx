import { ResponsiveModal } from "@/components/ui/responsive-modal";
import {
  StockMovement,
  getTypeColor,
  formatMovementDate,
  formatMovementTime,
} from "./stock-movement-utils";

interface Props {
  movement: StockMovement | null;
  onClose: () => void;
  onViewInCatalog: () => void;
}

export function StockMovementDetailModal({
  movement,
  onClose,
  onViewInCatalog,
}: Props) {
  return (
    <ResponsiveModal
      open={!!movement}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Movement detail"
      className="md:max-w-[440px] p-0 gap-0 overflow-hidden"
      headerClassName="px-5 pt-0 sm:pb-4 sm:pt-4 border-b border-border m-0"
    >
      {movement && (
        <div className="px-5 py-[18px]">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-[15px] font-semibold">
                {movement.product}
              </div>
              <div className="text-[12px] text-muted-foreground/70">
                {formatMovementDate(movement.date)},{" "}
                {formatMovementTime(movement.date)}
              </div>
            </div>
            <div className="text-right">
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-md capitalize inline-block ${getTypeColor(movement.type)}`}
              >
                {movement.type}
              </span>
              <div
                className={`text-[18px] font-semibold mt-1 ${movement.quantity > 0 ? "text-emerald-700" : "text-destructive"}`}
              >
                {movement.quantity > 0 && "+"}
                {movement.quantity}
              </div>
            </div>
          </div>
          <div className="border-t border-border pt-3.5 flex flex-col gap-3">
            <div>
              <div className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wide mb-1">
                Reference / reason
              </div>
              <div className="text-[13px] text-foreground">
                {movement.reference || movement.reason || "-"}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wide mb-1">
                Recorded by
              </div>
              <div className="text-[13px] text-foreground">{movement.user}</div>
            </div>
          </div>
          <div
            className="text-[12px] font-semibold text-primary mt-5 cursor-pointer hover:underline"
            onClick={onViewInCatalog}
          >
            View product in Catalog →
          </div>
        </div>
      )}
    </ResponsiveModal>
  );
}
