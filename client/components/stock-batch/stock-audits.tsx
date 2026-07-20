"use client";

import { useState, useEffect } from "react";
import { ChevronLeft, Search, Plus, Minus, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getProductsWithDetails } from "@/lib/db/queries/products";
import { genericFuzzySearch } from "@/lib/utils/search";

type AuditStep = "setup" | "list" | "count" | "review" | "done";

interface AuditItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  systemQty: number;
  countedQty?: number;
}

export function StockAudits({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<AuditStep>("setup");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  
  // Data fetching
  const { data: rawProducts, isLoading } = useQuery({
    queryKey: ['productsWithDetails'],
    queryFn: () => getProductsWithDetails()
  });

  const [items, setItems] = useState<AuditItem[]>([]);
  const [activeItem, setActiveItem] = useState<AuditItem | null>(null);
  const [currentCount, setCurrentCount] = useState<number>(0);
  const [reason, setReason] = useState<string>("");

  useEffect(() => {
    if (rawProducts) {
      const formatted: AuditItem[] = rawProducts.map((p: any) => ({
        id: p.id,
        name: p.name,
        sku: p.barcode || `SKU-${p.id.substring(0,6)}`,
        category: p.category_name || "Uncategorized",
        systemQty: p.stock_quantity || 0,
      }));
      setItems(formatted);
    }
  }, [rawProducts]);

  const categories = Array.from(new Set(items.map(i => i.category))).map(cat => ({
    id: cat,
    label: cat,
    count: items.filter(i => i.category === cat).length
  })).sort((a, b) => b.count - a.count);

  const categoryItems = items.filter(i => i.category === selectedCategory);
  
  const { results: filteredList } = genericFuzzySearch(
    search,
    categoryItems,
    ["name", "sku"]
  );

  const countedItems = items.filter(i => i.countedQty !== undefined);
  const adjustedItems = countedItems.filter(i => i.countedQty !== i.systemQty);
  
  const handleStart = () => {
    if (selectedCategory) setStep("list");
  };

  const openCount = (item: AuditItem) => {
    setActiveItem(item);
    setCurrentCount(item.countedQty ?? item.systemQty);
    setReason("");
    setStep("count");
  };

  const saveCount = () => {
    if (!activeItem) return;
    setItems(prev => prev.map(i => i.id === activeItem.id ? { ...i, countedQty: currentCount } : i));
    setStep("list");
  };

  const submitAudit = () => {
    // Send changes to backend
    setStep("done");
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#F5F8FC] w-full h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 md:px-6 py-4 md:py-5 border-b border-[#E6EAF2] bg-[#FFFFFF]">
        <div 
          className="w-8 h-8 md:w-[38px] md:h-[38px] rounded-[10px] bg-[#F5F8FC] flex items-center justify-center cursor-pointer text-[#667085] shrink-0 hover:bg-[#E6EAF2] transition-colors"
          onClick={() => {
            if (step === "count") setStep("list");
            else if (step === "review") setStep("list");
            else if (step === "list") setStep("setup");
            else onClose();
          }}
        >
          <ChevronLeft className="w-5 h-5" />
        </div>
        <div>
          <div className="text-[14px] md:text-[15px] font-semibold">Cycle Count</div>
          <div className="text-[11px] md:text-[11.5px] text-[#667085]">
            {step === "setup" && "Choose what to count"}
            {step === "list" && "Count items"}
            {step === "count" && "Adjust stock level"}
            {step === "review" && "Review"}
            {step === "done" && "Finished"}
          </div>
        </div>
        <div className="ml-auto hidden md:flex items-center gap-1.5 bg-[#ECFDF3] border border-[#D3F2E1] rounded-full px-3 py-1.5">
          <div className="w-2 h-2 rounded-full bg-[#12B76A]"></div>
          <span className="text-[11.5px] font-semibold text-[#067647]">Saved locally · syncs when online</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8 flex justify-center">
        <div className="w-full max-w-[560px]">

          {/* SETUP */}
          {step === "setup" && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="text-[17px] font-semibold mb-1.5">What are you counting?</div>
              <div className="text-[13px] text-[#667085] mb-5">Pick a category, then search and count items in any order.</div>
              {isLoading ? (
                <div className="text-center p-8 text-[#667085]">Loading categories...</div>
              ) : (
                <div className="flex flex-col gap-2.5 mb-6">
                  {categories.length === 0 && <div className="text-[#667085] text-[13px]">No categories found.</div>}
                  {categories.map(cat => (
                    <div 
                      key={cat.id} 
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-colors ${
                        selectedCategory === cat.id ? 'border-[#2054E0] bg-[#F0F4FF]' : 'border-[#E6EAF2] bg-white hover:bg-[#F9FAFB]'
                      }`}
                    >
                      <div className="font-semibold text-[14px] text-[#344054]">{cat.label}</div>
                      <div className="text-[13px] text-[#667085]">{cat.count} items</div>
                    </div>
                  ))}
                </div>
              )}
              <button 
                className="w-full bg-[#2054E0] text-white border-0 py-3.5 rounded-xl text-[14px] font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#1A43B3] transition-colors"
                disabled={!selectedCategory}
                onClick={handleStart}
              >
                Start count
              </button>
            </div>
          )}

          {/* LIST */}
          {step === "list" && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="flex items-center justify-between mb-3.5">
                <div className="text-[17px] font-semibold">Count items</div>
                <div className="text-[12.5px] text-[#667085] font-medium">{countedItems.length} of {categoryItems.length} counted</div>
              </div>
              <div className="flex items-center gap-2 bg-[#FFFFFF] border border-[#E6EAF2] rounded-[10px] px-3.5 py-2.5 mb-4">
                <Search className="w-4 h-4 text-[#98A2B3] shrink-0" />
                <input 
                  type="text" 
                  placeholder="Search by name or SKU" 
                  className="border-0 outline-none text-[13px] w-full bg-transparent"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2.5 mb-6">
                {filteredList.map(item => {
                  const isCounted = item.countedQty !== undefined;
                  const isDelta = isCounted && item.countedQty !== item.systemQty;
                  return (
                    <div 
                      key={item.id}
                      onClick={() => openCount(item)}
                      className="bg-white border border-[#E6EAF2] p-4 rounded-xl cursor-pointer hover:border-[#C9D3E4] transition-colors flex items-center justify-between"
                    >
                      <div>
                        <div className="text-[14px] font-semibold text-[#344054]">{item.name}</div>
                        <div className="text-[12px] text-[#98A2B3]">{item.sku}</div>
                      </div>
                      <div className="text-right">
                        {isCounted ? (
                          <div className={`text-[15px] font-bold ${isDelta ? 'text-[#B42318]' : 'text-[#067647]'}`}>
                            {item.countedQty}
                          </div>
                        ) : (
                          <div className="text-[13px] text-[#98A2B3] font-medium">uncounted</div>
                        )}
                        {isCounted && <div className="text-[11px] text-[#667085]">was {item.systemQty}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
              <button 
                className="w-full bg-[#2054E0] text-white border-0 py-3.5 rounded-xl text-[14px] font-bold cursor-pointer hover:bg-[#1A43B3] transition-colors"
                onClick={() => setStep("review")}
              >
                Review &amp; submit
              </button>
            </div>
          )}

          {/* COUNT */}
          {step === "count" && activeItem && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="bg-[#FFFFFF] border border-[#E6EAF2] rounded-2xl p-6 mb-5">
                <span className="text-[11px] font-semibold bg-[#F0F9FF] text-[#026AA2] px-2 py-0.5 rounded-md">
                  {activeItem.category}
                </span>
                <div className="text-[18px] font-semibold mt-2.5">{activeItem.name}</div>
                <div className="text-[12px] text-[#98A2B3] mb-5">SKU: {activeItem.sku}</div>

                <div className="text-[12px] text-[#667085] mb-1">System says</div>
                <div className="text-[15px] font-semibold mb-5">{activeItem.systemQty} units</div>

                <div className="text-[12px] text-[#667085] mb-2">Your count</div>
                <div className="flex items-center justify-center gap-5 mb-2">
                  <button 
                    className="w-12 h-12 rounded-xl bg-[#F5F8FC] border border-[#E6EAF2] text-[#344054] flex items-center justify-center cursor-pointer hover:bg-[#E6EAF2]"
                    onClick={() => setCurrentCount(Math.max(0, currentCount - 1))}
                  >
                    <Minus className="w-5 h-5" />
                  </button>
                  <div className="text-[34px] font-bold w-24 text-center">{currentCount}</div>
                  <button 
                    className="w-12 h-12 rounded-xl bg-[#F5F8FC] border border-[#E6EAF2] text-[#344054] flex items-center justify-center cursor-pointer hover:bg-[#E6EAF2]"
                    onClick={() => setCurrentCount(currentCount + 1)}
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>

                {currentCount !== activeItem.systemQty && (
                  <div className="border-t border-[#E6EAF2] mt-5 pt-4 animate-in fade-in duration-300">
                    <div className="text-[12.5px] font-semibold mb-2.5 text-[#B42318]">
                      {Math.abs(currentCount - activeItem.systemQty)} {currentCount > activeItem.systemQty ? "more" : "fewer"} than expected — reason required
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {["Damaged", "Expired", "Missing", "Found", "Other"].map(r => (
                        <div 
                          key={r}
                          onClick={() => setReason(r)}
                          className={`px-3 py-1.5 rounded-full border text-[12px] font-medium cursor-pointer transition-colors ${
                            reason === r ? 'border-[#B42318] bg-[#FEF3F2] text-[#B42318]' : 'border-[#E6EAF2] text-[#667085] hover:bg-[#F9FAFB]'
                          }`}
                        >
                          {r}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button 
                className="w-full bg-[#2054E0] text-white border-0 py-3.5 rounded-xl text-[14px] font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#1A43B3] transition-colors"
                disabled={currentCount !== activeItem.systemQty && !reason}
                onClick={saveCount}
              >
                Save count
              </button>
            </div>
          )}

          {/* REVIEW */}
          {step === "review" && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="text-[17px] font-semibold mb-1.5">Review &amp; submit</div>
              <div className="text-[13px] text-[#667085] mb-5">Check the adjustments below before submitting to the ledger.</div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-5">
                <div className="bg-[#FFFFFF] border border-[#E6EAF2] p-3 rounded-xl">
                  <div className="text-[11px] text-[#667085] font-semibold uppercase">Total Counted</div>
                  <div className="text-[16px] font-bold mt-1">{countedItems.length}</div>
                </div>
                <div className="bg-[#FFFFFF] border border-[#E6EAF2] p-3 rounded-xl">
                  <div className="text-[11px] text-[#667085] font-semibold uppercase">Adjusted</div>
                  <div className="text-[16px] font-bold mt-1 text-[#B42318]">{adjustedItems.length}</div>
                </div>
              </div>

              {adjustedItems.length > 0 ? (
                <div className="bg-[#FFFFFF] border border-[#E6EAF2] rounded-2xl divide-y divide-[#E6EAF2] mb-6">
                  {adjustedItems.map(item => (
                    <div key={item.id} className="p-4 flex items-center justify-between">
                      <div>
                        <div className="text-[14px] font-semibold text-[#344054]">{item.name}</div>
                        <div className="text-[12px] text-[#98A2B3]">{item.sku}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[14px] font-bold text-[#B42318]">
                          {item.systemQty} → {item.countedQty}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 bg-white border border-[#E6EAF2] rounded-2xl mb-6 text-center text-[13px] text-[#667085]">
                  No items were adjusted. All counts matched the system.
                </div>
              )}

              <button 
                className="w-full bg-[#2054E0] text-white border-0 py-3.5 rounded-xl text-[14px] font-bold cursor-pointer hover:bg-[#1A43B3] transition-colors"
                onClick={submitAudit}
              >
                Submit audit
              </button>
            </div>
          )}

          {/* DONE */}
          {step === "done" && (
            <div className="text-center py-10 animate-in zoom-in-95 duration-500">
              <div className="w-16 h-16 rounded-full bg-[#ECFDF3] text-[#067647] flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="text-[18px] font-semibold mb-1.5">Audit submitted</div>
              <div className="text-[13px] text-[#667085] mb-6">
                {countedItems.length} items counted · {adjustedItems.length} adjusted
              </div>
              <button 
                className="bg-[#2054E0] text-white border-0 px-6 py-3 rounded-xl text-[14px] font-bold cursor-pointer hover:bg-[#1A43B3] transition-colors"
                onClick={onClose}
              >
                Close Audit
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
