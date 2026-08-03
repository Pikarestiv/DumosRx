import { Search } from "lucide-react";
import type { AuditItem } from "./stock-audits";

interface AuditListStepProps {
  countedCount: number;
  totalCount: number;
  search: string;
  setSearch: (value: string) => void;
  filteredList: AuditItem[];
  openCount: (item: AuditItem) => void;
}

export function AuditListStep({
  countedCount,
  totalCount,
  search,
  setSearch,
  filteredList,
  openCount,
}: AuditListStepProps) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center justify-between mb-3.5">
        <div className="text-[17px] font-semibold">Count items</div>
        <div className="text-[12.5px] text-muted-foreground font-medium">
          {countedCount} of {totalCount} counted
        </div>
      </div>
      <div className="flex items-center gap-2 bg-card border border-border rounded-[10px] px-3.5 py-2.5 mb-4 sticky top-0 z-10">
        <Search className="w-4 h-4 text-muted-foreground/70 shrink-0" />
        <input
          type="text"
          placeholder="Search by name or SKU"
          className="border-0 outline-none text-[13px] w-full bg-transparent"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2.5 mb-2">
        {filteredList.map((item) => {
          const isCounted = item.countedQty !== undefined;
          const isDelta = isCounted && item.countedQty !== item.systemQty;
          return (
            <div
              key={item.id}
              onClick={() => openCount(item)}
              className="bg-card border border-border p-4 rounded-xl cursor-pointer hover:border-border transition-colors flex items-center justify-between"
            >
              <div>
                <div className="text-[14px] font-semibold text-foreground">
                  {item.name}
                </div>
                <div className="text-[12px] text-muted-foreground/70">
                  {item.sku}
                </div>
              </div>
              <div className="text-right">
                {!!isCounted && (
                  <div
                    className={`text-[15px] font-bold ${isDelta ? "text-destructive" : "text-emerald-700"}`}
                  >
                    {item.countedQty}
                  </div>
                )}
                {!isCounted && (
                  <div className="text-[13px] text-muted-foreground/70 font-medium">
                    uncounted
                  </div>
                )}
                {isCounted && (
                  <div className="text-[11px] text-muted-foreground">
                    was {item.systemQty}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
