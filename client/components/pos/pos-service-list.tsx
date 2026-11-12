"use client";

import { useState, useMemo } from "react";
import { Search, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/lib/context/auth-context";
import { useHasPermission } from "@/lib/hooks/use-permissions";
import { POSServiceCard } from "./pos-service-card";
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
      {/* Mobile-only Search Bar (Desktop uses top header search) */}
      {onSearchChange && (
        <div className="relative sm:hidden shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search services (e.g. massage, styling)..."
            className="pl-9 h-10 bg-muted/30 border-border/50 rounded-xl text-sm"
          />
        </div>
      )}

      {/* Category Filter Pills */}
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

      {/* Services Grid or Empty State */}
      <div className="flex-1 overflow-y-auto pr-1">
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
