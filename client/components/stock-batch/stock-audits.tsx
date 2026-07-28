"use client";

import { useState, useEffect } from "react";
import { AuditCountStep } from "./audit-count-step";
import { AuditReviewStep } from "./audit-review-step";
import { ChevronLeft, Search, CheckCircle2, PackageSearch } from "lucide-react";
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

function NoAuditItemsFound() {
  return (
    <div className="flex flex-col items-center gap-2 text-muted-foreground text-[13px] py-4">
      <PackageSearch className="w-6 h-6 opacity-30" />
      No items found.
    </div>
  );
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
  const [currentCount, setCurrentCount] = useState<number | "">(0);
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

  const categoryItems = selectedCategory === "__all__" ? items : items.filter(i => i.category === selectedCategory);
  
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
    const finalCount = typeof currentCount === "number" ? currentCount : 0;
    setItems(prev => prev.map(i => i.id === activeItem.id ? { ...i, countedQty: finalCount } : i));
    setStep("list");
  };

  const submitAudit = () => {
    // Send changes to backend
    setStep("done");
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background w-full h-full">
      {/* Header — top padding clears the status bar / Tauri title bar */}
      <div
        className="flex items-center gap-3 px-4 md:px-6 pb-4 md:pb-5 border-b border-border bg-card"
        style={{ paddingTop: "calc(var(--tauri-top, 0px) + 1rem)" }}
      >
        <div
          className="w-8 h-8 md:w-[38px] md:h-[38px] rounded-[10px] bg-muted/30 flex items-center justify-center cursor-pointer text-muted-foreground shrink-0 hover:bg-accent transition-colors"
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
          <div className="text-[11px] md:text-[11.5px] text-muted-foreground">
            {step === "setup" && "Choose what to count"}
            {step === "list" && "Count items"}
            {step === "count" && "Adjust stock level"}
            {step === "review" && "Review"}
            {step === "done" && "Finished"}
          </div>
        </div>
        <div className="ml-auto hidden md:flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-200 rounded-full px-3 py-1.5">
          <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
          <span className="text-[11.5px] font-semibold text-emerald-700">Saved locally · syncs when online</span>
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto p-4 md:p-8 flex justify-center"
        style={{ paddingBottom: "calc(var(--tauri-bottom, env(safe-area-inset-bottom, 0px)) + 1rem)" }}
      >
        <div className="w-full max-w-[560px]">

          {/* SETUP */}
          {step === "setup" && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="text-[17px] font-semibold mb-1.5">What are you counting?</div>
              <div className="text-[13px] text-muted-foreground mb-5">Pick a category, then search and count items in any order.</div>
              {!!(isLoading) && (
                                          <div className="text-center p-8 text-muted-foreground">Loading categories...</div>
                                        )}
                          {!(isLoading) && (
                                          <div className="flex flex-col gap-2.5 mb-2">
                                            {categories.length === 0 && <NoAuditItemsFound />}
                                            
                                            {items.length > 0 && (
                                              <div 
                                                onClick={() => setSelectedCategory("__all__")}
                                                className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-colors ${
                                                  selectedCategory === "__all__" ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-accent/50'
                                                }`}
                                              >
                                                <div className="font-semibold text-[14px] text-foreground">All Categories</div>
                                                <div className="text-[13px] text-muted-foreground">{items.length} items</div>
                                              </div>
                                            )}

                                            {categories.map(cat => (
                                              <div 
                                                key={cat.id} 
                                                onClick={() => setSelectedCategory(cat.id)}
                                                className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-colors ${
                                                  selectedCategory === cat.id ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-accent/50'
                                                }`}
                                              >
                                                <div className="font-semibold text-[14px] text-foreground">{cat.label}</div>
                                                <div className="text-[13px] text-muted-foreground">{cat.count} items</div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
            </div>
          )}

          {/* LIST */}
          {step === "list" && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="flex items-center justify-between mb-3.5">
                <div className="text-[17px] font-semibold">Count items</div>
                <div className="text-[12.5px] text-muted-foreground font-medium">{countedItems.length} of {categoryItems.length} counted</div>
              </div>
              <div className="flex items-center gap-2 bg-card border border-border rounded-[10px] px-3.5 py-2.5 mb-4 sticky top-0 z-10">
                <Search className="w-4 h-4 text-muted-foreground/70 shrink-0" />
                <input 
                  type="text" 
                  placeholder="Search by name or SKU" 
                  className="border-0 outline-none text-[13px] w-full bg-transparent"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2.5 mb-2">
                {filteredList.map(item => {
                  const isCounted = item.countedQty !== undefined;
                  const isDelta = isCounted && item.countedQty !== item.systemQty;
                  return (
                    <div 
                      key={item.id}
                      onClick={() => openCount(item)}
                      className="bg-card border border-border p-4 rounded-xl cursor-pointer hover:border-border transition-colors flex items-center justify-between"
                    >
                      <div>
                        <div className="text-[14px] font-semibold text-foreground">{item.name}</div>
                        <div className="text-[12px] text-muted-foreground/70">{item.sku}</div>
                      </div>
                      <div className="text-right">
                        {!!(isCounted) && (
                                                        <div className={`text-[15px] font-bold ${isDelta ? 'text-destructive' : 'text-emerald-700'}`}>
                                                          {item.countedQty}
                                                        </div>
                                                      )}
                              {!(isCounted) && (
                                                        <div className="text-[13px] text-muted-foreground/70 font-medium">uncounted</div>
                                                      )}
                        {isCounted && <div className="text-[11px] text-muted-foreground">was {item.systemQty}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* COUNT */}
          {step === "count" && activeItem && (
            <AuditCountStep
              activeItem={activeItem}
              currentCount={currentCount}
              setCurrentCount={setCurrentCount}
              reason={reason}
              setReason={setReason}
            />
          )}

          {/* REVIEW */}
          {step === "review" && (
            <AuditReviewStep
              countedItems={countedItems}
              adjustedItems={adjustedItems}
            />
          )}

          {/* DONE */}
          {step === "done" && (
            <div className="text-center py-10 animate-in zoom-in-95 duration-500">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-700 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="text-[18px] font-semibold mb-1.5">Audit submitted</div>
              <div className="text-[13px] text-muted-foreground mb-6">
                {countedItems.length} items counted · {adjustedItems.length} adjusted
              </div>
            </div>
          )}

        </div>
      </div>

      {/* FIXED FOOTER */}
      <div className="border-t border-border bg-background p-4 md:px-8 md:py-5 flex justify-center shrink-0">
        <div className="w-full max-w-[560px]">
          {step === "setup" && (
            <button 
              className="w-full bg-primary text-white border-0 py-3.5 rounded-xl text-[14px] font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
              disabled={!selectedCategory}
              onClick={handleStart}
            >
              Start count
            </button>
          )}

          {step === "list" && (
            <button 
              className="w-full bg-primary text-white border-0 py-3.5 rounded-xl text-[14px] font-bold cursor-pointer hover:bg-primary/90 transition-colors"
              onClick={() => setStep("review")}
            >
              Review &amp; submit
            </button>
          )}

          {step === "count" && (
            <button 
              className="w-full bg-primary text-white border-0 py-3.5 rounded-xl text-[14px] font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
              disabled={currentCount !== activeItem?.systemQty && !reason}
              onClick={saveCount}
            >
              Save count
            </button>
          )}

          {step === "review" && (
            <button 
              className="w-full bg-primary text-white border-0 py-3.5 rounded-xl text-[14px] font-bold cursor-pointer hover:bg-primary/90 transition-colors"
              onClick={submitAudit}
            >
              Submit audit
            </button>
          )}

          {step === "done" && (
            <button 
              className="w-full bg-primary text-white border-0 py-3.5 rounded-xl text-[14px] font-bold cursor-pointer hover:bg-primary/90 transition-colors"
              onClick={onClose}
            >
              Close Audit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
