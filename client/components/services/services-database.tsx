"use client";

import { useState, useMemo, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Sparkles, Edit, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { FilterPill } from "@/components/ui/filter-pill";
import { EmptyState } from "@/components/ui/empty-state";
import { useStore } from "@/lib/context/store-context";
import { formatCurrency } from "@/lib/utils";
import { queryKeys } from "@/lib/query-keys";
import { getServices } from "@/lib/db/queries/services";
import { ServiceFormDialog } from "./service-form-dialog";
import { ServiceDeleteDialog } from "./service-delete-dialog";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { Service } from "@/lib/types/service";

export function ServicesDatabase() {
  const { activeStoreId, storeProfile } = useStore();
  const currencyCode = storeProfile?.currency;
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "inactive"
  >("all");

  const [formOpen, setFormOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState<Service | null>(null);

  const searchParams = useSearchParams();
  const router = useRouter();

  const searchParamsKey = searchParams.toString();
  const [appliedSearchParamsKey, setAppliedSearchParamsKey] = useState<string | null>(null);
  if (searchParamsKey !== appliedSearchParamsKey) {
    setAppliedSearchParamsKey(searchParamsKey);
    if (searchParams.get("action") === "add") {
      setEditingService(null);
      setFormOpen(true);
    }
  }

  useEffect(() => {
    if (searchParams.get("action") !== "add") return;
    const newParams = new URLSearchParams(searchParams.toString());
    newParams.delete("action");
    const newUrl =
      window.location.pathname +
      (newParams.toString() ? `?${newParams.toString()}` : "");
    router.replace(newUrl);
  }, [searchParams, router]);

  const { data: rawServices = [], isLoading } = useQuery({
    ...queryKeys.services.all(),
    queryFn: () => getServices({ storeId: activeStoreId, activeOnly: false }),
  });

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const s of rawServices) {
      if (s.category?.trim()) set.add(s.category.trim());
    }
    return ["all", ...Array.from(set).sort()];
  }, [rawServices]);

  const filteredServices = useMemo(() => {
    return rawServices.filter((s) => {
      if (categoryFilter !== "all" && s.category !== categoryFilter)
        return false;
      if (statusFilter === "active" && !s.is_active) return false;
      if (statusFilter === "inactive" && s.is_active) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const mName = s.name.toLowerCase().includes(q);
        const mCode = s.code?.toLowerCase().includes(q);
        const mCat = s.category?.toLowerCase().includes(q);
        return mName || mCode || mCat;
      }
      return true;
    });
  }, [rawServices, categoryFilter, statusFilter, searchTerm]);

  const handleEdit = (service: Service) => {
    setEditingService(service);
    setFormOpen(true);
  };

  const handleDelete = (service: Service) => {
    setServiceToDelete(service);
    setDeleteOpen(true);
  };

  const handleAdd = () => {
    setEditingService(null);
    setFormOpen(true);
  };

  const isFiltered = Boolean(
    searchTerm.trim() || categoryFilter !== "all" || statusFilter !== "all",
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      {/* Mobile Filters (above card) */}
      {!isDesktop && (
        <div className="lg:hidden flex flex-col gap-3">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search services by name, code or category..."
            aria-label="Search services"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <FilterPill
              label="Category"
              value={categoryFilter}
              onValueChange={setCategoryFilter}
              options={categories.map((c) => ({
                value: c,
                label: c === "all" ? "All" : c,
              }))}
              className="bg-card"
            />
            <FilterPill
              label="Status"
              value={statusFilter}
              onValueChange={(val) =>
                setStatusFilter(val as "all" | "active" | "inactive")
              }
              options={[
                { value: "all", label: "All" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ]}
              className="bg-card"
            />
          </div>
        </div>
      )}

      {/* Main Table Card (matching ProductDatabase card layout) */}
      <div className="border-0 sm:border sm:border-border bg-transparent sm:bg-card rounded-none sm:rounded-2xl flex flex-col flex-1 min-h-[360px] overflow-hidden">
        {/* Desktop Filters (inside card header) */}
        {isDesktop && (
          <div className="hidden lg:block p-4 border-b border-border space-y-3">
            <div className="flex items-center gap-2">
              <SearchInput
                value={searchTerm}
                onChange={setSearchTerm}
                placeholder="Search services by name, code or category..."
                aria-label="Search services"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <FilterPill
                label="Category"
                value={categoryFilter}
                onValueChange={setCategoryFilter}
                options={categories.map((c) => ({
                  value: c,
                  label: c === "all" ? "All" : c,
                }))}
              />
              <FilterPill
                label="Status"
                value={statusFilter}
                onValueChange={(val) =>
                  setStatusFilter(val as "all" | "active" | "inactive")
                }
                options={[
                  { value: "all", label: "All" },
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                ]}
              />
            </div>
          </div>
        )}

        {/* Table Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center p-12 text-sm text-muted-foreground">
              Loading services catalog...
            </div>
          ) : filteredServices.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={Sparkles}
                title={
                  rawServices.length === 0
                    ? "No services configured"
                    : "No services found"
                }
                description={
                  rawServices.length === 0
                    ? "Add spa, styling, consultation, or clinic services to sell them at POS alongside physical products."
                    : "No services matched your active search or filters."
                }
                action={
                  isFiltered
                    ? {
                        label: "Clear filters",
                        onClick: () => {
                          setSearchTerm("");
                          setCategoryFilter("all");
                          setStatusFilter("all");
                        },
                      }
                    : {
                        label: "Add Service",
                        onClick: handleAdd,
                      }
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 border-b border-border text-muted-foreground font-semibold">
                  <tr>
                    <th className="py-3 px-4">Service Name</th>
                    <th className="py-3 px-4">Code</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4 text-right">Price</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredServices.map((srv) => (
                    <tr
                      key={srv.id}
                      className="hover:bg-muted/20 transition-colors"
                    >
                      <td className="py-3 px-4 font-medium text-foreground">
                        <div>{srv.name}</div>
                        {srv.description && (
                          <div className="text-[11px] text-muted-foreground line-clamp-1">
                            {srv.description}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground font-mono">
                        {srv.code || "—"}
                      </td>
                      <td className="py-3 px-4">
                        {srv.category ? (
                          <span className="inline-flex px-2 py-0.5 rounded-md bg-muted text-[11px] font-medium">
                            {srv.category}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-foreground">
                        {formatCurrency(srv.price, currencyCode)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {srv.is_active ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-muted text-muted-foreground">
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={() => handleEdit(srv)}
                            aria-label={`Edit ${srv.name}`}
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(srv)}
                            aria-label={`Delete ${srv.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <ServiceFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        service={editingService}
      />

      <ServiceDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        service={serviceToDelete}
      />
    </div>
  );
}
