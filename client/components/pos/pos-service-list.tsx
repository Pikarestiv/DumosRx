"use client";

import { useState, useMemo } from "react";
import { Search, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SearchClearButton } from "@/components/ui/search-input";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/lib/context/auth-context";
import { useHasPermission } from "@/lib/hooks/use-permissions";
import { POSServiceCard } from "./pos-service-card";
import { POSCategoryFilter } from "./pos-category-filter";
import type { Service } from "@/lib/types/service";
import type { CartItem } from "@/lib/hooks/use-pos-cart";

interface POSServiceListProps {
  services: Service[];
  loadingServices?: boolean;
  addToCart: (service: Service) => void;
  currencyCode?: string;
  cart?: CartItem[];
  searchTerm?: string;
  onSearchChange?: (val: string) => void;
  onClearSearch?: () => void;
  onManageServices?: () => void;
}

export function POSServiceList({
  services,
  loadingServices = false,
  addToCart,
  currencyCode,
  cart = [],
  searchTerm = "",
  onSearchChange,
  onClearSearch,
  onManageServices,
}: POSServiceListProps) {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const { isAdmin } = useAuth();
  const canManageCatalog = useHasPermission("manage_products");
  const canManage = isAdmin || canManageCatalog;

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

  const isFiltered = Boolean(searchTerm.trim() || selectedCategory !== "all");

  return (
    <div className="flex flex-col gap-4 flex-1 overflow-hidden">
      {onSearchChange && (
        <div className="relative sm:hidden shrink-0 mx-1 mt-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search services (e.g. massage, styling)..."
            className={`pl-9 ${searchTerm ? "pr-8" : ""} h-10 bg-muted/30 border-border/50 rounded-xl text-sm`}
          />
          {searchTerm && <SearchClearButton onClick={() => onSearchChange("")} />}
        </div>
      )}

      <div className="shrink-0">
        <POSCategoryFilter categories={categories} value={selectedCategory} onChange={setSelectedCategory} />
      </div>

      <div className="flex-1 overflow-y-auto pr-1 pb-24 lg:pb-0">
        {filteredServices.length === 0 ? (
          <div className="border border-dashed rounded-2xl border-border bg-card/50">
            <EmptyState
              icon={Sparkles}
              title={
                services.length === 0
                  ? "No services configured"
                  : "No services found"
              }
              description={
                services.length === 0
                  ? canManage
                    ? "Configure walk-in spa, styling, clinic, or repair services in the Inventory catalog to sell them here."
                    : "No services configured for this store yet. Contact a store manager to configure services."
                  : "No services matched your search or category filter."
              }
              action={
                isFiltered
                  ? {
                      label: "Clear filters",
                      onClick: () => {
                        setSelectedCategory("all");
                        onClearSearch?.();
                      },
                    }
                  : canManage
                    ? {
                        label: "Manage Services in Inventory",
                        href: "/inventory/services",
                        onClick: onManageServices,
                      }
                    : undefined
              }
            />
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
