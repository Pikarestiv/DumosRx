import React from "react";
import { Minus, Plus } from "lucide-react";
import type { AuditItem } from "./stock-audits";

interface AuditCountStepProps {
  activeItem: AuditItem | null;
  currentCount: number | "";
  setCurrentCount: (count: number | "") => void;
  reason: string;
  setReason: (reason: string) => void;
}

export function AuditCountStep({
  activeItem,
  currentCount,
  setCurrentCount,
  reason,
  setReason,
}: AuditCountStepProps) {
  if (!activeItem) return null;

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="bg-card border border-border rounded-2xl p-6 mb-2">
        <span className="text-[11px] font-semibold bg-blue-500/10 text-blue-700 px-2 py-0.5 rounded-md">
          {activeItem.category}
        </span>
        <div className="text-[18px] font-semibold mt-2.5">{activeItem.name}</div>
        <div className="text-[12px] text-muted-foreground/70 mb-5">SKU: {activeItem.sku}</div>

        <div className="text-[12px] text-muted-foreground mb-1">System says</div>
        <div className="text-[15px] font-semibold mb-5">{activeItem.systemQty} units</div>

        <div className="text-[12px] text-muted-foreground mb-2">Your count</div>
        <div className="flex items-center justify-center gap-5 mb-2">
          <button 
            className="w-12 h-12 rounded-xl bg-muted/30 border border-border text-foreground flex items-center justify-center cursor-pointer hover:bg-accent"
            onClick={() => setCurrentCount(Math.max(0, (typeof currentCount === "number" ? currentCount : 0) - 1))}
          >
            <Minus className="w-5 h-5" />
          </button>
          <input
            type="number"
            min="0"
            className="text-[34px] font-bold w-32 text-center border-0 bg-transparent outline-none p-0 focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none"
            value={currentCount}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val) && val >= 0) {
                setCurrentCount(val);
              } else if (e.target.value === "") {
                setCurrentCount("");
              }
            }}
            onFocus={(e) => e.target.select()}
          />
          <button 
            className="w-12 h-12 rounded-xl bg-muted/30 border border-border text-foreground flex items-center justify-center cursor-pointer hover:bg-accent"
            onClick={() => setCurrentCount((typeof currentCount === "number" ? currentCount : 0) + 1)}
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {currentCount !== activeItem.systemQty && (
          <div className="border-t border-border mt-5 pt-4 animate-in fade-in duration-300">
            <div className="text-[12.5px] font-semibold mb-2.5 text-destructive">
              {Math.abs((typeof currentCount === "number" ? currentCount : 0) - activeItem.systemQty)} {((typeof currentCount === "number" ? currentCount : 0) > activeItem.systemQty) && "more"}
              {!((typeof currentCount === "number" ? currentCount : 0) > activeItem.systemQty) && "fewer"} than expected — reason required
            </div>
            <div className="flex flex-wrap gap-2">
              {["Damaged", "Expired", "Missing", "Found", "Other"].map(r => (
                <div 
                  key={r}
                  onClick={() => setReason(r)}
                  className={`px-3 py-1.5 rounded-full border text-[12px] font-medium cursor-pointer transition-colors ${
                    reason === r ? 'border-destructive bg-destructive/10 text-destructive' : 'border-border text-muted-foreground hover:bg-accent/50'
                  }`}
                >
                  {r}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
