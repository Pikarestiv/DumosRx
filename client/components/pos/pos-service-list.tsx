"use client";

import { useState, useMemo } from "react";
import { Search, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { POSServiceCard } from "./pos-service-card";
import type { Service } from "@/lib/types/service";
import type { CartItem } from "@/lib/hooks/use-pos-cart";

interface POSServiceListProps {
  services: Service[];
  loadingServices?: boolean;
  addToCart: (service: Service) => void;
  currencyCode?: string;
  cart?: CartItem[];
}

export function POSServiceList({
  services,
  loadingServices = false,
  addToCart,
  currencyCode,
  cart = [],
}: POSServiceListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const cartQuantityMap = useMemo(
    () =>
      new Map(
        cart
          .filter((item) => item.item_type === "service")
          .map((item) => [item.id, item.quantity]),
      ),
    [cart],
  );

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const s of services) {
      if (s.category && s.category.trim()) {
        set.add(s.category.trim());
      }
    }
    return Array.from(set).sort();
  }, [services]);

  const filteredServices = useMemo(() => {
    return services.filter((srv) => {
      if (selectedCategory !== "all" && srv.category !== selectedCategory) {
        return false;
      }
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchName = srv.name.toLowerCase().includes(term);
        const matchCode = srv.code?.toLowerCase().includes(term);
        const matchCat = srv.category?.toLowerCase().includes(term);
        return matchName || matchCode || matchCat;
      }
      return true;
    });
  }, [services, selectedCategory, searchTerm]);

  if (loadingServices) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-muted-foreground text-sm">
        Loading services catalog...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 flex-1 overflow-hidden">
      {/* Search and Category Filters */}
      <div className="flex flex-col sm:flex-row gap-2 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search services (e.g. massage, consultation, styling)..."
            className="pl-9 h-10 bg-background"
          />
        </div>

        {categories.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none shrink-0">
            <button
              type="button"
              onClick={() => setSelectedCategory("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${
                selectedCategory === "all"
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
              }`}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${
                  selectedCategory === cat
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Services Grid */}
      <div className="flex-1 overflow-y-auto pr-1">
        {filteredServices.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed rounded-2xl border-border bg-muted/10">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3">
              <Sparkles className="w-6 h-6" />
            </div>
            <h4 className="font-semibold text-sm mb-1">No services found</h4>
            <p className="text-xs text-muted-foreground max-w-sm">
              {searchTerm || selectedCategory !== "all"
                ? "No services matched your filter criteria."
                : "No services have been configured for this store yet."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3">
            {filteredServices.map((service) => (
              <POSServiceCard
                key={service.id}
                service={service}
                currencyCode={currencyCode}
                addToCart={addToCart}
                cartQuantity={cartQuantityMap.get(service.id) || 0}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

