import { CheckCircle2, PackageOpen } from "lucide-react";
import type { PurchaseOrder } from "@/lib/db/procurement";

export function PoStatusTimeline({ po }: { po: PurchaseOrder }) {
  const isPartiallyReceived = po.status === "partially_received";
  const isSentOrLater =
    po.status === "sent" || po.status === "received" || isPartiallyReceived;

  return (
    <>
      <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mt-8 mb-4">
        Order Status
      </h4>
      <div className="flex flex-col gap-4 relative">
        <div className="absolute left-[9px] top-[14px] bottom-[14px] w-[2px] bg-border z-0"></div>

        <div className="flex items-center gap-3 z-10">
          <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center border-2 border-background">
            <CheckCircle2 className="w-3 h-3" />
          </div>
          <span className="text-[13.5px] font-semibold text-foreground">
            Draft
          </span>
        </div>

        {/* Sent step is skipped for Immediate Purchases, which have no vendor to send anything to. */}
        {po.type !== "immediate" && (
          <div className="flex items-center gap-3 z-10">
            <div
              className={`w-5 h-5 rounded-full flex items-center justify-center border-2 border-background ${isSentOrLater ? "bg-primary text-primary-foreground" : "bg-muted border border-border"}`}
            >
              {isSentOrLater && <CheckCircle2 className="w-3 h-3" />}
            </div>
            <span
              className={`text-[13.5px] font-semibold ${isSentOrLater ? "text-foreground" : "text-muted-foreground"}`}
            >
              Sent
            </span>
          </div>
        )}

        <div className="flex items-center gap-3 z-10">
          <div
            className={`w-5 h-5 rounded-full flex items-center justify-center border-2 border-background ${po.status === "received" ? "bg-primary text-primary-foreground" : isPartiallyReceived ? "bg-amber-500 text-white" : "bg-muted border border-border"}`}
          >
            {po.status === "received" && (
              <CheckCircle2 className="w-3 h-3" />
            )}
            {isPartiallyReceived && <PackageOpen className="w-3 h-3" />}
          </div>
          <span
            className={`text-[13.5px] font-semibold ${po.status === "received" || isPartiallyReceived ? "text-foreground" : "text-muted-foreground"}`}
          >
            {isPartiallyReceived ? "Partially Received" : "Received"}
          </span>
        </div>
      </div>
    </>
  );
}
